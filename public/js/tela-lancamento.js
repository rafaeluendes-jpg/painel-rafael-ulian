// Lançamento: checklists que o dono monta uma vez (com o nome que quiser), lado a
// lado como as colunas de Hoje. Marca conforme faz; "Zerar" desmarca tudo para a
// próxima vez. Não zeram sozinhas e não gravam hora.
import { el, limpar, icone, avisar, mensagemDeErro, confirmar, pedirTexto } from './dom.js'
import { estado, avisarMudanca } from './estado.js'
import { dados } from './dados.js'
import { dataBR, dataDoInstante } from './datas.js'

const X = 'M4 4l8 8M12 4l-8 8'
const LAPIS = 'M11.5 2.5l2 2L6 12H4v-2z'

function itensDaLista(lista) {
  return estado.listaItens
    .filter((i) => i.lista_id === lista.id)
    .sort((a, b) => a.ordem - b.ordem || a.criado_em.localeCompare(b.criado_em))
}

function linhaItem(item) {
  const caixa = el('input', { type: 'checkbox', 'aria-label': item.texto })
  caixa.checked = item.feito
  caixa.addEventListener('change', async () => {
    caixa.disabled = true
    try {
      const novo = await dados.marcarItemDeLista(item.id, caixa.checked)
      Object.assign(item, novo)
      avisarMudanca('listas')
    } catch (e) {
      caixa.checked = !caixa.checked
      caixa.disabled = false
      avisar(mensagemDeErro(e, 'Não consegui marcar.'), true)
    }
  })
  const remover = el(
    'button',
    {
      type: 'button',
      class: 'remover',
      title: 'Remover',
      'aria-label': `Remover “${item.texto}”`,
      onClick: async () => {
        try {
          await dados.apagarItemDeLista(item.id)
          estado.listaItens = estado.listaItens.filter((i) => i.id !== item.id)
          avisarMudanca('listas')
        } catch (e) {
          avisar(mensagemDeErro(e, 'Não consegui remover.'), true)
        }
      },
    },
    icone(X, 12),
  )
  return el(
    'li',
    { class: `item${item.feito ? ' feito' : ''}`, dataset: { item: item.id } },
    caixa,
    el('span', { class: 'texto' }, item.texto),
    remover,
  )
}

async function renomear(lista) {
  const nome = await pedirTexto('Renomear lista', { valor: lista.nome, rotulo: 'Renomear' })
  if (!nome || nome === lista.nome) return
  try {
    Object.assign(lista, await dados.atualizarLista(lista.id, { nome: nome.trim().slice(0, 60) }))
    avisarMudanca('listas')
  } catch (e) {
    avisar(mensagemDeErro(e, 'Não consegui renomear.'), true)
  }
}

async function zerar(lista) {
  const itens = itensDaLista(lista)
  if (!itens.some((i) => i.feito)) {
    avisar('Nada marcado para zerar.')
    return
  }
  if (!(await confirmar(`Zerar as marcações de “${lista.nome}”? Os itens continuam.`, 'Zerar')))
    return
  try {
    await dados.zerarLista(lista.id)
    for (const i of itens) i.feito = false
    Object.assign(
      lista,
      await dados.atualizarLista(lista.id, {
        vezes_zerada: (lista.vezes_zerada || 0) + 1,
        zerada_em: new Date().toISOString(),
      }),
    )
    avisarMudanca('listas')
    avisar(`“${lista.nome}” zerada.`)
  } catch (e) {
    avisar(mensagemDeErro(e, 'Não consegui zerar.'), true)
  }
}

async function apagar(lista) {
  if (!(await confirmar(`Apagar a lista “${lista.nome}” com todos os itens?`, 'Apagar'))) return
  try {
    await dados.apagarLista(lista.id)
    estado.listas = estado.listas.filter((l) => l.id !== lista.id)
    estado.listaItens = estado.listaItens.filter((i) => i.lista_id !== lista.id)
    avisarMudanca('listas')
    avisar('Lista apagada.')
  } catch (e) {
    avisar(mensagemDeErro(e, 'Não consegui apagar.'), true)
  }
}

function coluna(lista) {
  const itens = itensDaLista(lista)
  const feitos = itens.filter((i) => i.feito).length
  const pct = itens.length ? Math.round((feitos / itens.length) * 100) : 0
  const anel = el('div', { class: 'anel', role: 'img', 'aria-label': `${pct}% feito` })
  anel.style.setProperty('--p', `${pct}%`)

  const ul = el('ul', {}, itens.map(linhaItem))
  if (!itens.length) ul.append(el('li', { class: 'vazio' }, 'Escreva o primeiro item abaixo.'))

  const campo = el('input', {
    type: 'text',
    placeholder: 'Novo item',
    'aria-label': `Novo item em ${lista.nome}`,
    maxlength: '200',
    autocomplete: 'off',
  })
  const formulario = el(
    'form',
    { class: 'novo-item', novalidate: true },
    campo,
    el(
      'button',
      { type: 'submit', class: 'mais', title: 'Adicionar', 'aria-label': 'Adicionar' },
      '+',
    ),
  )
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault()
    const texto = campo.value.trim()
    if (!texto) return
    campo.disabled = true
    try {
      const item = await dados.criarItemDeLista(lista, texto, itens.length + 1)
      estado.listaItens.push(item)
      campo.value = ''
      avisarMudanca('listas')
    } catch (e) {
      avisar(mensagemDeErro(e, 'Não consegui adicionar.'), true)
    } finally {
      campo.disabled = false
    }
  })

  const quando = lista.zerada_em
    ? `zerada em ${dataBR(dataDoInstante(lista.zerada_em))} · ${lista.vezes_zerada}ª vez`
    : 'ainda não zerada'

  return el(
    'section',
    { class: 'cartao coluna lista', dataset: { lista: lista.id } },
    el(
      'header',
      {},
      anel,
      el(
        'div',
        { class: 'lista-titulo' },
        el('h2', {}, lista.nome),
        el('span', { class: 'sec' }, quando),
      ),
      el('span', { class: 'fracao num' }, `${feitos}/${itens.length}`),
      el(
        'button',
        {
          type: 'button',
          class: 'icone',
          title: 'Renomear',
          'aria-label': `Renomear ${lista.nome}`,
          onClick: () => renomear(lista),
        },
        icone(LAPIS, 14),
      ),
    ),
    ul,
    formulario,
    el(
      'div',
      { class: 'lista-rodape' },
      el(
        'button',
        { type: 'button', class: 'link perigo', onClick: () => apagar(lista) },
        'Apagar lista',
      ),
      el(
        'button',
        { type: 'button', class: 'botao ouro pequeno', onClick: () => zerar(lista) },
        'Zerar marcações',
      ),
    ),
  )
}

async function novaLista() {
  const nome = await pedirTexto('Nova lista', {
    placeholder: 'Ex.: Produto novo, Promoção',
    rotulo: 'Criar',
  })
  if (!nome) return
  try {
    const lista = await dados.criarLista(
      estado.uid,
      nome.trim().slice(0, 60),
      estado.listas.length + 1,
    )
    estado.listas.push(lista)
    avisarMudanca('listas')
    setTimeout(
      () => document.querySelector(`[data-lista="${lista.id}"] .novo-item input`)?.focus(),
      50,
    )
  } catch (e) {
    avisar(mensagemDeErro(e, 'Não consegui criar a lista.'), true)
  }
}

export function montarLancamento(raiz) {
  limpar(raiz)
  raiz.append(
    el(
      'div',
      { class: 'cabecalho' },
      el(
        'div',
        {},
        el('h1', {}, 'Checklists'),
        el('p', {}, 'Listas que você monta uma vez, marca conforme faz e zera para usar de novo.'),
      ),
      el(
        'button',
        { type: 'button', class: 'botao ouro', id: 'nova-lista', onClick: novaLista },
        '+ Nova lista',
      ),
    ),
    estado.listas.length
      ? el('div', { class: 'colunas' }, estado.listas.map(coluna))
      : el(
          'p',
          { class: 'vazio' },
          'Nenhuma lista ainda. Clique em “+ Nova lista” e dê o nome que quiser.',
        ),
  )
}
