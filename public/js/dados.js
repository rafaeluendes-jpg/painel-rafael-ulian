// Acesso ao banco. Toda consulta passa pela RLS: o cliente só enxerga o que é
// dele ou o que foi liberado em `permissoes`.
import { sb, ok } from './supabase.js'
import { hojeISO, somarDias } from './datas.js'

export const dados = {
  // ------------------------------------------------------------ leitura
  async perfil(uid) {
    return ok(await sb.from('painel_perfis').select('*').eq('id', uid).maybeSingle())
  },
  /** Primeiro acesso: cria o perfil se houver convite para o e-mail; senão devolve nulo. */
  async entrar() {
    return ok(await sb.rpc('painel_entrar'))
  },
  async pastas() {
    return ok(await sb.from('painel_pastas').select('*').order('ordem').order('criado_em'))
  },
  async itensAtivos() {
    return ok(
      await sb.from('painel_itens').select('*').eq('ativo', true).order('ordem').order('criado_em'),
    )
  },
  async itensTodos() {
    return ok(await sb.from('painel_itens').select('*').order('ordem').order('criado_em'))
  },
  async marcacoesDoDia(data = hojeISO()) {
    return ok(await sb.from('painel_marcacoes').select('*').eq('data', data))
  },
  async marcacoesDesde(dias, hoje = hojeISO()) {
    return ok(
      await sb
        .from('painel_marcacoes')
        .select('*')
        .gte('data', somarDias(hoje, -(dias - 1))),
    )
  },
  async acoes() {
    return ok(await sb.from('painel_acoes').select('*').order('comeca').order('ordem'))
  },
  async atas() {
    return ok(await sb.from('painel_atas').select('*').order('criado_em'))
  },
  async minhasPermissoes(uid) {
    return ok(await sb.from('painel_permissoes').select('*').eq('convidado_id', uid))
  },

  // ------------------------------------------------------------ checklist
  async marcar(item, feito, uid, data = hojeISO()) {
    return ok(
      await sb
        .from('painel_marcacoes')
        .upsert(
          {
            item_id: item.id,
            dono_id: item.dono_id,
            data,
            feito,
            marcado_em: new Date().toISOString(),
            marcado_por: uid,
          },
          { onConflict: 'item_id,data' },
        )
        .select()
        .single(),
    )
  },
  async criarItem(pasta, texto, ordem, extras = {}) {
    return ok(
      await sb
        .from('painel_itens')
        .insert({ dono_id: pasta.dono_id, pasta_id: pasta.id, texto, ordem, ...extras })
        .select()
        .single(),
    )
  },
  async removerItem(item) {
    return ok(
      await sb
        .from('painel_itens')
        .update({ ativo: false, desativado_em: new Date().toISOString() })
        .eq('id', item.id)
        .select()
        .single(),
    )
  },
  async reativarItem(item) {
    return ok(
      await sb
        .from('painel_itens')
        .update({ ativo: true, desativado_em: null })
        .eq('id', item.id)
        .select()
        .single(),
    )
  },
  async apagarMarcacao(itemId, data = hojeISO()) {
    return ok(await sb.from('painel_marcacoes').delete().eq('item_id', itemId).eq('data', data))
  },

  // ------------------------------------------------------------ plano de ação
  async criarAta(ata) {
    return ok(await sb.from('painel_atas').insert(ata).select().single())
  },
  async atualizarAta(id, mudancas) {
    return ok(await sb.from('painel_atas').update(mudancas).eq('id', id).select().single())
  },
  async apagarAta(id) {
    return ok(await sb.from('painel_atas').delete().eq('id', id))
  },
  async criarAcoes(linhas) {
    return ok(await sb.from('painel_acoes').insert(linhas).select())
  },
  async atualizarAcao(id, mudancas) {
    return ok(await sb.from('painel_acoes').update(mudancas).eq('id', id).select().single())
  },

  // ------------------------------------------------------------ pastas
  async atualizarPasta(id, mudancas) {
    return ok(await sb.from('painel_pastas').update(mudancas).eq('id', id).select().single())
  },
  async criarPasta(uid, nome, ordem) {
    return ok(
      await sb
        .from('painel_pastas')
        .insert({ dono_id: uid, nome, ordem, cor: '#D9B45A', no_checklist: true })
        .select()
        .single(),
    )
  },

  // ------------------------------------------------------------ acessos
  async convites() {
    return ok(await sb.from('painel_convites').select('*').order('criado_em'))
  },
  async criarConvite(uid, { email, nome, papel, pastas }) {
    return ok(
      await sb
        .from('painel_convites')
        .insert({ dono_id: uid, email, nome, papel, pastas })
        .select()
        .single(),
    )
  },
  async apagarConvite(id) {
    return ok(await sb.from('painel_convites').delete().eq('id', id))
  },
  async permissoesConcedidas(uid) {
    return ok(await sb.from('painel_permissoes').select('*').eq('dono_id', uid))
  },
  async perfisPorIds(ids) {
    if (!ids.length) return []
    return ok(await sb.from('painel_perfis').select('id,nome,papel').in('id', ids))
  },
  async revogar(uid, convidadoId) {
    ok(
      await sb
        .from('painel_permissoes')
        .delete()
        .eq('dono_id', uid)
        .eq('convidado_id', convidadoId),
    )
    ok(await sb.from('painel_convites').delete().eq('dono_id', uid).eq('convidado_id', convidadoId))
  },
  async enviarLinkPorEmail(email) {
    return ok(
      await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: location.origin + '/' },
      }),
    )
  },

  // ------------------------------------------------------------ preferências e conta
  async preferencias(uid) {
    return ok(await sb.from('painel_preferencias').select('*').eq('dono_id', uid).maybeSingle())
  },
  async salvarPreferencias(uid, mudancas) {
    return ok(
      await sb
        .from('painel_preferencias')
        .upsert({ dono_id: uid, ...mudancas, atualizado_em: new Date().toISOString() })
        .select()
        .single(),
    )
  },
  async trocarSenha(senha) {
    return ok(await sb.auth.updateUser({ password: senha }))
  },
  async atualizarNome(uid, nome) {
    return ok(await sb.from('painel_perfis').update({ nome }).eq('id', uid).select().single())
  },
}
