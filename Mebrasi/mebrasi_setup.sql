-- ================================================================
-- Hub GPSBI · Mebrasi — Setup inicial do Supabase (projeto separado)
-- Rode isso no SQL Editor do NOVO projeto Supabase do Mebrasi
-- (https://hobpwhhpvwlwhmhairnp.supabase.co)
-- ================================================================

-- ============================================================
-- 1) Funções de acesso
--    can_access_fluxo() -> qualquer @gpsbi.com.br ou @mebrasi.com.br
--    is_gpsbi_staff()   -> só @gpsbi.com.br (controla Saldo Inicial e
--                          Lançamentos Manuais, que o cliente não pode ver/editar)
-- ============================================================
create or replace function can_access_fluxo() returns boolean
language sql stable
as $$
  select coalesce(
    (auth.jwt() ->> 'email') ilike '%@gpsbi.com.br'
    or (auth.jwt() ->> 'email') ilike '%@mebrasi.com.br',
    false
  );
$$;

create or replace function is_gpsbi_staff() returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() ->> 'email') ilike '%@gpsbi.com.br', false);
$$;

-- ============================================================
-- 2) SALDO INICIAL — agora por empresa (Gymis/Ryngavi/Especial/Multicopos),
--    já que cada uma tem conta/saldo próprio. Leitura liberada pra quem
--    acessa o Fluxo (GPS + Mebrasi); escrita só GPS.
-- ============================================================
create table if not exists fluxo_saldo_inicial (
  id bigint generated always as identity primary key,
  empresa text not null check (empresa in ('gymis','ryngavi','especial','multicopos')),
  data_referencia date not null,
  valor numeric not null,
  criado_por text,
  criado_em timestamptz not null default now()
);
alter table fluxo_saldo_inicial enable row level security;

drop policy if exists "saldo_inicial_select" on fluxo_saldo_inicial;
drop policy if exists "saldo_inicial_insert" on fluxo_saldo_inicial;
drop policy if exists "saldo_inicial_delete" on fluxo_saldo_inicial;

create policy "saldo_inicial_select" on fluxo_saldo_inicial for select
  using (auth.role() = 'authenticated' and can_access_fluxo());
create policy "saldo_inicial_insert" on fluxo_saldo_inicial for insert
  with check (auth.role() = 'authenticated' and is_gpsbi_staff());
create policy "saldo_inicial_delete" on fluxo_saldo_inicial for delete
  using (auth.role() = 'authenticated' and is_gpsbi_staff());

-- ============================================================
-- 3) LANÇAMENTOS MANUAIS — também por empresa. Mesma regra de acesso.
-- ============================================================
create table if not exists fluxo_ajustes_manuais (
  id bigint generated always as identity primary key,
  empresa text not null check (empresa in ('gymis','ryngavi','especial','multicopos')),
  data date not null,
  descricao text not null,
  valor numeric not null,
  criado_por text,
  criado_em timestamptz not null default now()
);
alter table fluxo_ajustes_manuais enable row level security;

drop policy if exists "ajustes_manuais_select" on fluxo_ajustes_manuais;
drop policy if exists "ajustes_manuais_insert" on fluxo_ajustes_manuais;
drop policy if exists "ajustes_manuais_delete" on fluxo_ajustes_manuais;

create policy "ajustes_manuais_select" on fluxo_ajustes_manuais for select
  using (auth.role() = 'authenticated' and can_access_fluxo());
create policy "ajustes_manuais_insert" on fluxo_ajustes_manuais for insert
  with check (auth.role() = 'authenticated' and is_gpsbi_staff());
create policy "ajustes_manuais_delete" on fluxo_ajustes_manuais for delete
  using (auth.role() = 'authenticated' and is_gpsbi_staff());
