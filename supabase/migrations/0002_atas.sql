-- Atas: cada ata importada vira um grupo de ações, que abre e fecha na tela Hoje.
-- Quando tudo está feito, a ata é arquivada e vai para Relatórios.

create table public.painel_atas (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null references public.painel_perfis (id) on delete cascade,
  pasta_id uuid not null references public.painel_pastas (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) between 1 and 80),
  origem text not null default '',
  -- a ata como foi colada, para consulta no relatório
  texto text not null default '',
  criado_em timestamptz not null default now(),
  concluida_em timestamptz
);
create index painel_atas_dono_idx on public.painel_atas (dono_id, pasta_id);

alter table public.painel_acoes
  add column ata_id uuid references public.painel_atas (id) on delete cascade;
create index painel_acoes_ata_idx on public.painel_acoes (ata_id);

-- Ações que já existiam viram uma ata por pasta e origem.
insert into public.painel_atas (dono_id, pasta_id, titulo, origem)
select distinct a.dono_id, a.pasta_id, 'Ata ' || p.nome, a.origem
  from public.painel_acoes a
  join public.painel_pastas p on p.id = a.pasta_id
 where a.ata_id is null;
update public.painel_acoes a
   set ata_id = t.id
  from public.painel_atas t
 where a.ata_id is null
   and t.dono_id = a.dono_id and t.pasta_id = a.pasta_id and t.origem = a.origem;
alter table public.painel_acoes alter column ata_id set not null;

alter table public.painel_atas enable row level security;
create policy painel_atas_ler on public.painel_atas for select to authenticated
  using (dono_id = auth.uid() or public.painel_pasta_liberada(pasta_id));
create policy painel_atas_criar on public.painel_atas for insert to authenticated
  with check (
    dono_id = public.painel_pasta_dono(pasta_id)
    and (dono_id = auth.uid() or public.painel_pasta_liberada(pasta_id, 'edicao'))
  );
create policy painel_atas_editar on public.painel_atas for update to authenticated
  using (dono_id = auth.uid() or public.painel_pasta_liberada(pasta_id, 'edicao'))
  with check (dono_id = public.painel_pasta_dono(pasta_id));
create policy painel_atas_apagar on public.painel_atas for delete to authenticated
  using (dono_id = auth.uid());
revoke all on public.painel_atas from anon;
