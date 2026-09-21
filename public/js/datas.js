// Datas sempre no fuso da loja (São Paulo), em texto AAAA-MM-DD.
import { CONFIG } from './config.js'

const FUSO = CONFIG.fusoHorario || 'America/Sao_Paulo'
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
const fmtLonga = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const fmtCurta = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
})

export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]

/** Data de hoje no fuso da loja, AAAA-MM-DD. */
export function hojeISO() {
  return fmtISO.format(new Date())
}

/** Converte um instante (ISO com fuso) para a data AAAA-MM-DD no fuso da loja. */
export function dataDoInstante(instante) {
  return fmtISO.format(new Date(instante))
}

export function horaDoInstante(instante) {
  return fmtHora.format(new Date(instante))
}

/** Date em UTC-meia-noite para uma data AAAA-MM-DD (só para formatar e contar dias). */
function utc(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

export function somarDias(iso, n) {
  const d = utc(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function diferencaDias(deISO, ateISO) {
  return Math.round((utc(ateISO) - utc(deISO)) / 86400000)
}

/** Últimos `n` dias terminando hoje, do mais antigo para hoje. */
export function ultimosDias(n, hoje = hojeISO()) {
  const dias = []
  for (let i = n - 1; i >= 0; i--) dias.push(somarDias(hoje, -i))
  return dias
}

export function diaDaSemana(iso) {
  return utc(iso).getUTCDay()
}

export function diaDoMes(iso) {
  return Number(iso.slice(8, 10))
}

export function mesIndice(iso) {
  return Number(iso.slice(5, 7)) - 1
}

/** Quantos dias tem o mês da data. */
export function diasNoMes(iso) {
  const [a, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

/** "quarta-feira, 17 de setembro" */
export function dataLonga(iso) {
  return fmtLonga.format(utc(iso))
}

/** "qua., 17 set." → "qua 17 set" */
export function dataCurta(iso) {
  return fmtCurta.format(utc(iso)).replace(/\./g, '')
}

/** "17/09" */
export function dataBR(iso, comAno = false) {
  const [a, m, d] = iso.split('-')
  return comAno ? `${d}/${m}/${a}` : `${d}/${m}`
}

/** "dd/mm/aaaa" ou "dd/mm" (assume o ano corrente) → AAAA-MM-DD; nulo se inválida. */
export function lerDataBR(texto, anoPadrao = Number(hojeISO().slice(0, 4))) {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(texto.trim())
  if (!m) return null
  let ano = m[3] ? Number(m[3]) : anoPadrao
  if (ano < 100) ano += 2000
  const mes = Number(m[2])
  const dia = Number(m[1])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  return utc(iso).toISOString().slice(0, 10) === iso ? iso : null
}

/** "em 3 dias", "hoje", "há 2 dias" */
export function prazoRelativo(iso, hoje = hojeISO()) {
  const n = diferencaDias(hoje, iso)
  if (n === 0) return 'hoje'
  if (n === 1) return 'amanhã'
  if (n === -1) return 'ontem'
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`
}

/**
 * Um item entra no checklist de um dia se já existia nesse dia, ainda não tinha
 * sido removido e a agenda dele (todo dia, dias da semana, dia do mês) bate.
 */
export function itemAplicaNoDia(item, iso) {
  const inicio = item.a_partir_de || dataDoInstante(item.criado_em)
  if (iso < inicio) return false
  if (item.desativado_em && iso >= dataDoInstante(item.desativado_em)) return false
  if (item.dias_semana && item.dias_semana.length && !item.dias_semana.includes(diaDaSemana(iso))) {
    return false
  }
  // Dia 31 num mês de 30: vale o último dia do mês, para o lembrete não sumir.
  if (item.dia_mes && diaDoMes(iso) !== Math.min(item.dia_mes, diasNoMes(iso))) return false
  return true
}

/** Próxima data (a partir de amanhã) em que o item entra na lista; nulo se não houver. */
export function proximoDiaDoItem(item, hoje = hojeISO()) {
  for (let n = 1; n <= 62; n++) {
    const dia = somarDias(hoje, n)
    if (itemAplicaNoDia(item, dia)) return dia
  }
  return null
}

/** "dia 5", "seg · qua", "seg a sex", "fim de semana"; vazio quando é todo dia. */
export function descricaoAgenda(item) {
  if (item.dia_mes) return `dia ${item.dia_mes}`
  const dias = [...(item.dias_semana || [])].sort()
  if (!dias.length || dias.length === 7) return ''
  if (dias.join() === '1,2,3,4,5') return 'seg a sex'
  if (dias.join() === '0,6') return 'fim de semana'
  return dias.map((d) => DIAS_SEMANA[d]).join(' · ')
}
