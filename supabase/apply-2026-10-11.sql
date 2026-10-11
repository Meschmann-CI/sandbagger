-- Audit fixes, 2026-10-11. Paste into the Supabase SQL editor for project
-- ebukktjspbgzwnaxobfg (schema.sql carries the same statements; this file
-- is the subset that still needs applying to prod). Safe to rerun.

-- 1. Listing a public bucket is members-only and scoped to their own group
--    folder. Downloads by URL on a public bucket do not go through these
--    policies, so photos and logos keep showing; only `list()` changes.
--    (Applied and verified 2026-10-11.)
drop policy if exists round_photos_read on storage.objects;
create policy round_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'round-photos' and (storage.foldername(name))[1] = current_group_id()::text);

drop policy if exists course_logos_read on storage.objects;
create policy course_logos_read on storage.objects for select to authenticated
  using (bucket_id = 'course-logos' and (storage.foldername(name))[1] = current_group_id()::text);

-- player-photos exists in prod already (the faces branch); scope it the same way.
drop policy if exists player_photos_read on storage.objects;
create policy player_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and (storage.foldername(name))[1] = current_group_id()::text);

-- 2. Keep the sign-in actions off the anon key. Supabase grants execute on
--    every function to `public`, which `anon` inherits, so revoking from
--    `anon` alone does nothing (the first run of this file changed nothing).
--    Revoke from public too, then grant back to signed-in users.
--    current_group_id / current_player_id stay open: RLS policies call them
--    as the querying role, and the keep-alive Action reads `rounds` as anon.
--    keepalive() stays open: the Action calls it with the anon key.
revoke execute on function rename_course(text, text) from public, anon;
revoke execute on function claim_my_player() from public, anon;
revoke execute on function create_group_with_owner(text, text, text, text, numeric, text) from public, anon;
revoke execute on function join_group_by_code(text, text, text, numeric) from public, anon;

grant execute on function rename_course(text, text) to authenticated, service_role;
grant execute on function claim_my_player() to authenticated, service_role;
grant execute on function create_group_with_owner(text, text, text, text, numeric, text) to authenticated, service_role;
grant execute on function join_group_by_code(text, text, text, numeric) to authenticated, service_role;
