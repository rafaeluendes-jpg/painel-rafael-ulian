-- Checklists de lançamento: listas que o dono monta uma vez, marca conforme faz
-- e zera para usar de novo. Não zeram sozinhas e não gravam hora.

create table public.painel_listas (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null references public.painel_perfis (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  ordem int not null default 0,
  vezes_zerada int not null default 0,
  zerada_em timestamptz,
  criado_em timestamptz not null default now()
);

create table public.painel_lista_itens (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.painel_listas (id) on delete cascade,
  dono_id uuid not null references public.painel_perfis (id) on delete cascade,
  texto text not null check (length(trim(texto)) between 1 and 200),
  feito boolean not null default false,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create index painel_lista_itens_lista_idx on public.painel_lista_itens (lista_id);

alter table public.painel_listas enable row level security;
alter table public.painel_lista_itens enable row level security;

create policy painel_listas_tudo on public.painel_listas for all to authenticated
  using (dono_id = auth.uid()) with check (dono_id = auth.uid());
create policy painel_lista_itens_tudo on public.painel_lista_itens for all to authenticated
  using (dono_id = auth.uid()) with check (dono_id = auth.uid());

revoke all on public.painel_listas, public.painel_lista_itens from anon;
