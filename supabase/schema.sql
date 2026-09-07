-- Execute este arquivo no SQL Editor do Supabase uma única vez.
create extension if not exists pgcrypto;

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  pillar text not null check (pillar in ('Evolução','Desenvolvimento','Finanças','Todos')),
  owner text not null check (char_length(owner) between 1 and 150),
  due date not null,
  observation text not null default '',
  status text not null default 'Não iniciada' check (status in ('Não iniciada','Em andamento','Atenção','Concluída')),
  progress integer not null default 0 check (progress between 0 and 100),
  impact numeric(14,2) not null default 0 check (impact >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period ~ '^\\d{4}-\\d{2}$'),
  cost_center text not null check (char_length(cost_center) between 1 and 200),
  budget numeric(14,2) not null default 0 check (budget >= 0),
  actual numeric(14,2) not null default 0 check (actual >= 0),
  headcount integer not null default 0 check (headcount >= 0),
  observation text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.actions enable row level security;
alter table public.finance_entries enable row level security;

drop policy if exists "Usuários autenticados gerenciam ações" on public.actions;
create policy "Usuários autenticados gerenciam ações" on public.actions
  for all to authenticated using (true) with check (auth.uid() = created_by);

drop policy if exists "Usuários autenticados gerenciam finanças" on public.finance_entries;
create policy "Usuários autenticados gerenciam finanças" on public.finance_entries
  for all to authenticated using (true) with check (auth.uid() = created_by);

create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists actions_touch_updated_at on public.actions;
create trigger actions_touch_updated_at before update on public.actions
for each row execute function public.touch_updated_at();

revoke all on public.actions from anon;
revoke all on public.finance_entries from anon;
grant select, insert, update, delete on public.actions to authenticated;
grant select, insert, update, delete on public.finance_entries to authenticated;
