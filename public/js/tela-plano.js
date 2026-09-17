// Plano de ação: a ata da reunião vira ações com data, ritmo e status, por pasta.
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
const abertas = new Set()

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

function linhaAcao(acao, pasta) {
  const atrasada = acaoAtrasada(acao)
  const hoje = acao.comeca === estado.hoje
  const pode = podeEditar(pasta)
  const pilulas = STATUS.map(([valor, rotulo, classe]) =>
    el(
      'button',
      {
        type: 'button',
        class: `pilula ${classe}${acao.status === valor ? ' ativa' : ''}`,
        'aria-pressed': String(acao.status === valor),
        disabled: !pode || acao.status === valor,
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
      'aria-expanded': String(abertas.has(acao.id)),
      onClick: () => {
        if (abertas.has(acao.id)) abertas.delete(acao.id)
        else abertas.add(acao.id)
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
      acao.status !== 'feito'
        ? el('span', { class: 'prazo num' }, prazoRelativo(acao.comeca))
        : null,
      atrasada ? el('span', { class: 'pilula atrasada' }, 'Atrasada') : null,
      hoje && !atrasada && acao.status !== 'feito'
        ? el('span', { class: 'pilula hoje' }, 'Hoje')
        : null,
      pilulas,
    ),
    abertas.has(acao.id) ? detalhe(acao, pasta) : null,
  )
}

function resumo(acoes) {
  const feitas = acoes.filter((a) => a.status === 'feito').length
  const andando = acoes.filter((a) => a.status === 'andando').length
  const atrasadas = acoes.filter((a) => acaoAtrasada(a)).length
  return el(
    'div',
    { class: 'plano-resumo num' },
    el('span', {}, el('b', {}, acoes.length), ' ações'),
    el('span', {}, el('b', {}, andando), ' em andamento'),
    el('span', {}, el('b', {}, feitas), ' feitas'),
    el('span', { class: 'atrasadas' }, el('b', {}, atrasadas), ' atrasadas'),
  )
}

function origemDoPlano(acoes) {
  return acoes.find((a) => a.origem)?.origem || ''
}

async function importarAta(pastaInicial) {
  const pastas = estado.pastas.filter(podeEditar)
  const seletor = el(
    'select',
    { id: 'ata-pasta', 'aria-label': 'Pasta do plano' },
    pastas.map((p) => el('option', { value: p.id, selected: p.id === pastaInicial?.id }, p.nome)),
  )
  const campo = el('textarea', {
    id: 'ata-texto',
    placeholder: '20/09/2026 | Rafael | Fechar o freezer da AABB | uma vez | detalhe…',
    spellcheck: 'false',
  })
  const erro = el('p', { class: 'erro', hidden: true, role: 'alert' })
  const botao = el('button', { type: 'button', class: 'botao ouro' }, 'Importar')
  const substituir = el('input', { type: 'checkbox', id: 'ata-substituir' })

  if (!estado.acoes.length) {
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
    botao.disabled = true
    try {
      if (substituir.checked) await dados.apagarAcoesDaPasta(pasta.id)
      const linhas = lido.acoes.map((a) => ({
        ...a,
        dono_id: pasta.dono_id,
        pasta_id: pasta.id,
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
      await recarregarDia()
      fecharDialogo()
      avisar(`${criadas.length} ações importadas para ${pasta.nome}.`)
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
    estado.acoes.length
      ? el(
          'label',
          { class: 'marcar', style: { marginTop: '12px' } },
          substituir,
          'Substituir o plano atual desta pasta',
        )
      : null,
    erro,
    el(
      'div',
      { class: 'dialogo-acoes' },
      el('button', { type: 'button', class: 'botao', onClick: fecharDialogo }, 'Cancelar'),
      botao,
    ),
  ])
}

async function apagarPlano(pasta) {
  if (
    !(await confirmar(
      `Apagar o plano de ação de ${pasta.nome}? Os itens ligados a ele saem da lista.`,
      'Apagar',
    ))
  )
    return
  try {
    await dados.apagarAcoesDaPasta(pasta.id)
    await recarregarDia()
    avisar('Plano apagado.')
  } catch (e) {
    avisar(mensagemDeErro(e, 'Não consegui apagar o plano.'), true)
  }
}

function secaoDaPasta(pasta, acoes) {
  const pode = podeEditar(pasta)
  return el(
    'section',
    { class: 'cartao plano', dataset: { plano: pasta.id } },
    el(
      'header',
      {},
      el('h2', {}, `Plano de ação · ${pasta.nome}`),
      origemDoPlano(acoes) ? el('span', { class: 'selo ouro' }, origemDoPlano(acoes)) : null,
      resumo(acoes),
      pode
        ? el(
            'button',
            { type: 'button', class: 'botao pequeno', onClick: () => importarAta(pasta) },
            'Importar ata',
          )
        : null,
      pode
        ? el(
            'button',
            {
              type: 'button',
              class: 'icone',
              title: 'Apagar plano',
              'aria-label': 'Apagar plano',
              onClick: () => apagarPlano(pasta),
            },
            icone('M3 4h10M6 4V2.5h4V4M4.5 4l.6 9h5.8l.6-9', 14),
          )
        : null,
    ),
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
        'Ação com data que passou sem “Feito” aparece como ',
        el('b', {}, 'Atrasada'),
        ' e sobe para o topo.',
      ),
      el(
        'span',
        {},
        'Rotinas do plano entram na coluna ',
        el('b', {}, pasta.nome),
        ' no dia certo, com a etiqueta “plano”.',
      ),
    ),
  )
}

let raizPlano = null

export function montarPlano(raiz = raizPlano) {
  if (!raiz) return
  raizPlano = raiz
  raiz.querySelectorAll('.plano').forEach((n) => n.remove())
  const porPasta = new Map()
  for (const acao of estado.acoes) {
    if (!porPasta.has(acao.pasta_id)) porPasta.set(acao.pasta_id, [])
    porPasta.get(acao.pasta_id).push(acao)
  }
  const ancora = raiz.querySelector('.eficiencia')
  const inserir = (nodo) => (ancora ? raiz.insertBefore(nodo, ancora) : raiz.append(nodo))
  for (const pasta of estado.pastas) {
    const acoes = porPasta.get(pasta.id)
    if (acoes?.length) inserir(secaoDaPasta(pasta, acoes))
  }
  if (!porPasta.size && souAdmin()) {
    inserir(
      el(
        'section',
        { class: 'cartao plano plano-vazio' },
        el(
          'div',
          {},
          el('h2', {}, 'Plano de ação'),
          el(
            'p',
            { class: 'sec' },
            'Traga a ata da reunião: cada decisão vira uma ação com data, e as rotinas entram no checklist.',
          ),
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'botao ouro',
            onClick: () =>
              importarAta(pastaPorId(estado.pastas.find((p) => p.chave === 'rafaellos')?.id)),
          },
          'Importar ata',
        ),
      ),
    )
  }
}
