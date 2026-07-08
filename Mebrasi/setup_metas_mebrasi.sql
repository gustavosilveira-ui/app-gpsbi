-- Rode no SQL Editor do Supabase do projeto Mebrasi
-- Tabela de metas por representante/vendedor (anual) — extraída da tabela
-- embutida no BiGrupoMebrasi.pbix ("Representantes / Metas").

create table if not exists metas_mebrasi (
  id bigint generated always as identity primary key,
  ano int not null,
  cod_vendedor int not null,
  representacao text not null,
  meta_anual numeric not null default 0,
  unique(ano, cod_vendedor)
);
alter table metas_mebrasi enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where tablename = 'metas_mebrasi' loop
    execute format('drop policy if exists %I on metas_mebrasi', pol.policyname);
  end loop;
end $$;

create policy "metas_mebrasi_select_all" on metas_mebrasi for select using (auth.role()='authenticated');
create policy "metas_mebrasi_insert_owner" on metas_mebrasi for insert with check (auth.role()='authenticated' and is_owner());
create policy "metas_mebrasi_update_owner" on metas_mebrasi for update using (auth.role()='authenticated' and is_owner());
create policy "metas_mebrasi_delete_owner" on metas_mebrasi for delete using (auth.role()='authenticated' and is_owner());

-- Semente com os valores reais de 2026 (extraídos do .pbix — pode editar depois pela tela "Definir Metas")
insert into metas_mebrasi (ano, cod_vendedor, representacao, meta_anual) values
(2026, 42,  'ARLINDO',          110000.00),
(2026, 307, 'ANA PAULA',         32000.00),
(2026, 304, 'ARNALDO',           50000.00),
(2026, 234, 'BAIAO',             30000.00),
(2026, 34,  'CARLOS (PR)',      105000.00),
(2026, 40,  'CHRISTIAN',        168000.00),
(2026, 31,  'ELAINE/FRANCISCO',  50000.00),
(2026, 36,  'EGBERTO',          420000.00),
(2026, 37,  'FELISBERTO',        94500.00),
(2026, 308, 'FLÁVIO',            32000.00),
(2026, 248, 'MARRON',            32000.00),
(2026, 47,  'MEBRASI',         1500000.00),
(2026, 35,  'MESQUITA',          52500.00),
(2026, 39,  'MENEZES',           52500.00),
(2026, 312, 'MICHELLE',          42000.00),
(2026, 32,  'NELSON',            32000.00),
(2026, 170, 'NOBRE',             52500.00),
(2026, 238, 'REGIS',             32000.00),
(2026, 214, 'RITA',              52500.00),
(2026, 144, 'SÉRGIO',            32000.00),
(2026, 30,  'SILVIO',           126000.00),
(2026, 41,  'SUELI',             90000.00)
on conflict (ano, cod_vendedor) do update set representacao=excluded.representacao, meta_anual=excluded.meta_anual;
