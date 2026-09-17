// Worker do painel: entrega os arquivos estáticos de `public/` e acrescenta os
// cabeçalhos de segurança. Não há segredo aqui: só a chave anon vai ao navegador.

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: https://www.google.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const CABECALHOS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

export default {
  async fetch(request, env) {
    const resposta = await env.ASSETS.fetch(request)
    const saida = new Response(resposta.body, resposta)
    for (const [nome, valor] of Object.entries(CABECALHOS)) saida.headers.set(nome, valor)
    // O service worker e o manifest precisam sempre da versão nova.
    const caminho = new URL(request.url).pathname
    if (caminho === '/sw.js' || caminho === '/manifest.json' || caminho === '/js/config.js') {
      saida.headers.set('Cache-Control', 'no-cache')
    }
    return saida
  },
}
