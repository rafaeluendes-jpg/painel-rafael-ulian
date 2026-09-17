// Tema escuro (padrão) ou claro; a escolha fica salva no aparelho.
const CHAVE = 'ru.tema'

export function temaAtual() {
  return document.documentElement.dataset.tema === 'claro' ? 'claro' : 'escuro'
}

export function definirTema(tema) {
  document.documentElement.dataset.tema = tema
  document
    .querySelector('meta[name="theme-color"]:not([media])')
    ?.setAttribute('content', tema === 'claro' ? '#EDE7DA' : '#050506')
  try {
    localStorage.setItem(CHAVE, tema)
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

export function alternarTema() {
  definirTema(temaAtual() === 'escuro' ? 'claro' : 'escuro')
}

export function carregarTema() {
  let salvo = null
  try {
    salvo = localStorage.getItem(CHAVE)
  } catch {
    salvo = null
  }
  definirTema(salvo === 'claro' ? 'claro' : 'escuro')
}
