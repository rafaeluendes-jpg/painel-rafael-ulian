// Supabase de mentira para o teste no navegador: Auth (senha, sessão, logout) e o
// bastante do PostgREST (select/insert/upsert/update/delete com filtros simples).
// Guarda tudo em memória. Não é usado em produção.
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

export const USUARIO = { id: '11111111-1111-4111-8111-111111111111', email: 'rafael@exemplo.local' }
export const SENHA = 'senha-de-teste-123'

const tabelas = {
  painel_perfis: [],
  painel_pastas: [],
  painel_itens: [],
  painel_marcacoes: [],
  painel_acoes: [],
  painel_atas: [],
  painel_listas: [],
  painel_lista_itens: [],
  painel_permissoes: [],
  painel_convites: [],
  painel_preferencias: [],
}
const unicos = { painel_marcacoes: ['item_id', 'data'], painel_preferencias: ['dono_id'] }

export function semear() {
  for (const t of Object.values(tabelas)) t.length = 0
  tabelas.painel_convites.push({
    id: randomUUID(),
    dono_id: null,
    email: USUARIO.email,
    nome: 'Rafael Ulian',
    papel: 'dono',
    pastas: [],
    criado_em: iso(-40),
    aceito_em: null,
    convidado_id: null,
  })
}

const fmtSP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
/** Instante `dias` atrás, às `hora`h de São Paulo (UTC-3), para as datas baterem com o painel. */
function iso(dias = 0, hora = 12) {
  const [a, m, d] = fmtSP.format(new Date()).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias, hora + 3, 0, 0)).toISOString()
}
/** Data AAAA-MM-DD em São Paulo, `dias` atrás. */
function dataSP(dias = 0) {
  return fmtSP.format(new Date(Date.parse(iso(dias))))
}

/** Um histórico de 13 dias para o gráfico ter o que mostrar. */
export function semearHistorico(uid) {
  const pastas = tabelas.painel_pastas.filter((p) => p.dono_id === uid)
  const textos = {
    jolo: ['Conferir caixa de ontem', 'Responder franqueados', 'Pedido de insumos'],
    rafaellos: ['Abrir loja e conferir estoque', 'Fechar caixa'],
    pessoal: ['Treino', 'Ligar para o contador'],
  }
  for (const pasta of pastas) {
    for (const [i, texto] of (textos[pasta.chave] || []).entries()) {
      const item = {
        id: randomUUID(),
        dono_id: uid,
        pasta_id: pasta.id,
        texto,
        ativo: true,
        ordem: i + 1,
        criado_em: iso(-20),
        desativado_em: null,
        acao_id: null,
        a_partir_de: null,
        dias_semana: null,
        dia_mes: null,
      }
      tabelas.painel_itens.push(item)
      for (let d = 13; d >= 1; d--) {
        if ((d * 7 + i * 3) % 5 === 0) continue // alguns dias sem fazer
        const data = dataSP(-d)
        tabelas.painel_marcacoes.push({
          id: randomUUID(),
          item_id: item.id,
          dono_id: uid,
          data,
          feito: true,
          marcado_em: iso(-d, 11),
          marcado_por: uid,
        })
      }
    }
  }
}

// ------------------------------------------------------------ painel_entrar (a RPC)
function entrar(uid, email) {
  let perfil = tabelas.painel_perfis.find((p) => p.id === uid)
  if (perfil) return perfil
  const c = tabelas.painel_convites.find(
    (c) => c.email.toLowerCase() === email.toLowerCase() && !c.aceito_em,
  )
  if (!c) return null
  perfil = { id: uid, nome: c.nome || email.split('@')[0], papel: c.papel, criado_em: iso() }
  tabelas.painel_perfis.push(perfil)
  if (c.papel === 'dono') {
    const base = [
      ['Jolô', 'jolo', '#D9B45A', true],
      ["Rafaello's", 'rafaellos', '#C9A227', true],
      ['Outros', 'outros', '#9C958A', false],
      ['Pessoal', 'pessoal', '#F0DCA0', true],
    ]
    base.forEach(([nome, chave, cor, no_checklist], i) =>
      tabelas.painel_pastas.push({
        id: randomUUID(),
        dono_id: uid,
        nome,
        chave,
        ordem: i + 1,
        cor,
        no_checklist,
        criado_em: iso(),
      }),
    )
    tabelas.painel_preferencias.push({
      dono_id: uid,
      whatsapp_ativo: false,
      whatsapp_numero: '',
      resumo_diario: true,
      resumo_hora: '21:00:00',
      atualizado_em: iso(),
    })
    semearHistorico(uid)
  }
  c.aceito_em = iso()
  c.convidado_id = uid
  return perfil
}

// ------------------------------------------------------------ filtros do PostgREST
function valor(texto) {
  if (texto === 'null') return null
  if (texto === 'true') return true
  if (texto === 'false') return false
  return texto
}
function filtros(url) {
  const lista = []
  for (const [chave, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(chave)) continue
    const m = /^(\w+)\.(.*)$/.exec(v)
    if (!m) continue
    const [, op, resto] = m
    if (op === 'in')
      lista.push((l) =>
        resto
          .slice(1, -1)
          .split(',')
          .map((s) => s.replace(/^"|"$/g, ''))
          .includes(String(l[chave])),
      )
    else if (op === 'eq')
      lista.push((l) => String(l[chave]) === String(valor(resto)) || l[chave] === valor(resto))
    else if (op === 'neq') lista.push((l) => l[chave] !== valor(resto))
    else if (op === 'gte') lista.push((l) => l[chave] >= resto)
    else if (op === 'lte') lista.push((l) => l[chave] <= resto)
    else if (op === 'is')
      lista.push((l) => (resto === 'null' ? l[chave] == null : l[chave] === valor(resto)))
  }
  return (linha) => lista.every((f) => f(linha))
}
function ordenar(url, linhas) {
  const ordens = url.searchParams.getAll('order')
  for (const o of ordens.reverse()) {
    const [col, dir] = o.split('.')
    linhas.sort(
      (a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1),
    )
  }
  return linhas
}
function projetar(url, linhas) {
  const sel = url.searchParams.get('select')
  if (!sel || sel === '*') return linhas
  const cols = sel.split(',')
  return linhas.map((l) => Object.fromEntries(cols.map((c) => [c, l[c]])))
}

function corpo(req) {
  return new Promise((resolve) => {
    let dados = ''
    req.on('data', (c) => (dados += c))
    req.on('end', () => resolve(dados ? JSON.parse(dados) : null))
  })
}

const sessoes = new Map()
function token(uid) {
  const t = randomUUID()
  sessoes.set(t, uid)
  return t
}
function sessao(uid) {
  const usuario = {
    id: uid,
    email: USUARIO.email,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: iso(-40),
  }
  return {
    access_token: token(uid),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: token(uid),
    user: usuario,
  }
}

export function criarMock() {
  semear()
  const registros = { emails: [] }
  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock')
    const querObjeto = /vnd\.pgrst\.object/.test(req.headers.accept || '')
    const responder = (status, dados) => {
      if (querObjeto && Array.isArray(dados)) {
        if (dados.length !== 1) {
          status = 406
          dados = {
            code: 'PGRST116',
            message: `${dados.length} linhas, esperava 1`,
            details: null,
            hint: null,
          }
        } else dados = dados[0]
      }
      res.writeHead(status, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
        'access-control-expose-headers': '*',
      })
      res.end(dados === undefined ? '' : JSON.stringify(dados))
    }
    if (req.method === 'OPTIONS') return responder(204)
    const auth = req.headers.authorization || ''
    const uid = sessoes.get(auth.replace('Bearer ', ''))

    // ---------------- auth
    if (url.pathname === '/auth/v1/token') {
      const b = await corpo(req)
      if (url.searchParams.get('grant_type') === 'password') {
        if (b.email === USUARIO.email && b.password === SENHA)
          return responder(200, sessao(USUARIO.id))
        return responder(400, {
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
          code: 400,
          msg: 'Invalid login credentials',
        })
      }
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const u = sessoes.get(b.refresh_token)
        return u ? responder(200, sessao(u)) : responder(400, { error: 'invalid_grant' })
      }
      return responder(400, { error: 'unsupported' })
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      return uid ? responder(200, sessao(uid).user) : responder(401, { msg: 'sem sessão' })
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'PUT') {
      const b = await corpo(req)
      registros.senhaNova = b.password
      return responder(200, sessao(uid).user)
    }
    if (url.pathname === '/auth/v1/logout') return responder(200, {})
    if (url.pathname === '/auth/v1/otp' || url.pathname === '/auth/v1/recover') {
      const b = await corpo(req)
      registros.emails.push(b.email)
      return responder(200, {})
    }

    // ---------------- rpc
    if (url.pathname === '/rest/v1/rpc/painel_entrar') {
      if (!uid) return responder(401, { message: 'JWT' })
      return responder(200, entrar(uid, USUARIO.email))
    }

    // ---------------- rest
    const m = /^\/rest\/v1\/(\w+)$/.exec(url.pathname)
    if (!m || !tabelas[m[1]]) return responder(404, { message: `não existe: ${url.pathname}` })
    if (!uid) return responder(401, { message: 'JWT expirado' })
    const tabela = tabelas[m[1]]
    const nome = m[1]
    const prefer = req.headers.prefer || ''
    const filtro = filtros(url)
    if (req.method === 'GET') {
      const linhas = projetar(url, ordenar(url, tabela.filter(filtro)))
      if (/count=/.test(prefer))
        res.setHeader('content-range', `0-${linhas.length}/${linhas.length}`)
      return responder(200, linhas)
    }
    if (req.method === 'POST') {
      const b = await corpo(req)
      const lista = Array.isArray(b) ? b : [b]
      const saida = []
      for (const l of lista) {
        const linha = { id: randomUUID(), criado_em: iso(), ...l }
        const chaves = unicos[nome]
        const existente =
          chaves && tabela.find((x) => chaves.every((k) => String(x[k]) === String(linha[k])))
        if (existente) {
          if (!/merge-duplicates/.test(prefer))
            return responder(409, {
              code: '23505',
              message: 'duplicate key value violates unique constraint',
            })
          Object.assign(existente, l)
          saida.push(existente)
        } else {
          if (nome === 'painel_acoes')
            Object.assign(linha, {
              status: linha.status || 'aberto',
              nota: linha.nota || '',
              concluido_em: null,
            })
          if (nome === 'painel_itens')
            Object.assign(linha, {
              ativo: true,
              desativado_em: null,
              acao_id: linha.acao_id || null,
              a_partir_de: linha.a_partir_de || null,
              dias_semana: linha.dias_semana || null,
              dia_mes: linha.dia_mes || null,
            })
          tabela.push(linha)
          saida.push(linha)
        }
      }
      return responder(
        201,
        /return=representation/.test(prefer) ? (Array.isArray(b) ? saida : saida) : undefined,
      )
    }
    if (req.method === 'PATCH') {
      const b = await corpo(req)
      const alvos = tabela.filter(filtro)
      for (const l of alvos) Object.assign(l, b)
      return responder(200, alvos)
    }
    if (req.method === 'DELETE') {
      const alvos = tabela.filter(filtro)
      for (const l of alvos) tabela.splice(tabela.indexOf(l), 1)
      if (nome === 'painel_atas') {
        const ids = new Set(alvos.map((a) => a.id))
        tabelas.painel_acoes = tabelas.painel_acoes.filter((a) => !ids.has(a.ata_id))
      }
      if (nome === 'painel_listas') {
        const ids = new Set(alvos.map((a) => a.id))
        tabelas.painel_lista_itens = tabelas.painel_lista_itens.filter((i) => !ids.has(i.lista_id))
      }
      return responder(200, alvos)
    }
    return responder(405, {})
  })
  return { servidor, tabelas, registros }
}
