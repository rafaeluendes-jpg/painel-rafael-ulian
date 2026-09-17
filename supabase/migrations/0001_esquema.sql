-- Painel Rafael Ulian — esquema inicial.
-- Vive dentro do projeto Supabase "rafaellos-gestao" (decisão do Rafael, 17/09/2026:
-- sem custo de projeto novo). Por isso tudo aqui tem o prefixo `painel_` e nada
-- toca nas tabelas, gatilhos ou permissões do outro sistema.
-- Toda tabela tem RLS ligada: cada pessoa lê e escreve o que é seu, mais o que
-- lhe foi liberado em `painel_permissoes`. A chave anon não enxerga nada.

-- ---------------------------------------------------------------- tabelas

create table public.painel_perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  papel text not null default 'convidada'
    check (papel in ('dono', 'administradora', 'convidada', 'leitura')),
  criado_em timestamptz not null default now()
);

create table public.painel_pastas (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null references public.painel_perfis (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 40),
  -- liga a pasta aos sistemas fixos do painel (jolo, rafaellos, outros, pessoal); nula em pasta nova
  chave text,
  ordem int not null default 0,
  cor text not null default '#D9B45A',
  -- se a pasta aparece como coluna no checklist do dia
  no_checklist boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Plano de ação: a ata da reunião vira ações com responsável, data de início e ritmo.
create table public.painel_acoes (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null references public.painel_perfis (id) on delete cascade,
  pasta_id uuid not null references public.painel_pastas (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) between 1 and 120),
  quem text not null default '',
  detalhe text not null default '',
  comeca date not null,
  ritmo text not null default 'unica' check (ritmo in ('unica', 'diaria', 'semanal', 'mensal')),
  ritmo_texto text not null default '',
  dias_semana smallint[] not null default '{}', -- 0 = domingo … 6 = sábado (ritmo semanal)
  dia_mes smallint check (dia_mes between 1 and 31), -- ritmo mensal
  custo text not null default '',
  mede text[] not null default '{}',
  meta text not null default '',
  revisa date,
  status text not null default 'aberto' check (status in ('aberto', 'andando', 'feito')),
  nota text not null default '',
  origem text not null default '',
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

create table public.painel_itens (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null references public.painel_perfis (id) on delete cascade,
  pasta_id uuid not null references public.painel_pastas (id) on delete cascade,
  texto text not null check (length(trim(texto)) between 1 and 200),
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  -- quando foi removido da lista (o histórico de marcações continua guardado)
  desativado_em timestamptz,
  -- item gerado por uma ação do plano, com agenda própria
  acao_id uuid references public.painel_acoes (id) on delete cascade,
  a_partir_de date,
  dias_semana smallint[],
  dia_mes smallint check (dia_mes between 1 and 31)
);

create table public.painel_marcacoes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.painel_itens (id) on delete cascade,
  dono_id uuid not null references public.painel_perfis (id) on delete cascade,
  data date not null,
  feito boolean not null default true,
  marcado_em timestamptz not null default now(),
  marcado_por uuid references public.painel_perfis (id) on delete set null,
  unique (item_id, data)
);

create table public.painel_permissoes (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null references public.painel_perfis (id) on delete cascade,
  convidado_id uuid not null references public.painel_perfis (id) on delete cascade,
  pasta_id uuid not null references public.painel_pastas (id) on delete cascade,
  nivel text not null default 'leitura' check (nivel in ('leitura', 'edicao')),
  criado_em timestamptz not null default now(),
  unique (convidado_id, pasta_id)
);

-- Convite pendente: quem entra pelo link do e-mail só vira perfil se estiver aqui.
create table public.painel_convites (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid references public.painel_perfis (id) on delete cascade, -- nulo só no convite do dono
  email text not null,
  nome text not null default '',
  papel text not null default 'convidada'
    check (papel in ('dono', 'administradora', 'convidada', 'leitura')),
  pastas uuid[] not null default '{}',
  criado_em timestamptz not null default now(),
  aceito_em timestamptz,
  convidado_id uuid references public.painel_perfis (id) on delete set null
);
create unique index painel_convites_email_pendente on public.painel_convites (lower(email))
  where aceito_em is null;

create table public.painel_preferencias (
  dono_id uuid primary key references public.painel_perfis (id) on delete cascade,
  whatsapp_ativo boolean not null default false,
  whatsapp_numero text not null default '',
  resumo_diario boolean not null default true,
  resumo_hora time not null default '21:00',
  atualizado_em timestamptz not null default now()
);

create index painel_itens_pasta_idx on public.painel_itens (pasta_id) where ativo;
create unique index painel_itens_acao_idx on public.painel_itens (acao_id) where acao_id is not null;
create index painel_marcacoes_dono_data_idx on public.painel_marcacoes (dono_id, data);
create index painel_permissoes_convidado_idx on public.painel_permissoes (convidado_id);
create index painel_acoes_dono_idx on public.painel_acoes (dono_id, pasta_id);

-- ---------------------------------------------------------------- funções de apoio
-- SECURITY DEFINER para as policies não entrarem em recursão entre tabelas.

create or replace function public.painel_pasta_liberada(p_pasta uuid, p_nivel text default 'leitura')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.painel_permissoes p
    where p.pasta_id = p_pasta
      and p.convidado_id = auth.uid()
      and (p_nivel = 'leitura' or p.nivel = 'edicao')
  );
$$;

create or replace function public.painel_pasta_dono(p_pasta uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select dono_id from public.painel_pastas where id = p_pasta;
$$;

create or replace function public.painel_item_pasta(p_item uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select pasta_id from public.painel_itens where id = p_item;
$$;

create or replace function public.painel_pastas_sao_minhas(p_pastas uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from unnest(p_pastas) as p (id)
    where not exists (
      select 1 from public.painel_pastas x where x.id = p.id and x.dono_id = auth.uid()
    )
  );
$$;

-- Pessoas ligadas a mim: quem me liberou algo ou a quem eu liberei algo.
create or replace function public.painel_ligado_a_mim(p_perfil uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.painel_permissoes p
    where (p.dono_id = auth.uid() and p.convidado_id = p_perfil)
       or (p.convidado_id = auth.uid() and p.dono_id = p_perfil)
  );
$$;

-- ---------------------------------------------------------------- entrada no painel
-- Chamada pelo painel logo depois do login. Se a pessoa ainda não tem perfil, só
-- ganha um se houver convite pendente para o e-mail dela; sem convite, devolve nulo
-- e o painel a põe para fora. (Não é gatilho em auth.users para não interferir no
-- outro sistema que vive neste projeto.)
create or replace function public.painel_entrar()
returns public.painel_perfis language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  meu_email text;
  c public.painel_convites%rowtype;
  perfil public.painel_perfis%rowtype;
  p uuid;
begin
  if eu is null then return null; end if;
  select * into perfil from public.painel_perfis where id = eu;
  if found then return perfil; end if;

  select email into meu_email from auth.users where id = eu;
  select * into c from public.painel_convites
   where lower(email) = lower(meu_email) and aceito_em is null
   order by criado_em desc limit 1;
  if not found then return null; end if;

  insert into public.painel_perfis (id, nome, papel)
  values (eu, coalesce(nullif(c.nome, ''), split_part(meu_email, '@', 1)), c.papel)
  returning * into perfil;

  if c.papel = 'dono' then
    insert into public.painel_pastas (dono_id, nome, chave, ordem, cor, no_checklist) values
      (eu, 'Jolô', 'jolo', 1, '#D9B45A', true),
      (eu, 'Rafaello''s', 'rafaellos', 2, '#C9A227', true),
      (eu, 'Outros', 'outros', 3, '#9C958A', false),
      (eu, 'Pessoal', 'pessoal', 4, '#F0DCA0', true);
    insert into public.painel_preferencias (dono_id) values (eu);
  else
    foreach p in array c.pastas loop
      insert into public.painel_permissoes (dono_id, convidado_id, pasta_id, nivel)
      values (c.dono_id, eu, p, case when c.papel = 'leitura' then 'leitura' else 'edicao' end)
      on conflict do nothing;
    end loop;
  end if;

  update public.painel_convites set aceito_em = now(), convidado_id = eu where id = c.id;
  return perfil;
end;
$$;

-- ---------------------------------------------------------------- RLS

alter table public.painel_perfis enable row level security;
alter table public.painel_pastas enable row level security;
alter table public.painel_acoes enable row level security;
alter table public.painel_itens enable row level security;
alter table public.painel_marcacoes enable row level security;
alter table public.painel_permissoes enable row level security;
alter table public.painel_convites enable row level security;
alter table public.painel_preferencias enable row level security;

-- perfis: o meu e o de quem está ligado a mim (para mostrar nomes). Criação só por painel_entrar().
create policy painel_perfis_ler on public.painel_perfis for select to authenticated
  using (id = auth.uid() or public.painel_ligado_a_mim(id));
create policy painel_perfis_editar on public.painel_perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- pastas: dono faz tudo; convidado lê as liberadas.
create policy painel_pastas_ler on public.painel_pastas for select to authenticated
  using (dono_id = auth.uid() or public.painel_pasta_liberada(id));
create policy painel_pastas_criar on public.painel_pastas for insert to authenticated
  with check (dono_id = auth.uid());
create policy painel_pastas_editar on public.painel_pastas for update to authenticated
  using (dono_id = auth.uid()) with check (dono_id = auth.uid());
create policy painel_pastas_apagar on public.painel_pastas for delete to authenticated
  using (dono_id = auth.uid());

-- ações do plano: seguem a pasta.
create policy painel_acoes_ler on public.painel_acoes for select to authenticated
  using (dono_id = auth.uid() or public.painel_pasta_liberada(pasta_id));
create policy painel_acoes_criar on public.painel_acoes for insert to authenticated
  with check (
    dono_id = public.painel_pasta_dono(pasta_id)
    and (dono_id = auth.uid() or public.painel_pasta_liberada(pasta_id, 'edicao'))
  );
create policy painel_acoes_editar on public.painel_acoes for update to authenticated
  using (dono_id = auth.uid() or public.painel_pasta_liberada(pasta_id, 'edicao'))
  with check (dono_id = public.painel_pasta_dono(pasta_id));
create policy painel_acoes_apagar on public.painel_acoes for delete to authenticated
  using (dono_id = auth.uid());

-- itens: dono faz tudo nas suas pastas; convidado com edição escreve na pasta liberada.
create policy painel_itens_ler on public.painel_itens for select to authenticated
  using (dono_id = auth.uid() or public.painel_pasta_liberada(pasta_id));
create policy painel_itens_criar on public.painel_itens for insert to authenticated
  with check (
    dono_id = public.painel_pasta_dono(pasta_id)
    and (dono_id = auth.uid() or public.painel_pasta_liberada(pasta_id, 'edicao'))
  );
create policy painel_itens_editar on public.painel_itens for update to authenticated
  using (dono_id = auth.uid() or public.painel_pasta_liberada(pasta_id, 'edicao'))
  with check (dono_id = public.painel_pasta_dono(pasta_id));
create policy painel_itens_apagar on public.painel_itens for delete to authenticated
  using (dono_id = auth.uid());

-- marcações: seguem o item.
create policy painel_marcacoes_ler on public.painel_marcacoes for select to authenticated
  using (dono_id = auth.uid() or public.painel_pasta_liberada(public.painel_item_pasta(item_id)));
create policy painel_marcacoes_criar on public.painel_marcacoes for insert to authenticated
  with check (
    dono_id = public.painel_pasta_dono(public.painel_item_pasta(item_id))
    and (
      dono_id = auth.uid()
      or public.painel_pasta_liberada(public.painel_item_pasta(item_id), 'edicao')
    )
  );
create policy painel_marcacoes_editar on public.painel_marcacoes for update to authenticated
  using (
    dono_id = auth.uid()
    or public.painel_pasta_liberada(public.painel_item_pasta(item_id), 'edicao')
  )
  with check (dono_id = public.painel_pasta_dono(public.painel_item_pasta(item_id)));
create policy painel_marcacoes_apagar on public.painel_marcacoes for delete to authenticated
  using (
    dono_id = auth.uid()
    or public.painel_pasta_liberada(public.painel_item_pasta(item_id), 'edicao')
  );

-- permissões: o dono concede e revoga; o convidado vê as suas.
create policy painel_permissoes_ler on public.painel_permissoes for select to authenticated
  using (dono_id = auth.uid() or convidado_id = auth.uid());
create policy painel_permissoes_criar on public.painel_permissoes for insert to authenticated
  with check (dono_id = auth.uid() and public.painel_pasta_dono(pasta_id) = auth.uid());
create policy painel_permissoes_editar on public.painel_permissoes for update to authenticated
  using (dono_id = auth.uid()) with check (dono_id = auth.uid());
create policy painel_permissoes_apagar on public.painel_permissoes for delete to authenticated
  using (dono_id = auth.uid());

-- convites: só do dono, e só para pastas dele.
create policy painel_convites_ler on public.painel_convites for select to authenticated
  using (dono_id = auth.uid());
create policy painel_convites_criar on public.painel_convites for insert to authenticated
  with check (
    dono_id = auth.uid() and papel <> 'dono' and public.painel_pastas_sao_minhas(pastas)
  );
create policy painel_convites_apagar on public.painel_convites for delete to authenticated
  using (dono_id = auth.uid());

-- preferências: só as minhas.
create policy painel_preferencias_tudo on public.painel_preferencias for all to authenticated
  using (dono_id = auth.uid()) with check (dono_id = auth.uid());

-- ---------------------------------------------------------------- acesso anônimo: nenhum
-- Só nas tabelas e funções do painel (as do outro sistema ficam como estão).
revoke all on public.painel_perfis, public.painel_pastas, public.painel_acoes,
  public.painel_itens, public.painel_marcacoes, public.painel_permissoes,
  public.painel_convites, public.painel_preferencias from anon;
revoke all on function public.painel_entrar() from anon, public;
revoke all on function public.painel_pasta_liberada(uuid, text) from anon, public;
revoke all on function public.painel_pasta_dono(uuid) from anon, public;
revoke all on function public.painel_item_pasta(uuid) from anon, public;
revoke all on function public.painel_pastas_sao_minhas(uuid[]) from anon, public;
revoke all on function public.painel_ligado_a_mim(uuid) from anon, public;
