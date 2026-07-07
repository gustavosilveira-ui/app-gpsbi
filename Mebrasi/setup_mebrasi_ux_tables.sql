-- Setup UX Hub GPSBI · Grupo Mebrasi
-- Rode no SQL Editor do Supabase do projeto Mebrasi.

create or replace function public.is_owner() returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() ->> 'email') in ('gustavosilveira@gpsbi.com.br'), false);
$$;

create or replace function public.drop_all_policies(target_table text) returns void
language plpgsql
as $$
declare pol record;
begin
  for pol in select policyname from pg_policies where tablename = target_table loop
    execute format('drop policy if exists %I on %I', pol.policyname, target_table);
  end loop;
end;
$$;

-- Agenda pessoal
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
select drop_all_policies('tarefas_pessoais');
create policy "tarefas_select_own_or_owner" on tarefas_pessoais for select using (auth.role()='authenticated' and (usuario_email = auth.jwt()->>'email' or is_owner()));
create policy "tarefas_insert_own" on tarefas_pessoais for insert with check (auth.role()='authenticated' and usuario_email = auth.jwt()->>'email');
create policy "tarefas_update_own" on tarefas_pessoais for update using (auth.role()='authenticated' and usuario_email = auth.jwt()->>'email');
create policy "tarefas_delete_own" on tarefas_pessoais for delete using (auth.role()='authenticated' and usuario_email = auth.jwt()->>'email');
create index if not exists idx_tarefas_pessoais_usuario on tarefas_pessoais(usuario_email);

-- Mural
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
select drop_all_policies('comunicados');
create policy "comunicados_select_all" on comunicados for select using (auth.role()='authenticated');
create policy "comunicados_insert_owner" on comunicados for insert with check (auth.role()='authenticated' and is_owner());
create policy "comunicados_update_owner" on comunicados for update using (auth.role()='authenticated' and is_owner());
create policy "comunicados_delete_owner" on comunicados for delete using (auth.role()='authenticated' and is_owner());

create table if not exists comunicado_reacoes (
  id bigint generated always as identity primary key,
  comunicado_id bigint not null references comunicados(id) on delete cascade,
  usuario_email text not null,
  criado_em timestamptz not null default now(),
  unique(comunicado_id, usuario_email)
);
alter table comunicado_reacoes enable row level security;
select drop_all_policies('comunicado_reacoes');
create policy "reacoes_select_all" on comunicado_reacoes for select using (auth.role()='authenticated');
create policy "reacoes_insert_own" on comunicado_reacoes for insert with check (auth.role()='authenticated' and usuario_email = auth.jwt()->>'email');
create policy "reacoes_delete_own" on comunicado_reacoes for delete using (auth.role()='authenticated' and usuario_email = auth.jwt()->>'email');

create table if not exists comunicado_leituras (
  id bigint generated always as identity primary key,
  comunicado_id bigint not null references comunicados(id) on delete cascade,
  usuario_email text not null,
  usuario_nome text,
  lido_em timestamptz not null default now(),
  unique(comunicado_id, usuario_email)
);
alter table comunicado_leituras enable row level security;
select drop_all_policies('comunicado_leituras');
create policy "leituras_select_all" on comunicado_leituras for select using (auth.role()='authenticated');
create policy "leituras_insert_own" on comunicado_leituras for insert with check (auth.role()='authenticated' and usuario_email = auth.jwt()->>'email');

-- Aprovações
create table if not exists aprovacoes_desconto (
  id bigint generated always as identity primary key,
  vendedor_email text not null,
  vendedor_nome text,
  cliente text not null,
  valor_pedido numeric,
  percentual_desconto numeric not null,
  justificativa text,
  gestor_email text,
  status text not null default 'pendente',
  resposta_dono text,
  aprovado_por text,
  aprovado_por_email text,
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);
alter table aprovacoes_desconto enable row level security;
select drop_all_policies('aprovacoes_desconto');
create policy "aprov_select_own_or_owner_or_gestor" on aprovacoes_desconto for select using (auth.role()='authenticated' and (vendedor_email = auth.jwt()->>'email' or gestor_email = auth.jwt()->>'email' or is_owner()));
create policy "aprov_insert_own" on aprovacoes_desconto for insert with check (auth.role()='authenticated' and vendedor_email = auth.jwt()->>'email');
create policy "aprov_update_owner_or_gestor" on aprovacoes_desconto for update using (auth.role()='authenticated' and (is_owner() or gestor_email = auth.jwt()->>'email'));
create policy "aprov_delete_owner_only" on aprovacoes_desconto for delete using (auth.role()='authenticated' and is_owner());
create index if not exists idx_aprovacoes_vendedor on aprovacoes_desconto(vendedor_email);
