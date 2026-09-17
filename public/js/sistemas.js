// Os sistemas de cada pasta (Empresas). A pasta do banco liga-se aqui pela `chave`.
// `imagem`: ícone verdadeiro do aplicativo, guardado em /icones/sistemas/.
// `site`: quando não temos o arquivo, o ícone vem do próprio site (serviço de favicon).
// `icone`: letras de reserva, usadas só se a imagem não carregar.

const G = (cores, letras) => ({ cores, letras })

export const SISTEMAS = {
  jolo: [
    {
      nome: 'Joia ERP',
      url: 'https://joiagest.com.br',
      icone: G(['#F0DCA0', '#8A6A14'], 'J'),
    },
    {
      nome: 'Faturamento',
      url: 'https://app.joiagest.com.br',
      icone: G(['#D9B45A', '#5E4508'], 'R$'),
    },
    {
      nome: 'Central Jolô',
      url: 'https://centraljolo.com.br',
      imagem: '/icones/sistemas/central-jolo.png',
      icone: G(['#C9A227', '#2E2408'], 'CJ'),
    },
  ],
  rafaellos: [
    {
      nome: 'Sistema Inteligente',
      url: 'https://sistema-inteligente-erp.onrender.com',
      imagem: '/icones/sistemas/sistema-inteligente.png',
      icone: G(['#EFEBE2', '#4A4438'], 'SI'),
    },
    {
      nome: "Central Rafaello's",
      url: 'https://rafaellos.usacademyadm.workers.dev',
      imagem: '/icones/sistemas/central-rafaellos.png',
      icone: G(['#D9B45A', '#3B2E0A'], 'CR'),
    },
    {
      nome: 'Saipos',
      url: 'https://conta.saipos.com/#/access/login',
      site: 'conta.saipos.com',
      icone: G(['#FF7A59', '#7A2210'], 'S'),
    },
  ],
  outros: [
    {
      nome: 'R2ON',
      url: 'https://r2on.r2on.workers.dev',
      imagem: '/icones/sistemas/r2on.png',
      icone: G(['#9C958A', '#1B1A17'], 'R2'),
    },
  ],
  pessoal: [
    {
      nome: 'Central Pessoal',
      url: 'https://painel.daluapp.com',
      icone: G(['#F0DCA0', '#6B5210'], 'CP'),
    },
    {
      nome: 'Dalu',
      url: 'https://daluapp.com',
      site: 'daluapp.com',
      icone: G(['#C9A227', '#17130A'], 'D'),
    },
  ],
}

export function sistemasDaPasta(pasta) {
  return (pasta.chave && SISTEMAS[pasta.chave]) || []
}

export function totalDeSistemas() {
  return Object.values(SISTEMAS).reduce((n, lista) => n + lista.length, 0)
}

/** Endereço curto para mostrar embaixo do azulejo. */
export function enderecoCurto(url) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** Endereço do ícone pelo serviço de favicon (para sites de terceiros). */
export function iconeDoSite(site) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site)}&sz=128`
}

/** Desenho de reserva do azulejo: letras sobre o degradê. */
export function desenhoDoAzulejo(icone) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 64 64')
  svg.setAttribute('aria-hidden', 'true')
  const texto = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  texto.setAttribute('x', '32')
  texto.setAttribute('y', '39')
  texto.setAttribute('text-anchor', 'middle')
  texto.setAttribute('font-family', 'Inter, sans-serif')
  texto.setAttribute('font-weight', '700')
  texto.setAttribute('font-size', icone.letras.length > 1 ? '22' : '30')
  texto.setAttribute('letter-spacing', '-1')
  texto.setAttribute('fill', '#0A0A0C')
  texto.setAttribute('fill-opacity', '0.85')
  texto.textContent = icone.letras
  svg.append(texto)
  return svg
}
