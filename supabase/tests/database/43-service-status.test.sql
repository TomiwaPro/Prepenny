-- Step 4k: service status (brief 4.16, D644). The status function asks the
-- database, with Supabase's own key, whether it can save a change now and
-- whether the reminders job is running, and which address is the app's.
-- - Only Supabase's own key can ask: nobody signed in or out.
-- - Asking saves one thing: when it was asked, in a row of its own. Nothing
--   anyone has, and no account, is read or changed.
-- - The reminders job counts as running when it finished well in the last 5
--   minutes; failing, or stopped, or not at all, it isn't.

begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- A refusal's code, or "no refusal".
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'no refusal';
exception when others then
  return sqlerrm;
end;
$$;
grant execute on function pg_temp.refusal(text) to authenticated, anon, service_role;

select tests.make_jess_and_tom();

-- ---------------------------------------------------------------------------
-- 1. Who can ask.

select tests.as_person('jess');
select tests.through_the_data_api();
select ok(pg_temp.refusal('select public.service_status()') like 'permission denied for %',
  'Someone signed in can''t ask the server''s status this way');
select tests.as_nobody();
select ok(pg_temp.refusal('select public.service_status()') like 'permission denied for %',
  'nor can someone signed out');
select tests.as_supabase_admin();
select is(pg_temp.refusal('select public.service_status()'), 'no refusal', 'Supabase''s own key can');
select tests.as_test();
select is_empty($$ select 1 from information_schema.role_table_grants
     where table_schema = 'app' and table_name = 'service_checks'
       and grantee in ('anon', 'authenticated', 'service_role', 'public') $$,
  'Nobody but the database itself reads or changes the status row');

-- ---------------------------------------------------------------------------
-- 2. Saving changes: asking saves when it was asked, and nothing else.

update app.service_checks set checked_at = null where only_one;
select set_config('test.rows_before', (select count(*) from tests.readable_rows())::text, true);
select tests.as_supabase_admin();
select set_config('test.answer', public.service_status()::text, true);
select tests.as_test();
select is(current_setting('test.answer')::jsonb ->> 'saving', 'true', 'The database can save a change now');
select ok((select checked_at from app.service_checks where only_one) is not null,
  'Asking saved when it was asked');
select is((select count(*) from app.service_checks), 1::bigint, 'in its one row');
select is((select count(*) from tests.readable_rows())::text, current_setting('test.rows_before'),
  'and nothing in anyone''s plan changed');
select ok(current_setting('test.answer')::jsonb ? 'now', 'The answer has the server''s time');
select is_empty(format($$ select k from jsonb_object_keys(%L::jsonb) k
     where k not in ('saving', 'reminders_job', 'site', 'now') $$, current_setting('test.answer')),
  'and only says whether saving works, whether reminders are running, and the app''s address');

-- A database that can't save, as when it's full: asking fails, so saving isn't working.
select tests.as_supabase_admin();
select is(pg_temp.refusal('set local transaction_read_only = on; select public.service_status()'),
  'cannot execute UPDATE in a read-only transaction', 'A database that can''t save makes the check fail');
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 3. The reminders job.

select cron.unschedule(jobname) from cron.job where jobname = 'prepenny-reminders';
select ok(not app.reminders_job_ok(), 'With no reminders job, reminders aren''t running');

select cron.schedule('prepenny-reminders', '* * * * *', $$select 1$$);
select ok(not app.reminders_job_ok(), 'A job that hasn''t run yet isn''t running');

-- Each run made up here has a number of its own, far past any real run's.
insert into cron.job_run_details (runid, jobid, status, start_time, end_time, username, database, command)
select 9000000000001, j.jobid, 'succeeded', now() - interval '1 minute', now() - interval '1 minute', 'postgres', 'postgres', 'select 1'
from cron.job j where j.jobname = 'prepenny-reminders';
select ok(app.reminders_job_ok(), 'A job that finished well a minute ago is running');
select tests.as_supabase_admin();
select is(public.service_status() ->> 'reminders_job', 'true', 'and the status function is told so');
select tests.as_test();

update cron.job_run_details set end_time = now() - interval '6 minutes', start_time = now() - interval '6 minutes'
  where jobid = (select jobid from cron.job where jobname = 'prepenny-reminders');
select ok(not app.reminders_job_ok(), 'Nothing finished in the last 5 minutes: not running');

insert into cron.job_run_details (runid, jobid, status, start_time, end_time, username, database, command)
select 9000000000002, j.jobid, 'failed', now(), now(), 'postgres', 'postgres', 'select 1'
from cron.job j where j.jobname = 'prepenny-reminders';
select ok(not app.reminders_job_ok(), 'A run that failed doesn''t count');

update cron.job_run_details set status = 'succeeded'
  where jobid = (select jobid from cron.job where jobname = 'prepenny-reminders') and status = 'failed';
select cron.alter_job(jobid, active => false) from cron.job where jobname = 'prepenny-reminders';
select ok(not app.reminders_job_ok(), 'A job switched off isn''t running, even just after it ran');

-- ---------------------------------------------------------------------------
-- 4. The app's address.

select is((select site from app.service_checks), 'http://host.docker.internal:1',
  'On this local database, the app is a stand-in on the building computer');
select is(pg_temp.refusal($$ update app.service_checks set site = 'https://example.com/a/page' $$),
  'new row for relation "service_checks" violates check constraint "service_checks_site_check"',
  'The app''s address is a site, never a page with a path');

select * from finish();
rollback;
