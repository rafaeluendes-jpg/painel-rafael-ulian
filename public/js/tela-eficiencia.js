// Eficiência: últimos 14 dias com linha de média, "hoje por frente" e o que fica para trás.
import { el, limpar } from './dom.js'
import {
  estado,
  pastasDoChecklist,
  itensDaPastaHoje,
  marcacaoDoItem,
  aoMudar,
  itemAplica,
  acaoAtrasada,
  acoesAtivas,
} from './estado.js'
import { dados } from './dados.js'
import { ultimosDias, dataBR, diaDoMes } from './datas.js'

const DIAS = 14
const NS = 'http://www.w3.org/2000/svg'
let historico = { itens: [], marcacoes: [], carregadoEm: '' }
let raizEficiencia = null

function svg(tag, atributos) {
  const n = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(atributos)) n.setAttribute(k, v)
  return n
}

/** Percentual feito de cada dia (nulo quando não havia item). Hoje usa o estado vivo. */
function serie() {
  const dias = ultimosDias(DIAS, estado.hoje)
  const feitasPorDia = new Map()
  for (const m of historico.marcacoes) {
    if (!m.feito) continue
    if (!feitasPorDia.has(m.data)) feitasPorDia.set(m.data, new Set())
    feitasPorDia.get(m.data).add(m.item_id)
  }
  const pastasVisiveis = new Set(pastasDoChecklist().map((p) => p.id))
  const itens = historico.itens.filter((i) => pastasVisiveis.has(i.pasta_id))
  return dias.map((dia) => {
    if (dia === estado.hoje) {
      let total = 0
      let feitas = 0
      for (const pasta of pastasDoChecklist()) {
        const lista = itensDaPastaHoje(pasta.id)
        total += lista.length
        feitas += lista.filter((i) => marcacaoDoItem(i.id)).length
      }
      return { dia, total, feitas, pct: total ? feitas / total : null }
    }
    const aplicaveis = itens.filter((i) => itemAplica(i, dia))
    const feitas = aplicaveis.filter((i) => feitasPorDia.get(dia)?.has(i.id)).length
    return {
      dia,
      total: aplicaveis.length,
      feitas,
      pct: aplicaveis.length ? feitas / aplicaveis.length : null,
    }
  })
}

function grafico(pontos) {
  const L = 560
  const A = 150
  const topo = 16
  const base = A - 22
  const alturaUtil = base - topo
  const passo = L / pontos.length
  const larguraBarra = passo * 0.6
  const g = svg('svg', { class: 'grafico', viewBox: `0 0 ${L} ${A}`, role: 'img' })
  const validos = pontos.filter((p) => p.pct !== null)
  const media = validos.length ? validos.reduce((s, p) => s + p.pct, 0) / validos.length : 0
  g.setAttribute(
    'aria-label',
    `Percentual feito por dia nos últimos ${DIAS} dias; média ${Math.round(media * 100)}%`,
  )

  g.append(svg('line', { class: 'eixo', x1: 0, x2: L, y1: base, y2: base }))
  pontos.forEach((p, i) => {
    const x = i * passo + (passo - larguraBarra) / 2
    const h = p.pct === null ? 0 : Math.max(2, p.pct * alturaUtil)
    const barra = svg('rect', {
      class: `barra${p.dia === estado.hoje ? ' hoje' : ''}`,
      x,
      y: base - h,
      width: larguraBarra,
      height: h,
      rx: 3,
    })
    barra.append(svg('title', {}))
    barra.firstChild.textContent = `${dataBR(p.dia)}: ${p.feitas}/${p.total}`
    g.append(barra)
    const rotulo = svg('text', { class: 'rotulo', x: x + larguraBarra / 2, y: A - 8 })
    rotulo.textContent = String(diaDoMes(p.dia))
    g.append(rotulo)
    if (p.pct !== null && (p.dia === estado.hoje || p.pct >= 0.995)) {
      const valor = svg('text', { class: 'valor', x: x + larguraBarra / 2, y: base - h - 4 })
      valor.textContent = `${Math.round(p.pct * 100)}%`
      g.append(valor)
    }
  })
  if (validos.length) {
    const y = base - media * alturaUtil
    g.append(svg('line', { class: 'media', x1: 0, x2: L, y1: y, y2: y }))
    const t = svg('text', { class: 'media-rotulo', x: L - 2, y: y - 4, 'text-anchor': 'end' })
    t.textContent = `média ${Math.round(media * 100)}%`
    g.append(t)
  }
  return g
}

function porFrente() {
  const linhas = pastasDoChecklist().map((pasta) => {
    const itens = itensDaPastaHoje(pasta.id)
    const feitas = itens.filter((i) => marcacaoDoItem(i.id)).length
    return { nome: pasta.nome, cor: pasta.cor, feitas, total: itens.length }
  })
  const acoes = acoesAtivas()
  if (acoes.length) {
    linhas.push({
      nome: 'Plano de ação',
      cor: '#F0DCA0',
      feitas: acoes.filter((a) => a.status === 'feito').length,
      total: acoes.length,
      atrasadas: acoes.filter((a) => acaoAtrasada(a)).length,
    })
  }
  return linhas.map((l) => {
    const pct = l.total ? Math.round((l.feitas / l.total) * 100) : 0
    const barra = el('i')
    barra.style.width = `${pct}%`
    if (l.cor) barra.style.setProperty('--cor', l.cor)
    return el(
      'div',
      { class: 'frente' },
      el('span', { class: 'nome' }, l.nome),
      el('div', { class: 'trilho' }, barra),
      el('span', { class: 'v num' }, `${l.feitas}/${l.total}`),
    )
  })
}

/** Itens com maior taxa de não conclusão nos últimos dias completos (hoje ainda não acabou). */
function ficaParaTras() {
  const dias = ultimosDias(DIAS, estado.hoje).slice(0, -1)
  const feitas = new Set(
    historico.marcacoes.filter((m) => m.feito).map((m) => `${m.item_id}|${m.data}`),
  )
  const pastas = new Map(estado.pastas.map((p) => [p.id, p.nome]))
  const linhas = []
  for (const item of historico.itens) {
    const aplicaveis = dias.filter((d) => itemAplica(item, d))
    if (!aplicaveis.length) continue
    const naoFeitos = aplicaveis.filter((d) => !feitas.has(`${item.id}|${d}`)).length
    if (!naoFeitos) continue
    linhas.push({ item, dias: aplicaveis.length, naoFeitos, taxa: naoFeitos / aplicaveis.length })
  }
  linhas.sort((a, b) => b.taxa - a.taxa || b.naoFeitos - a.naoFeitos)
  if (!linhas.length) return el('p', { class: 'vazio' }, 'Nada ficou para trás. Boa.')
  return el(
    'div',
    { class: 'atras' },
    linhas
      .slice(0, 6)
      .map((l) =>
        el(
          'div',
          {},
          el('span', { class: 't', title: pastas.get(l.item.pasta_id) || '' }, l.item.texto),
          el('span', { class: 'v num' }, `${l.naoFeitos} de ${l.dias} dias`),
        ),
      ),
  )
}

function desenhar() {
  if (!raizEficiencia) return
  limpar(raizEficiencia)
  raizEficiencia.append(
    el(
      'section',
      { class: 'cartao' },
      el('h3', {}, `Últimos ${DIAS} dias`, el('span', { class: 'selo vivo' }, 'ao vivo')),
      grafico(serie()),
    ),
    el('section', { class: 'cartao' }, el('h3', {}, 'Hoje, por frente'), porFrente()),
    el('section', { class: 'cartao' }, el('h3', {}, 'O que mais fica para trás'), ficaParaTras()),
  )
}

async function carregarHistorico() {
  const [itens, marcacoes] = await Promise.all([
    dados.itensTodos(),
    dados.marcacoesDesde(DIAS, estado.hoje),
  ])
  historico = { itens, marcacoes, carregadoEm: estado.hoje }
}

let escutando = false
export function montarEficiencia(raiz) {
  raiz.querySelector('.eficiencia')?.remove()
  raizEficiencia = el('div', { class: 'eficiencia', id: 'eficiencia' })
  raiz.append(raizEficiencia)
  desenhar()
  if (historico.carregadoEm !== estado.hoje) {
    carregarHistorico()
      .then(desenhar)
      .catch(() => {
        /* o gráfico fica só com o dia de hoje */
      })
  }
  if (!escutando) {
    escutando = true
    aoMudar((origem) => {
      if (origem === 'tudo') return // a tela inteira é remontada
      if (origem === 'itens' || origem === 'acoes' || origem === 'dia') {
        carregarHistorico().then(desenhar).catch(desenhar)
      } else if (origem === 'marcacao') {
        // Só hoje muda: atualiza a marcação no histórico e redesenha.
        historico.marcacoes = historico.marcacoes
          .filter((m) => m.data !== estado.hoje)
          .concat(estado.marcacoes)
        desenhar()
      }
    })
  }
}
