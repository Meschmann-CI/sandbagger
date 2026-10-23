-- Scores merged hole by hole, 2026-10-22. Paste into the Supabase SQL editor
-- for project ebukktjspbgzwnaxobfg (schema.sql carries the same function).
-- Safe to rerun.
--
-- Phones sharing a card on the course used to write every golfer's whole
-- card from their own copy, so a phone coming back from no signal could
-- blank holes the others had entered meanwhile. The apps now send only
-- what a save changed (src/lib/scorePatch.ts, BanditCore/ScorePatch.swift)
-- and this lays it onto what's stored. Until it exists the apps fall back
-- to writing just the golfers a save touched.
--
-- p_scores: [{playerId, handicapSnapshot, holes?: {"0": 4, "5": -1},
-- putts?: {...}, puttsMode?: 'unset'|'off'|'on', grossSet?: bool, gross?: int|null}].
-- Hole keys are 0-based; -1 clears. A full card always sets the total.
-- Security invoker: the round_players policies decide who may write.
create or replace function merge_round_scores(p_round uuid, p_scores jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  s jsonb;
  pid uuid;
  h integer[];
  p integer[];
  g integer;
  k text;
  v jsonb;
begin
  for s in select * from jsonb_array_elements(p_scores) loop
    pid := (s->>'playerId')::uuid;
    insert into round_players (round_id, player_id, gross, handicap_snapshot)
    values (p_round, pid, null, (s->>'handicapSnapshot')::numeric)
    on conflict (round_id, player_id) do nothing;

    select holes, putts, gross into h, p, g
    from round_players where round_id = p_round and player_id = pid
    for update;

    if s ? 'holes' then
      h := coalesce(h, '{}');
      if cardinality(h) < 18 then h := h || array_fill(null::integer, array[18 - cardinality(h)]); end if;
      for k, v in select * from jsonb_each(s->'holes') loop
        h[k::int + 1] := nullif((v #>> '{}')::int, -1);
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
        p[k::int + 1] := nullif((v #>> '{}')::int, -1);
      end loop;
    end if;

    if coalesce((s->>'grossSet')::boolean, false) then g := (s->>'gross')::int; end if;
    if h is not null and cardinality(h) >= 18
       and not exists (select 1 from unnest(h[1:18]) x where x is null) then
      g := (select sum(x) from unnest(h[1:18]) x);
    end if;

    update round_players
    set holes = h, putts = p, gross = g,
        handicap_snapshot = coalesce((s->>'handicapSnapshot')::numeric, handicap_snapshot)
    where round_id = p_round and player_id = pid;
  end loop;
end;
$$;

revoke execute on function merge_round_scores(uuid, jsonb) from public, anon;
grant execute on function merge_round_scores(uuid, jsonb) to authenticated, service_role;
