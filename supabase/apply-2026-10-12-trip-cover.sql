-- A trip's own cover photo, 2026-10-12. Paste into the Supabase SQL editor
-- for project ebukktjspbgzwnaxobfg (schema.sql carries the same line).
-- Safe to rerun. The iPhone app sets it from "Change photo" on a trip's
-- banner; the file lives in the round-photos bucket under
-- <group_id>/trips/<trip_id>/, which the bucket's policies already allow.
-- Null means no photo: the painted scene shows, as before.
alter table trips add column if not exists cover text;
