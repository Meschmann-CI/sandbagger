-- A golfer's own score wins, 2026-10-24. Paste into the Supabase SQL editor
-- for project ebukktjspbgzwnaxobfg (schema.sql carries the same). Safe to
-- rerun.
--
-- Matt kept his own and Barry's card while Pat kept his own; if two phones
-- enter the same golfer's hole, the golfer's own entry should win. Each
-- golfer's row remembers which holes they entered themselves, and the merge
-- won't let anyone else change those (holes, putts, or a typed total).
alter table round_players add column if not exists self_holes boolean[];

create or replace function merge_round_scores(p_round uuid, p_scores jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  me uuid := current_player_id();
  s jsonb;
  pid uuid;
  h integer[];
  p integer[];
  f boolean[];
  g integer;
  k text;
  v jsonb;
  mine boolean;
begin
  for s in select * from jsonb_array_elements(p_scores) loop
    pid := (s->>'playerId')::uuid;
    mine := pid = me;
    insert into round_players (round_id, player_id, gross, handicap_snapshot)
    values (p_round, pid, null, (s->>'handicapSnapshot')::numeric)
    on conflict (round_id, player_id) do nothing;

    select holes, putts, gross, self_holes into h, p, g, f
    from round_players where round_id = p_round and player_id = pid
    for update;
    f := coalesce(f, '{}');
    if cardinality(f) < 18 then f := f || array_fill(false, array[18 - cardinality(f)]); end if;

    if s ? 'holes' then
      h := coalesce(h, '{}');
      if cardinality(h) < 18 then h := h || array_fill(null::integer, array[18 - cardinality(h)]); end if;
      for k, v in select * from jsonb_each(s->'holes') loop
        -- Someone else's change to a hole the golfer entered themselves: kept out.
        if not mine and f[k::int + 1] then continue; end if;
        h[k::int + 1] := nullif((v #>> '{}')::int, -1);
        if mine and h[k::int + 1] is not null then f[k::int + 1] := true; end if;
      end loop;
      if not exists (select 1 from unnest(h) x where x is not null) then h := null; end if;
    end if;

    -- Putts tracking: never said (null), said no (empty), on (18 entries).
    if s ? 'puttsMode' then
      p := case s->>'puttsMode' when 'unset' then null when 'off' then '{}' else coalesce(p, '{}') end;
      if s->>'puttsMode' = 'on' and cardinality(p) < 18 then
        p := p || array_fill(null::integer, array[18 - cardinality(p)]);
      end if;
    end if;
    if s ? 'putts' then
      p := coalesce(p, '{}');
      if cardinality(p) < 18 then p := p || array_fill(null::integer, array[18 - cardinality(p)]); end if;
      for k, v in select * from jsonb_each(s->'putts') loop
        if not mine and f[k::int + 1] then continue; end if;
        p[k::int + 1] := nullif((v #>> '{}')::int, -1);
      end loop;
    end if;

    if coalesce((s->>'grossSet')::boolean, false) and (mine or not (true = any(f))) then
      g := (s->>'gross')::int;
    end if;
    if h is not null and cardinality(h) >= 18 and not exists (select 1 from unnest(h[1:18]) x where x is null) then
      g := (select sum(x) from unnest(h[1:18]) x);
    end if;

    update round_players
    set holes = h, putts = p, gross = g,
        self_holes = case when true = any(f) then f else null end,
        handicap_snapshot = coalesce((s->>'handicapSnapshot')::numeric, handicap_snapshot)
    where round_id = p_round and player_id = pid;
  end loop;
end;
$$;

revoke execute on function merge_round_scores(uuid, jsonb) from public, anon;
grant execute on function merge_round_scores(uuid, jsonb) to authenticated, service_role;
