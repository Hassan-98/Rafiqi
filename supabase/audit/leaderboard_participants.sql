-- «الترتيب» — who is really on the board. Run in the Supabase SQL editor (owner only:
-- it reads auth.users). Runs on its own; `client` and the board's test filter come with
-- supabase/migrations/20261121120000_leaderboard_client.sql.
--   tag    = the number the app shows («مجهول ٤٦٥٦» → 4656)
--   test   = marked as a test account ({"test": true} in its user metadata) — hidden from the board
--   login  = google (email shown: a real, known person) or guest (anonymous, no login)
--   client = android/desktop = a real install; web = a browser (a dev build or a test) —
--            filled from app 1.5.2 on
select (abs(hashtext(u.id::text)::bigint) % 9000 + 1000)::int                      as tag,
       coalesce(u.raw_user_meta_data ->> 'test', '') = 'true'                       as test,
       p.display_name                                                              as name,
       p.hide_name,
       case when u.is_anonymous then 'guest' else coalesce(u.raw_app_meta_data ->> 'provider', '?') end as login,
       u.email,
       to_jsonb(p) ->> 'client'                                                    as client, -- null until the migration adds it
       u.created_at::date                                                          as joined,
       (select max(d.day) from leaderboard_days d where d.user_id = u.id and d.points > 0) as last_day,
       (select count(*)   from leaderboard_days d where d.user_id = u.id and d.points > 0) as days,
       (select coalesce(sum(d.points), 0) from leaderboard_days d
         where d.user_id = u.id and d.day >= current_date - 7)                     as last_7_days
from auth.users u
left join leaderboard_profiles p on p.user_id = u.id
where exists (select 1 from leaderboard_days d where d.user_id = u.id)
   or p.user_id is not null
   or u.raw_user_meta_data ->> 'test' = 'true'
order by test, last_7_days desc;

-- ① Mark an account as a test by its tag (it leaves the board at once; nothing is deleted yet):
-- update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"test": true}'
--  where (abs(hashtext(id::text)::bigint) % 9000 + 1000) = 0000;

-- ② Delete EVERY account marked as a test — its points, profile and groups go with it (on delete cascade):
-- delete from auth.users where raw_user_meta_data ->> 'test' = 'true';
