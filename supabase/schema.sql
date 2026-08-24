-- Sandbagger schema. Paste this whole file into the Supabase SQL Editor
-- and run it once. Safe to re-run: everything is guarded.

-- ============================================================
-- Tables
-- ============================================================

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

-- A player is a golfer in a group. user_id is null until they sign in:
-- the organizer can add someone by email and that row gets claimed on
-- their first magic-link login.
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  email text,
  name text not null,
  initials text not null,
  handicap numeric(4,1) not null default 18.0,
  home_course text,
  color text not null default '#1c7c4a',
  is_member boolean not null default true,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists players_group_idx on players(group_id);
create index if not exists players_email_idx on players(lower(email));

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  status text not null default 'planning' check (status in ('planning', 'booked')),
  location text,
  start_date date,
  end_date date,
  note text,
  -- The privacy control: only these players can see the trip.
  attendee_ids uuid[] not null default '{}',
  created_by uuid references players(id) on delete set null,
  chosen_option_id text,
  options jsonb not null default '[]'::jsonb,
  itinerary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trips_group_idx on trips(group_id);

-- Par and stroke index, off the physical scorecard, entered once per
-- course. Rounds keep recording the course as free text and are matched
-- to a row here by slug, so filling one in reaches back through every
-- round already played there without rewriting any of them.
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  slug text not null,
  -- 18 entries once complete; nulls while it's still being filled in.
  pars smallint[] not null default '{}',
  stroke_index smallint[],
  created_at timestamptz not null default now(),
  unique (group_id, slug)
);

create index if not exists courses_group_idx on courses(group_id);

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  played_on date not null,
  course_name text not null,
  tee text,
  trip_id uuid references trips(id) on delete set null,
  notes text,
  created_by uuid references players(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rounds_group_idx on rounds(group_id);

create table if not exists round_players (
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  -- Nullable: whoever logged the round may not have known everyone's
  -- score. The player fills their own in later.
  gross integer,
  -- Snapshotted so history stays accurate when a handicap changes.
  handicap_snapshot numeric(4,1) not null,
  holes integer[],
  primary key (round_id, player_id)
);

create table if not exists bets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  type text not null check (type in ('nassau', 'skins', 'custom')),
  name text not null,
  stake numeric(10,2) not null default 0,
  results jsonb not null default '[]'::jsonb
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  description text not null,
  amount numeric(10,2) not null,
  category text not null default 'other' check (category in ('lodging', 'golf', 'travel', 'food', 'other')),
  paid_by uuid not null references players(id) on delete cascade,
  shared_by uuid[] not null default '{}',
  spent_on date
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  from_player uuid not null references players(id) on delete cascade,
  to_player uuid not null references players(id) on delete cascade,
  amount numeric(10,2) not null,
  paid_on date
);

-- Migrations, for projects created before these existed.
-- Handing the Saddam over by hand:
alter table groups add column if not exists saddam_award jsonb;
-- Scores that aren't in yet:
alter table round_players alter column gross drop not null;
-- Venmo handles, for settling up. Public usernames, nothing linked.
alter table players add column if not exists venmo text;

-- ============================================================
-- Helpers
-- ============================================================
-- SECURITY DEFINER so these can read players without tripping the
-- policies that call them (that would recurse).

create or replace function current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from players where user_id = auth.uid() limit 1
$$;

create or replace function current_group_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select group_id from players where user_id = auth.uid() limit 1
$$;

-- Claims a player row that was created for this email before they had an
-- account. Called by the app right after sign-in.
create or replace function claim_my_player()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed uuid;
  my_email text;
begin
  select id into claimed from players where user_id = auth.uid() limit 1;
  if claimed is not null then
    return claimed;
  end if;

  select email into my_email from auth.users where id = auth.uid();
  if my_email is null then
    return null;
  end if;

  update players
     set user_id = auth.uid()
   where user_id is null
     and lower(email) = lower(my_email)
  returning id into claimed;

  return claimed;
end;
$$;

-- Creates a group and the caller's own player row in one shot, which
-- avoids the chicken-and-egg problem in the insert policies.
create or replace function create_group_with_owner(
  group_name text,
  invite_code text,
  player_name text,
  player_initials text,
  player_handicap numeric default 18.0,
  player_home_course text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group uuid;
  new_player uuid;
  my_email text;
begin
  if (select id from players where user_id = auth.uid() limit 1) is not null then
    raise exception 'You already belong to a group';
  end if;

  select email into my_email from auth.users where id = auth.uid();

  insert into groups (name, invite_code) values (group_name, invite_code)
  returning id into new_group;

  insert into players (group_id, user_id, email, name, initials, handicap, home_course, is_admin)
  values (new_group, auth.uid(), my_email, player_name, player_initials, player_handicap, player_home_course, true)
  returning id into new_player;

  return new_group;
end;
$$;

-- Joining an existing group by its invite code.
create or replace function join_group_by_code(
  code text,
  player_name text,
  player_initials text,
  player_handicap numeric default 18.0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group uuid;
  my_email text;
begin
  if (select id from players where user_id = auth.uid() limit 1) is not null then
    raise exception 'You already belong to a group';
  end if;

  select id into target_group from groups where upper(invite_code) = upper(code) limit 1;
  if target_group is null then
    raise exception 'No group with that code';
  end if;

  select email into my_email from auth.users where id = auth.uid();

  insert into players (group_id, user_id, email, name, initials, handicap)
  values (target_group, auth.uid(), my_email, player_name, player_initials, player_handicap);

  return target_group;
end;
$$;

-- Casting a vote.
--
-- A trip is one row, and its destinations and their votes live inside a
-- single JSONB column. The app used to vote by writing the whole trip
-- back, so two people voting within a few seconds of each other meant
-- the second write clobbered the first and a vote simply disappeared.
-- Voting is the one thing everybody does at once, so the toggle happens
-- here, in one statement, against whatever the row currently holds.
--
-- security invoker on purpose: the trips policies still apply, so this
-- can't be used to vote on a trip you can't see.

create or replace function jsonb_without(arr jsonb, val jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(e), '[]'::jsonb)
  from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) e
  where e <> val
$$;

create or replace function toggle_trip_vote(trip_id uuid, option_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  me jsonb;
  result jsonb;
begin
  if current_player_id() is null then
    raise exception 'No player profile for this account';
  end if;
  me := to_jsonb(current_player_id()::text);

  update trips t
     set options = (
       select coalesce(
         jsonb_agg(
           case
             -- Tapping your own pick again takes it back.
             when o->>'id' = option_id
                  and not (coalesce(o->'votes', '[]'::jsonb) @> jsonb_build_array(me))
               then jsonb_set(o, '{votes}', jsonb_without(o->'votes', me) || jsonb_build_array(me))
             -- One vote per golfer per trip, so clear it off the others.
             else jsonb_set(o, '{votes}', jsonb_without(o->'votes', me))
           end
           order by ord
         ),
         '[]'::jsonb
       )
       from jsonb_array_elements(coalesce(t.options, '[]'::jsonb)) with ordinality as x(o, ord)
     )
   where t.id = toggle_trip_vote.trip_id
   returning t.options into result;

  if result is null then
    raise exception 'That trip is not yours to vote on';
  end if;

  return result;
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table groups enable row level security;
alter table players enable row level security;
alter table courses enable row level security;
alter table trips enable row level security;
alter table rounds enable row level security;
alter table round_players enable row level security;
alter table bets enable row level security;
alter table expenses enable row level security;
alter table payments enable row level security;

-- groups: you see and rename your own group
drop policy if exists groups_select on groups;
create policy groups_select on groups for select
  using (id = current_group_id());

drop policy if exists groups_update on groups;
create policy groups_update on groups for update
  using (id = current_group_id());

-- players: everyone in the group sees everyone, and any member can add
-- or edit members (it's a friend group, not a corporation)
drop policy if exists players_select on players;
create policy players_select on players for select
  using (group_id = current_group_id());

drop policy if exists players_insert on players;
create policy players_insert on players for insert
  with check (group_id = current_group_id());

drop policy if exists players_update on players;
create policy players_update on players for update
  using (group_id = current_group_id());

-- trips: group-scoped AND attendee-scoped. This is what actually keeps a
-- private trip private — the UI filter alone would not.
drop policy if exists trips_select on trips;
create policy trips_select on trips for select
  using (
    group_id = current_group_id()
    and (current_player_id() = any(attendee_ids) or created_by = current_player_id())
  );

-- Note the predicate matches trips_update. The app saves trips with an
-- upsert, which Postgres runs as INSERT ... ON CONFLICT and checks
-- against BOTH policies — so requiring created_by here would stop an
-- attendee from editing a trip somebody else created.
drop policy if exists trips_insert on trips;
create policy trips_insert on trips for insert
  with check (
    group_id = current_group_id()
    and (current_player_id() = any(attendee_ids) or created_by = current_player_id())
  );

drop policy if exists trips_update on trips;
create policy trips_update on trips for update
  using (
    group_id = current_group_id()
    and (current_player_id() = any(attendee_ids) or created_by = current_player_id())
  );

drop policy if exists trips_delete on trips;
create policy trips_delete on trips for delete
  using (group_id = current_group_id() and created_by = current_player_id());

-- courses: shared reference data, like the rounds played on them
drop policy if exists courses_all on courses;
create policy courses_all on courses for all
  using (group_id = current_group_id())
  with check (group_id = current_group_id());

-- rounds: shared history, visible to the whole group
drop policy if exists rounds_all on rounds;
create policy rounds_all on rounds for all
  using (group_id = current_group_id())
  with check (group_id = current_group_id());

-- Child tables inherit visibility: Postgres applies RLS inside these
-- subqueries too, so a round or trip you cannot see hides its children.
drop policy if exists round_players_all on round_players;
create policy round_players_all on round_players for all
  using (round_id in (select id from rounds))
  with check (round_id in (select id from rounds));

drop policy if exists bets_all on bets;
create policy bets_all on bets for all
  using (round_id in (select id from rounds))
  with check (round_id in (select id from rounds));

drop policy if exists expenses_all on expenses;
create policy expenses_all on expenses for all
  using (trip_id in (select id from trips))
  with check (trip_id in (select id from trips));

drop policy if exists payments_all on payments;
create policy payments_all on payments for all
  using (trip_id in (select id from trips))
  with check (trip_id in (select id from trips));

-- ============================================================
-- Realtime (so a round logged on the course shows up on everyone's phone)
-- ============================================================
-- The app never reads the change payload — it just refetches, and that
-- read goes back through the policies above. So even a broadcast the
-- subscriber shouldn't have seen can't leak a private trip's contents.

do $$
declare
  t text;
begin
  foreach t in array array['players', 'courses', 'trips', 'rounds', 'round_players', 'bets', 'expenses', 'payments']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
