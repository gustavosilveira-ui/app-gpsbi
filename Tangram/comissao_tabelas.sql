-- Hub GPSBI · Tangram — Comissão de Vendas
-- Script idempotente: pode rodar novamente sem erro de policy existente.

create table if not exists public.tangram_comissao_percentuais (
  vendedor text primary key,
  percentual numeric not null default 0.015,
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.tangram_comissao_ajustes (
  id bigint generated always as identity primary key,
  vendedor text not null,
  mes_ano text not null,
  valor numeric not null,
  motivo text,
  criado_por text,
  criado_em timestamptz not null default now()
);

alter table public.tangram_comissao_percentuais enable row level security;
alter table public.tangram_comissao_ajustes enable row level security;

drop policy if exists "tangram_comissao_percentuais_rls"
  on public.tangram_comissao_percentuais;
drop policy if exists "tangram_comissao_ajustes_rls"
  on public.tangram_comissao_ajustes;

create policy "tangram_comissao_percentuais_rls"
on public.tangram_comissao_percentuais
for all
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email','')) like '%@gpsbi.com.br'
  or lower(coalesce(auth.jwt() ->> 'email','')) = 'anderson@tangrampersonalizados.com.br'
)
with check (
  lower(coalesce(auth.jwt() ->> 'email','')) like '%@gpsbi.com.br'
  or lower(coalesce(auth.jwt() ->> 'email','')) = 'anderson@tangrampersonalizados.com.br'
);

create policy "tangram_comissao_ajustes_rls"
on public.tangram_comissao_ajustes
for all
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email','')) like '%@gpsbi.com.br'
  or lower(coalesce(auth.jwt() ->> 'email','')) = 'anderson@tangrampersonalizados.com.br'
)
with check (
  lower(coalesce(auth.jwt() ->> 'email','')) like '%@gpsbi.com.br'
  or lower(coalesce(auth.jwt() ->> 'email','')) = 'anderson@tangrampersonalizados.com.br'
);

grant select, insert, update, delete
on public.tangram_comissao_percentuais
to authenticated;

grant select, insert, update, delete
on public.tangram_comissao_ajustes
to authenticated;
