-- Күнім: push-напоминания (выполняется после supabase.sql)
create table if not exists kunim_subs (
  endpoint text primary key,
  sync_id text not null,
  sub jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists kunim_sent (
  key text primary key,
  at timestamptz not null default now()
);
alter table kunim_subs enable row level security;
alter table kunim_sent enable row level security;
revoke all on table kunim_subs, kunim_sent from anon, authenticated;

create or replace function kunim_sub(k text, s jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(k) < 16 or s->>'endpoint' is null then raise exception 'bad request'; end if;
  insert into kunim_subs (endpoint, sync_id, sub)
  values (s->>'endpoint', encode(sha256(convert_to(k, 'UTF8')), 'hex'), s)
  on conflict (endpoint) do update set sync_id = excluded.sync_id, sub = excluded.sub;
end $$;

create or replace function kunim_unsub(e text) returns void
language sql security definer set search_path = public as $$
  delete from kunim_subs where endpoint = e;
$$;

-- Returns reminders due in the last 10 minutes that were not sent yet, and marks them sent.
create or replace function kunim_due()
returns table (endpoint text, sub jsonb, title text, body text, tag text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare nowms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  delete from kunim_sent where kunim_sent.at < now() - interval '3 days';
  return query
  with r as (
    select s.id as sid, e->>'id' as rid, e->>'t' as rt, e->>'b' as rb, (e->>'at')::bigint as rat
    from kunim_sync s, jsonb_array_elements(coalesce(s.data->'rem', '[]'::jsonb)) e
    where (e->>'at') ~ '^[0-9]+$'
      and (e->>'at')::bigint between nowms - 10 * 60000 and nowms
  ), ins as (
    insert into kunim_sent (key)
    select r.sid || '|' || r.rid || '|' || r.rat from r
    on conflict do nothing
    returning kunim_sent.key
  )
  select su.endpoint, su.sub, r.rt, r.rb, r.rid
  from r
  join ins on ins.key = r.sid || '|' || r.rid || '|' || r.rat
  join kunim_subs su on su.sync_id = r.sid;
end $$;

revoke all on function kunim_sub(text, jsonb) from public;
revoke all on function kunim_unsub(text) from public;
revoke all on function kunim_due() from public, anon, authenticated;
grant execute on function kunim_sub(text, jsonb) to anon, authenticated;
grant execute on function kunim_unsub(text) to anon, authenticated;
grant execute on function kunim_due() to service_role;
