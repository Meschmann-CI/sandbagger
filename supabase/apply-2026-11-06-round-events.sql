-- Round moments announced once across phones (2026-11-06, audit 2026-10-24
-- items 11 to 13). Before a phone sends the Final, a golfer's trophies, the
-- turn or a lead change, it inserts (round, kind) here; the phone whose
-- insert lands sends the push, a phone that hits the primary key doesn't.
-- Paste into the Supabase SQL editor for project ebukktjspbgzwnaxobfg before
-- pushing the apps that write it (schema.sql carries the same). Until it is
-- pasted the insert fails with another error and every phone sends, which
-- is what happens today. Safe to rerun.
--
-- Not in the realtime publication on purpose: an insert here must not make
-- every phone reload.
create table if not exists round_events (
  round_id uuid not null references rounds(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 80),
  by_player uuid references players(id) on delete set null,
  at timestamptz not null default now(),
  primary key (round_id, kind)
);
alter table round_events enable row level security;
drop policy if exists round_events_select on round_events;
create policy round_events_select on round_events for select
  using (round_id in (select id from rounds));
drop policy if exists round_events_insert on round_events;
create policy round_events_insert on round_events for insert
  with check (round_id in (select id from rounds) and by_player = current_player_id());
