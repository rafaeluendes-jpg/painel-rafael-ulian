// Configurações: minha conta, criar acesso, quem tem acesso, pastas, aparência e assistente.
import { el, limpar, avisar, mensagemDeErro, confirmar } from './dom.js'
import { estado, souDono, avisarMudanca } from './estado.js'
import { dados } from './dados.js'
import { sb } from './supabase.js'
import { temaAtual, definirTema } from './tema.js'

const PAPEIS = [
  ['convidada', 'Convidada', 'Vê e marca o checklist das pastas liberadas.'],
  ['administradora', 'Administradora', 'Como convidada, e também importa atas e cria itens.'],
  ['leitura', 'Só leitura', 'Só olha, não marca nada.'],
]

function cartao(titulo, ...miolo) {
  return el(
    'section',
    { class: 'cartao' },
    el('header', {}, el('h2', {}, titulo)),
    el('div', { class: 'miolo' }, miolo),
  )
}

function interruptor(id, marcado, aoMudar) {
  const caixa = el('input', { type: 'checkbox', id, role: 'switch' })
  caixa.checked = marcado
  caixa.addEventListener('change', () => aoMudar(caixa.checked))
  return el('label', { class: 'interruptor', for: id }, caixa, el('i'))
}

function opcao(titulo, descricao, controle) {
  return el(
    'div',
    { class: 'linha-opcao' },
    el('div', {}, el('b', {}, titulo), el('p', {}, descricao)),
    controle,
  )
}

// ---------------------------------------------------------------- minha conta
function minhaConta() {
  const nome = el('input', {
    type: 'text',
    id: 'conta-nome',
    value: estado.perfil?.nome || '',
    maxlength: '60',
  })
  const senha = el('input', {
    type: 'password',
    id: 'conta-senha',
    autocomplete: 'new-password',
    minlength: '8',
  })
  const confirma = el('input', {
    type: 'password',
    id: 'conta-confirma',
    autocomplete: 'new-password',
  })
  const erro = el('p', { class: 'erro', hidden: true, role: 'alert' })
  const form = el(
    'form',
    { novalidate: true },
    el('label', { for: 'conta-nome' }, 'Nome'),
    nome,
    el('label', {}, 'E-mail'),
    el('input', { type: 'email', value: estado.email, disabled: true }),
    el('label', { for: 'conta-senha' }, 'Nova senha'),
    senha,
    el('label', { for: 'conta-confirma' }, 'Confirmar a nova senha'),
    confirma,
    erro,
    el(
      'div',
      { class: 'acoes-form' },
      el('button', { type: 'submit', class: 'botao ouro' }, 'Salvar'),
      el(
        'button',
        {
          type: 'button',
          class: 'botao',
          onClick: async () => {
            try {
              await dados.enviarLinkPorEmail(estado.email)
              avisar('Link de recuperação enviado para o seu e-mail.')
            } catch (e) {
              avisar(mensagemDeErro(e, 'Não consegui enviar o e-mail agora.'), true)
            }
          },
        },
        'Recuperar por e-mail',
      ),
      el(
        'button',
        { type: 'button', class: 'botao', id: 'sair-config', onClick: () => sb.auth.signOut() },
        'Sair do painel',
      ),
    ),
  )
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault()
    erro.hidden = true
    try {
      if (nome.value.trim() && nome.value.trim() !== estado.perfil.nome) {
        estado.perfil = await dados.atualizarNome(estado.uid, nome.value.trim())
        avisarMudanca('perfil')
      }
      if (senha.value || confirma.value) {
        if (senha.value.length < 8) throw new Error('Password should be at least 8')
        if (senha.value !== confirma.value) {
          erro.textContent = 'As senhas não são iguais.'
          erro.hidden = false
          return
        }
        await dados.trocarSenha(senha.value)
        senha.value = ''
        confirma.value = ''
      }
      avisar('Conta atualizada.')
    } catch (e) {
      erro.textContent = mensagemDeErro(e, 'Não consegui salvar.')
      erro.hidden = false
    }
  })
  return cartao('Minha conta', form)
}

// ---------------------------------------------------------------- criar acesso
function criarAcesso(aoCriar) {
  const nome = el('input', { type: 'text', id: 'acesso-nome', maxlength: '60' })
  const email = el('input', { type: 'email', id: 'acesso-email', autocomplete: 'off' })
  const papel = el(
    'select',
    { id: 'acesso-papel' },
    PAPEIS.map(([v, r]) => el('option', { value: v }, r)),
  )
  const ajuda = el('p', {}, PAPEIS[0][2])
  papel.addEventListener(
    'change',
    () => (ajuda.textContent = PAPEIS.find(([v]) => v === papel.value)[2]),
  )
  const caixas = estado.pastas
    .filter((p) => p.dono_id === estado.uid)
    .map((p) => {
      const c = el('input', { type: 'checkbox', value: p.id })
      c.checked = p.chave === 'pessoal'
      return el('label', { class: 'marcar' }, c, p.nome)
    })
  const erro = el('p', { class: 'erro', hidden: true, role: 'alert' })
  const botao = el('button', { type: 'submit', class: 'botao ouro' }, 'Enviar convite')
  const form = el(
    'form',
    { novalidate: true },
    el('label', { for: 'acesso-nome' }, 'Nome'),
    nome,
    el('label', { for: 'acesso-email' }, 'E-mail'),
    email,
    el('label', { for: 'acesso-papel' }, 'Papel'),
    papel,
    ajuda,
    el('label', {}, 'Pastas que a pessoa enxerga'),
    el('div', { class: 'opcoes-pastas' }, caixas),
    erro,
    el('div', { class: 'acoes-form' }, botao),
  )
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault()
    erro.hidden = true
    const pastas = caixas
      .map((l) => l.firstChild)
      .filter((c) => c.checked)
      .map((c) => c.value)
    if (!email.value.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) {
      erro.textContent = 'Escreva um e-mail válido.'
      erro.hidden = false
      return
    }
    if (!pastas.length) {
      erro.textContent = 'Escolha pelo menos uma pasta.'
      erro.hidden = false
      return
    }
    botao.disabled = true
    try {
      await dados.criarConvite(estado.uid, {
        email: email.value.trim().toLowerCase(),
        nome: nome.value.trim(),
        papel: papel.value,
        pastas,
      })
      await dados.enviarLinkPorEmail(email.value.trim().toLowerCase())
      avisar(`Convite enviado para ${email.value.trim()}.`)
      form.reset()
      caixas.forEach((l) => (l.firstChild.checked = false))
      aoCriar()
    } catch (e) {
      erro.textContent = /duplicate|unique/i.test(String(e?.message))
        ? 'Já existe um convite pendente para este e-mail.'
        : mensagemDeErro(e, 'Não consegui enviar o convite.')
      erro.hidden = false
    } finally {
      botao.disabled = false
    }
  })
  return cartao('Criar acesso', form)
}

// ---------------------------------------------------------------- quem tem acesso
async function quemTemAcesso() {
  const lista = el('ul', { class: 'lista-simples', id: 'lista-acessos' })
  const secao = el(
    'section',
    { class: 'cartao' },
    el('header', {}, el('h2', {}, 'Quem tem acesso')),
    lista,
  )
  const nomesDasPastas = new Map(estado.pastas.map((p) => [p.id, p.nome]))

  async function recarregar() {
    limpar(lista)
    try {
      const [convites, permissoes] = await Promise.all([
        dados.convites(),
        dados.permissoesConcedidas(estado.uid),
      ])
      const ids = [...new Set(permissoes.map((p) => p.convidado_id))]
      const perfis = new Map((await dados.perfisPorIds(ids)).map((p) => [p.id, p]))
      for (const id of ids) {
        const pastas = permissoes
          .filter((p) => p.convidado_id === id)
          .map((p) => nomesDasPastas.get(p.pasta_id) || '?')
        const convite = convites.find((c) => c.convidado_id === id)
        const perfil = perfis.get(id)
        lista.append(
          el(
            'li',
            {},
            el(
              'div',
              { class: 'info' },
              el('b', {}, perfil?.nome || convite?.nome || 'Sem nome'),
              el(
                'span',
                {},
                [convite?.email, PAPEIS.find(([v]) => v === perfil?.papel)?.[1], pastas.join(', ')]
                  .filter(Boolean)
                  .join(' · '),
              ),
            ),
            el(
              'button',
              {
                type: 'button',
                class: 'botao pequeno perigo',
                onClick: async () => {
                  if (
                    !(await confirmar(
                      `Revogar o acesso de ${perfil?.nome || convite?.email}?`,
                      'Revogar',
                    ))
                  )
                    return
                  try {
                    await dados.revogar(estado.uid, id)
                    avisar('Acesso revogado.')
                    recarregar()
                  } catch (e) {
                    avisar(mensagemDeErro(e, 'Não consegui revogar.'), true)
                  }
                },
              },
              'Revogar',
            ),
          ),
        )
      }
      for (const c of convites.filter((c) => !c.aceito_em)) {
        lista.append(
          el(
            'li',
            {},
            el(
              'div',
              { class: 'info' },
              el('b', {}, c.nome || c.email),
              el(
                'span',
                {},
                `${c.email} · convite pendente · ${c.pastas.map((id) => nomesDasPastas.get(id) || '?').join(', ')}`,
              ),
            ),
            el(
              'button',
              {
                type: 'button',
                class: 'botao pequeno',
                onClick: async () => {
                  try {
                    await dados.apagarConvite(c.id)
                    avisar('Convite cancelado.')
                    recarregar()
                  } catch (e) {
                    avisar(mensagemDeErro(e, 'Não consegui cancelar.'), true)
                  }
                },
              },
              'Cancelar convite',
            ),
          ),
        )
      }
      if (!lista.children.length) lista.append(el('li', { class: 'vazio' }, 'Só você tem acesso.'))
    } catch (e) {
      lista.append(
        el('li', { class: 'vazio' }, mensagemDeErro(e, 'Não consegui carregar a lista.')),
      )
    }
  }
  recarregar()
  return { secao, recarregar }
}

// ---------------------------------------------------------------- pastas
function pastas() {
  const lista = el('ul', { class: 'lista-simples lista-pastas' })
  const desenhar = () => {
    limpar(lista)
    for (const pasta of estado.pastas.filter((p) => p.dono_id === estado.uid)) {
      const nome = el('input', {
        type: 'text',
        value: pasta.nome,
        maxlength: '40',
        'aria-label': `Nome da pasta ${pasta.nome}`,
      })
      const cor = el('input', {
        type: 'color',
        value: pasta.cor || '#D9B45A',
        'aria-label': `Cor da pasta ${pasta.nome}`,
      })
      const salvar = async (mudancas) => {
        try {
          const nova = await dados.atualizarPasta(pasta.id, mudancas)
          Object.assign(pasta, nova)
          avisarMudanca('pastas')
          avisar('Pasta atualizada.')
        } catch (e) {
          avisar(mensagemDeErro(e, 'Não consegui salvar a pasta.'), true)
        }
      }
      nome.addEventListener('change', () => {
        const v = nome.value.trim()
        if (!v) {
          nome.value = pasta.nome
          return
        }
        salvar({ nome: v })
      })
      cor.addEventListener('change', () => salvar({ cor: cor.value }))
      lista.append(
        el(
          'li',
          {},
          cor,
          nome,
          el(
            'label',
            { class: 'marcar', title: 'Aparece como coluna no checklist' },
            interruptor(`pasta-check-${pasta.id}`, pasta.no_checklist, (v) =>
              salvar({ no_checklist: v }),
            ).firstChild,
            'Checklist',
          ),
        ),
      )
    }
  }
  desenhar()
  const novo = el('input', {
    type: 'text',
    id: 'pasta-nova',
    placeholder: 'Nome da nova pasta',
    maxlength: '40',
  })
  const criar = async () => {
    const v = novo.value.trim()
    if (!v) return
    try {
      const pasta = await dados.criarPasta(estado.uid, v, estado.pastas.length + 1)
      estado.pastas.push(pasta)
      novo.value = ''
      avisarMudanca('pastas')
      desenhar()
      avisar('Pasta criada.')
    } catch (e) {
      avisar(mensagemDeErro(e, 'Não consegui criar a pasta.'), true)
    }
  }
  novo.addEventListener('keydown', (ev) => ev.key === 'Enter' && (ev.preventDefault(), criar()))
  return el(
    'section',
    { class: 'cartao' },
    el('header', {}, el('h2', {}, 'Pastas')),
    lista,
    el(
      'div',
      { class: 'miolo' },
      el(
        'div',
        { class: 'campo-linha', style: { marginTop: '12px' } },
        novo,
        el('button', { type: 'button', class: 'botao', onClick: criar }, 'Criar'),
      ),
    ),
  )
}

// ---------------------------------------------------------------- aparência e assistente
async function aparencia() {
  let prefs = null
  if (souDono()) {
    try {
      prefs = await dados.preferencias(estado.uid)
    } catch {
      prefs = null
    }
  }
  const salvar = async (mudancas) => {
    try {
      prefs = await dados.salvarPreferencias(estado.uid, mudancas)
      avisar('Preferência salva.')
    } catch (e) {
      avisar(mensagemDeErro(e, 'Não consegui salvar.'), true)
    }
  }
  const numero = el('input', {
    type: 'tel',
    id: 'whats-numero',
    placeholder: '+55 45 9 9999-9999',
    value: prefs?.whatsapp_numero || '',
  })
  numero.addEventListener('change', () => salvar({ whatsapp_numero: numero.value.trim() }))
  const hora = el('input', {
    type: 'time',
    id: 'resumo-hora',
    value: (prefs?.resumo_hora || '21:00').slice(0, 5),
  })
  hora.addEventListener('change', () => salvar({ resumo_hora: hora.value }))

  return cartao(
    'Aparência e assistente',
    opcao(
      'Tema escuro',
      'Preto e dourado. Desligado, o painel fica claro.',
      interruptor('tema-escuro', temaAtual() === 'escuro', (v) =>
        definirTema(v ? 'escuro' : 'claro'),
      ),
    ),
    souDono()
      ? [
          opcao(
            'Assistente do WhatsApp',
            'Responde “o que falta?”, marca itens e acrescenta tarefas.',
            interruptor('whats-ativo', Boolean(prefs?.whatsapp_ativo), (v) =>
              salvar({ whatsapp_ativo: v }),
            ),
          ),
          el('label', { for: 'whats-numero' }, 'Seu número no WhatsApp'),
          numero,
          opcao(
            'Resumo diário',
            'Uma mensagem com o que ficou por fazer.',
            interruptor('resumo-diario', prefs?.resumo_diario ?? true, (v) =>
              salvar({ resumo_diario: v }),
            ),
          ),
          el('label', { for: 'resumo-hora' }, 'Horário do resumo'),
          hora,
        ]
      : null,
  )
}

export async function montarConfig(raiz) {
  limpar(raiz)
  raiz.append(
    el(
      'div',
      { class: 'cabecalho' },
      el(
        'div',
        {},
        el('h1', {}, 'Configurações'),
        el('p', {}, souDono() ? 'Conta, acessos, pastas e assistente.' : 'Conta e aparência.'),
      ),
    ),
  )
  const grade = el('div', { class: 'config' })
  raiz.append(grade)
  grade.append(minhaConta())
  if (souDono()) {
    const acessos = await quemTemAcesso()
    grade.append(criarAcesso(acessos.recarregar), acessos.secao, pastas())
  }
  grade.append(await aparencia())
}
