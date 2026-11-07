-- The round playlist (2026-11-07): songs anyone on a round adds, each with
-- its ISRC and both services' ids, so every golfer can take the list to
-- Apple Music or Spotify (supabase/functions/music). Insert-only, delete
-- your own, like chirps, so four phones adding at once never clash. Paste
-- into the Supabase SQL editor for project ebukktjspbgzwnaxobfg before
-- pushing the apps that write it (schema.sql carries the same). Safe to rerun.
create table if not exists round_tracks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  added_by uuid not null references players(id) on delete cascade,
  isrc text,
  title text not null check (char_length(title) between 1 and 200),
  artist text not null default '',
  album text,
  artwork text,
  duration_ms integer,
  apple_id text,
  apple_url text,
  spotify_id text,
  spotify_url text,
  created_at timestamptz not null default now()
);
create index if not exists round_tracks_round_idx on round_tracks(round_id);
alter table round_tracks enable row level security;
drop policy if exists round_tracks_select on round_tracks;
create policy round_tracks_select on round_tracks for select
  using (round_id in (select id from rounds));
drop policy if exists round_tracks_insert on round_tracks;
create policy round_tracks_insert on round_tracks for insert
  with check (round_id in (select id from rounds) and added_by = current_player_id());
drop policy if exists round_tracks_delete on round_tracks;
create policy round_tracks_delete on round_tracks for delete
  using (added_by = current_player_id());
do $$ begin
  alter publication supabase_realtime add table round_tracks;
exception when duplicate_object then null; when undefined_object then null;
end $$;
