// Empresas: primeiro as pastas; dentro, a grade de sistemas tipo Launchpad.
import { el, limpar, icone } from './dom.js'
import { estado, pastaPorId } from './estado.js'
import { sistemasDaPasta, enderecoCurto, desenhoDoAzulejo, iconeDoSite } from './sistemas.js'

const VOLTAR = 'M10 3L5 8l5 5'
const VOLTAR_INVERTIDO = 'M6 3l5 5-5 5'

/** Pasta desenhada (com aba), na cor da pasta. */
function dobra(cor) {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 64 52')
  svg.setAttribute('class', 'dobra')
  svg.setAttribute('aria-hidden', 'true')
  const tras = document.createElementNS(NS, 'path')
  tras.setAttribute(
    'd',
    'M4 10a4 4 0 0 1 4-4h14l5 5h29a4 4 0 0 1 4 4v27a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z',
  )
  tras.style.fill = `color-mix(in srgb, ${cor} 45%, #000)`
  const frente = document.createElementNS(NS, 'path')
  frente.setAttribute('d', 'M4 20h56v22a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z')
  frente.style.fill = cor
  const brilho = document.createElementNS(NS, 'path')
  brilho.setAttribute('d', 'M4 20h56v2H4z')
  brilho.setAttribute('fill', 'rgba(255,255,255,0.18)')
  svg.append(tras, frente, brilho)
  return svg
}

/** Ícone pequeno de um sistema (imagem verdadeira, favicon ou letras). */
function miniIcone(sistema) {
  const origem = sistema.imagem || (sistema.site ? iconeDoSite(sistema.site) : null)
  const caixa = el('span', { class: 'mini' })
  caixa.style.background = `linear-gradient(150deg, ${sistema.icone.cores[0]}, ${sistema.icone.cores[1]})`
  if (origem) {
    const img = el('img', { src: origem, alt: '', loading: 'lazy' })
    img.addEventListener('error', () => {
      img.remove()
      caixa.textContent = sistema.icone.letras
    })
    caixa.append(img)
  } else caixa.textContent = sistema.icone.letras
  return caixa
}

const CHAVE_VISUAL = 'ru.empresas.visual'
function visualAtual() {
  try {
    return localStorage.getItem(CHAVE_VISUAL) === 'grade' ? 'grade' : 'lista'
  } catch {
    return 'lista'
  }
}
function definirVisual(v) {
  try {
    localStorage.setItem(CHAVE_VISUAL, v)
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

/** Pasta solta (grade): pasta grande centralizada, nome e contagem embaixo. */
function cartaoPasta(pasta) {
  const n = sistemasDaPasta(pasta).length
  return el(
    'a',
    { class: 'pasta pasta-solta', href: `#empresas/${pasta.id}`, dataset: { pasta: pasta.id } },
    el('span', { class: 'pasta-dobra' }, dobra(pasta.cor || '#D9B45A')),
    el('b', {}, pasta.nome),
    el('span', {}, n === 1 ? '1 sistema' : `${n} sistemas`),
  )
}

const LISTA = 'M2 4h12M2 8h12M2 12h12'
const GRADE = 'M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z'

function seletorDeVisual(raiz, pastaId) {
  const atual = visualAtual()
  const botao = (v, caminho, rotulo) =>
    el(
      'button',
      {
        type: 'button',
        class: `icone${atual === v ? ' ativo' : ''}`,
        title: rotulo,
        'aria-label': rotulo,
        'aria-pressed': String(atual === v),
        onClick: () => {
          definirVisual(v)
          montarEmpresas(raiz, pastaId)
        },
      },
      icone(caminho, 16),
    )
  return el(
    'div',
    { class: 'visual' },
    botao('lista', LISTA, 'Ver em lista'),
    botao('grade', GRADE, 'Ver em cartões'),
  )
}

function linhaPasta(pasta) {
  const sistemas = sistemasDaPasta(pasta)
  const n = sistemas.length
  return el(
    'a',
    { class: 'pasta', href: `#empresas/${pasta.id}`, dataset: { pasta: pasta.id } },
    el('span', { class: 'pasta-dobra' }, dobra(pasta.cor || '#D9B45A')),
    el(
      'span',
      { class: 'pasta-texto' },
      el('b', {}, pasta.nome),
      el('span', {}, n === 1 ? '1 sistema' : `${n} sistemas`),
    ),
    el('span', { class: 'pasta-minis' }, sistemas.slice(0, 4).map(miniIcone)),
    el('span', { class: 'chev' }, icone(VOLTAR_INVERTIDO, 14)),
  )
}

function azulejo(sistema) {
  const ic = el('div', { class: 'azulejo-icone' })
  ic.style.setProperty('--cor-a', sistema.icone.cores[0])
  ic.style.setProperty('--cor-b', sistema.icone.cores[1])
  const origem = sistema.imagem || (sistema.site ? iconeDoSite(sistema.site) : null)
  if (origem) {
    // Ícone verdadeiro do aplicativo; se não carregar, ficam as letras de reserva.
    const img = el('img', {
      src: origem,
      alt: '',
      loading: 'lazy',
      class: sistema.imagem ? 'cheio' : 'favicon',
    })
    img.addEventListener('error', () => {
      img.remove()
      ic.classList.remove('com-imagem')
      ic.append(desenhoDoAzulejo(sistema.icone))
    })
    ic.classList.add('com-imagem')
    ic.append(img)
  } else ic.append(desenhoDoAzulejo(sistema.icone))
  return el(
    'a',
    { class: 'azulejo', href: sistema.url, target: '_blank', rel: 'noopener noreferrer' },
    ic,
    el('div', {}, el('b', {}, sistema.nome), el('span', {}, enderecoCurto(sistema.url))),
  )
}

export function montarEmpresas(raiz, pastaId) {
  limpar(raiz)
  const pasta = pastaId ? pastaPorId(pastaId) : null
  if (!pasta) {
    raiz.append(
      el(
        'div',
        { class: 'cabecalho' },
        el(
          'div',
          {},
          el('h1', {}, 'Empresas'),
          el('p', {}, 'Escolha a pasta; dentro estão os sistemas.'),
        ),
        seletorDeVisual(raiz, pastaId),
      ),
      visualAtual() === 'grade'
        ? el('div', { class: 'pastas-grade' }, estado.pastas.map(cartaoPasta))
        : el('div', { class: 'cartao pastas' }, estado.pastas.map(linhaPasta)),
    )
    return
  }
  const sistemas = sistemasDaPasta(pasta)
  raiz.append(
    el(
      'div',
      { class: 'cabecalho' },
      el(
        'div',
        {},
        el('a', { class: 'voltar', href: '#empresas' }, icone(VOLTAR, 14), 'Pastas'),
        el('h1', { style: { marginTop: '6px' } }, pasta.nome),
        el(
          'p',
          {},
          sistemas.length
            ? 'Cada ícone abre o sistema em uma aba nova.'
            : 'Esta pasta ainda não tem sistemas.',
        ),
      ),
    ),
    el('div', { class: 'launchpad' }, sistemas.map(azulejo)),
  )
}
