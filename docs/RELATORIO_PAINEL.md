# Painel Rafael Ulian — relatório de construção (17/09/2026)

## O que foi feito

Aplicativo web completo em `painel-rafael-ulian/`: tela de entrada, checklist do dia
(Hoje), plano de ação da reunião, eficiência ao vivo, Empresas em dois níveis,
Configurações, PWA instalável, banco com RLS no Supabase e as funções do assistente do
WhatsApp para o servidor Hetzner.

## Decisões tomadas no caminho (e por quê)

1. **Banco dentro do projeto `rafaellos-gestao`, não em projeto novo.** Um projeto
   novo no Supabase custaria US$ 10/mês na organização atual; o Rafael escolheu não
   pagar. Todas as tabelas e funções têm o prefixo `painel_` e nada do outro sistema
   foi tocado. A migração foi aplicada em 17/09/2026 (`painel_rafael_ulian_esquema`),
   junto com o convite do dono (`rafaeluendes@gmail.com`).
2. **Perfil criado por função (`painel_entrar()`), não por gatilho em `auth.users`.**
   O projeto já tem um gatilho de outro sistema (`trg_novo_usuario`); um segundo
   gatilho que recusasse usuários sem convite quebraria o cadastro do outro sistema.
   O painel chama `painel_entrar()` logo após o login: com convite pendente, cria o
   perfil (e as quatro pastas, se for o dono); sem convite, devolve nulo e o painel
   encerra a sessão com a mensagem "Este e-mail não tem acesso ao painel".
   Efeito colateral conhecido: o gatilho do outro sistema cria, para cada usuário
   novo do painel, um perfil inativo (`ativo = false`, papel operador) lá. Não dá
   acesso a nada.
3. **Login por link de e-mail (magic link) para primeiro acesso e "esqueci minha
   senha".** É o único caminho que não precisa da `service_role` no navegador.
   Fluxo implícito de propósito (`flowType: 'implicit'`): o link do convite é aberto no
   celular da pessoa convidada, não no navegador de quem convidou.
4. **Plano de ação entrou nesta versão** (pedido do Rafael durante a construção,
   prévia aprovada). Tabela `painel_acoes`; cada ação gera um item do checklist na
   pasta, com agenda própria (`a_partir_de`, `dias_semana`, `dia_mes`), então a
   eficiência já conta as rotinas do plano. Ação única marcada como feita sai da lista
   no dia seguinte; a marcação fica no histórico.
5. **Colunas extras no esquema pedido:** `pastas.chave` (liga a pasta aos sistemas
   fixos, mesmo depois de renomeada), `pastas.no_checklist` (Outros não tem coluna
   no dia), `itens.desativado_em` (histórico correto quando um item é removido),
   `marcacoes.marcado_por` (quem marcou, quando a Lu marca), tabela
   `painel_preferencias` (assistente do WhatsApp e resumo das 21h) e
   `painel_convites` (deny-by-default de quem entra).
6. **supabase-js embutido em `public/vendor/`** (UMD 2.116.0) em vez de CDN: o
   Worker fica autossuficiente, o service worker guarda tudo e a CSP fica só em
   `'self'`.
7. **Logo:** o PNG do monograma não chegou; desenhei um RU em SVG (`public/logo/ru.svg`)
   e gerei os ícones do PWA a partir dele. Trocar depois é substituir o arquivo e
   rodar `node test/icones.mjs`.

## Segurança

- RLS ligada em todas as `painel_*`; `anon` sem nenhum privilégio nelas.
- Policies com funções `security definer` só de leitura (`painel_pasta_liberada`,
  `painel_pasta_dono`, `painel_item_pasta`, `painel_ligado_a_mim`,
  `painel_pastas_sao_minhas`). O linter do Supabase avisa que `authenticated` pode
  chamá-las por RPC; elas só respondem verdadeiro/falso ou um id sobre dados que o
  próprio usuário já pode ver.
- Worker com CSP (`script-src 'self'`), `frame-ancestors 'none'`, HSTS, nosniff.
- Nenhuma senha ou chave secreta no código. A chave em `config.js` é a publicável.
- Erros ao usuário sem detalhe técnico (`mensagemDeErro`).

### Achado no projeto compartilhado (não mexi; decisão do Rafael)

O linter do Supabase aponta, no `rafaellos-gestao`, a tabela `public.backup_producao`
**sem RLS** (qualquer pessoa com a chave anon lê e escreve nela), views `equipe` e
`clientes_venda` expondo `auth.users` para `anon`, e funções `criar_acesso`,
`criar_cliente`, `disparar_push_agora`, `meu_revendedor` executáveis por `anon`.
Correção sugerida para a tabela: `alter table public.backup_producao enable row level
security;` (e criar as policies necessárias antes, senão o outro sistema perde acesso).

## Testes

`node test/navegador.mjs` (Chromium do Playwright, Supabase de mentira em memória):

- 1440×900 e 390×844, tema escuro e claro;
- entrar (senha errada avisa; certa entra), três colunas, marcar item (horário gravado,
  medidor sobe, barra de hoje cresce), novo item, remover, importar a ata de 16/09
  (8 ações), mudar status, abrir detalhe, Empresas → Jolô (3 sistemas, aba nova) →
  voltar, Configurações (convite para a Lu enviado por e-mail, senha trocada), tema
  claro persistido após recarregar, sair;
- nenhuma página rola de lado; console sem erro.

`wrangler deploy --dry-run` valida a configuração do Worker (35 arquivos de assets).

`pnpm lint` e `pnpm format` do repositório passam com a pasta nova.

## O que depende do Rafael

1. Criar o repositório `painel-rafael-ulian` no GitHub (privado) e ligar ao Workers
   Builds (build vazio, deploy `npx wrangler deploy`); copiar a pasta
   `painel-rafael-ulian/` para lá. Não tenho acesso a esse repositório nesta sessão.
2. No Supabase (`rafaellos-gestao` → Authentication → URL Configuration): adicionar o
   endereço do Worker em Site URL e Redirect URLs. Sem isso o link do e-mail volta
   para o endereço do outro sistema.
3. Opcional: ajustar o texto do e-mail "Magic Link" (Authentication → Email Templates)
   para "Seu acesso ao Painel Rafael Ulian".
4. Primeiro acesso: e-mail + "Esqueci minha senha" → link → definir senha.
5. Enviar o PNG oficial do monograma RU, se quiser trocar o desenhado.
6. No Hetzner: `assistente/` com a `service_role` no `.env` e ligar ao bot do WhatsApp.

## Arquivos

```
painel-rafael-ulian/
  README.md · package.json · wrangler.jsonc
  src/worker.js
  public/index.html · manifest.json · sw.js
  public/css/base.css · telas.css
  public/js/app.js · config.js · supabase.js · dados.js · estado.js · datas.js · dom.js
            tema.js · sistemas.js · ata.js · tela-entrada.js · tela-hoje.js
            tela-plano.js · tela-eficiencia.js · tela-empresas.js · tela-config.js
  public/vendor/supabase-js-2.116.0.js · public/logo/ru.svg · public/icones/*.png
  public/dados/ata-2026-09-16.txt
  supabase/migrations/0001_esquema.sql · supabase/seed.sql
  assistente/painel.js · exemplo-whatsapp.js · package.json · .env.example
  test/navegador.mjs · mock-supabase.mjs · servidor.mjs · icones.mjs
  docs/RELATORIO_PAINEL.md
```

Fora da pasta: `.prettierignore` e `eslint.config.mjs` da raiz ganharam duas linhas
para ignorar o `vendor/` e liberar `console` no assistente e nos testes.
