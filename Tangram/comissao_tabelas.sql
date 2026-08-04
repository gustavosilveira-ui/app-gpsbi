-- ================================================================
-- Hub GPSBI · Tangram — Comissão de Vendas
-- Rode no SQL Editor do projeto Supabase da Tangram (o mesmo
-- compartilhado com a Jambuzada).
-- ================================================================

-- Percentual de comissão por vendedor — o único valor que muda,
-- confirmado com o cliente. Uma linha por vendedor, sempre a mais
-- recente (upsert).
create table if not exists tangram_comissao_percentuais (
  vendedor text primary key,
  percentual numeric not null default 0.015,
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);
alter table tangram_comissao_percentuais enable row level security;
create policy "tangram_comissao_percentuais_rls" on tangram_comissao_percentuais for all
  using (can_access_tangram()) with check (can_access_tangram());

-- Ajustes manuais por vendedor/mês (ex: "DESCONSIDERADO - NF 17371 -
-- devolução") — abate do total faturado antes de calcular a comissão.
create table if not exists tangram_comissao_ajustes (
  id bigint generated always as identity primary key,
  vendedor text not null,
  mes_ano text not null, -- formato "aaaa-mm"
  valor numeric not null,
  motivo text,
  criado_por text,
  criado_em timestamptz not null default now()
);
alter table tangram_comissao_ajustes enable row level security;
create policy "tangram_comissao_ajustes_rls" on tangram_comissao_ajustes for all
  using (can_access_tangram()) with check (can_access_tangram());
