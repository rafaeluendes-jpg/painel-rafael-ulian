// Hoje: medidores, uma coluna por pasta com o checklist do dia.
import {
  el,
  limpar,
  icone,
  avisar,
  mensagemDeErro,
  confirmar,
  abrirDialogo,
  fecharDialogo,
} from './dom.js'
import {
  estado,
  pastasDoChecklist,
  itensDaPastaHoje,
  itensDaPastaOutrosDias,
  marcacaoDoItem,
  podeEditar,
  alternarItem,
  adicionarItem,
  removerItem,
  salvarAgendaDoItem,
  acaoPorId,
} from './estado.js'
import {
  dataLonga,
  horaDoInstante,
  dataCurta,
  descricaoAgenda,
  proximoDiaDoItem,
  DIAS_SEMANA,
} from './datas.js'
import { montarPlano } from './tela-plano.js'
import { montarEficiencia } from './tela-eficiencia.js'

const X = 'M4 4l8 8M12 4l-8 8'
const CALENDARIO = 'M3 4.5h10v9H3zM3 7.5h10M5.5 2.5v3M10.5 2.5v3'
const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

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

/** Diálogo "Quando lembrar": todo dia, dias da semana ou um dia de cada mês. */
async function abrirAgenda(item) {
  const tipoAtual = item.dia_mes ? 'mes' : item.dias_semana?.length ? 'semana' : 'todo'
  const radio = (valor, texto) =>
    el(
      'label',
      { class: 'agenda-opcao', dataset: { tipo: valor } },
      el('input', {
        type: 'radio',
        name: 'agenda-tipo',
        value: valor,
        checked: valor === tipoAtual,
      }),
      el('span', {}, texto),
    )
  const dias = DIAS_SEMANA.map((nome, d) =>
    el(
      'label',
      { class: 'agenda-dia', title: NOMES_DIAS[d] },
      el('input', {
        type: 'checkbox',
        name: 'agenda-dia',
        value: String(d),
        checked: Boolean(item.dias_semana?.includes(d)),
      }),
      nome,
    ),
  )
  const diaMes = el('input', {
    type: 'number',
    id: 'agenda-dia-mes',
    min: '1',
    max: '31',
    inputmode: 'numeric',
    value: item.dia_mes ? String(item.dia_mes) : '',
    'aria-label': 'Dia do mês',
  })
  const opcaoSemana = radio('semana', 'Só nestes dias da semana')
  opcaoSemana.append(el('div', { class: 'agenda-dias' }, dias))
  const opcaoMes = radio('mes', 'Todo mês, no dia')
  opcaoMes.append(diaMes)
  const erro = el('p', { class: 'erro', role: 'alert', hidden: true })
  const formulario = el(
    'form',
    { class: 'agenda-form', novalidate: true },
    el('h2', {}, 'Quando lembrar'),
    el('p', { class: 'sec' }, '“', item.texto, '”'),
    el('div', { class: 'agenda-opcoes' }, radio('todo', 'Todo dia'), opcaoSemana, opcaoMes),
    el('p', { class: 'sec agenda-nota' }, 'Dia 31 num mês mais curto vale no último dia do mês.'),
    erro,
    el(
      'div',
      { class: 'dialogo-acoes' },
      el('button', { type: 'button', class: 'botao', onClick: fecharDialogo }, 'Cancelar'),
      el('button', { type: 'submit', class: 'botao ouro' }, 'Salvar'),
    ),
  )
  // Clicar nos dias ou no número já escolhe a opção correspondente.
  opcaoSemana.addEventListener('change', (e) => {
    if (e.target.name === 'agenda-dia')
      opcaoSemana.querySelector('input[type=radio]').checked = true
  })
  diaMes.addEventListener(
    'focus',
    () => (opcaoMes.querySelector('input[type=radio]').checked = true),
  )

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault()
    const tipo = formulario.querySelector('input[name=agenda-tipo]:checked')?.value
    const agenda = { dias_semana: null, dia_mes: null }
    if (tipo === 'semana') {
      agenda.dias_semana = [...formulario.querySelectorAll('input[name=agenda-dia]:checked')].map(
        (c) => Number(c.value),
      )
      if (!agenda.dias_semana.length) return mostrarErro('Escolha pelo menos um dia da semana.')
    } else if (tipo === 'mes') {
      agenda.dia_mes = Number(diaMes.value)
      if (!(agenda.dia_mes >= 1 && agenda.dia_mes <= 31))
        return mostrarErro('Informe um dia de 1 a 31.')
    }
    const botao = formulario.querySelector('button[type=submit]')
    botao.disabled = true
    try {
      const novo = await salvarAgendaDoItem(item, agenda)
      fecharDialogo()
      const quando = descricaoAgenda(novo)
      avisar(quando ? `Lembrete ajustado: ${quando}.` : 'Lembrete voltou a ser todo dia.')
    } catch (e) {
      mostrarErro(mensagemDeErro(e, 'Não consegui salvar o lembrete.'))
      botao.disabled = false
    }
  })
  function mostrarErro(texto) {
    erro.textContent = texto
    erro.hidden = false
  }
  await abrirDialogo(formulario)
}

function botaoAgenda(item) {
  return el(
    'button',
    {
      type: 'button',
      class: 'agenda',
      'aria-label': `Quando lembrar “${item.texto}”`,
      title: 'Quando lembrar',
      onClick: () => abrirAgenda(item),
    },
    icone(CALENDARIO, 13),
  )
}

function botaoRemover(item, acao) {
  return el(
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
}

function etiquetaDoItem(item, acao) {
  if (acao) {
    return el(
      'span',
      { class: 'etiqueta' },
      acao.ritmo === 'unica' ? `plano · ${dataCurta(acao.comeca)}` : 'plano',
    )
  }
  const quando = descricaoAgenda(item)
  return quando ? el('span', { class: 'etiqueta agenda-etiqueta' }, quando) : null
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
  const editavel = podeEditar(pasta)
  return el(
    'li',
    { class: `item${marcacao ? ' feito' : ''}`, dataset: { item: item.id } },
    caixa,
    el('span', { class: 'texto' }, item.texto, etiquetaDoItem(item, acao)),
    marcacao ? el('span', { class: 'hora num' }, horaDoInstante(marcacao.marcado_em)) : null,
    editavel && !acao ? botaoAgenda(item) : null,
    editavel ? botaoRemover(item, acao) : null,
  )
}

/** Item com agenda que não cai hoje: mostra quando volta. */
function linhaOutroDia(item, pasta) {
  const acao = item.acao_id ? acaoPorId(item.acao_id) : null
  const proximo = proximoDiaDoItem(item, estado.hoje)
  const editavel = podeEditar(pasta)
  return el(
    'li',
    { class: 'item outro-dia', dataset: { item: item.id } },
    icone(CALENDARIO, 14),
    el('span', { class: 'texto' }, item.texto, etiquetaDoItem(item, acao)),
    proximo ? el('span', { class: 'hora num' }, dataCurta(proximo)) : null,
    editavel && !acao ? botaoAgenda(item) : null,
    editavel ? botaoRemover(item, acao) : null,
  )
}

function coluna(pasta) {
  const itens = itensDaPastaHoje(pasta.id)
  const outros = itensDaPastaOutrosDias(pasta.id)
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

  const outrosDias = outros.length
    ? el(
        'details',
        { class: 'outros-dias' },
        el(
          'summary',
          {},
          `${outros.length} ${outros.length === 1 ? 'lembrete' : 'lembretes'} em outros dias`,
        ),
        el(
          'ul',
          {},
          outros.map((i) => linhaOutroDia(i, pasta)),
        ),
      )
    : null

  const campo = el('input', {
    type: 'text',
    placeholder: 'Novo item',
    'aria-label': `Novo item em ${pasta.nome}`,
    maxlength: '200',
    autocomplete: 'off',
  })
  const adicionar = el(
    'button',
    {
      type: 'submit',
      class: 'mais',
      title: 'Adicionar',
      'aria-label': `Adicionar em ${pasta.nome}`,
    },
    '+',
  )
  const formulario = el('form', { class: 'novo-item', novalidate: true }, campo, adicionar)
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault()
    const texto = campo.value.trim()
    if (!texto) return
    // Limpa antes de gravar: a tela é remontada ao gravar e guardaria o texto.
    campo.value = ''
    campo.disabled = true
    try {
      await adicionarItem(pasta, texto)
    } catch (e) {
      campo.value = texto
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
    outrosDias,
    podeEditar(pasta) ? formulario : null,
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
