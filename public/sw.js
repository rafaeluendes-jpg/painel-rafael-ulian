// Service worker: guarda a casca do painel para abrir rápido e instalado no celular.
// Dados nunca são guardados aqui (vão sempre ao Supabase).
const VERSAO = 'ru-2026-09-17-2'
const CASCA = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/telas.css',
  '/js/app.js',
  '/js/ata.js',
  '/js/config.js',
  '/js/dados.js',
  '/js/datas.js',
  '/js/dom.js',
  '/js/estado.js',
  '/js/sistemas.js',
  '/js/supabase.js',
  '/js/tela-config.js',
  '/js/tela-eficiencia.js',
  '/js/tela-empresas.js',
  '/js/tela-entrada.js',
  '/js/tela-hoje.js',
  '/js/tela-plano.js',
  '/js/tela-relatorios.js',
  '/js/tema.js',
  '/vendor/supabase-js-2.116.0.js',
  '/logo/ru.svg',
  '/icones/icone-192.png',
  '/manifest.json',
]

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.addAll(CASCA))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  const { request } = evento
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Só o que é do próprio painel e das fontes; Supabase vai direto à rede.
  const fonte = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  if (url.origin !== location.origin && !fonte) return
  if (url.pathname === '/sw.js' || url.pathname === '/js/config.js') return

  evento.respondWith(
    (async () => {
      const cache = await caches.open(VERSAO)
      if (request.mode === 'navigate') {
        // Página: rede primeiro, casca guardada se estiver sem internet.
        try {
          const resposta = await fetch(request)
          cache.put('/index.html', resposta.clone())
          return resposta
        } catch {
          return (await cache.match('/index.html')) || Response.error()
        }
      }
      const guardado = await cache.match(request)
      const daRede = fetch(request)
        .then((resposta) => {
          if (resposta.ok) cache.put(request, resposta.clone())
          return resposta
        })
        .catch(() => guardado)
      return guardado || daRede
    })(),
  )
})
