-- «الترتيب» — who is really on the board. Run in the Supabase SQL editor (owner only:
-- it reads auth.users). One row per account that ever uploaded points.
--   tag      = the number the app shows («مجهول ٤٦٥٦» → 4656)
--   login    = google (email shown: a real, known person) or guest (anonymous, no login)
--   client   = android/desktop = a real install; web = a browser (a dev build or a test) —
--              filled from app 1.5.2 on, after 20261121120000_leaderboard_client.sql
select (abs(hashtext(u.id::text)::bigint) % 9000 + 1000)::int                      as tag,
       p.display_name                                                              as name,
       p.hide_name,
       case when u.is_anonymous then 'guest' else coalesce(u.raw_app_meta_data->>'provider', '?') end as login,
       u.email,
       p.client,
       u.created_at::date                                                          as joined,
       (select max(d.day) from leaderboard_days d where d.user_id = u.id and d.points > 0) as last_day,
       (select count(*)   from leaderboard_days d where d.user_id = u.id and d.points > 0) as days,
       (select coalesce(sum(d.points), 0) from leaderboard_days d
         where d.user_id = u.id and d.day >= current_date - 7)                     as last_7_days
from auth.users u
left join leaderboard_profiles p on p.user_id = u.id
where exists (select 1 from leaderboard_days d where d.user_id = u.id)
   or p.user_id is not null
order by last_7_days desc;

-- Take a test account off the board by its tag (check the list above first):
-- delete from leaderboard_days     where (abs(hashtext(user_id::text)::bigint) % 9000 + 1000) = 0000;
-- delete from leaderboard_profiles where (abs(hashtext(user_id::text)::bigint) % 9000 + 1000) = 0000;
