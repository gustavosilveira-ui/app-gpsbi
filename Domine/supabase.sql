-- DOMINE HUB GPSBI — estrutura inicial
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text,
  role text not null default 'user',
  theme text default 'light',
  created_at timestamptz default now()
);
create table if not exists public.tarefas_pessoais (
  id bigint generated always as identity primary key,
  usuario_email text not null,
  titulo text not null,
  descricao text,
  data date not null,
  concluida boolean default false,
  created_at timestamptz default now()
);
create table if not exists public.comunicados (
  id bigint generated always as identity primary key,
  titulo text not null,
  conteudo text not null,
  autor_email text not null,
  fixado boolean default false,
  created_at timestamptz default now()
);
create table if not exists public.aprovacoes_operacionais (
  id bigint generated always as identity primary key,
  solicitante_email text not null,
  aprovador_email text not null,
  tipo text not null,
  referencia text,
  justificativa text,
  status text not null default 'pendente',
  resposta text,
  respondido_em timestamptz,
  created_at timestamptz default now()
);
create or replace function public.current_email() returns text language sql stable as $$select lower(coalesce(auth.jwt()->>'email',''));$$;
alter table public.tarefas_pessoais enable row level security;
alter table public.comunicados enable row level security;
alter table public.aprovacoes_operacionais enable row level security;
create policy "agenda própria" on public.tarefas_pessoais for all using (lower(usuario_email)=public.current_email()) with check (lower(usuario_email)=public.current_email());
create policy "mural leitura" on public.comunicados for select using (auth.role()='authenticated');
create policy "aprovações participantes" on public.aprovacoes_operacionais for select using (lower(solicitante_email)=public.current_email() or lower(aprovador_email)=public.current_email());
create policy "aprovação criar própria" on public.aprovacoes_operacionais for insert with check (lower(solicitante_email)=public.current_email());
