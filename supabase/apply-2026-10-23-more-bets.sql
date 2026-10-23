-- Wolf, Vegas and match-play Nassau with presses, 2026-10-23. Paste into
-- the Supabase SQL editor for project ebukktjspbgzwnaxobfg (schema.sql
-- carries the same lines). Safe to rerun.
--
-- Two new bet types, and one jsonb column for how a game is set up:
--   nassau (match play): {format: 'match', autoPress?: 2, presses?: [{hole, byId}]}
--   wolf:                {order: [4 player ids], picks: [partner id | 'lone' | 'blind' | null, ...18]}
--   vegas:               {teams: [[id, id], [id, id]], birdieFlip: true}
-- Null on every other bet. The apps leave the column out of a save until
-- a bet has one, so the bets they already save are fine either way; the
-- new games need this before they can be saved.
alter table bets drop constraint if exists bets_type_check;
alter table bets add constraint bets_type_check
  check (type in ('nassau', 'skins', 'match', 'wolf', 'vegas', 'custom'));
alter table bets add column if not exists game jsonb;
