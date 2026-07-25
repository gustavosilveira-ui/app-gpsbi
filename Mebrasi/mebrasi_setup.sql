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

-- ============================================================
-- 4) COMERCIAL_MENSAGENS — "Observações, Avisos e Solicitações" do BI
--    Comercial (painel.html). É a mesma ideia que já existe no Fluxo de
--    Caixa (tabela fluxo_mensagens), só que separada por área — decisão
--    de 24/07/2026 de não misturar assunto de um setor com o de outro.
--    Acesso: qualquer @gpsbi.com.br ou @mebrasi.com.br (mesmo grupo que
--    já acessa o BI Comercial hoje).
-- ============================================================
create table if not exists comercial_mensagens (
  id bigint generated always as identity primary key,
  autor_email text not null,
  autor_nome text,
  tipo text not null check (tipo in ('observacao','aviso','solicitacao')),
  mensagem text not null,
  status text not null default 'aberto' check (status in ('aberto','resolvido','aprovado','recusado')),
  resposta text,
  respondido_por text,
  respondido_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table comercial_mensagens enable row level security;

drop policy if exists "comercial_mensagens_select" on comercial_mensagens;
drop policy if exists "comercial_mensagens_insert" on comercial_mensagens;
drop policy if exists "comercial_mensagens_update" on comercial_mensagens;

create policy "comercial_mensagens_select" on comercial_mensagens for select
  using (auth.role() = 'authenticated' and can_access_fluxo());
create policy "comercial_mensagens_insert" on comercial_mensagens for insert
  with check (auth.role() = 'authenticated' and can_access_fluxo());
create policy "comercial_mensagens_update" on comercial_mensagens for update
  using (auth.role() = 'authenticated' and can_access_fluxo());

-- ------------------------------------------------------------
-- Observação: a tabela fluxo_mensagens (usada no Fluxo de Caixa) segue
-- o mesmo formato acima, mas não estava documentada neste arquivo — só
-- criando aqui (com "if not exists") pra registro; não altera a tabela
-- se ela já existir em produção.
-- ------------------------------------------------------------
create table if not exists fluxo_mensagens (
  id bigint generated always as identity primary key,
  autor_email text not null,
  autor_nome text,
  tipo text not null check (tipo in ('observacao','aviso','solicitacao')),
  mensagem text not null,
  status text not null default 'aberto' check (status in ('aberto','resolvido','aprovado','recusado')),
  resposta text,
  respondido_por text,
  respondido_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table fluxo_mensagens enable row level security;

drop policy if exists "fluxo_mensagens_select" on fluxo_mensagens;
drop policy if exists "fluxo_mensagens_insert" on fluxo_mensagens;
drop policy if exists "fluxo_mensagens_update" on fluxo_mensagens;

create policy "fluxo_mensagens_select" on fluxo_mensagens for select
  using (auth.role() = 'authenticated' and can_access_fluxo());
create policy "fluxo_mensagens_insert" on fluxo_mensagens for insert
  with check (auth.role() = 'authenticated' and can_access_fluxo());
create policy "fluxo_mensagens_update" on fluxo_mensagens for update
  using (auth.role() = 'authenticated' and can_access_fluxo());

-- ============================================================
-- 5) LEITURA E REAÇÕES — só faz sentido pra Observação e Aviso (Solicitação
--    já tem seu próprio fluxo de aprovar/recusar/resolver). Decisão de
--    24/07/2026: mostrar quem leu + reação com 👍/❤️/👏, igual ao Mural.
--    Uma tabela de leitura e uma de reação por área (Fluxo de Caixa e
--    BI Comercial), pra não misturar.
-- ============================================================
create table if not exists fluxo_mensagens_leituras (
  id bigint generated always as identity primary key,
  mensagem_id bigint not null references fluxo_mensagens(id) on delete cascade,
  usuario_email text not null,
  usuario_nome text,
  lido_em timestamptz not null default now(),
  unique (mensagem_id, usuario_email)
);
alter table fluxo_mensagens_leituras enable row level security;
drop policy if exists "fluxo_mensagens_leituras_select" on fluxo_mensagens_leituras;
drop policy if exists "fluxo_mensagens_leituras_insert" on fluxo_mensagens_leituras;
create policy "fluxo_mensagens_leituras_select" on fluxo_mensagens_leituras for select
  using (auth.role() = 'authenticated' and can_access_fluxo());
create policy "fluxo_mensagens_leituras_insert" on fluxo_mensagens_leituras for insert
  with check (auth.role() = 'authenticated' and can_access_fluxo());

create table if not exists fluxo_mensagens_reacoes (
  id bigint generated always as identity primary key,
  mensagem_id bigint not null references fluxo_mensagens(id) on delete cascade,
  usuario_email text not null,
  tipo text not null check (tipo in ('like','coracao','palmas')),
  criado_em timestamptz not null default now(),
  unique (mensagem_id, usuario_email, tipo)
);
alter table fluxo_mensagens_reacoes enable row level security;
drop policy if exists "fluxo_mensagens_reacoes_select" on fluxo_mensagens_reacoes;
drop policy if exists "fluxo_mensagens_reacoes_insert" on fluxo_mensagens_reacoes;
drop policy if exists "fluxo_mensagens_reacoes_delete" on fluxo_mensagens_reacoes;
create policy "fluxo_mensagens_reacoes_select" on fluxo_mensagens_reacoes for select
  using (auth.role() = 'authenticated' and can_access_fluxo());
create policy "fluxo_mensagens_reacoes_insert" on fluxo_mensagens_reacoes for insert
  with check (auth.role() = 'authenticated' and can_access_fluxo());
create policy "fluxo_mensagens_reacoes_delete" on fluxo_mensagens_reacoes for delete
  using (auth.role() = 'authenticated' and can_access_fluxo());

create table if not exists comercial_mensagens_leituras (
  id bigint generated always as identity primary key,
  mensagem_id bigint not null references comercial_mensagens(id) on delete cascade,
  usuario_email text not null,
  usuario_nome text,
  lido_em timestamptz not null default now(),
  unique (mensagem_id, usuario_email)
);
alter table comercial_mensagens_leituras enable row level security;
drop policy if exists "comercial_mensagens_leituras_select" on comercial_mensagens_leituras;
drop policy if exists "comercial_mensagens_leituras_insert" on comercial_mensagens_leituras;
create policy "comercial_mensagens_leituras_select" on comercial_mensagens_leituras for select
  using (auth.role() = 'authenticated' and can_access_fluxo());
create policy "comercial_mensagens_leituras_insert" on comercial_mensagens_leituras for insert
  with check (auth.role() = 'authenticated' and can_access_fluxo());

create table if not exists comercial_mensagens_reacoes (
  id bigint generated always as identity primary key,
  mensagem_id bigint not null references comercial_mensagens(id) on delete cascade,
  usuario_email text not null,
  tipo text not null check (tipo in ('like','coracao','palmas')),
  criado_em timestamptz not null default now(),
  unique (mensagem_id, usuario_email, tipo)
);
alter table comercial_mensagens_reacoes enable row level security;
drop policy if exists "comercial_mensagens_reacoes_select" on comercial_mensagens_reacoes;
drop policy if exists "comercial_mensagens_reacoes_insert" on comercial_mensagens_reacoes;
drop policy if exists "comercial_mensagens_reacoes_delete" on comercial_mensagens_reacoes;
create policy "comercial_mensagens_reacoes_select" on comercial_mensagens_reacoes for select
  using (auth.role() = 'authenticated' and can_access_fluxo());
create policy "comercial_mensagens_reacoes_insert" on comercial_mensagens_reacoes for insert
  with check (auth.role() = 'authenticated' and can_access_fluxo());
create policy "comercial_mensagens_reacoes_delete" on comercial_mensagens_reacoes for delete
  using (auth.role() = 'authenticated' and can_access_fluxo());

-- ============================================================
-- 6) MURAL — reações com 👍/❤️/👏 (antes só tinha curtir). A tabela
--    comunicado_reacoes já existe em produção; só adiciona a coluna
--    "tipo" (com default 'like', preenchendo automaticamente as curtidas
--    antigas) — decisão de 24/07/2026.
-- ============================================================
alter table comunicado_reacoes add column if not exists tipo text not null default 'like';
