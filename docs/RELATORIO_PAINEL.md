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

## Lembretes por dia (21/09) e o texto que sumia ao digitar

**Lembrete mensal / semanal.** Cada item do Hoje ganhou o botão de calendário
("Quando lembrar"): todo dia, só nestes dias da semana, ou todo mês num dia
(1 a 31; dia 31 num mês de 30 vale no último dia). Usa as colunas que já
existiam em `painel_itens` (`dias_semana`, `dia_mes`), sem migração nova. O
item que não cai hoje fica na seção recolhível "N lembretes em outros dias" da
coluna, com a etiqueta ("dia 5", "seg · qua", "seg a sex") e a próxima data.
Itens que vêm do plano de ação não têm o botão: o ritmo deles é o da ata.
Arquivos: `datas.js` (`diasNoMes`, `proximoDiaDoItem`, `descricaoAgenda`),
`dados.js` (`atualizarItem`), `estado.js` (`salvarAgendaDoItem`,
`itensDaPastaOutrosDias`), `tela-hoje.js`, `telas.css`, `assistente/painel.js`
(mesma regra do dia 31).

**Texto apagado sozinho.** Causa: a tela é remontada do zero a cada minuto e
quando a aba volta ao foco (para puxar o que mudou em outro aparelho), e também
quando qualquer marcação muda; a remontagem descartava o que estava no campo
"Novo item". Correção em `app.js`: (1) a atualização automática espera enquanto
um campo de texto está com foco ou um diálogo está aberto; (2) qualquer
remontagem guarda e devolve o texto, o foco e a posição do cursor dos campos
das colunas do Hoje, das listas do Checklist e das observações do plano.
Teste no navegador cobre os dois caminhos.

## Data da ação, ata inteira e campo que não zerava (21/09)

**Mudar a data de uma ação.** No plano, o bloco da data (dia + mês) de cada
ação virou botão "Mudar a data": abre um diálogo com o campo de data e grava
em `painel_acoes.comeca`. O item do checklist ligado à ação acompanha
(`painel_itens.a_partir_de`), então uma ação adiada some de Hoje e volta no dia
novo; "Atrasada" some na hora. `estado.mudarDataDaAcao`, `tela-plano.js`.

**Ata inteira.** A ata já era guardada em `painel_atas.texto` desde a
importação; faltava mostrar. Botão "Ver ata" no rodapé da ata, na tela Hoje e
em Relatórios, abre o texto original como foi colado (`verAta` em
`tela-plano.js`). Atas importadas antes de guardar o texto mostram um aviso.

**Campo "Novo item" não zerava.** Efeito colateral da correção do rascunho:
a tela era remontada ao gravar e devolvia o texto recém-digitado. Agora o
campo é limpo antes de gravar (e o texto volta se der erro), no Hoje e no
Checklist. Testes cobrem os três pontos.

## "Fica carregando e nada" (23/09)

**O que acontecia.** Qualquer falha antes de o painel aparecer (sessão vencida
que não renovou, trava de sessão entre abas com limite de 5 s, internet parada,
banco fora) caía no `catch` de `montarPainel`, que só mostrava um aviso de 6 s.
Depois disso, tela em branco: nem entrada nem painel. Não é possível confirmar
pelos registros do Supabase qual das causas foi a dele hoje (o acesso aos logs
foi negado nesta sessão); a correção cobre todas.

**O que mudou (`app.js`, `index.html`, `dom.js`, `telas.css`).**

- Tela de espera "Abrindo o painel…" desde o primeiro instante. Some quando a
  entrada ou o painel aparece; qualquer erro vira mensagem nela, com o botão
  "Tentar de novo" (limpa o cache do service worker, desregistra e recarrega).
  Se em 12 s nada apareceu, a mesma tela avisa que está demorando.
- Limite de tempo: 8 s para conferir a sessão, 25 s para carregar os dados.
  Estourou, vira mensagem, não espera infinita.
- A montagem do painel saiu de dentro do aviso `onAuthStateChange` (adiada com
  `setTimeout`), como a documentação do supabase-js pede, para nunca disputar a
  trava interna da biblioteca ao renovar token.

**Testes novos.** Sessão vencida guardada no navegador renova e abre o painel;
banco fora do ar na abertura mostra o problema e "Tentar de novo" reabre.

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
