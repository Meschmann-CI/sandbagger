-- Spectator mode, 2026-10-23. Paste into the Supabase SQL editor for project
-- ebukktjspbgzwnaxobfg (schema.sql carries the same lines). Safe to rerun.
--
-- Chirps: reactions from someone watching a round they're not in, at one
-- golfer in it. Seen by whoever can see the round; sent only as yourself;
-- only the sender can take one back. The apps load the last two days.
create table if not exists chirps (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  from_player uuid not null references players(id) on delete cascade,
  to_player uuid not null references players(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 140),
  created_at timestamptz not null default now()
);
create index if not exists chirps_round_idx on chirps(round_id);
alter table chirps enable row level security;
drop policy if exists chirps_select on chirps;
create policy chirps_select on chirps for select
  using (round_id in (select id from rounds));
drop policy if exists chirps_insert on chirps;
create policy chirps_insert on chirps for insert
  with check (round_id in (select id from rounds) and from_player = current_player_id());
drop policy if exists chirps_delete on chirps;
create policy chirps_delete on chirps for delete
  using (from_player = current_player_id());
do $$ begin
  alter publication supabase_realtime add table chirps;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- Rounds a golfer is watching but doesn't want the turn and lead-change
-- pushes from, and whether they take chirps while they play.
alter table players add column if not exists muted_rounds uuid[];
alter table players add column if not exists chirps_off boolean;
