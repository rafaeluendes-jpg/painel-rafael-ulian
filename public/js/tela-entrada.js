// Tela de entrada: e-mail e senha pelo Supabase Auth. "Esqueci minha senha" e o
// primeiro acesso usam o mesmo link por e-mail.
import { sb } from './supabase.js'
import { definirLembrar } from './supabase.js'
import { $, mensagemDeErro, avisar } from './dom.js'
import { dados } from './dados.js'

export function montarEntrada() {
  const form = $('#form-entrar')
  const erro = $('#entrar-erro')
  const botao = $('#entrar-botao')

  const mostrarErro = (texto) => {
    erro.textContent = texto
    erro.hidden = !texto
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault()
    mostrarErro('')
    const email = $('#entrar-email').value.trim()
    const senha = $('#entrar-senha').value
    if (!email || !senha) {
      mostrarErro('Preencha o e-mail e a senha.')
      return
    }
    definirLembrar($('#entrar-lembrar').checked)
    botao.disabled = true
    botao.textContent = 'Entrando…'
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha })
      if (error) throw error
      // O app escuta onAuthStateChange e monta o painel.
    } catch (e) {
      mostrarErro(mensagemDeErro(e))
    } finally {
      botao.disabled = false
      botao.textContent = 'Entrar'
    }
  })

  $('#entrar-esqueci').addEventListener('click', async () => {
    mostrarErro('')
    const email = $('#entrar-email').value.trim()
    if (!email) {
      mostrarErro('Escreva o e-mail para receber o link.')
      $('#entrar-email').focus()
      return
    }
    try {
      await dados.enviarLinkPorEmail(email)
      avisar('Link enviado. Abra o e-mail e clique para entrar e definir a senha.')
    } catch (e) {
      mostrarErro(mensagemDeErro(e, 'Não foi possível enviar o link agora.'))
    }
  })
}

export function mostrarEntrada() {
  $('#app').hidden = true
  $('#carregando').hidden = true
  $('#entrada').hidden = false
  $('#entrar-senha').value = ''
}
