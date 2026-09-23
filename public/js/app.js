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
import { montarRelatorios } from './tela-relatorios.js'
import { montarLancamento } from './tela-lancamento.js'

const TITULOS = {
  hoje: 'Hoje',
  empresas: 'Empresas',
  lancamento: 'Checklist',
  relatorios: 'Relatórios',
  config: 'Configurações',
}
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

  // A tela é remontada do zero: guarda o que estava sendo digitado (e o foco)
  // para devolver depois, senão o texto some no meio da frase.
  const rascunhos = guardarRascunhos()

  if (tela === 'hoje') montarHoje($('#tela-hoje'))
  else if (tela === 'empresas') montarEmpresas($('#tela-empresas'), parametro)
  else if (tela === 'lancamento') montarLancamento($('#tela-lancamento'))
  else if (tela === 'relatorios') montarRelatorios($('#tela-relatorios'))
  else montarConfig($('#tela-config'))

  devolverRascunhos(rascunhos)
}

// Campos de texto que vivem dentro de um bloco identificado (coluna, lista, ação).
const SELETOR_RASCUNHO =
  '#conteudo :is([data-pasta], [data-lista], [data-acao]) :is(input[type=text], textarea)'
const chaveDoCampo = (campo) => {
  const bloco = campo.closest('[data-pasta], [data-lista], [data-acao]')
  const id = bloco.dataset.pasta || bloco.dataset.lista || bloco.dataset.acao
  return `${id}|${campo.closest('form')?.className || ''}|${campo.name || campo.className}`
}

function guardarRascunhos() {
  const ativo = document.activeElement
  const guardados = []
  for (const campo of document.querySelectorAll(SELETOR_RASCUNHO)) {
    const comFoco = campo === ativo
    if (!campo.value && !comFoco) continue
    guardados.push({
      chave: chaveDoCampo(campo),
      valor: campo.value,
      foco: comFoco,
      inicio: campo.selectionStart,
      fim: campo.selectionEnd,
    })
  }
  return guardados
}

function devolverRascunhos(guardados) {
  if (!guardados.length) return
  const campos = [...document.querySelectorAll(SELETOR_RASCUNHO)]
  for (const g of guardados) {
    const campo = campos.find((c) => chaveDoCampo(c) === g.chave)
    if (!campo) continue
    if (g.valor && !campo.value) campo.value = g.valor
    if (g.foco) {
      campo.focus()
      try {
        campo.setSelectionRange(g.inicio, g.fim)
      } catch {
        /* alguns tipos de campo não aceitam seleção */
      }
    }
  }
}

/** Alguém está digitando num campo do painel (ou com um diálogo aberto)? */
function digitando() {
  if ($('#dialogo')?.open) return true
  const a = document.activeElement
  if (!a || !a.closest?.('#conteudo')) return false
  if (a.tagName === 'TEXTAREA') return true
  return a.tagName === 'INPUT' && !/^(checkbox|radio|submit|button|range)$/.test(a.type)
}

/** Rejeita se a promessa demorar mais que `ms` (internet parada não pode travar o painel). */
function comTempo(promessa, ms) {
  let temporizador
  const limite = new Promise((_, rejeitar) => {
    temporizador = setTimeout(() => rejeitar(new Error('tempo_esgotado')), ms)
  })
  return Promise.race([promessa, limite]).finally(() => clearTimeout(temporizador))
}

/** Tela de espera com o problema e o botão "Tentar de novo" (nunca fica em branco). */
function mostrarProblema(mensagem) {
  $('#app').hidden = true
  $('#entrada').hidden = true
  $('#carregando-texto').textContent = mensagem
  $('#carregando-tentar').hidden = false
  $('#carregando').hidden = false
}

async function montarPainel() {
  if (montando) return
  montando = true
  try {
    // A sessão guardada pode estar com o token vencido (painel aberto horas depois):
    // pede a sessão atual (o cliente renova sozinha) antes de carregar.
    const { data } = await comTempo(sb.auth.getSession(), 8000)
    if (!data?.session) {
      mostrarEntrada()
      return
    }
    try {
      await comTempo(carregarTudo(data.session), 25000)
    } catch (e) {
      if (!/JWT|401|expired|invalid token/i.test(String(e?.message || e?.code))) throw e
      // Token recusado: renova uma vez; se não der, volta para a entrada.
      const renovada = await sb.auth.refreshSession()
      if (!renovada.data?.session) {
        await sb.auth.signOut()
        mostrarEntrada()
        return
      }
      await comTempo(carregarTudo(renovada.data.session), 25000)
    }
    $('#entrada').hidden = true
    $('#carregando').hidden = true
    $('#app').hidden = false
    if (!/^#(hoje|empresas|lancamento|relatorios|config)/.test(location.hash))
      history.replaceState(null, '', '#hoje')
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
      mostrarProblema(mensagemDeErro(e, 'Não consegui carregar o painel.'))
    }
  } finally {
    montando = false
  }
}

/** Recomeça do zero: limpa o que o service worker guardou e recarrega a página. */
async function recomecar() {
  $('#carregando-tentar').disabled = true
  try {
    if ('caches' in window) for (const chave of await caches.keys()) await caches.delete(chave)
    if ('serviceWorker' in navigator) {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
    }
  } catch {
    /* sem cache para limpar */
  }
  location.reload()
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
  // Nunca no meio de uma digitação: a atualização espera o campo ser solto.
  const atualizarSeDerTempo = () => {
    if (document.visibilityState !== 'visible' || !estado.pronto || digitando()) return
    recarregarDia().catch(() => {})
  }
  document.addEventListener('visibilitychange', atualizarSeDerTempo)
  setInterval(atualizarSeDerTempo, 60000)
  setInterval(virarODia, 30000)

  // Este aviso pode chegar de dentro de uma trava da biblioteca (ao renovar um token
  // vencido). Chamar a biblioteca de novo aqui dentro trava o painel para sempre, por
  // isso a montagem é adiada para depois que o aviso termina.
  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'PASSWORD_RECOVERY') pedirSenha = true
    if (sessao && sessao.user) {
      if (sessaoAtual?.user?.id !== sessao.user.id) {
        sessaoAtual = sessao
        setTimeout(() => montarPainel(), 0)
      } else sessaoAtual = sessao
      return
    }
    if (evento === 'SIGNED_OUT' || evento === 'INITIAL_SESSION') {
      sessaoAtual = null
      estado.pronto = false
      mostrarEntrada()
    }
  })

  // Se em 12 segundos nem o painel nem a entrada apareceram, oferece recomeçar.
  setTimeout(() => {
    if ($('#entrada').hidden && $('#app').hidden) {
      mostrarProblema('Está demorando mais que o normal. Verifique a internet.')
    }
  }, 12000)
  $('#carregando-tentar').addEventListener('click', recomecar)

  registrarServiceWorker()
}

iniciar()
