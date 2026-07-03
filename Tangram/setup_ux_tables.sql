-- Rode no SQL Editor do Supabase (mesmo projeto do Hub Tangram)
-- Cria as tabelas usadas pelas novas páginas: Agenda Pessoal, Mural de Comunicados e Aprovação de Desconto

-- 1) Agenda pessoal do vendedor (tarefas do dia a dia, diferente da agenda de contato por cliente)
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
create policy "allow all tarefas_pessoais" on tarefas_pessoais for all using (true) with check (true);
create index if not exists idx_tarefas_pessoais_usuario on tarefas_pessoais(usuario_email);

-- 2) Mural de comunicados (dono posta, todo mundo vê e pode curtir)
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
create policy "allow all comunicados" on comunicados for all using (true) with check (true);

create table if not exists comunicado_reacoes (
  id bigint generated always as identity primary key,
  comunicado_id bigint not null references comunicados(id) on delete cascade,
  usuario_email text not null,
  criado_em timestamptz not null default now(),
  unique(comunicado_id, usuario_email)
);
alter table comunicado_reacoes enable row level security;
create policy "allow all comunicado_reacoes" on comunicado_reacoes for all using (true) with check (true);

-- 3) Aprovação de desconto (vendedor pede, dono aprova/recusa, tudo registrado)
create table if not exists aprovacoes_desconto (
  id bigint generated always as identity primary key,
  vendedor_email text not null,
  vendedor_nome text,
  cliente text not null,
  valor_pedido numeric,
  percentual_desconto numeric not null,
  justificativa text,
  status text not null default 'pendente', -- pendente | aprovado | recusado
  resposta_dono text,
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);
alter table aprovacoes_desconto enable row level security;
create policy "allow all aprovacoes_desconto" on aprovacoes_desconto for all using (true) with check (true);
create index if not exists idx_aprovacoes_vendedor on aprovacoes_desconto(vendedor_email);
