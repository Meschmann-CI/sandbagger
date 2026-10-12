-- iPhone app notifications, 2026-10-11. Paste into the Supabase SQL editor
-- for project ebukktjspbgzwnaxobfg (schema.sql carries the same
-- statements). Safe to rerun. Nothing reads this table until the notify
-- function's APNs half is deployed with its secrets set.

-- One row per iPhone running the native app with notifications on: its
-- APNs device token, filed under the golfer signed in on it. `environment`
-- is 'sandbox' for development builds and 'production' for TestFlight and
-- the App Store, since Apple keeps the two token sets apart.
create table if not exists apns_tokens (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  token text not null unique,
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  created_at timestamptz not null default now()
);

create index if not exists apns_tokens_player_idx on apns_tokens(player_id);

alter table apns_tokens enable row level security;

-- Yours and only yours, like push_subscriptions. The Edge Function reads
-- everyone's with the service role, which bypasses this.
drop policy if exists apns_tokens_own on apns_tokens;
create policy apns_tokens_own on apns_tokens for all
  using (player_id = current_player_id())
  with check (player_id = current_player_id());
