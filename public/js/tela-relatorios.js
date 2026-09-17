// Relatórios: as atas concluídas, com as ações e observações como ficaram.
import { el, limpar, icone, avisar, mensagemDeErro, confirmar } from './dom.js'
import { pastaPorId, podeEditar, acoesDaAta, atasArquivadas, recarregarDia } from './estado.js'
import { dados } from './dados.js'
import { dataBR, dataDoInstante } from './datas.js'
import { linhaAcao, resumoDaAta } from './tela-plano.js'

const SETA = 'M6 3l5 5-5 5'
const abertas = new Set()

async function voltarParaHoje(ata) {
  if (!(await confirmar(`Trazer “${ata.titulo}” de volta para a tela Hoje?`, 'Trazer de volta')))
    return
  try {
    await dados.atualizarAta(ata.id, { concluida_em: null })
    // As rotinas da ata voltam para o checklist.
    const ids = new Set(acoesDaAta(ata.id).map((a) => a.id))
    const itens = await dados.itensTodos()
    for (const item of itens.filter((i) => i.acao_id && ids.has(i.acao_id) && !i.ativo)) {
      await dados.reativarItem(item)
    }
    await recarregarDia()
    avisar(`“${ata.titulo}” voltou para Hoje.`)
  } catch (e) {
    avisar(mensagemDeErro(e, 'Não consegui trazer a ata de volta.'), true)
  }
}

function linhaAta(ata) {
  const pasta = pastaPorId(ata.pasta_id)
  const acoes = acoesDaAta(ata.id)
  const r = resumoDaAta(acoes)
  const aberta = abertas.has(ata.id)
  const periodo = `${dataBR(dataDoInstante(ata.criado_em), true)} → ${dataBR(dataDoInstante(ata.concluida_em), true)}`
  return el(
    'div',
    { class: `ata${aberta ? ' aberta' : ''}`, dataset: { ata: ata.id } },
    el(
      'button',
      {
        type: 'button',
        class: 'ata-cabecalho',
        'aria-expanded': String(aberta),
        onClick: () => {
          if (aberta) abertas.delete(ata.id)
          else abertas.add(ata.id)
          montarRelatorios()
        },
      },
      el('span', { class: `seta${aberta ? ' aberta' : ''}` }, icone(SETA, 14)),
      el(
        'span',
        { class: 'ata-titulo' },
        el('b', {}, ata.titulo),
        el(
          'span',
          { class: 'sec' },
          [pasta?.nome, ata.origem, periodo].filter(Boolean).join(' · '),
        ),
      ),
      el('span', { class: 'ata-resumo num' }, el('span', {}, `${r.feitas}/${r.total} feitas`)),
    ),
    aberta
      ? el(
          'div',
          { class: 'ata-corpo' },
          el(
            'div',
            { class: 'acoes' },
            acoes.map((a) => linhaAcao(a, pasta, true)),
          ),
          podeEditar(pasta)
            ? el(
                'div',
                { class: 'plano-rodape' },
                el('span', {}, 'Arquivada. As rotinas dela não entram mais no checklist do dia.'),
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'botao pequeno',
                    style: { marginLeft: 'auto' },
                    onClick: () => voltarParaHoje(ata),
                  },
                  'Trazer de volta para Hoje',
                ),
              )
            : null,
        )
      : null,
  )
}

let raizRelatorios = null

export function montarRelatorios(raiz = raizRelatorios) {
  if (!raiz) return
  raizRelatorios = raiz
  limpar(raiz)
  const atas = atasArquivadas()
  raiz.append(
    el(
      'div',
      { class: 'cabecalho' },
      el(
        'div',
        {},
        el('h1', {}, 'Relatórios'),
        el('p', {}, 'As atas concluídas, com as ações como ficaram.'),
      ),
    ),
    el(
      'section',
      { class: 'cartao plano' },
      el(
        'header',
        {},
        el('h2', {}, 'Atas concluídas'),
        el('span', { class: 'selo' }, atas.length === 1 ? '1 ata' : `${atas.length} atas`),
      ),
      atas.length
        ? el('div', { class: 'atas' }, atas.map(linhaAta))
        : el(
            'p',
            { class: 'vazio' },
            'Nenhuma ata concluída ainda. Na tela Hoje, quando tudo estiver feito, “Concluir e mandar para Relatórios”.',
          ),
    ),
  )
}
