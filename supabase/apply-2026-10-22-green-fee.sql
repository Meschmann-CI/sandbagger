-- Green fees, 2026-10-22. Paste into the Supabase SQL editor for project
-- ebukktjspbgzwnaxobfg (schema.sql carries the same line). Safe to rerun.
-- {payerId, amount}: one golfer covered the tee time at `amount` a head,
-- so everyone else on the round owes them that (src/lib/settlements.ts).
-- Null: paid at the course. Round saves write it, so this goes in before
-- the apps that know about it are pushed.
alter table rounds add column if not exists green_fee jsonb;
