// Estado em memória do painel: o que está carregado e quem está olhando.
// As telas escutam `aoMudar` e se redesenham.
import { dados } from './dados.js'
import { hojeISO, itemAplicaNoDia, dataDoInstante } from './datas.js'

export const estado = {
  uid: null,
  email: '',
  perfil: null,
  pastas: [],
  itens: [], // ativos
  marcacoes: [], // de hoje
  acoes: [],
  atas: [],
  listas: [],
  listaItens: [],
  permissoes: [], // as que me foram concedidas (quando sou convidada)
  hoje: hojeISO(),
  pronto: false,
}

const ouvintes = new Set()
export function aoMudar(fn) {
  ouvintes.add(fn)
  return () => ouvintes.delete(fn)
}
export function avisarMudanca(origem = 'geral') {
  for (const fn of ouvintes) fn(origem)
}

export async function carregarTudo(sessao) {
  estado.uid = sessao.user.id
  estado.email = sessao.user.email || ''
  estado.hoje = hojeISO()
  let perfil = await dados.perfil(estado.uid)
  if (!perfil) perfil = await dados.entrar()
  if (!perfil) throw new Error('sem_convite')
  const [pastas, itens, marcacoes, acoes, atas, listas, listaItens, permissoes] = await Promise.all(
    [
      dados.pastas(),
      dados.itensAtivos(),
      dados.marcacoesDoDia(estado.hoje),
      dados.acoes(),
      dados.atas(),
      // As listas do Checklist não derrubam o painel inteiro se falharem.
      dados.listas().catch(() => []),
      dados.itensDeListas().catch(() => []),
      dados.minhasPermissoes(estado.uid),
    ],
  )
  Object.assign(estado, {
    perfil,
    pastas,
    itens,
    marcacoes,
    acoes,
    atas,
    listas,
    listaItens,
    permissoes,
    pronto: true,
  })
  avisarMudanca('tudo')
}

/** Recarrega só o que muda ao longo do dia (marcações, itens, ações). */
export async function recarregarDia() {
  const hoje = hojeISO()
  const [itens, marcacoes, acoes, atas] = await Promise.all([
    dados.itensAtivos(),
    dados.marcacoesDoDia(hoje),
    dados.acoes(),
    dados.atas(),
  ])
  Object.assign(estado, { hoje, itens, marcacoes, acoes, atas })
  avisarMudanca('dia')
}

// ------------------------------------------------------------ consultas locais
export const souDono = () => estado.perfil?.papel === 'dono'
export const souAdmin = () =>
  estado.perfil?.papel === 'dono' || estado.perfil?.papel === 'administradora'

export function pastasDoChecklist() {
  return estado.pastas.filter((p) => p.no_checklist)
}

export function podeEditar(pasta) {
  if (!pasta) return false
  if (pasta.dono_id === estado.uid) return true
  return estado.permissoes.some((p) => p.pasta_id === pasta.id && p.nivel === 'edicao')
}

/** Como itemAplicaNoDia, mas o item de uma ação única concluída só vale até o dia da conclusão. */
export function itemAplica(item, iso, acoes = estado.acoes) {
  if (!itemAplicaNoDia(item, iso)) return false
  if (!item.acao_id) return true
  const acao = acoes.find((a) => a.id === item.acao_id)
  if (!acao) return true
  if (acao.ritmo === 'unica' && acao.status === 'feito' && acao.concluido_em) {
    return iso <= dataDoInstante(acao.concluido_em)
  }
  return true
}

export function itensDaPastaHoje(pastaId) {
  return estado.itens.filter((i) => i.pasta_id === pastaId && i.ativo && itemAplica(i, estado.hoje))
}

/** Itens ativos da pasta que têm agenda (dia do mês, dias da semana) e não caem hoje. */
export function itensDaPastaOutrosDias(pastaId) {
  return estado.itens.filter(
    (i) =>
      i.pasta_id === pastaId &&
      i.ativo &&
      !itemAplica(i, estado.hoje) &&
      (i.dia_mes || i.dias_semana?.length || (i.a_partir_de && i.a_partir_de > estado.hoje)),
  )
}

export function marcacaoDoItem(itemId) {
  return estado.marcacoes.find((m) => m.item_id === itemId && m.feito) || null
}

export function pastaPorId(id) {
  return estado.pastas.find((p) => p.id === id) || null
}

export function acaoPorId(id) {
  return estado.acoes.find((a) => a.id === id) || null
}

export function atasAtivas() {
  return estado.atas.filter((a) => !a.concluida_em)
}

export function atasArquivadas() {
  return estado.atas
    .filter((a) => a.concluida_em)
    .sort((a, b) => b.concluida_em.localeCompare(a.concluida_em))
}

export function acoesDaAta(ataId) {
  return estado.acoes.filter((a) => a.ata_id === ataId)
}

/** Ações das atas que ainda estão em andamento (não arquivadas). */
export function acoesAtivas() {
  const ativas = new Set(atasAtivas().map((a) => a.id))
  return estado.acoes.filter((a) => ativas.has(a.ata_id))
}

/** Ação única passada da data sem "feito"; rotina que nem começou depois da data. */
export function acaoAtrasada(acao, hoje = estado.hoje) {
  if (acao.status === 'feito' || acao.comeca >= hoje) return false
  return acao.ritmo === 'unica' ? true : acao.status === 'aberto'
}

// ------------------------------------------------------------ mudanças
export async function alternarItem(item, feito) {
  const marcacao = await dados.marcar(item, feito, estado.uid, estado.hoje)
  estado.marcacoes = estado.marcacoes.filter((m) => m.item_id !== item.id)
  estado.marcacoes.push(marcacao)
  // Item de uma ação única do plano: marcar conclui a ação e tira o item da lista.
  const acao = item.acao_id ? acaoPorId(item.acao_id) : null
  if (acao && acao.ritmo === 'unica') {
    const mudancas = feito
      ? { status: 'feito', concluido_em: new Date().toISOString() }
      : { status: 'andando', concluido_em: null }
    const nova = await dados.atualizarAcao(acao.id, mudancas)
    substituirAcao(nova)
  }
  avisarMudanca('marcacao')
}

export async function adicionarItem(pasta, texto) {
  const ordem = estado.itens.filter((i) => i.pasta_id === pasta.id).length + 1
  const item = await dados.criarItem(pasta, texto.trim(), ordem)
  estado.itens.push(item)
  avisarMudanca('itens')
  return item
}

/** Agenda do item: { dias_semana, dia_mes } (nulos = todo dia). */
export async function salvarAgendaDoItem(item, agenda) {
  const novo = await dados.atualizarItem(item.id, {
    dias_semana: agenda.dias_semana?.length ? agenda.dias_semana : null,
    dia_mes: agenda.dia_mes || null,
  })
  const i = estado.itens.findIndex((x) => x.id === item.id)
  if (i >= 0) estado.itens[i] = novo
  avisarMudanca('itens')
  return novo
}

export async function removerItem(item) {
  await dados.removerItem(item)
  estado.itens = estado.itens.filter((i) => i.id !== item.id)
  estado.marcacoes = estado.marcacoes.filter((m) => m.item_id !== item.id)
  avisarMudanca('itens')
}

export function substituirAcao(acao) {
  const i = estado.acoes.findIndex((a) => a.id === acao.id)
  if (i >= 0) estado.acoes[i] = acao
  else estado.acoes.push(acao)
}

export async function mudarStatusDaAcao(acao, status) {
  const mudancas = { status, concluido_em: status === 'feito' ? new Date().toISOString() : null }
  const nova = await dados.atualizarAcao(acao.id, mudancas)
  substituirAcao(nova)
  // O item ligado a uma ação única acompanha: feito marca hoje; reaberto desmarca.
  const item = estado.itens.find((i) => i.acao_id === acao.id)
  if (acao.ritmo === 'unica' && item) {
    if (status === 'feito') {
      const marcacao = await dados.marcar(item, true, estado.uid, estado.hoje)
      estado.marcacoes = estado.marcacoes.filter((m) => m.item_id !== item.id).concat(marcacao)
    } else if (marcacaoDoItem(item.id)) {
      await dados.apagarMarcacao(item.id, estado.hoje)
      estado.marcacoes = estado.marcacoes.filter((m) => m.item_id !== item.id)
    }
  }
  avisarMudanca('acoes')
}

export async function anotarAcao(acao, nota) {
  const nova = await dados.atualizarAcao(acao.id, { nota })
  substituirAcao(nova)
}
