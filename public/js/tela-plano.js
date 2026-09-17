// Planos de ação: cada ata importada é um grupo que abre e fecha na tela Hoje.
// Quando tudo está feito, a ata é arquivada e vai para Relatórios.
import { el, icone, avisar, mensagemDeErro, abrirDialogo, fecharDialogo, confirmar } from './dom.js'
import {
  estado,
  pastaPorId,
  podeEditar,
  mudarStatusDaAcao,
  anotarAcao,
  recarregarDia,
  souAdmin,
  acaoAtrasada,
  atasAtivas,
  acoesDaAta,
} from './estado.js'
import { dados } from './dados.js'
import {
  dataBR,
  prazoRelativo,
  diaDaSemana,
  mesIndice,
  diaDoMes,
  DIAS_SEMANA,
  MESES,
} from './datas.js'
import { lerAta, textoDoItem } from './ata.js'

const STATUS = [
  ['aberto', 'Não iniciado', ''],
  ['andando', 'Em andamento', 'andando'],
  ['feito', 'Feito', 'feito'],
]
const SETA = 'M6 3l5 5-5 5'
const LIXEIRA = 'M3 4h10M6 4V2.5h4V4M4.5 4l.6 9h5.8l.6-9'
const CHAVE_ABERTAS = 'ru.atas.abertas'
const detalhesAbertos = new Set()

function atasAbertas() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE_ABERTAS) || '[]'))
  } catch {
    return new Set()
  }
}
function guardarAbertas(conjunto) {
  try {
    localStorage.setItem(CHAVE_ABERTAS, JSON.stringify([...conjunto]))
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

function ordenar(a, b) {
  const la = acaoAtrasada(a) ? 0 : 1
  const lb = acaoAtrasada(b) ? 0 : 1
  if (la !== lb) return la - lb
  if (a.status === 'feito' && b.status !== 'feito') return 1
  if (b.status === 'feito' && a.status !== 'feito') return -1
  return a.comeca.localeCompare(b.comeca) || a.ordem - b.ordem
}

function subtitulo(acao) {
  const partes = [
    acao.ritmo_texto,
    acao.custo,
    acao.revisa ? `revisa em ${dataBR(acao.revisa)}` : '',
  ]
  return partes.filter(Boolean).join(' · ')
}

function detalhe(acao, pasta) {
  const campos = []
  if (acao.detalhe) campos.push(['O que é', acao.detalhe])
  if (acao.mede?.length) {
    campos.push([
      'Como mede',
      el(
        'ul',
        {},
        acao.mede.map((m) => el('li', {}, m)),
      ),
    ])
  }
  if (acao.meta) campos.push(['Meta', acao.meta])
  campos.push(['Ritmo', acao.ritmo_texto || 'uma vez'])
  const nota = el('input', {
    type: 'text',
    value: acao.nota || '',
    placeholder: 'Número da semana, observação…',
    disabled: !podeEditar(pasta),
    'aria-label': `Observação de ${acao.titulo}`,
  })
  nota.addEventListener('change', async () => {
    try {
      await anotarAcao(acao, nota.value.trim())
      avisar('Observação salva.')
    } catch (e) {
      avisar(mensagemDeErro(e, 'Não consegui salvar a observação.'), true)
    }
  })
  return el(
    'div',
    { class: 'acao-detalhe' },
    campos.map(([rot, txt]) => el('div', {}, el('div', { class: 'rot' }, rot), txt)),
    el('div', { class: 'nota' }, el('div', { class: 'rot' }, 'Observação'), nota),
  )
}

export function linhaAcao(acao, pasta, somenteLeitura = false) {
  const atrasada = acaoAtrasada(acao)
  const hoje = acao.comeca === estado.hoje
  const pode = podeEditar(pasta) && !somenteLeitura
  const pilulas = STATUS.map(([valor, rotulo, classe]) =>
    el(
      'button',
      {
        type: 'button',
        class: `pilula ${classe}${acao.status === valor ? ' ativa' : ''}`,
        'aria-pressed': String(acao.status === valor),
        disabled: !pode || acao.status === valor,
        hidden: somenteLeitura && acao.status !== valor,
        onClick: async () => {
          try {
            await mudarStatusDaAcao(acao, valor)
          } catch (e) {
            avisar(mensagemDeErro(e, 'Não consegui mudar o status.'), true)
          }
        },
      },
      rotulo,
    ),
  )
  const titulo = el(
    'button',
    {
      type: 'button',
      class: 'titulo',
      'aria-expanded': String(detalhesAbertos.has(acao.id)),
      onClick: () => {
        if (detalhesAbertos.has(acao.id)) detalhesAbertos.delete(acao.id)
        else detalhesAbertos.add(acao.id)
        montarPlano()
      },
    },
    acao.titulo,
    acao.quem ? el('span', { class: 'quem' }, ` · ${acao.quem}`) : null,
  )
  return el(
    'div',
    { class: `acao${acao.status === 'feito' ? ' feita' : ''}`, dataset: { acao: acao.id } },
    el(
      'div',
      { class: 'quando num' },
      el('b', {}, String(diaDoMes(acao.comeca)).padStart(2, '0')),
      `${DIAS_SEMANA[diaDaSemana(acao.comeca)]} · ${MESES[mesIndice(acao.comeca)]}`,
    ),
    el('div', { class: 'texto' }, titulo, el('div', { class: 'sub' }, subtitulo(acao))),
    el(
      'div',
      { class: 'estado' },
      acao.status !== 'feito' && !somenteLeitura
        ? el('span', { class: 'prazo num' }, prazoRelativo(acao.comeca))
        : null,
      atrasada && !somenteLeitura ? el('span', { class: 'pilula atrasada' }, 'Atrasada') : null,
      hoje && !atrasada && acao.status !== 'feito' && !somenteLeitura
        ? el('span', { class: 'pilula hoje' }, 'Hoje')
        : null,
      pilulas,
    ),
    detalhesAbertos.has(acao.id) ? detalhe(acao, pasta) : null,
  )
}

export function resumoDaAta(acoes) {
  return {
    total: acoes.length,
    feitas: acoes.filter((a) => a.status === 'feito').length,
    andando: acoes.filter((a) => a.status === 'andando').length,
    atrasadas: acoes.filter((a) => acaoAtrasada(a)).length,
  }
}

// ---------------------------------------------------------------- importar
async function importarAta(pastaInicial) {
  const pastas = estado.pastas.filter(podeEditar)
  const seletor = el(
    'select',
    { id: 'ata-pasta', 'aria-label': 'Pasta do plano' },
    pastas.map((p) => el('option', { value: p.id, selected: p.id === pastaInicial?.id }, p.nome)),
  )
  const nome = el('input', { type: 'text', id: 'ata-nome', maxlength: '80' })
  const nomeSugerido = () => `Ata ${pastaPorId(seletor.value)?.nome || ''}`.trim()
  nome.value = nomeSugerido()
  seletor.addEventListener('change', () => (nome.value = nomeSugerido()))
  const campo = el('textarea', {
    id: 'ata-texto',
    placeholder: '20/09/2026 | Rafael | Fechar o freezer da AABB | uma vez | detalhe…',
    spellcheck: 'false',
  })
  const erro = el('p', { class: 'erro', hidden: true, role: 'alert' })
  const botao = el('button', { type: 'button', class: 'botao ouro' }, 'Importar')

  if (!estado.atas.length) {
    try {
      const r = await fetch('/dados/ata-2026-09-16.txt')
      if (r.ok) campo.value = await r.text()
    } catch {
      /* sem a ata de exemplo, o campo fica vazio */
    }
  }

  botao.addEventListener('click', async () => {
    erro.hidden = true
    const pasta = pastaPorId(seletor.value)
    let lido
    try {
      lido = lerAta(campo.value)
    } catch (e) {
      erro.textContent = e.message
      erro.hidden = false
      return
    }
    if (!nome.value.trim()) {
      erro.textContent = 'Dê um nome para a ata.'
      erro.hidden = false
      return
    }
    botao.disabled = true
    try {
      const ata = await dados.criarAta({
        dono_id: pasta.dono_id,
        pasta_id: pasta.id,
        titulo: nome.value.trim(),
        origem: lido.origem,
        texto: campo.value,
      })
      const linhas = lido.acoes.map((a) => ({
        ...a,
        dono_id: pasta.dono_id,
        pasta_id: pasta.id,
        ata_id: ata.id,
        origem: lido.origem,
      }))
      const criadas = await dados.criarAcoes(linhas)
      // Cada ação vira um item do checklist com a agenda dela.
      let ordem = estado.itens.filter((i) => i.pasta_id === pasta.id).length
      for (const acao of criadas) {
        await dados.criarItem(pasta, textoDoItem(acao), ++ordem, {
          acao_id: acao.id,
          a_partir_de: acao.comeca,
          dias_semana: acao.ritmo === 'semanal' ? acao.dias_semana : null,
          dia_mes: acao.ritmo === 'mensal' ? acao.dia_mes : null,
        })
      }
      // Toda segunda: 15 minutos de revisão do plano.
      const revisao = 'Revisar o plano de ação (15 min)'
      if (!estado.itens.some((i) => i.pasta_id === pasta.id && i.texto === revisao)) {
        await dados.criarItem(pasta, revisao, ++ordem, { dias_semana: [1] })
      }
      const abertas = atasAbertas()
      abertas.add(ata.id)
      guardarAbertas(abertas)
      await recarregarDia()
      fecharDialogo()
      avisar(`${criadas.length} ações importadas em “${ata.titulo}”.`)
    } catch (e) {
      erro.textContent = mensagemDeErro(e, 'Não consegui importar a ata.')
      erro.hidden = false
    } finally {
      botao.disabled = false
    }
  })

  await abrirDialogo([
    el('h2', {}, 'Importar ata'),
    el('label', { for: 'ata-pasta' }, 'Pasta'),
    seletor,
    el('label', { for: 'ata-nome' }, 'Nome da ata'),
    nome,
    el('label', { for: 'ata-texto' }, 'Ata (uma ação por linha)'),
    campo,
    el(
      'p',
      { class: 'formato-ata' },
      'Formato: ',
      el(
        'code',
        {},
        'data | quem | título | ritmo | detalhe | custo: … | mede: a; b | meta: … | revisa: dd/mm',
      ),
      '. Ritmo: “uma vez”, “todo dia”, “seg qua sex” ou “mensal dia 20”. Também aceita o JSON da página do plano.',
    ),
    erro,
    el(
      'div',
      { class: 'dialogo-acoes' },
      el('button', { type: 'button', class: 'botao', onClick: fecharDialogo }, 'Cancelar'),
      botao,
    ),
  ])
}

// ---------------------------------------------------------------- arquivar e apagar
async function arquivarAta(ata) {
  const r = resumoDaAta(acoesDaAta(ata.id))
  const pergunta =
    r.feitas === r.total
      ? `Concluir “${ata.titulo}” e mandar para Relatórios?`
      : `Ainda faltam ${r.total - r.feitas} de ${r.total} ações. Arquivar “${ata.titulo}” mesmo assim?`
  if (!(await confirmar(pergunta, 'Arquivar'))) return
  try {
    await dados.atualizarAta(ata.id, { concluida_em: new Date().toISOString() })
    // Os itens do checklist ligados às ações da ata saem da lista do dia.
    const ids = new Set(acoesDaAta(ata.id).map((a) => a.id))
    for (const item of estado.itens.filter((i) => i.acao_id && ids.has(i.acao_id))) {
      await dados.removerItem(item)
    }
    await recarregarDia()
    avisar(`“${ata.titulo}” foi para Relatórios.`)
  } catch (e) {
    avisar(mensagemDeErro(e, 'Não consegui arquivar a ata.'), true)
  }
}

async function apagarAta(ata) {
  if (
    !(await confirmar(
      `Apagar “${ata.titulo}” e todas as ações dela? Não dá para desfazer.`,
      'Apagar',
    ))
  )
    return
  try {
    await dados.apagarAta(ata.id)
    await recarregarDia()
    avisar('Ata apagada.')
  } catch (e) {
    avisar(mensagemDeErro(e, 'Não consegui apagar a ata.'), true)
  }
}

// ---------------------------------------------------------------- a linha de cada ata
function barra(r) {
  const b = el('i')
  b.style.width = `${r.total ? Math.round((r.feitas / r.total) * 100) : 0}%`
  return el('div', { class: 'trilho' }, b)
}

function linhaAta(ata, aberta) {
  const pasta = pastaPorId(ata.pasta_id)
  const acoes = acoesDaAta(ata.id)
  const r = resumoDaAta(acoes)
  const pode = podeEditar(pasta)
  const cabecalho = el(
    'button',
    {
      type: 'button',
      class: 'ata-cabecalho',
      'aria-expanded': String(aberta),
      onClick: () => {
        const abertas = atasAbertas()
        if (abertas.has(ata.id)) abertas.delete(ata.id)
        else abertas.add(ata.id)
        guardarAbertas(abertas)
        montarPlano()
      },
    },
    el('span', { class: `seta${aberta ? ' aberta' : ''}` }, icone(SETA, 14)),
    el(
      'span',
      { class: 'ata-titulo' },
      el('b', {}, ata.titulo),
      el('span', { class: 'sec' }, [pasta?.nome, ata.origem].filter(Boolean).join(' · ')),
    ),
    el(
      'span',
      { class: 'ata-resumo num' },
      el('span', {}, `${r.feitas}/${r.total} feitas`),
      r.atrasadas
        ? el('span', { class: 'atrasadas' }, `${r.atrasadas} atrasada${r.atrasadas > 1 ? 's' : ''}`)
        : null,
      barra(r),
    ),
  )
  const corpo = aberta
    ? el(
        'div',
        { class: 'ata-corpo' },
        el(
          'div',
          { class: 'acoes' },
          [...acoes].sort(ordenar).map((a) => linhaAcao(a, pasta)),
        ),
        el(
          'div',
          { class: 'plano-rodape' },
          el(
            'span',
            {},
            'Ação com data que passou sem “Feito” fica ',
            el('b', {}, 'Atrasada'),
            ' e sobe para o topo.',
          ),
          pode
            ? el(
                'span',
                { class: 'ata-botoes' },
                el(
                  'button',
                  {
                    type: 'button',
                    class: `botao pequeno${r.feitas === r.total ? ' ouro' : ''}`,
                    onClick: () => arquivarAta(ata),
                  },
                  r.feitas === r.total
                    ? 'Concluir e mandar para Relatórios'
                    : 'Arquivar em Relatórios',
                ),
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'icone',
                    title: 'Apagar ata',
                    'aria-label': 'Apagar ata',
                    onClick: () => apagarAta(ata),
                  },
                  icone(LIXEIRA, 14),
                ),
              )
            : null,
        ),
      )
    : null
  return el(
    'div',
    { class: `ata${aberta ? ' aberta' : ''}`, dataset: { ata: ata.id } },
    cabecalho,
    corpo,
  )
}

let raizPlano = null

export function montarPlano(raiz = raizPlano) {
  if (!raiz) return
  raizPlano = raiz
  raiz.querySelectorAll('.plano').forEach((n) => n.remove())
  const atas = atasAtivas()
  const podeImportar = souAdmin() || estado.pastas.some(podeEditar)
  if (!atas.length && !podeImportar) return
  const abertas = atasAbertas()
  const pastaPadrao =
    pastaPorId(estado.pastas.find((p) => p.chave === 'rafaellos')?.id) || estado.pastas[0]
  const secao = el(
    'section',
    { class: 'cartao plano' },
    el(
      'header',
      {},
      el('h2', {}, 'Planos de ação'),
      el('span', { class: 'selo' }, atas.length === 1 ? '1 ata' : `${atas.length} atas`),
      podeImportar
        ? el(
            'button',
            {
              type: 'button',
              class: 'botao pequeno',
              style: { marginLeft: 'auto' },
              onClick: () => importarAta(pastaPadrao),
            },
            'Importar ata',
          )
        : null,
    ),
    atas.length
      ? el(
          'div',
          { class: 'atas' },
          atas.map((a) => linhaAta(a, abertas.has(a.id))),
        )
      : el(
          'p',
          { class: 'vazio' },
          'Traga a ata da reunião: cada decisão vira uma ação com data, e as rotinas entram no checklist.',
        ),
  )
  const ancora = raiz.querySelector('.eficiencia')
  if (ancora) raiz.insertBefore(secao, ancora)
  else raiz.append(secao)
}
