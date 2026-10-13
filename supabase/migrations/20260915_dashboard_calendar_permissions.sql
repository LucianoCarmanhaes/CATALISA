-- Dashboard, calendário, projetos configuráveis e colaboração nas ações.
-- Execute somente depois de aprovar a prévia local.

begin;

create or replace function public.is_site_owner()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.profiles
    where id=auth.uid() and active=true and lower(email)='luciano@botuvera.com'
  )
$$;

create or replace function public.can_edit_action(target uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.actions a
    where a.id=target and (
      public.current_profile_role()='admin'
      or (public.current_profile_role()='manager' and (a.created_by=auth.uid() or a.manager_id=auth.uid()))
      or a.collaborator_id=auth.uid()
    )
  )
$$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  pillar text not null check (pillar in ('Evolução','Desenvolvimento','Finanças')),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '',
  icon text not null default '+',
  observation text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pillar,name)
);

alter table public.projects enable row level security;

drop policy if exists "Projetos visíveis para usuários" on public.projects;
create policy "Projetos visíveis para usuários" on public.projects
for select to authenticated using (true);

drop policy if exists "Proprietário cria projetos" on public.projects;
create policy "Proprietário cria projetos" on public.projects
for insert to authenticated with check (public.current_profile_role()='admin' and created_by=auth.uid());

drop policy if exists "Proprietário atualiza projetos" on public.projects;
create policy "Proprietário atualiza projetos" on public.projects
for update to authenticated using (public.current_profile_role()='admin') with check (public.current_profile_role()='admin');

drop policy if exists "Proprietário exclui projetos" on public.projects;
create policy "Proprietário exclui projetos" on public.projects
for delete to authenticated using (
  public.current_profile_role()='admin'
  and created_by=auth.uid()
);

create or replace function public.delete_owned_project(target uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  project_pillar text;
  project_name text;
begin
  select p.pillar,p.name into project_pillar,project_name
  from public.projects p
  where p.id=target
    and p.created_by=auth.uid()
    and public.current_profile_role()='admin';

  if project_name is null then
    raise exception 'Somente o administrador que criou o projeto pode excluí-lo.';
  end if;

  delete from public.actions a
  where a.pillar=project_pillar and a.project=project_name;

  delete from public.projects p where p.id=target;
end;
$$;

drop policy if exists "Perfis visíveis conforme vínculo" on public.profiles;
drop policy if exists "Usuários autenticados visualizam a base" on public.profiles;
create policy "Usuários autenticados visualizam a base" on public.profiles
for select to authenticated using (true);

drop policy if exists "Administradores gerenciam perfis" on public.profiles;
drop policy if exists "Proprietário gerencia perfis" on public.profiles;
create policy "Proprietário gerencia perfis" on public.profiles
for update to authenticated
using (public.is_site_owner()) with check (public.is_site_owner());

drop policy if exists "Gestores atualizam ações" on public.actions;
drop policy if exists "Participantes atualizam ações" on public.actions;
create policy "Participantes atualizam ações" on public.actions
for update to authenticated
using (public.can_edit_action(id)) with check (public.can_edit_action(id));

drop policy if exists "Gestores criam etapas" on public.action_steps;
drop policy if exists "Participantes criam etapas" on public.action_steps;
create policy "Participantes criam etapas" on public.action_steps
for insert to authenticated with check (public.can_edit_action(action_id));

drop policy if exists "Gestores atualizam etapas" on public.action_steps;
drop policy if exists "Participantes atualizam etapas" on public.action_steps;
create policy "Participantes atualizam etapas" on public.action_steps
for update to authenticated
using (public.can_edit_action(action_id)) with check (public.can_edit_action(action_id));

drop policy if exists "Gestores excluem etapas" on public.action_steps;
drop policy if exists "Participantes excluem etapas" on public.action_steps;
create policy "Participantes excluem etapas" on public.action_steps
for delete to authenticated using (public.can_edit_action(action_id));

drop policy if exists "Gestores registram atualizações" on public.action_updates;
drop policy if exists "Participantes registram atualizações" on public.action_updates;
create policy "Participantes registram atualizações" on public.action_updates
for insert to authenticated
with check (created_by=auth.uid() and public.can_edit_action(action_id));

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
before update on public.projects
for each row execute function public.touch_updated_at();

revoke all on public.projects from anon;
grant select,insert,update,delete on public.projects to authenticated;
revoke all on function public.delete_owned_project(uuid) from public;
grant execute on function public.delete_owned_project(uuid) to authenticated;

commit;
