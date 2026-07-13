-- ================================================================
-- HUB GPSBI · UUIZZ — SETUP SUPABASE
-- Baseado no Blueprint Canônico da HUB GPSBI MASTER CONSTITUTION,
-- adaptado para o cliente Uuizz (2 empresas: Empoderamento + Mister Wiz).
--
-- Gestora principal: Daniela Mazzei <daniela@empoderamentoadolescente.com.br>
-- Rode este script inteiro no SQL Editor do Supabase do projeto da Uuizz.
-- ================================================================

-- ============================================================
-- 1) FUNÇÕES DE ACESSO
-- ============================================================
create or replace function public.current_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email',''));
$$;

create or replace function public.is_gustavo()
returns boolean
language sql
stable
as $$
  select public.current_email() = 'gustavosilveira@gpsbi.com.br';
$$;

create or replace function public.is_gestor_principal()
returns boolean
language sql
stable
as $$
  select public.current_email() = 'daniela@empoderamentoadolescente.com.br';
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select public.is_gustavo() or public.is_gestor_principal();
$$;

-- Time interno GPS (qualquer @gpsbi.com.br) — usado pra travar recursos
-- que só a GPS pode mexer (Saldo Inicial, Lançamentos Manuais).
create or replace function public.is_gpsbi_staff()
returns boolean
language sql
stable
as $$
  select public.current_email() like '%@gpsbi.com.br';
$$;

-- Acesso ao Fluxo de Caixa: gestora principal (Daniela) + equipe GPSBI.
create or replace function public.can_access_fluxo()
returns boolean
language sql
stable
as $$
  select public.is_gestor_principal() or public.is_gpsbi_staff();
$$;

-- ============================================================
-- 2) AGENDA PESSOAL
-- Usuário lê/escreve a própria agenda. Gestora principal só visualiza.
-- ============================================================
create table if not exists tarefas_pessoais (
  id bigint generated always as identity primary key,
  usuario_email text not null,
  usuario_nome text,
  titulo text not null,
  data_tarefa date not null,
  feito boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table tarefas_pessoais enable row level security;

drop policy if exists tarefas_select_own_or_manager on tarefas_pessoais;
drop policy if exists tarefas_insert_own on tarefas_pessoais;
drop policy if exists tarefas_update_own on tarefas_pessoais;
drop policy if exists tarefas_delete_own on tarefas_pessoais;

create policy tarefas_select_own_or_manager
on tarefas_pessoais for select
using (
  auth.role() = 'authenticated'
  and (
    lower(usuario_email) = public.current_email()
    or public.is_gestor_principal()
  )
);

create policy tarefas_insert_own
on tarefas_pessoais for insert
with check (
  auth.role() = 'authenticated'
  and lower(usuario_email) = public.current_email()
);

create policy tarefas_update_own
on tarefas_pessoais for update
using (
  auth.role() = 'authenticated'
  and lower(usuario_email) = public.current_email()
)
with check (
  lower(usuario_email) = public.current_email()
);

create policy tarefas_delete_own
on tarefas_pessoais for delete
using (
  auth.role() = 'authenticated'
  and lower(usuario_email) = public.current_email()
);

-- ============================================================
-- 3) MURAL
-- Todos logados leem; só admins (Gustavo/Daniela) publicam e excluem.
-- ============================================================
create table if not exists comunicados (
  id bigint generated always as identity primary key,
  autor_email text not null,
  autor_nome text,
  titulo text not null,
  mensagem text not null,
  fixado boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table comunicados enable row level security;

drop policy if exists comunicados_select_all on comunicados;
drop policy if exists comunicados_insert_admin on comunicados;
drop policy if exists comunicados_delete_admin on comunicados;

create policy comunicados_select_all
on comunicados for select
using (auth.role() = 'authenticated');

create policy comunicados_insert_admin
on comunicados for insert
with check (auth.role() = 'authenticated' and public.is_owner());

create policy comunicados_delete_admin
on comunicados for delete
using (auth.role() = 'authenticated' and public.is_owner());

create table if not exists comunicado_reacoes (
  id bigint generated always as identity primary key,
  comunicado_id bigint not null references comunicados(id) on delete cascade,
  usuario_email text not null,
  criado_em timestamptz not null default now(),
  unique(comunicado_id, usuario_email)
);
alter table comunicado_reacoes enable row level security;

drop policy if exists reacoes_select_all on comunicado_reacoes;
drop policy if exists reacoes_insert_own on comunicado_reacoes;
drop policy if exists reacoes_delete_own on comunicado_reacoes;

create policy reacoes_select_all on comunicado_reacoes for select using (auth.role() = 'authenticated');
create policy reacoes_insert_own on comunicado_reacoes for insert
  with check (auth.role() = 'authenticated' and lower(usuario_email) = public.current_email());
create policy reacoes_delete_own on comunicado_reacoes for delete
  using (auth.role() = 'authenticated' and lower(usuario_email) = public.current_email());

create table if not exists comunicado_leituras (
  id bigint generated always as identity primary key,
  comunicado_id bigint not null references comunicados(id) on delete cascade,
  usuario_email text not null,
  usuario_nome text,
  lido_em timestamptz not null default now(),
  unique(comunicado_id, usuario_email)
);
alter table comunicado_leituras enable row level security;

drop policy if exists leituras_select_all on comunicado_leituras;
drop policy if exists leituras_insert_own on comunicado_leituras;

-- Gestora principal precisa ver quem leu; demais usuários só enxergam a própria leitura.
create policy leituras_select_all
on comunicado_leituras for select
using (
  auth.role() = 'authenticated'
  and (lower(usuario_email) = public.current_email() or public.is_owner())
);
create policy leituras_insert_own on comunicado_leituras for insert
  with check (auth.role() = 'authenticated' and lower(usuario_email) = public.current_email());

-- ============================================================
-- 4) FLUXO DE CAIXA — Saldo Inicial e Lançamentos Manuais, POR EMPRESA
-- Leitura liberada pra quem acessa o Fluxo (Daniela + GPSBI).
-- Escrita (criar/remover) só pro time interno GPS.
-- ============================================================
create table if not exists fluxo_saldo_inicial (
  id bigint generated always as identity primary key,
  empresa text not null check (empresa in ('Empoderamento','Mister Wiz')),
  data_referencia date not null,
  valor numeric not null,
  criado_por text,
  criado_em timestamptz not null default now()
);
alter table fluxo_saldo_inicial enable row level security;

drop policy if exists saldo_inicial_select on fluxo_saldo_inicial;
drop policy if exists saldo_inicial_insert on fluxo_saldo_inicial;
drop policy if exists saldo_inicial_delete on fluxo_saldo_inicial;

create policy saldo_inicial_select on fluxo_saldo_inicial for select
  using (auth.role() = 'authenticated' and public.can_access_fluxo());
create policy saldo_inicial_insert on fluxo_saldo_inicial for insert
  with check (auth.role() = 'authenticated' and public.is_gpsbi_staff());
create policy saldo_inicial_delete on fluxo_saldo_inicial for delete
  using (auth.role() = 'authenticated' and public.is_gpsbi_staff());

create table if not exists fluxo_ajustes_manuais (
  id bigint generated always as identity primary key,
  empresa text not null check (empresa in ('Empoderamento','Mister Wiz')),
  data date not null,
  descricao text not null,
  valor numeric not null,
  criado_por text,
  criado_em timestamptz not null default now()
);
alter table fluxo_ajustes_manuais enable row level security;

drop policy if exists ajustes_manuais_select on fluxo_ajustes_manuais;
drop policy if exists ajustes_manuais_insert on fluxo_ajustes_manuais;
drop policy if exists ajustes_manuais_delete on fluxo_ajustes_manuais;

create policy ajustes_manuais_select on fluxo_ajustes_manuais for select
  using (auth.role() = 'authenticated' and public.can_access_fluxo());
create policy ajustes_manuais_insert on fluxo_ajustes_manuais for insert
  with check (auth.role() = 'authenticated' and public.is_gpsbi_staff());
create policy ajustes_manuais_delete on fluxo_ajustes_manuais for delete
  using (auth.role() = 'authenticated' and public.is_gpsbi_staff());

-- ============================================================
-- 5) AUTH HOOK / DOMÍNIOS PERMITIDOS
-- Configurar no Supabase (Auth > Hooks, ou trigger em auth.users) para
-- restringir cadastro aos domínios abaixo. ASSUNÇÃO A CONFIRMAR:
-- só temos o domínio da Daniela hoje; se a Mister Wiz usar outro
-- domínio de e-mail, adicionar aqui antes do go-live.
--   - @empoderamentoadolescente.com.br
--   - @gpsbi.com.br
-- ============================================================
