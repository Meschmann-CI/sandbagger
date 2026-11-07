-- The call (2026-11-06): a broadcaster's account of the round, written once
-- by the `recap` Edge Function when the last score lands and kept on the
-- round for everyone. {text, at}. Paste into the Supabase SQL editor for
-- project ebukktjspbgzwnaxobfg before pushing the apps that read it
-- (schema.sql carries the same). Safe to rerun.
alter table rounds add column if not exists recap jsonb;
