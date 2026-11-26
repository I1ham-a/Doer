-- Күнім: синхронизация. Вставьте целиком в Supabase → SQL Editor → Run.
create table if not exists kunim_sync (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table kunim_sync enable row level security;
revoke all on table kunim_sync from anon, authenticated;

create or replace function kunim_pull(k text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if length(k) < 16 then raise exception 'code too short'; end if;
  return (select data from kunim_sync where id = encode(sha256(convert_to(k, 'UTF8')), 'hex'));
end $$;

create or replace function kunim_push(k text, d jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(k) < 16 then raise exception 'code too short'; end if;
  insert into kunim_sync (id, data, updated_at)
  values (encode(sha256(convert_to(k, 'UTF8')), 'hex'), d, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
end $$;

revoke all on function kunim_pull(text) from public;
revoke all on function kunim_push(text, jsonb) from public;
grant execute on function kunim_pull(text) to anon, authenticated;
grant execute on function kunim_push(text, jsonb) to anon, authenticated;
