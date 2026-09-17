// Lê uma ata de reunião e devolve as ações do plano.
// Aceita duas formas:
//  1) linhas "data | quem | título | ritmo | detalhe | custo: … | mede: a; b | meta: … | revisa: dd/mm"
//  2) JSON (lista de objetos como o da página do Plano de Ação: quem, titulo, oque, comeca, ritmo…)
import { lerDataBR, diaDoMes } from './datas.js'

const SEMANA = [
  ['dom', 0],
  ['seg', 1],
  ['ter', 2],
  ['qua', 3],
  ['qui', 4],
  ['sex', 5],
  ['sab', 6],
]

function semAcento(texto) {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** "todo dia", "seg qua sex", "mensal dia 20", "uma vez" → { ritmo, dias_semana, dia_mes } */
export function interpretarRitmo(texto, comeca) {
  const t = semAcento(texto || '')
  if (/todo dia|todos os dias|diari|por dia/.test(t))
    return { ritmo: 'diaria', dias_semana: [], dia_mes: null }
  const dias = SEMANA.filter(([abrev]) => new RegExp(`\\b${abrev}`).test(t)).map(([, n]) => n)
  if (dias.length) return { ritmo: 'semanal', dias_semana: dias, dia_mes: null }
  if (/mensal|\bmes\b|por mes|todo mes/.test(t)) {
    const m = /dia (\d{1,2})/.exec(t)
    const dia = m ? Number(m[1]) : diaDoMes(comeca)
    return { ritmo: 'mensal', dias_semana: [], dia_mes: Math.min(Math.max(dia, 1), 31) }
  }
  return { ritmo: 'unica', dias_semana: [], dia_mes: null }
}

function semHTML(texto) {
  return String(texto || '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function deJSON(lista) {
  return lista.map((a, i) => {
    const comeca = /^\d{4}-\d{2}-\d{2}$/.test(a.comeca || '') ? a.comeca : lerDataBR(a.comeca || '')
    if (!comeca) throw new Error(`Ação ${i + 1}: data "comeca" inválida.`)
    const custo = [a.custo, a.custoNota].filter(Boolean).join(' · ')
    return {
      titulo: semHTML(a.titulo),
      quem: semHTML(a.quem),
      detalhe: semHTML(a.oque || a.detalhe),
      comeca,
      ritmo_texto: semHTML(a.ritmo),
      ...interpretarRitmo(a.ritmo, comeca),
      custo: semHTML(custo),
      mede: Array.isArray(a.mede) ? a.mede.map(semHTML) : [],
      meta: semHTML(a.metaTxt || a.meta),
      revisa: a.revisa
        ? /^\d{4}-\d{2}-\d{2}$/.test(a.revisa)
          ? a.revisa
          : lerDataBR(a.revisa)
        : null,
      ordem: i + 1,
    }
  })
}

function deLinhas(texto) {
  const acoes = []
  let origem = ''
  const linhas = texto.split(/\r?\n/)
  for (const bruta of linhas) {
    const linha = bruta.trim()
    if (!linha) continue
    if (linha.startsWith('#')) {
      origem = linha.replace(/^#+\s*/, '')
      continue
    }
    const partes = linha.split('|').map((p) => p.trim())
    if (partes.length < 4) {
      throw new Error(
        `Linha sem os 4 campos (data | quem | título | ritmo): "${linha.slice(0, 40)}…"`,
      )
    }
    const [dataTexto, quem, titulo, ritmoTexto, ...resto] = partes
    const comeca = lerDataBR(dataTexto)
    if (!comeca) throw new Error(`Data inválida em "${titulo}": use dd/mm/aaaa.`)
    if (!titulo) throw new Error('Há uma linha sem título.')
    const acao = {
      titulo,
      quem,
      detalhe: '',
      comeca,
      ritmo_texto: ritmoTexto,
      ...interpretarRitmo(ritmoTexto, comeca),
      custo: '',
      mede: [],
      meta: '',
      revisa: null,
      ordem: acoes.length + 1,
    }
    for (const campo of resto) {
      const m = /^(detalhe|custo|mede|meta|revisa)\s*:\s*(.*)$/i.exec(campo)
      if (!m) {
        acao.detalhe = acao.detalhe ? `${acao.detalhe} ${campo}` : campo
        continue
      }
      const chave = m[1].toLowerCase()
      const valor = m[2].trim()
      if (chave === 'mede')
        acao.mede = valor
          .split(';')
          .map((v) => v.trim())
          .filter(Boolean)
      else if (chave === 'revisa') acao.revisa = lerDataBR(valor)
      else acao[chave] = valor
    }
    acoes.push(acao)
  }
  return { origem, acoes }
}

/** @returns {{ origem: string, acoes: object[] }} */
export function lerAta(texto) {
  const limpo = (texto || '').trim()
  if (!limpo) throw new Error('Cole a ata antes de importar.')
  if (limpo.startsWith('[') || limpo.startsWith('{')) {
    let json
    try {
      json = JSON.parse(limpo)
    } catch {
      throw new Error('O JSON não está bem formado.')
    }
    const lista = Array.isArray(json) ? json : json.acoes
    if (!Array.isArray(lista) || !lista.length) throw new Error('O JSON não tem a lista de ações.')
    return { origem: json.origem || '', acoes: deJSON(lista) }
  }
  const lido = deLinhas(limpo)
  if (!lido.acoes.length) throw new Error('Nenhuma ação encontrada na ata.')
  return lido
}

/** Texto do item do checklist que uma ação gera. */
export function textoDoItem(acao) {
  return acao.quem ? `${acao.titulo} — ${acao.quem}` : acao.titulo
}
