-- Step 4k: service status (brief 4.16, D643 to D645).
--
-- PrePenny's status page, at UptimeRobot, says whether four things are
-- working: the app, signing in, saving changes and reminders. UptimeRobot
-- checks the app's own page, and asks the `status` function on Supabase
-- about the other three; the support dashboard asks the same function about
-- all four. The function asks the database the two things only it knows,
-- here. Nothing here, or in the function, uses anyone's account or data.

-- One row, which only the database itself reads or changes.
create table app.service_checks (
  only_one boolean primary key default true check (only_one),
  -- When a check last saved something: "saving changes" means the database
  -- takes a change, so each check makes one, here, and nowhere else.
  checked_at timestamptz,
  -- The app's own address, whose /version.json the function asks for "the
  -- app" on the dashboard. The local test database's is a stand-in on the
  -- building computer (supabase/seed.sql); never the real prepenny.co.uk.
  site text not null default 'https://prepenny.co.uk'
    check (site ~ '^https?://[a-z0-9.-]+(:[0-9]{1,5})?$')
);
insert into app.service_checks (only_one) values (true);
alter table app.service_checks enable row level security;
revoke all on app.service_checks from public, anon, authenticated, service_role;

-- Reminders are working when the scheduled job that starts them, every
-- minute (D578), finished well in the last 5 minutes. Whether the reminders
-- function itself answers, the function checks on its own.
create function app.reminders_job_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from cron.job j
    join cron.job_run_details d on d.jobid = j.jobid
    where j.jobname = 'prepenny-reminders' and j.active
      and d.status = 'succeeded' and d.end_time > now() - interval '5 minutes'
  )
$$;

-- What the status function asks, with Supabase's own key, through the Data
-- API, as phones save changes: that it can save a change now, and whether
-- the reminders job is running. And the app's address to ask about.
create function public.service_status() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  saved timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    perform app.refuse('not-allowed', '42501');
  end if;
  update app.service_checks set checked_at = clock_timestamp() where only_one
    returning checked_at into saved;
  return jsonb_build_object(
    'saving', saved is not null,
    'reminders_job', app.reminders_job_ok(),
    'site', (select c.site from app.service_checks c where c.only_one),
    'now', app.server_time());
end;
$$;

revoke execute on function public.service_status() from public, anon, authenticated;
grant execute on function public.service_status() to service_role;
revoke execute on function app.reminders_job_ok() from public, anon, authenticated, service_role;
