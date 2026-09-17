// Cliente Supabase (vendor/supabase-js, UMD). A sessão fica no localStorage quando a
// pessoa marca "continuar conectado"; senão, só na aba (sessionStorage).
import { CONFIG } from './config.js'

const CHAVE_LEMBRAR = 'ru.lembrar'

function lembrar() {
  try {
    return localStorage.getItem(CHAVE_LEMBRAR) !== 'nao'
  } catch {
    return true
  }
}

export function definirLembrar(sim) {
  try {
    localStorage.setItem(CHAVE_LEMBRAR, sim ? 'sim' : 'nao')
  } catch {
    /* sem armazenamento: segue só na memória */
  }
}

const armazenamento = {
  getItem(chave) {
    try {
      return sessionStorage.getItem(chave) ?? localStorage.getItem(chave)
    } catch {
      return null
    }
  },
  setItem(chave, valor) {
    try {
      const alvo = lembrar() ? localStorage : sessionStorage
      alvo.setItem(chave, valor)
    } catch {
      /* sem armazenamento */
    }
  },
  removeItem(chave) {
    try {
      localStorage.removeItem(chave)
      sessionStorage.removeItem(chave)
    } catch {
      /* sem armazenamento */
    }
  },
}

// Fluxo implícito de propósito: o link do convite é aberto no aparelho de quem foi
// convidado, não no navegador de quem convidou (o PKCE exigiria o mesmo navegador).
export const sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
  auth: {
    storage: armazenamento,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
})

/** Lança o erro da resposta do PostgREST, se houver; devolve os dados. */
export function ok({ data, error }) {
  if (error) throw error
  return data
}
