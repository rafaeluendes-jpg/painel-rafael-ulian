// Teste no navegador (Chromium do Playwright) contra o Supabase de mentira:
// entrar, marcar item, ver a eficiência mexer, importar a ata, navegar entre pastas,
// voltar, abrir configurações, alternar o tema. Nenhum erro de console.
// Rode: node test/navegador.mjs   (fotos em /tmp/provas-painel)
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { criarMock, USUARIO, SENHA } from './mock-supabase.mjs'
import { criarServidorEstatico } from './servidor.mjs'

const DIR = process.env.PROVAS_DIR || '/tmp/provas-painel'
mkdirSync(DIR, { recursive: true })

const mock = criarMock()
await new Promise((r) => mock.servidor.listen(0, '127.0.0.1', r))
const portaMock = mock.servidor.address().port
const estatico = criarServidorEstatico({ supabaseUrl: `http://127.0.0.1:${portaMock}` })
await new Promise((r) => estatico.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${estatico.address().port}`

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH })
const falhas = []
const conferir = (ok, msg) => {
  if (!ok) falhas.push(msg)
  console.log(`${ok ? 'ok ' : 'ERR'} ${msg}`)
}

for (const [nome, largura, altura] of [
  ['pc', 1440, 900],
  ['celular', 390, 844],
]) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: altura },
    locale: 'pt-BR',
  })
  const page = await ctx.newPage()
  const consola = []
  // Sem internet no teste: as fontes do Google não carregam (o painel usa as de reserva).
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  )
  // Sem internet no teste: o serviço de favicon devolve um PNG local.
  await ctx.route(/www\.google\.com\/s2\/favicons/, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/png',
      body: readFileSync(new URL('../public/icones/icone-192.png', import.meta.url)),
    }),
  )
  let esperandoErroDeLogin = false
  let esperandoFalhaDeRede = false
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    if (esperandoErroDeLogin && /status of 400/.test(m.text())) return // senha errada de propósito
    if (esperandoFalhaDeRede && /ERR_CONNECTION_FAILED/.test(m.text())) return // banco fora de propósito
    consola.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => consola.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) =>
    esperandoFalhaDeRede && /painel_perfis/.test(r.url())
      ? null
      : consola.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`),
  )
  const rolaDeLado = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
  const foto = (tela) =>
    page.screenshot({ path: `${DIR}/${nome}-${tela}.png`, fullPage: nome === 'pc' })

  try {
    // ---------------- entrada
    await page.goto(BASE + '/')
    await page.waitForSelector('#entrada:not([hidden])')
    conferir(await page.locator('#app').isHidden(), `${nome}: sem sessão, o painel não aparece`)
    await foto('entrada')
    await page.fill('#entrar-email', USUARIO.email)
    await page.fill('#entrar-senha', 'errada')
    esperandoErroDeLogin = true
    await page.click('#entrar-botao')
    await page.waitForSelector('#entrar-erro:not([hidden])')
    esperandoErroDeLogin = false
    conferir(
      (await page.textContent('#entrar-erro')).includes('incorretos'),
      `${nome}: senha errada avisa`,
    )
    await page.fill('#entrar-senha', SENHA)
    await page.click('#entrar-botao')
    await page.waitForSelector('#app:not([hidden])')
    await page.waitForSelector('.coluna')
    conferir((await page.locator('.coluna').count()) === 3, `${nome}: três colunas no checklist`)
    await page.waitForSelector('.grafico rect.barra')
    await page.waitForTimeout(400)
    await foto('hoje')
    conferir(!(await rolaDeLado()), `${nome}: Hoje não rola de lado`)

    // ---------------- marcar um item e ver a eficiência mexer
    const alturaAntes = await page.locator('.grafico rect.barra.hoje').getAttribute('height')
    const feitasAntes = await page.locator('#medidores .val').first().textContent()
    const primeiraCaixa = page
      .locator('.coluna')
      .first()
      .locator('.item:not(.feito) input[type=checkbox]')
      .first()
    await primeiraCaixa.check()
    await page.waitForFunction(
      (antes) => document.querySelector('#medidores .val').textContent !== antes,
      feitasAntes,
    )
    await page.waitForSelector('.item.feito .hora')
    const feitasDepois = await page.locator('#medidores .val').first().textContent()
    conferir(
      Number(feitasDepois) === Number(feitasAntes) + 1,
      `${nome}: medidor "feitas" subiu (${feitasAntes} → ${feitasDepois})`,
    )
    const alturaDepois = await page.locator('.grafico rect.barra.hoje').getAttribute('height')
    conferir(
      Number(alturaDepois) > Number(alturaAntes),
      `${nome}: a barra de hoje cresceu (${alturaAntes} → ${alturaDepois})`,
    )
    conferir(
      (await page.locator('.item.feito .hora').first().textContent()).match(/^\d{2}:\d{2}$/),
      `${nome}: horário gravado ao marcar`,
    )

    // ---------------- novo item e remover
    const campo = page.locator('.coluna').nth(2).locator('.novo-item input')
    await campo.fill('Comprar açaí')
    await campo.press('Enter')
    await page.waitForSelector('.item:has-text("Comprar açaí")')
    conferir(true, `${nome}: novo item entrou na coluna`)
    conferir((await campo.inputValue()) === '', `${nome}: campo "Novo item" zera ao adicionar`)
    const linha = page.locator('.item:has-text("Comprar açaí")')
    await linha.hover()
    await linha.locator('.remover').click()
    await page.waitForSelector('.item:has-text("Comprar açaí")', { state: 'detached' })
    conferir(true, `${nome}: item removido`)

    // ---------------- o que está sendo digitado não some quando a tela se atualiza
    await campo.fill('Texto pela metade')
    // Atualização automática (aba voltou ao foco) enquanto o campo tem foco: espera.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForTimeout(400)
    conferir(
      (await campo.inputValue()) === 'Texto pela metade',
      `${nome}: atualização automática não apaga o que está sendo digitado`,
    )
    // Outra ação remonta a tela (marcar item em outra coluna): o rascunho volta.
    await page.locator('.coluna .item:not(.feito) input[type=checkbox]').first().check()
    await page.waitForTimeout(400)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForTimeout(400)
    conferir(
      (await campo.inputValue()) === 'Texto pela metade',
      `${nome}: rascunho sobrevive à remontagem da tela`,
    )
    await campo.fill('')

    // ---------------- lembrete mensal: some de hoje e aparece em "outros dias"
    const diaHoje = Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', day: '2-digit' }).format(
        new Date(),
      ),
    )
    const diaEscolhido = (diaHoje % 28) + 1
    const fecharCaixa = page.locator('.item:has-text("Fechar caixa")')
    await fecharCaixa.hover()
    await fecharCaixa.locator('.agenda').click()
    await page.waitForSelector('#dialogo[open] .agenda-form')
    await page.fill('#agenda-dia-mes', String(diaEscolhido))
    await page.click('.agenda-form button[type=submit]')
    await page.waitForSelector('.outros-dias .item:has-text("Fechar caixa")', {
      state: 'attached',
    })
    conferir(
      (await page
        .locator('.coluna ul:not(.outros-dias ul) .item:has-text("Fechar caixa")')
        .count()) === 0,
      `${nome}: item mensal saiu da lista de hoje`,
    )
    const etiquetaMes = await page
      .locator('.outros-dias .item:has-text("Fechar caixa") .etiqueta')
      .textContent()
    conferir(
      etiquetaMes === `dia ${diaEscolhido}`,
      `${nome}: etiqueta do lembrete mensal (${etiquetaMes})`,
    )
    const itemMock = mock.tabelas.painel_itens.find((i) => i.texto === 'Fechar caixa')
    conferir(itemMock.dia_mes === diaEscolhido, `${nome}: dia do mês gravado no banco`)
    await page.click('.outros-dias summary')
    await foto('hoje-lembrete')
    // Volta para todo dia: reaparece na lista de hoje.
    const outro = page.locator('.outros-dias .item:has-text("Fechar caixa")')
    await outro.hover()
    await outro.locator('.agenda').click()
    await page.waitForSelector('#dialogo[open] .agenda-form')
    await page.check('.agenda-opcao[data-tipo="todo"] input[type=radio]')
    await page.click('.agenda-form button[type=submit]')
    await page.waitForSelector('.coluna > ul .item:has-text("Fechar caixa")')
    conferir(
      (await page.locator('.outros-dias .item:has-text("Fechar caixa")').count()) === 0,
      `${nome}: item voltou a ser diário`,
    )

    // ---------------- plano de ação: importar a ata, abrir/fechar, arquivar
    if (nome === 'pc') {
      await page.click('.plano header .botao')
      await page.waitForSelector('#dialogo[open] #ata-texto')
      await page.waitForFunction(() => document.querySelector('#ata-texto').value.length > 100)
      conferir(
        (await page.inputValue('#ata-nome')).startsWith('Ata '),
        `${nome}: nome da ata sugerido`,
      )
      await page.click('#dialogo .botao.ouro')
      await page.waitForSelector('.ata.aberta .acao')
      conferir(
        (await page.locator('.ata .acao').count()) === 8,
        `${nome}: 8 ações importadas na ata`,
      )
      await page.click('.ata-cabecalho')
      await page.waitForSelector('.ata .acao', { state: 'detached' })
      conferir((await page.locator('.ata').count()) === 1, `${nome}: ata fechada vira uma linha só`)
      await page.click('.ata-cabecalho')
      await page.waitForSelector('.ata.aberta .acao')
      await page.locator('.ata .acao').first().locator('.pilula.andando').click()
      await page.waitForSelector('.ata .acao .pilula.andando.ativa')
      conferir(true, `${nome}: status da ação muda`)
      await page.locator('.ata .acao').nth(1).locator('.acao-caixa').check()
      await page.waitForSelector('.ata .acao.feita')
      conferir(
        (await page.locator('.ata .acao.feita').count()) === 1,
        `${nome}: caixa da ação risca a ação`,
      )
      await page.locator('.ata .acao.feita .acao-caixa').uncheck()
      await page.waitForSelector('.ata .acao.feita', { state: 'detached' })
      conferir(true, `${nome}: desmarcar a caixa reabre a ação`)
      // mudar a data de uma ação: o prazo muda e o item do checklist acompanha
      const acaoId = await page.locator('.ata .acao').first().getAttribute('data-acao')
      const novaData = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(Date.now() + 10 * 86400000))
      await page.locator(`.acao[data-acao="${acaoId}"] .quando`).click()
      await page.waitForSelector('#dialogo[open] #acao-data')
      await page.fill('#acao-data', novaData)
      await page.click('.data-form button[type=submit]')
      await page.waitForFunction(
        (id) =>
          document.querySelector(`.acao[data-acao="${id}"] .prazo`)?.textContent === 'em 10 dias',
        acaoId,
      )
      const acaoMock = mock.tabelas.painel_acoes.find((a) => a.id === acaoId)
      const itemDaAcao = mock.tabelas.painel_itens.find((i) => i.acao_id === acaoId)
      conferir(
        acaoMock.comeca === novaData && itemDaAcao?.a_partir_de === novaData,
        `${nome}: data da ação mudou (${novaData}) e o item do checklist acompanhou`,
      )
      await page.locator(`.acao[data-acao="${acaoId}"] .titulo`).click()
      await page.waitForSelector('.acao-detalhe')
      await foto('plano')
      await page.fill('.acao-detalhe .nota-form input', 'Semana 1: Netão pediu prazo')
      await page.click('.acao-detalhe .nota-form .botao')
      await page.waitForSelector('.acao-detalhe', { state: 'detached' })
      conferir(
        (await page.locator(`.acao[data-acao="${acaoId}"] .obs`).textContent()).includes('Netão'),
        `${nome}: observação salva recolhe o detalhe e fica à vista`,
      )
      // ver a ata inteira
      await page.click('#tela-hoje .ver-ata')
      await page.waitForSelector('#dialogo[open] .ata-texto')
      conferir(
        (await page.textContent('#dialogo .ata-texto')).length > 100,
        `${nome}: "Ver ata" mostra o texto original`,
      )
      await foto('ver-ata')
      await page.click('#dialogo .botao')
      await page.waitForSelector('#dialogo[open]', { state: 'detached' })
      // arquivar: vai para Relatórios e volta
      await page.click('.ata-botoes .botao:not(.ver-ata)')
      await page.waitForSelector('#dialogo[open]')
      await page.click('#dialogo .botao.ouro')
      await page.waitForSelector('.ata', { state: 'detached' })
      conferir(
        (await page.locator('.plano .vazio').count()) === 1,
        `${nome}: ata arquivada sai da tela Hoje`,
      )
      await page.click('.lateral a[data-tela="relatorios"]')
      await page.waitForSelector('#tela-relatorios .ata')
      conferir(
        (await page.locator('#tela-relatorios .ata').count()) === 1,
        `${nome}: ata aparece em Relatórios`,
      )
      await page.click('#tela-relatorios .ata-cabecalho')
      await page.waitForSelector('#tela-relatorios .acao')
      await foto('relatorios')
      await page.click('#tela-relatorios .ver-ata')
      await page.waitForSelector('#dialogo[open] .ata-texto')
      conferir(true, `${nome}: ata inteira também abre em Relatórios`)
      await page.click('#dialogo .botao')
      await page.waitForSelector('#dialogo[open]', { state: 'detached' })
      await page.click('#tela-relatorios .plano-rodape .botao:not(.ver-ata)')
      await page.waitForSelector('#dialogo[open]')
      await page.click('#dialogo .botao.ouro')
      await page.waitForSelector('#tela-relatorios .ata', { state: 'detached' })
      await page.click('.lateral a[data-tela="hoje"]')
      await page.waitForSelector('#tela-hoje .ata')
      conferir(true, `${nome}: ata voltou para Hoje`)
    } else {
      await page.waitForSelector('.plano .ata')
      conferir(!(await rolaDeLado()), `${nome}: plano não rola de lado`)
    }

    // ---------------- lançamento: nova lista, itens, marcar, zerar
    await page.click('.lateral a[data-tela="lancamento"]')
    await page.waitForSelector('#nova-lista')
    await page.click('#nova-lista')
    await page.waitForSelector('#dialogo[open] #dialogo-texto')
    await page.fill('#dialogo-texto', 'Produto novo')
    await page.click('#dialogo .botao.ouro')
    await page.waitForSelector('.lista .novo-item input')
    for (const texto of ['Ficha técnica', 'Foto do produto', 'Cadastrar no Saipos']) {
      await page.fill('.lista .novo-item input', texto)
      await page.click('.lista .novo-item .mais')
      await page.waitForSelector(`.lista .item:has-text("${texto}")`)
    }
    conferir((await page.locator('.lista .item').count()) === 3, `${nome}: três itens na lista`)
    conferir(
      (await page.inputValue('.lista .novo-item input')) === '',
      `${nome}: campo da lista zera ao dar "+"`,
    )
    await page.locator('.lista .item input[type=checkbox]').first().check()
    await page.waitForSelector('.lista .item.feito')
    conferir(
      (await page.textContent('.lista .fracao')) === '1/3',
      `${nome}: item da lista riscado (1/3)`,
    )
    await foto('lancamento')
    await page.click('.lista-rodape .botao')
    await page.waitForSelector('#dialogo[open]')
    await page.click('#dialogo .botao.ouro')
    await page.waitForSelector('.lista .item.feito', { state: 'detached' })
    conferir(
      (await page.textContent('.lista .fracao')) === '0/3',
      `${nome}: zerar desmarca tudo e mantém os itens`,
    )
    await page.click('.lista-rodape .link.perigo')
    await page.waitForSelector('#dialogo[open]')
    await page.click('#dialogo .botao.ouro')
    await page.waitForSelector('.lista', { state: 'detached' })
    conferir(true, `${nome}: lista apagada`)

    // ---------------- empresas: pastas → sistemas → voltar
    await page.click('.lateral a[data-tela="empresas"]')
    await page.waitForSelector('.pastas .pasta')
    conferir((await page.locator('.pastas .pasta').count()) === 4, `${nome}: quatro pastas`)
    await foto('empresas')
    await page.click('.visual button[title="Ver em cartões"]')
    await page.waitForSelector('.pastas-grade .pasta')
    conferir(
      (await page.locator('.pastas-grade .pasta').count()) === 4,
      `${nome}: pastas em cartões`,
    )
    await foto('empresas-cartoes')
    await page.click('.visual button[title="Ver em lista"]')
    await page.waitForSelector('.pastas .pasta')
    await page.click('.pastas .pasta:has-text("Jolô")')
    await page.waitForSelector('.launchpad .azulejo')
    conferir(
      (await page.locator('.launchpad .azulejo').count()) === 3,
      `${nome}: Jolô tem 3 sistemas`,
    )
    conferir(
      (await page.locator('.launchpad .azulejo').first().getAttribute('target')) === '_blank',
      `${nome}: ícone abre em aba nova`,
    )
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.azulejo-icone img')].every(
        (i) => i.complete && i.naturalWidth > 0,
      ),
    )
    conferir(
      (await page.locator('.azulejo-icone img.cheio').count()) === 1,
      `${nome}: ícone verdadeiro da Central Jolô carregado`,
    )
    await foto('sistemas')
    await page.click('.voltar')
    await page.waitForSelector('.pastas .pasta')
    conferir(true, `${nome}: voltar para as pastas`)

    // ---------------- configurações
    await page.click('.lateral a[data-tela="config"]')
    await page.waitForSelector('#conta-senha')
    await page.waitForSelector('#lista-acessos li')
    await page.fill('#acesso-nome', 'Lu')
    await page.fill('#acesso-email', 'lu@exemplo.local')
    await page.click('form:has(#acesso-email) button[type=submit]')
    await page.waitForSelector('#lista-acessos li:has-text("lu@exemplo.local")')
    conferir(
      mock.registros.emails.includes('lu@exemplo.local'),
      `${nome}: convite enviado por e-mail`,
    )
    await page.fill('#conta-senha', 'nova-senha-segura')
    await page.fill('#conta-confirma', 'nova-senha-segura')
    await page.click('form:has(#conta-senha) button[type=submit]')
    await page.waitForSelector('#aviso:not([hidden])')
    conferir(mock.registros.senhaNova === 'nova-senha-segura', `${nome}: senha trocada`)
    await foto('config')
    conferir(!(await rolaDeLado()), `${nome}: Configurações não rola de lado`)

    // ---------------- tema
    await page.click('#botao-tema')
    conferir(
      (await page.getAttribute('html', 'data-tema')) === 'claro',
      `${nome}: tema claro ligou`,
    )
    await page.click('.lateral a[data-tela="hoje"]')
    await page.waitForSelector('.coluna')
    await foto('hoje-claro')
    await page.reload()
    await page.waitForSelector('#app:not([hidden])')
    conferir(
      (await page.getAttribute('html', 'data-tema')) === 'claro',
      `${nome}: tema salvo depois de recarregar`,
    )
    await page.click('#botao-tema')

    // ---------------- sessão vencida: abrir o painel horas depois renova o token e entra
    await page.evaluate(() => {
      for (const deposito of [localStorage, sessionStorage]) {
        for (const chave of Object.keys(deposito)) {
          if (!chave.endsWith('-auth-token')) continue
          const sessao = JSON.parse(deposito.getItem(chave))
          sessao.expires_at = Math.floor(Date.now() / 1000) - 600
          deposito.setItem(chave, JSON.stringify(sessao))
        }
      }
    })
    await page.reload()
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
    await page.waitForSelector('.coluna')
    conferir(true, `${nome}: sessão vencida renova o token e o painel abre`)

    // ---------------- banco fora do ar ao abrir: mostra o problema e "Tentar de novo"
    esperandoFalhaDeRede = true
    await page.route('**/rest/v1/painel_perfis**', (rota) => rota.abort('connectionfailed'))
    await page.reload()
    await page.waitForSelector('#carregando-tentar:not([hidden])', { timeout: 15000 })
    conferir(
      (await page.textContent('#carregando-texto')).length > 10 &&
        (await page.locator('#app').isHidden()),
      `${nome}: sem banco, aparece o problema com "Tentar de novo" (${await page.textContent('#carregando-texto')})`,
    )
    await page.unroute('**/rest/v1/painel_perfis**')
    esperandoFalhaDeRede = false
    await page.click('#carregando-tentar')
    await page.waitForSelector('#app:not([hidden])', { timeout: 15000 })
    await page.waitForSelector('.coluna')
    conferir(true, `${nome}: "Tentar de novo" reabre o painel`)

    // ---------------- sair (no celular o botão fica em Configurações > Minha conta)
    if (await page.locator('#botao-sair').isVisible()) await page.click('#botao-sair')
    else {
      await page.click('.lateral a[data-tela="config"]')
      await page.click('#sair-config')
    }
    await page.waitForSelector('#entrada:not([hidden])')
    conferir(await page.locator('#app').isHidden(), `${nome}: sair volta para a entrada`)

    await page.waitForTimeout(300) // deixa o pedido de logout terminar antes de fechar
  } catch (e) {
    // Foto do momento da falha, para não ficar às cegas.
    await page.screenshot({ path: `${DIR}/${nome}-erro.png`, fullPage: true }).catch(() => {})
    conferir(
      false,
      `${nome}: falhou em ${String(e.message).split('\n').slice(0, 3).join(' | ')}\n   console: ${consola.join(' | ')}`,
    )
  }
  conferir(
    consola.length === 0,
    `${nome}: console limpo${consola.length ? '\n   ' + consola.join('\n   ') : ''}`,
  )
  await ctx.close()
}

await browser.close()
mock.servidor.close()
estatico.close()
console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\nTudo certo.')
process.exit(falhas.length ? 1 : 0)
