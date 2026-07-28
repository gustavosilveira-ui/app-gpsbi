-- Rode isso também no SQL Editor do Supabase (é um complemento do setup_ux_tables.sql)

-- 1) Registrar quem aprovou/recusou cada pedido de desconto
alter table gpsbi_aprovacoes_desconto add column if not exists aprovado_por text;
alter table gpsbi_aprovacoes_desconto add column if not exists aprovado_por_email text;

-- 2) Confirmação de leitura no Mural ("lido, de acordo")
create table if not exists gpsbi_comunicado_leituras (
  id bigint generated always as identity primary key,
  comunicado_id bigint not null references gpsbi_comunicados(id) on delete cascade,
  usuario_email text not null,
  usuario_nome text,
  lido_em timestamptz not null default now(),
  unique(comunicado_id, usuario_email)
);
alter table gpsbi_comunicado_leituras enable row level security;
create policy "allow all gpsbi_comunicado_leituras" on gpsbi_comunicado_leituras for all using (true) with check (true);
