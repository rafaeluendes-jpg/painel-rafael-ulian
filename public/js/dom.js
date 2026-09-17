// Ajudantes de DOM: criar elementos sem framework e sem innerHTML com dado do usuário.

export function el(tag, atributos = {}, ...filhos) {
  const nodo = document.createElement(tag)
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue
    if (chave === 'class') nodo.className = valor
    else if (chave === 'dataset') Object.assign(nodo.dataset, valor)
    else if (chave === 'style') Object.assign(nodo.style, valor)
    else if (chave.startsWith('on') && typeof valor === 'function') {
      nodo.addEventListener(chave.slice(2).toLowerCase(), valor)
    } else if (chave === 'html') nodo.innerHTML = valor
    else if (valor === true) nodo.setAttribute(chave, '')
    else nodo.setAttribute(chave, valor)
  }
  anexar(nodo, filhos)
  return nodo
}

export function anexar(nodo, filhos) {
  for (const filho of filhos.flat(Infinity)) {
    if (filho === null || filho === undefined || filho === false) continue
    nodo.append(filho instanceof Node ? filho : document.createTextNode(String(filho)))
  }
  return nodo
}

export function limpar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild)
  return nodo
}

export const $ = (seletor, base = document) => base.querySelector(seletor)

/** Ícone SVG inline a partir de um caminho (viewBox 16). */
export function icone(caminho, tamanho = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', tamanho)
  svg.setAttribute('height', tamanho)
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.6')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', caminho)
  svg.append(p)
  return svg
}

let temporizadorAviso = null
/** Aviso curto no rodapé (toast). */
export function avisar(mensagem, erro = false) {
  const caixa = $('#aviso')
  caixa.textContent = mensagem
  caixa.classList.toggle('erro', erro)
  caixa.hidden = false
  clearTimeout(temporizadorAviso)
  temporizadorAviso = setTimeout(() => (caixa.hidden = true), erro ? 6000 : 3200)
}

/** Abre o diálogo com o conteúdo dado; resolve quando fechar. */
export function abrirDialogo(conteudo) {
  const dialogo = $('#dialogo')
  limpar(dialogo)
  dialogo.append(el('div', { class: 'dialogo-corpo' }, conteudo))
  dialogo.showModal()
  return new Promise((resolver) => dialogo.addEventListener('close', resolver, { once: true }))
}

export function fecharDialogo() {
  const dialogo = $('#dialogo')
  if (dialogo.open) dialogo.close()
}

/** Confirmação simples. */
export async function confirmar(pergunta, rotulo = 'Confirmar') {
  let resposta = false
  await abrirDialogo([
    el('h2', {}, pergunta),
    el(
      'div',
      { class: 'dialogo-acoes' },
      el('button', { type: 'button', class: 'botao', onClick: fecharDialogo }, 'Cancelar'),
      el(
        'button',
        {
          type: 'button',
          class: 'botao ouro',
          onClick: () => {
            resposta = true
            fecharDialogo()
          },
        },
        rotulo,
      ),
    ),
  ])
  return resposta
}

/** Mensagem de erro sem detalhe técnico. */
export function mensagemDeErro(erro, padrao = 'Não deu certo. Tente de novo.') {
  const texto = String(erro?.message || erro || '')
  if (/sem_convite|Database error saving new user/i.test(texto)) {
    return 'Este e-mail não tem acesso ao painel.'
  }
  if (/Invalid login credentials/i.test(texto)) return 'E-mail ou senha incorretos.'
  if (/rate limit|too many/i.test(texto))
    return 'Muitas tentativas. Espere um minuto e tente de novo.'
  if (/Password should be at least/i.test(texto))
    return 'A senha precisa ter pelo menos 8 caracteres.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(texto))
    return 'Sem conexão. Verifique a internet.'
  if (/Email not confirmed/i.test(texto)) return 'Confirme o e-mail pelo link que enviamos.'
  return padrao
}
