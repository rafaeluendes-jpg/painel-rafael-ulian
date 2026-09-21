// Funções do assistente do WhatsApp (roda no servidor Hetzner do Rafael, com a
// service_role). NÃO são endpoints públicos: quem chama é o bot, depois de
// reconhecer o número de quem mandou a mensagem.
//
//   const painel = criarPainel({ url, serviceRoleKey })
//   await painel.listarPendentes(donoId)          → texto pronto para o WhatsApp
//   await painel.marcarFeito(donoId, 'fechar caixa')
//   await painel.adicionarItem(donoId, 'Pessoal', 'Ligar para o contador')
//   await painel.resumirEficiencia(donoId, 7)
//   await painel.resumoDiario(donoId)              → a mensagem das 21h
import { createClient } from '@supabase/supabase-js'

const FUSO = 'America/Sao_Paulo'
const fmtISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const fmtHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
})

export const hojeISO = () => fmtISO.format(new Date())
const dataDoInstante = (t) => fmtISO.format(new Date(t))
const utc = (iso) => new Date(iso + 'T00:00:00Z')
const somarDias = (iso, n) => new Date(utc(iso).getTime() + n * 86400000).toISOString().slice(0, 10)
const semAcento = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Mesma regra do painel: o item entra no dia se já existia, não foi removido e a agenda bate. */
export function itemAplicaNoDia(item, iso, acao) {
  const inicio = item.a_partir_de || dataDoInstante(item.criado_em)
  if (iso < inicio) return false
  if (item.desativado_em && iso >= dataDoInstante(item.desativado_em)) return false
  if (item.dias_semana?.length && !item.dias_semana.includes(utc(iso).getUTCDay())) return false
  // Dia 31 num mês de 30 vale no último dia do mês (mesma regra do painel).
  const ultimo = new Date(
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0),
  ).getUTCDate()
  if (item.dia_mes && Number(iso.slice(8, 10)) !== Math.min(item.dia_mes, ultimo)) return false
  if (acao && acao.ritmo === 'unica' && acao.status === 'feito' && acao.concluido_em) {
    return iso <= dataDoInstante(acao.concluido_em)
  }
  return true
}

export function acaoAtrasada(acao, hoje = hojeISO()) {
  if (acao.status === 'feito' || acao.comeca >= hoje) return false
  return acao.ritmo === 'unica' ? true : acao.status === 'aberto'
}

function ok({ data, error }) {
  if (error) throw error
  return data
}

export function criarPainel({ url, serviceRoleKey }) {
  if (!url || !serviceRoleKey) throw new Error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
  const sb = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  async function carregar(donoId, hoje = hojeISO()) {
    const [pastas, itens, marcacoes, acoes] = await Promise.all([
      ok(await sb.from('painel_pastas').select('*').eq('dono_id', donoId).order('ordem')),
      ok(
        await sb
          .from('painel_itens')
          .select('*')
          .eq('dono_id', donoId)
          .eq('ativo', true)
          .order('ordem'),
      ),
      ok(await sb.from('painel_marcacoes').select('*').eq('dono_id', donoId).eq('data', hoje)),
      ok(await sb.from('painel_acoes').select('*').eq('dono_id', donoId).order('comeca')),
    ])
    const acoesPorId = new Map(acoes.map((a) => [a.id, a]))
    const feitos = new Set(marcacoes.filter((m) => m.feito).map((m) => m.item_id))
    const doDia = itens.filter((i) =>
      itemAplicaNoDia(i, hoje, i.acao_id ? acoesPorId.get(i.acao_id) : null),
    )
    return { pastas, itens, doDia, feitos, acoes, hoje }
  }

  /** Quem é o dono pelo número do WhatsApp (só quem ligou o assistente nas preferências). */
  async function donoPeloNumero(numero) {
    const digitos = String(numero).replace(/\D/g, '')
    const prefs = ok(
      await sb
        .from('painel_preferencias')
        .select('dono_id, whatsapp_numero')
        .eq('whatsapp_ativo', true),
    )
    const p = prefs.find((x) => x.whatsapp_numero.replace(/\D/g, '') === digitos)
    return p ? p.dono_id : null
  }

  async function listarPendentes(donoId) {
    const { pastas, doDia, feitos } = await carregar(donoId)
    const linhas = []
    for (const pasta of pastas.filter((p) => p.no_checklist)) {
      const itens = doDia.filter((i) => i.pasta_id === pasta.id)
      const faltam = itens.filter((i) => !feitos.has(i.id))
      if (!itens.length) continue
      linhas.push(`*${pasta.nome}* (${itens.length - faltam.length}/${itens.length})`)
      for (const i of faltam) linhas.push(`  ☐ ${i.texto}`)
      if (!faltam.length) linhas.push('  ✓ tudo feito')
    }
    if (!linhas.length) return 'Nada na lista de hoje.'
    const total = doDia.length
    const feitas = doDia.filter((i) => feitos.has(i.id)).length
    return [
      `Hoje: ${feitas} de ${total} feitas (${total ? Math.round((feitas / total) * 100) : 0}%).`,
      ...linhas,
    ].join('\n')
  }

  /** Marca o item do dia cujo texto mais parece com o pedido. */
  async function marcarFeito(donoId, textoOuId) {
    const { doDia, feitos, hoje, acoes } = await carregar(donoId)
    const pedido = semAcento(textoOuId)
    let item = doDia.find((i) => i.id === textoOuId)
    if (!item) {
      const candidatos = doDia.filter(
        (i) => !feitos.has(i.id) && semAcento(i.texto).includes(pedido),
      )
      if (!candidatos.length)
        return { ok: false, mensagem: `Não achei "${textoOuId}" na lista de hoje.` }
      if (candidatos.length > 1) {
        return {
          ok: false,
          mensagem: `Qual deles?\n${candidatos.map((c) => `• ${c.texto}`).join('\n')}`,
        }
      }
      item = candidatos[0]
    }
    ok(
      await sb.from('painel_marcacoes').upsert(
        {
          item_id: item.id,
          dono_id: donoId,
          data: hoje,
          feito: true,
          marcado_em: new Date().toISOString(),
          marcado_por: donoId,
        },
        { onConflict: 'item_id,data' },
      ),
    )
    const acao = item.acao_id ? acoes.find((a) => a.id === item.acao_id) : null
    if (acao && acao.ritmo === 'unica') {
      ok(
        await sb
          .from('painel_acoes')
          .update({ status: 'feito', concluido_em: new Date().toISOString() })
          .eq('id', acao.id),
      )
    }
    return { ok: true, mensagem: `Feito: ${item.texto} (${fmtHora.format(new Date())}).`, item }
  }

  /** Acrescenta um item na pasta (pelo nome; sem nome, vai para a primeira do checklist). */
  async function adicionarItem(donoId, nomeDaPasta, texto) {
    const { pastas, itens } = await carregar(donoId)
    const pedido = semAcento(nomeDaPasta)
    const pasta =
      pastas.find((p) => semAcento(p.nome) === pedido) ||
      pastas.find((p) => semAcento(p.nome).startsWith(pedido)) ||
      pastas.find((p) => p.no_checklist)
    if (!pasta) return { ok: false, mensagem: 'Não achei essa pasta.' }
    const limpo = String(texto || '')
      .trim()
      .slice(0, 200)
    if (!limpo) return { ok: false, mensagem: 'O que eu acrescento?' }
    const item = ok(
      await sb
        .from('painel_itens')
        .insert({
          dono_id: donoId,
          pasta_id: pasta.id,
          texto: limpo,
          ordem: itens.filter((i) => i.pasta_id === pasta.id).length + 1,
        })
        .select()
        .single(),
    )
    return { ok: true, mensagem: `Anotado em ${pasta.nome}: ${limpo}.`, item }
  }

  /** Percentual feito por dia no período e os itens que mais ficaram para trás. */
  async function resumirEficiencia(donoId, dias = 7) {
    const hoje = hojeISO()
    const inicio = somarDias(hoje, -(dias - 1))
    const [pastas, itens, marcacoes, acoes] = await Promise.all([
      ok(await sb.from('painel_pastas').select('*').eq('dono_id', donoId)),
      ok(await sb.from('painel_itens').select('*').eq('dono_id', donoId)),
      ok(await sb.from('painel_marcacoes').select('*').eq('dono_id', donoId).gte('data', inicio)),
      ok(await sb.from('painel_acoes').select('*').eq('dono_id', donoId)),
    ])
    const acoesPorId = new Map(acoes.map((a) => [a.id, a]))
    const visiveis = new Set(pastas.filter((p) => p.no_checklist).map((p) => p.id))
    const feitos = new Set(marcacoes.filter((m) => m.feito).map((m) => `${m.item_id}|${m.data}`))
    const porDia = []
    const atras = new Map()
    for (let d = 0; d < dias; d++) {
      const dia = somarDias(inicio, d)
      const aplicaveis = itens.filter(
        (i) =>
          visiveis.has(i.pasta_id) &&
          itemAplicaNoDia(i, dia, i.acao_id ? acoesPorId.get(i.acao_id) : null),
      )
      const feitas = aplicaveis.filter((i) => feitos.has(`${i.id}|${dia}`)).length
      porDia.push({ dia, total: aplicaveis.length, feitas })
      if (dia === hoje) continue
      for (const i of aplicaveis) {
        if (feitos.has(`${i.id}|${dia}`)) continue
        atras.set(i.texto, (atras.get(i.texto) || 0) + 1)
      }
    }
    const comItens = porDia.filter((p) => p.total)
    const media = comItens.length
      ? Math.round((comItens.reduce((s, p) => s + p.feitas / p.total, 0) / comItens.length) * 100)
      : 0
    const linhas = porDia.map(
      (p) =>
        `${dataBR(p.dia)}: ${p.total ? Math.round((p.feitas / p.total) * 100) + '%' : '—'} (${p.feitas}/${p.total})`,
    )
    const piores = [...atras.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    const texto = [
      `Últimos ${dias} dias: média ${media}%.`,
      ...linhas,
      piores.length
        ? `Mais fica para trás: ${piores.map(([t, n]) => `${t} (${n}x)`).join(', ')}.`
        : 'Nada ficou para trás.',
    ].join('\n')
    return { media, porDia, piores, texto }
  }

  /** Estado do plano de ação: atrasadas e o que vence nos próximos dias. */
  async function resumirPlano(donoId, diasAFrente = 3) {
    const hoje = hojeISO()
    const acoes = ok(
      await sb.from('painel_acoes').select('*').eq('dono_id', donoId).order('comeca'),
    )
    if (!acoes.length) return ''
    const atrasadas = acoes.filter((a) => acaoAtrasada(a, hoje))
    const limite = somarDias(hoje, diasAFrente)
    const vencendo = acoes.filter(
      (a) => a.status !== 'feito' && a.comeca >= hoje && a.comeca <= limite,
    )
    const feitas = acoes.filter((a) => a.status === 'feito').length
    const linhas = [
      `Plano de ação: ${feitas}/${acoes.length} feitas, ${atrasadas.length} atrasada(s).`,
    ]
    for (const a of atrasadas)
      linhas.push(`  ⚠ ${a.titulo}${a.quem ? ` (${a.quem})` : ''} — desde ${dataBR(a.comeca)}`)
    for (const a of vencendo)
      linhas.push(
        `  • ${a.titulo}${a.quem ? ` (${a.quem})` : ''} — ${a.comeca === hoje ? 'hoje' : dataBR(a.comeca)}`,
      )
    return linhas.join('\n')
  }

  /** A mensagem das 21h. */
  async function resumoDiario(donoId) {
    const pendentes = await listarPendentes(donoId)
    const plano = await resumirPlano(donoId)
    return ['Boa noite. Como foi o dia:', pendentes, plano].filter(Boolean).join('\n\n')
  }

  return {
    donoPeloNumero,
    listarPendentes,
    marcarFeito,
    adicionarItem,
    resumirEficiencia,
    resumirPlano,
    resumoDiario,
  }
}
