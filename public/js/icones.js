// Ícone de cada sistema. Quando o sistema é nosso (`iconeProprio`), o ícone do
// aplicativo é buscado no próprio site, pelo navegador de quem usa o painel,
// nos caminhos de costume de um app instalável. O primeiro que carregar fica
// guardado neste aparelho. Depois vêm a imagem guardada no painel, o favicon
// do site e, por fim, as letras.
import { el } from './dom.js'
import { iconeDoSite } from './sistemas.js'

const CAMINHOS = [
  '/apple-touch-icon.png',
  '/icones/icone-512.png',
  '/icons/icon-512.png',
  '/icon-512.png',
  '/android-chrome-512x512.png',
  '/logo512.png',
  '/icones/icone-192.png',
  '/icons/icon-192.png',
  '/icon-192.png',
  '/android-chrome-192x192.png',
  '/logo192.png',
  '/apple-touch-icon-precomposed.png',
  '/favicon.svg',
  '/favicon.png',
  '/favicon.ico',
]
const CHAVE = 'ru.icone.'

function lembrado(origem) {
  try {
    return localStorage.getItem(CHAVE + origem)
  } catch {
    return null
  }
}
function lembrar(origem, url) {
  try {
    if (url) localStorage.setItem(CHAVE + origem, url)
    else localStorage.removeItem(CHAVE + origem)
  } catch {
    /* sem armazenamento: busca de novo na próxima vez */
  }
}

function candidatos(sistema) {
  const lista = []
  if (sistema.iconeProprio) {
    const origem = sistema.iconeProprio.replace(/\/$/, '')
    const salvo = lembrado(origem)
    if (salvo) lista.push({ url: salvo, proprio: origem })
    for (const c of CAMINHOS) {
      if (origem + c !== salvo) lista.push({ url: origem + c, proprio: origem })
    }
  }
  if (sistema.imagem) lista.push({ url: sistema.imagem, cheio: true })
  if (sistema.site) lista.push({ url: iconeDoSite(sistema.site) })
  return lista
}

/** Carrega uma imagem; resolve com ela se tiver tamanho de ícone, senão com nulo. */
function carregar(url) {
  return new Promise((resolver) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolver(img.naturalWidth >= 32 ? img : null)
    img.onerror = () => resolver(null)
    img.src = url
  })
}

/**
 * Põe o ícone do sistema em `caixa` (tenta os candidatos em ordem).
 * `aoFalhar` desenha a reserva (letras) quando nada carregar.
 */
export async function mostrarIcone(caixa, sistema, aoFalhar) {
  for (const c of candidatos(sistema)) {
    const img = await carregar(c.url)
    if (!img) {
      if (c.proprio && lembrado(c.proprio) === c.url) lembrar(c.proprio, null)
      continue
    }
    if (c.proprio) lembrar(c.proprio, c.url)
    const cheio = c.cheio || (c.proprio && img.naturalWidth >= 96)
    caixa.classList.add('com-imagem')
    caixa.append(el('img', { src: c.url, alt: '', class: cheio ? 'cheio' : 'favicon' }))
    return
  }
  aoFalhar()
}
