// Hoje: medidores, uma coluna por pasta com o checklist do dia.
import { el, limpar, icone, avisar, mensagemDeErro, confirmar } from './dom.js'
import {
  estado,
  pastasDoChecklist,
  itensDaPastaHoje,
  marcacaoDoItem,
  podeEditar,
  alternarItem,
  adicionarItem,
  removerItem,
  acaoPorId,
} from './estado.js'
import { dataLonga, horaDoInstante, dataCurta } from './datas.js'
import { montarPlano } from './tela-plano.js'
import { montarEficiencia } from './tela-eficiencia.js'

const X = 'M4 4l8 8M12 4l-8 8'

export function resumoDoDia() {
  let total = 0
  let feitas = 0
  for (const pasta of pastasDoChecklist()) {
    const itens = itensDaPastaHoje(pasta.id)
    total += itens.length
    feitas += itens.filter((i) => marcacaoDoItem(i.id)).length
  }
  const pct = total ? Math.round((feitas / total) * 100) : 0
  return { total, feitas, faltam: total - feitas, pct }
}

function medidor(rotulo, valor) {
  return el('div', {}, el('div', { class: 'rot' }, rotulo), el('div', { class: 'val num' }, valor))
}

function linhaItem(item, pasta) {
  const marcacao = marcacaoDoItem(item.id)
  const acao = item.acao_id ? acaoPorId(item.acao_id) : null
  const caixa = el('input', {
    type: 'checkbox',
    'aria-label': item.texto,
    disabled: !podeEditar(pasta),
  })
  caixa.checked = Boolean(marcacao)
  caixa.addEventListener('change', async () => {
    caixa.disabled = true
    try {
      await alternarItem(item, caixa.checked)
    } catch (e) {
      caixa.checked = !caixa.checked
      avisar(mensagemDeErro(e, 'Não consegui salvar a marcação.'), true)
    } finally {
      caixa.disabled = !podeEditar(pasta)
    }
  })
  const etiqueta = acao
    ? el(
        'span',
        { class: 'etiqueta' },
        acao.ritmo === 'unica' ? `plano · ${dataCurta(acao.comeca)}` : 'plano',
      )
    : null
  const remover = el(
    'button',
    {
      type: 'button',
      class: 'remover',
      'aria-label': `Remover “${item.texto}”`,
      title: 'Remover da lista',
      onClick: async () => {
        if (
          acao &&
          !(await confirmar(`Tirar “${item.texto}” da lista? A ação continua no plano.`, 'Tirar'))
        )
          return
        try {
          await removerItem(item)
        } catch (e) {
          avisar(mensagemDeErro(e, 'Não consegui remover.'), true)
        }
      },
    },
    icone(X, 12),
  )
  return el(
    'li',
    { class: `item${marcacao ? ' feito' : ''}`, dataset: { item: item.id } },
    caixa,
    el('span', { class: 'texto' }, item.texto, etiqueta),
    marcacao ? el('span', { class: 'hora num' }, horaDoInstante(marcacao.marcado_em)) : null,
    podeEditar(pasta) ? remover : null,
  )
}

function coluna(pasta) {
  const itens = itensDaPastaHoje(pasta.id)
  const feitos = itens.filter((i) => marcacaoDoItem(i.id)).length
  const pct = itens.length ? Math.round((feitos / itens.length) * 100) : 0
  const anel = el('div', { class: 'anel', role: 'img', 'aria-label': `${pct}% feito` })
  anel.style.setProperty('--p', `${pct}%`)
  anel.style.setProperty('--cor', pasta.cor || '#D9B45A')

  const lista = el(
    'ul',
    {},
    itens.map((i) => linhaItem(i, pasta)),
  )
  if (!itens.length) lista.append(el('li', { class: 'vazio' }, 'Nada na lista de hoje.'))

  const campo = el('input', {
    type: 'text',
    placeholder: 'Novo item',
    'aria-label': `Novo item em ${pasta.nome}`,
    maxlength: '200',
    autocomplete: 'off',
  })
  campo.addEventListener('keydown', async (evento) => {
    if (evento.key !== 'Enter') return
    evento.preventDefault()
    const texto = campo.value.trim()
    if (!texto) return
    campo.disabled = true
    try {
      await adicionarItem(pasta, texto)
      campo.value = ''
    } catch (e) {
      avisar(mensagemDeErro(e, 'Não consegui adicionar.'), true)
    } finally {
      campo.disabled = false
      campo.focus()
    }
  })

  return el(
    'section',
    { class: 'cartao coluna', dataset: { pasta: pasta.id } },
    el(
      'header',
      {},
      anel,
      el('h2', {}, pasta.nome),
      el('span', { class: 'fracao num' }, `${feitos}/${itens.length}`),
    ),
    lista,
    podeEditar(pasta) ? el('div', { class: 'novo-item' }, campo) : null,
  )
}

export function montarHoje(raiz) {
  limpar(raiz)
  const r = resumoDoDia()
  raiz.append(
    el(
      'div',
      { class: 'cabecalho' },
      el('div', {}, el('h1', {}, 'Hoje'), el('p', {}, dataLonga(estado.hoje))),
      el(
        'div',
        { class: 'medidores', id: 'medidores' },
        medidor('Feitas', r.feitas),
        medidor('Faltam', r.faltam),
        medidor('% do dia', `${r.pct}%`),
      ),
    ),
    el('div', { class: 'colunas', id: 'colunas' }, pastasDoChecklist().map(coluna)),
  )
  if (!pastasDoChecklist().length) {
    raiz.append(el('p', { class: 'vazio' }, 'Nenhuma pasta no checklist ainda.'))
  }
  montarPlano(raiz)
  montarEficiencia(raiz)
}
