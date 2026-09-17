// Ponto de partida: sessão, tema, navegação por hash e montagem das telas.
import { sb } from './supabase.js'
import { $, avisar, mensagemDeErro } from './dom.js'
import { estado, carregarTudo, recarregarDia, aoMudar } from './estado.js'
import { hojeISO, dataCurta } from './datas.js'
import { carregarTema, alternarTema } from './tema.js'
import { montarEntrada, mostrarEntrada } from './tela-entrada.js'
import { montarHoje } from './tela-hoje.js'
import { montarEmpresas } from './tela-empresas.js'
import { montarConfig } from './tela-config.js'

const TITULOS = { hoje: 'Hoje', empresas: 'Empresas', config: 'Configurações' }
let pedirSenha = /type=(recovery|magiclink|invite|signup)/.test(location.hash)
let sessaoAtual = null
let montando = false

function rota() {
  const h = location.hash.replace(/^#/, '')
  if (!h || h.includes('access_token') || h.includes('error='))
    return { tela: 'hoje', parametro: null }
  const [tela, parametro] = h.split('/')
  return { tela: TITULOS[tela] ? tela : 'hoje', parametro: parametro || null }
}

function desenharTela() {
  if (!estado.pronto) return
  const { tela, parametro } = rota()
  for (const nome of Object.keys(TITULOS)) $(`#tela-${nome}`).hidden = nome !== tela
  document
    .querySelectorAll('.lateral a[data-tela]')
    .forEach((a) => a.classList.toggle('ativo', a.dataset.tela === tela))
  $('#titulo-tela').textContent = TITULOS[tela]
  $('#lateral-nome').textContent = estado.perfil?.nome || estado.email
  $('#barra-data').textContent = dataCurta(estado.hoje)

  // Guarda onde estava o foco (o campo "Novo item" de uma coluna) para devolvê-lo depois.
  const ativo = document.activeElement
  const pastaComFoco = ativo?.closest?.('.novo-item')
    ? ativo.closest('[data-pasta]')?.dataset.pasta
    : null

  if (tela === 'hoje') montarHoje($('#tela-hoje'))
  else if (tela === 'empresas') montarEmpresas($('#tela-empresas'), parametro)
  else montarConfig($('#tela-config'))

  if (pastaComFoco) $(`[data-pasta="${pastaComFoco}"] .novo-item input`)?.focus()
}

async function montarPainel(sessao) {
  if (montando) return
  montando = true
  try {
    await carregarTudo(sessao)
    $('#entrada').hidden = true
    $('#app').hidden = false
    if (!/^#(hoje|empresas|config)/.test(location.hash)) history.replaceState(null, '', '#hoje')
    desenharTela()
    if (pedirSenha) {
      pedirSenha = false
      location.hash = '#config'
      avisar('Você entrou pelo link. Defina uma senha em “Minha conta”.')
      setTimeout(() => $('#conta-senha')?.focus(), 300)
    }
  } catch (e) {
    if (String(e?.message) === 'sem_convite') {
      await sb.auth.signOut()
      mostrarEntrada()
      const erro = $('#entrar-erro')
      erro.textContent = 'Este e-mail não tem acesso ao painel.'
      erro.hidden = false
    } else {
      avisar(mensagemDeErro(e, 'Não consegui carregar o painel.'), true)
    }
  } finally {
    montando = false
  }
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))
    return
  navigator.serviceWorker.register('/sw.js').catch(() => {
    /* sem service worker o painel continua funcionando online */
  })
}

function virarODia() {
  if (estado.pronto && estado.hoje !== hojeISO()) recarregarDia().catch(() => {})
}

async function iniciar() {
  carregarTema()
  montarEntrada()
  $('#botao-tema').addEventListener('click', alternarTema)
  $('#botao-sair').addEventListener('click', async () => {
    await sb.auth.signOut()
  })
  window.addEventListener('hashchange', desenharTela)
  aoMudar((origem) => {
    if (origem === 'tudo') return
    if (origem === 'perfil') {
      $('#lateral-nome').textContent = estado.perfil?.nome || estado.email
      return
    }
    // Configurações têm campos em edição: não remontar a cada mudança de pasta.
    if (rota().tela === 'config' && origem === 'pastas') return
    desenharTela()
  })

  // Quando a aba volta ao foco (ou a cada minuto), busca o que mudou em outro aparelho.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && estado.pronto) recarregarDia().catch(() => {})
  })
  setInterval(() => {
    if (document.visibilityState === 'visible' && estado.pronto) recarregarDia().catch(() => {})
  }, 60000)
  setInterval(virarODia, 30000)

  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'PASSWORD_RECOVERY') pedirSenha = true
    if (sessao && sessao.user) {
      if (sessaoAtual?.user?.id !== sessao.user.id) {
        sessaoAtual = sessao
        montarPainel(sessao)
      } else sessaoAtual = sessao
      return
    }
    if (evento === 'SIGNED_OUT' || evento === 'INITIAL_SESSION') {
      sessaoAtual = null
      estado.pronto = false
      mostrarEntrada()
    }
  })

  registrarServiceWorker()
}

iniciar()
