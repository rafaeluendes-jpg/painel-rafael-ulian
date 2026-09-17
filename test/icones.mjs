// Gera os ícones do PWA (192, 256, 384, 512 e maskable) a partir do monograma RU,
// usando o Chromium do Playwright. Rode: node test/icones.mjs
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(raiz, 'public/logo/ru.svg'), 'utf8')
const saida = join(raiz, 'public/icones')
mkdirSync(saida, { recursive: true })

// maskable: a marca ocupa só o centro (zona segura de 80%).
function pagina(tamanho, maskable) {
  const margem = maskable ? Math.round(tamanho * 0.22) : Math.round(tamanho * 0.16)
  const raio = maskable ? 0 : Math.round(tamanho * 0.22)
  return `<!doctype html><html><head><style>
    html,body{margin:0;background:transparent}
    .caixa{width:${tamanho}px;height:${tamanho}px;border-radius:${raio}px;background:#0A0A0C;
      display:grid;place-items:center;box-sizing:border-box;padding:${margem}px;
      ${maskable ? '' : 'border:1px solid rgba(255,255,255,.12);'}}
    svg{width:100%;height:100%}
  </style></head><body><div class="caixa">${svg}</div></body></html>`
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH })
const page = await browser.newPage({ deviceScaleFactor: 1 })
for (const [tamanho, maskable, nome] of [
  [192, false, 'icone-192.png'],
  [256, false, 'icone-256.png'],
  [384, false, 'icone-384.png'],
  [512, false, 'icone-512.png'],
  [512, true, 'icone-maskable-512.png'],
]) {
  await page.setViewportSize({ width: tamanho, height: tamanho })
  await page.setContent(pagina(tamanho, maskable))
  await page.locator('.caixa').screenshot({ path: join(saida, nome), omitBackground: !maskable })
  console.log('gerado', nome)
}
await browser.close()
