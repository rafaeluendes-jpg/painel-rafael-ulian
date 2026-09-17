// Servidor estático de teste: entrega `public/` como o Worker faria (com os mesmos
// cabeçalhos de segurança) e troca o config.js para apontar ao Supabase de mentira.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: https://www.google.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:* http://localhost:*",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
].join('; ')

export function criarServidorEstatico({ supabaseUrl }) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    let caminho = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
    if (caminho === '/js/config.js') {
      res.writeHead(200, { 'content-type': TIPOS['.js'], 'content-security-policy': CSP })
      res.end(
        `export const CONFIG = { supabaseUrl: '${supabaseUrl}', supabaseAnonKey: 'anon-de-teste', fusoHorario: 'America/Sao_Paulo' }\n`,
      )
      return
    }
    if (caminho === '/') caminho = '/index.html'
    let arquivo
    try {
      arquivo = await readFile(join(raiz, caminho))
    } catch {
      if (extname(caminho)) {
        res.writeHead(404)
        res.end('não encontrado')
        return
      }
      arquivo = await readFile(join(raiz, 'index.html'))
      caminho = '/index.html'
    }
    res.writeHead(200, {
      'content-type': TIPOS[extname(caminho)] || 'application/octet-stream',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
    })
    res.end(arquivo)
  })
}
