-- ================================================================
-- CORREÇÃO URGENTE: a função is_owner() estava liberando admin
-- pra QUALQUER e-mail @gpsbi.com.br (inclusive funcionários da
-- GPS que não deveriam ter esse poder no Hub do Tangram).
-- Agora só libera pra e-mails específicos.
-- Rode isso no SQL Editor do Supabase.
-- ================================================================

create or replace function is_owner() returns boolean
language sql stable
as $$
  select (auth.jwt() ->> 'email') in (
    'anderson@tangrampersonalizados.com.br',
    'gustavosilveira@gpsbi.com.br'
  );
$$;

-- Coluna nova: e-mail do gestor que o vendedor escolheu pra aprovar aquele pedido
alter table aprovacoes_desconto add column if not exists gestor_email text;
