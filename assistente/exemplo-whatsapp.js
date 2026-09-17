// Exemplo de como o bot do WhatsApp usa as funções do painel. A parte que fala
// com o WhatsApp (Baileys, Evolution API, Z-API…) fica por conta do servidor;
// aqui só a interpretação da mensagem e a resposta.
import 'dotenv/config'
import { criarPainel } from './painel.js'

const painel = criarPainel({
  url: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
})

/**
 * Recebe o número de quem mandou e o texto; devolve a resposta (ou nulo se não é
 * para o painel). Só responde a quem ligou o assistente nas Configurações.
 */
export async function responder(numero, texto) {
  const donoId = await painel.donoPeloNumero(numero)
  if (!donoId) return null
  const t = texto.trim()
  const baixo = t.toLowerCase()

  if (/^(o que falta|falta|lista|hoje)\??$/.test(baixo)) return painel.listarPendentes(donoId)
  if (/^(resumo|efici[eê]ncia)( da semana)?$/.test(baixo))
    return (await painel.resumirEficiencia(donoId, 7)).texto
  if (/^(resumo do m[eê]s)$/.test(baixo)) return (await painel.resumirEficiencia(donoId, 30)).texto
  if (/^plano$/.test(baixo)) return (await painel.resumirPlano(donoId)) || 'Sem plano de ação.'

  let m = /^(feito|fiz|feita|ok)\s+(.+)$/i.exec(t)
  if (m) return (await painel.marcarFeito(donoId, m[2])).mensagem

  // "add Pessoal: ligar para o contador" ou "anota: comprar açaí"
  m = /^(add|anota|anotar|acrescenta|novo)\s*:?\s*(?:([^:]+):\s*)?(.+)$/i.exec(t)
  if (m) return (await painel.adicionarItem(donoId, m[2] || '', m[3])).mensagem

  return 'Posso: "o que falta?", "feito <item>", "add <pasta>: <item>", "resumo", "plano".'
}

/** Para o agendador do servidor (cron às 21h): manda o resumo a quem ligou. */
export async function resumosDas21h(enviar) {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data } = await sb
    .from('painel_preferencias')
    .select('dono_id, whatsapp_numero')
    .eq('whatsapp_ativo', true)
    .eq('resumo_diario', true)
  for (const p of data || []) {
    if (!p.whatsapp_numero) continue
    await enviar(p.whatsapp_numero, await painel.resumoDiario(p.dono_id))
  }
}

// Uso direto na linha de comando: node exemplo-whatsapp.js "+5545999999999" "o que falta?"
if (
  process.argv[1] &&
  process.argv[1].endsWith('exemplo-whatsapp.js') &&
  process.argv.length >= 4
) {
  responder(process.argv[2], process.argv.slice(3).join(' ')).then((r) => {
    console.log(r ?? '(número sem assistente ligado)')
  })
}
