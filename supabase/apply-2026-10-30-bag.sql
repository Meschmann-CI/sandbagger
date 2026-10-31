-- Your bag (Matt, 2026-10-30): each golfer's clubs, how far each goes and
-- what it is, on the You page. Paste into the Supabase SQL editor for
-- project ebukktjspbgzwnaxobfg (schema.sql carries the same). Safe to rerun.
-- A list of {id, club, brand, yards}; club is a code the apps share
-- (D, 3W, 5H, 7I, PW, SW, P). Written only when a golfer has one.
alter table players add column if not exists bag jsonb;
