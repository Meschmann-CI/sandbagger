-- New money games, 2026-10-23. Paste into the Supabase SQL editor for
-- project ebukktjspbgzwnaxobfg (schema.sql carries the same lines). Safe
-- to rerun.
--
-- The new bet types (Wolf, Vegas, and the parlor games: Rabbit, Snake,
-- Sixes, Stableford, Bingo Bango Bongo, Junk, Hammer) and one jsonb column
-- for how a game is set up:
--   nassau (match play): {format: 'match', autoPress?: 2, presses?: [{hole, byId}]}
--   wolf:   {order: [4 ids], picks: [partner id | 'lone' | 'blind' | null, ...18]}
--   vegas:  {teams: [[id, id], [id, id]], birdieFlip: true}
--   sixes:  {order: [4 ids]}
--   bbb:    {picks: [[bingo id, bango id, bongo id] | null, ...18]}
--   junk:   {kinds: ['greenie', 'sandie', 'barkie', 'chippie', 'birdie'], claims: [{hole, playerId, kind}]}
--   hammer: {teams: [[id], [id]] or [[id, id], [id, id]], limit: 3, holes: [{doubles, by, pending, conceded} | null, ...18]}
-- Rabbit, Snake and Stableford need nothing beyond the card. Null on every
-- other bet. The apps leave the column out of a save until a bet has one,
-- so the bets they already save are fine either way; the new games need
-- this before they can be saved.
alter table bets drop constraint if exists bets_type_check;
alter table bets add constraint bets_type_check check (type in (
  'nassau', 'skins', 'match', 'wolf', 'vegas',
  'rabbit', 'snake', 'sixes', 'stableford', 'bbb', 'junk', 'hammer',
  'custom'
));
alter table bets add column if not exists game jsonb;
