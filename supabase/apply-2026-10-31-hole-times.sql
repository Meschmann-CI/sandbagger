-- Pace of play (2026-10-31): the live card stamps each hole with the moment
-- its first score lands, so a round knows how long it took and which hole
-- ate the afternoon. Paste into the Supabase SQL editor for project
-- ebukktjspbgzwnaxobfg before pushing the apps that write it (schema.sql
-- carries the same). Safe to rerun.
--
-- rounds.hole_times: a JSON list of 18 ISO instants or nulls. Written through
-- merge_hole_times so two phones scoring one round keep each other's
-- stamps: the earlier stamp for a hole wins, a null never overwrites one.
alter table rounds add column if not exists hole_times jsonb;

create or replace function merge_hole_times(p_round uuid, p_times jsonb)
returns void
language plpgsql
security invoker
as $$
declare
  cur jsonb;
  merged jsonb := '[]'::jsonb;
  i int;
begin
  select coalesce(hole_times, '[]'::jsonb) into cur from rounds where id = p_round;
  if cur is null then
    return;
  end if;
  for i in 0..17 loop
    merged := merged || jsonb_build_array(
      coalesce(nullif(cur -> i, 'null'::jsonb), nullif(p_times -> i, 'null'::jsonb))
    );
  end loop;
  update rounds set hole_times = merged where id = p_round;
end;
$$;

revoke execute on function merge_hole_times(uuid, jsonb) from public, anon;
grant execute on function merge_hole_times(uuid, jsonb) to authenticated, service_role;
