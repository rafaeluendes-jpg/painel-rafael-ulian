// Empresas: primeiro as pastas; dentro, a grade de sistemas tipo Launchpad.
import { el, limpar, icone } from './dom.js'
import { estado, pastaPorId } from './estado.js'
import { sistemasDaPasta, enderecoCurto, desenhoDoAzulejo, iconeDoSite } from './sistemas.js'

const PASTA =
  'M2 4.5A1.5 1.5 0 013.5 3H7l1.5 1.5H12.5A1.5 1.5 0 0114 6v6a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12z'
const VOLTAR = 'M10 3L5 8l5 5'

function cartaoPasta(pasta) {
  const n = sistemasDaPasta(pasta).length
  const ic = el('div', { class: 'pasta-icone' }, icone(PASTA, 22))
  ic.style.setProperty('--cor', pasta.cor || '#D9B45A')
  return el(
    'a',
    { class: 'cartao pasta', href: `#empresas/${pasta.id}`, dataset: { pasta: pasta.id } },
    ic,
    el('div', {}, el('h3', {}, pasta.nome), el('p', {}, n === 1 ? '1 sistema' : `${n} sistemas`)),
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
      ),
      el('div', { class: 'pastas' }, estado.pastas.map(cartaoPasta)),
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
