-- Rounds booked ahead, 2026-10-22. Paste into the Supabase SQL editor for
-- project ebukktjspbgzwnaxobfg (schema.sql carries the same lines). Safe
-- to rerun. A round with a tee time and no scores is a booking; it shows
-- under Upcoming and on Home, and counts as played once a score is in.
-- booked_by says who decides who's in: created_by can't, since every save
-- of a round overwrites it with whoever saved last.
alter table rounds add column if not exists tee_time text;
alter table rounds add column if not exists booked_by uuid references players(id) on delete set null;
