# Painel Rafael Ulian

Painel pessoal do Rafael: o checklist do dia, o plano de ação das reuniões e os atalhos
para todos os sistemas (Jolô, Rafaello's, Outros, Pessoal). Uma página HTML/CSS/JS, sem
framework, servida por Cloudflare Worker; banco e login no Supabase; instalável no celular.

## Como está montado

| Parte               | Onde                                             |
| ------------------- | ------------------------------------------------ |
| Página e telas      | `public/` (`index.html`, `css/`, `js/`)          |
| Worker (só entrega) | `src/worker.js`, `wrangler.jsonc`                |
| Banco (Supabase)    | `supabase/migrations/`, `supabase/seed.sql`      |
| Assistente WhatsApp | `assistente/` (roda no servidor Hetzner)         |
| Teste no navegador  | `test/navegador.mjs`                             |
| Ícones do PWA       | `public/icones/` (gerados por `test/icones.mjs`) |

O banco vive no projeto Supabase **rafaellos-gestao** (região São Paulo), em tabelas com
o prefixo `painel_`, com RLS ligada em todas. A chave pública (anon) fica em
`public/js/config.js`; a `service_role` só existe no servidor do assistente.

## Publicar

Repositório próprio `painel-rafael-ulian` ligado ao Workers Builds:

- comando de construção: vazio
- implantação: `npx wrangler deploy`

Push na `main` publica sozinho. Para publicar à mão: `npm install && npm run deploy`.

Depois do primeiro deploy, no Supabase (Authentication → URL Configuration) colocar o
endereço do Worker em **Site URL** e em **Redirect URLs** (`https://…workers.dev/**`),
senão o link do e-mail não volta para o painel.

## Primeiro acesso

1. Aplicar `supabase/migrations/0001_esquema.sql` e `supabase/seed.sql` (já aplicados
   em 17/09/2026).
2. Abrir o painel, escrever o e-mail e clicar em **Esqueci minha senha**: chega um link.
3. Pelo link, o painel abre em Configurações → Minha conta para definir a senha.

Quem não tem convite (`painel_convites`) não entra: o e-mail recebe o link, mas o painel
não cria perfil e põe a pessoa para fora.

## Dar acesso a outra pessoa (a Lu, por exemplo)

Configurações → **Criar acesso**: nome, e-mail, papel e as pastas que ela enxerga. O
painel grava o convite e manda o link por e-mail. Ela entra, define a senha e vê só o
que foi liberado. **Quem tem acesso** lista e revoga.

## Plano de ação (ata da reunião)

Na tela Hoje, **Importar ata**: uma ação por linha,

```
# Reunião de 16/09/2026
20/09/2026 | Rafael | Fechar o freezer da AABB | uma vez | detalhe… | custo: … | mede: a; b | meta: … | revisa: 24/09/2026
24/09/2026 | Daísa | Stories todo dia | todo dia
01/10/2026 | Daísa | Feed programado no Meta | seg qua sex
26/09/2026 | Rafael | Acervo e calendário editorial | mensal dia 20
```

Ritmos: `uma vez`, `todo dia`, dias da semana (`seg qua sex`), `mensal dia N`. Também
aceita o JSON da página do Plano de Ação. Cada ação vira um item do checklist na pasta,
no dia certo, com a etiqueta "plano"; ação com data vencida sem "Feito" fica **Atrasada**.
A ata de 16/09 está em `public/dados/ata-2026-09-16.txt` e já vem preenchida no diálogo
enquanto não houver plano.

## Assistente do WhatsApp

`assistente/painel.js` expõe funções (não endpoints): `listarPendentes`, `marcarFeito`,
`adicionarItem`, `resumirEficiencia`, `resumirPlano`, `resumoDiario` e `donoPeloNumero`.
`assistente/exemplo-whatsapp.js` mostra a interpretação das mensagens e o resumo das 21h.
No Hetzner: `cd assistente && npm install`, copiar `.env.example` para `.env` com a
`service_role`, e chamar `responder(numero, texto)` a partir do bot.

## Testar

```
PW_CHROMIUM_PATH=/caminho/do/chromium node test/navegador.mjs
```

Sobe um Supabase de mentira e um servidor estático, e passa por: entrar, marcar item,
eficiência mexendo, novo item, remover, importar ata, mudar status, pastas → sistemas →
voltar, criar acesso, trocar senha, alternar tema, sair — em 1440px e em 390px, sem erro
de console. Fotos em `/tmp/provas-painel`.

## Logo

`public/logo/ru.svg` é um monograma RU desenhado para o painel. Para usar o PNG oficial,
substitua o SVG (ou aponte os `<img>` para o PNG) e rode `node test/icones.mjs` para
regerar os ícones.
