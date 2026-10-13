-- Múltiplos colaboradores por ação e preparação dos alertas por e-mail.
-- Esta migração pertence à prévia e não deve ser executada antes da aprovação.

begin;

alter table public.actions
  add column if not exists all_collaborators boolean not null default false,
  add column if not exists email_alert_days integer check (email_alert_days is null or email_alert_days between 1 and 30);

create table if not exists public.action_collaborators (
  action_id uuid not null references public.actions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (action_id,user_id)
);

insert into public.action_collaborators(action_id,user_id)
select id,collaborator_id from public.actions where collaborator_id is not null
on conflict do nothing;

create or replace function public.can_view_action(target uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.actions a
    where a.id=target and (
      public.current_profile_role()='admin'
      or a.created_by=auth.uid()
      or a.manager_id=auth.uid()
      or a.all_collaborators
      or a.collaborator_id=auth.uid()
      or exists (
        select 1 from public.action_collaborators ac
        where ac.action_id=a.id and ac.user_id=auth.uid()
      )
    )
  )
$$;

create or replace function public.can_edit_action(target uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.actions a
    where a.id=target and (
      public.current_profile_role()='admin'
      or (public.current_profile_role()='manager' and (a.created_by=auth.uid() or a.manager_id=auth.uid()))
      or a.all_collaborators
      or a.collaborator_id=auth.uid()
      or exists (
        select 1 from public.action_collaborators ac
        where ac.action_id=a.id and ac.user_id=auth.uid()
      )
    )
  )
$$;

alter table public.action_collaborators enable row level security;

drop policy if exists "Ações visíveis conforme perfil" on public.actions;
create policy "Ações visíveis conforme perfil" on public.actions
for select to authenticated using (public.can_view_action(id));

drop policy if exists "Participantes da ação são visíveis" on public.action_collaborators;
create policy "Participantes da ação são visíveis" on public.action_collaborators
for select to authenticated using (public.can_view_action(action_id));

drop policy if exists "Gestores incluem participantes" on public.action_collaborators;
create policy "Gestores incluem participantes" on public.action_collaborators
for insert to authenticated with check (public.can_manage_action(action_id));

drop policy if exists "Gestores removem participantes" on public.action_collaborators;
create policy "Gestores removem participantes" on public.action_collaborators
for delete to authenticated using (public.can_manage_action(action_id));

revoke all on public.action_collaborators from anon;
grant select,insert,delete on public.action_collaborators to authenticated;

commit;
