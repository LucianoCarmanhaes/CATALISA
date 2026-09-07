-- Adiciona horário aos prazos existentes sem apagar nenhuma ação.
alter table public.actions
  alter column due type timestamptz
  using due::timestamp at time zone 'America/Cuiaba';
