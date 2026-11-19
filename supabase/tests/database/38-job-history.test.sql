-- Step 4g: PrePenny's own scheduled jobs keep 7 days of history (D590).
--
-- Proves: prepenny-job-history runs once a day and clears only history
-- older than 7 days, of PrePenny's own jobs only, its own included, and
-- leaves another job's history as it is; and nobody else can run it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- The job, once a day, running the step.
select is((select schedule from cron.job where jobname = 'prepenny-job-history'), '23 3 * * *',
  'prepenny-job-history runs once a day, at 3:23am UTC');
select is((select command from cron.job where jobname = 'prepenny-job-history'),
  'select app.forget_old_job_runs()', 'and clears PrePenny''s own old job history');
select is((select count(*)::integer from cron.job where jobname = 'prepenny-job-history'), 1,
  'once');

-- The local Supabase switches PrePenny's other jobs off (seed.sql), so they
-- are scheduled again here as the live database has them, for this test only.
select cron.schedule('prepenny-reminders', '* * * * *', $$select app.reminders_tick()$$);
select cron.schedule('prepenny-bank-holidays', '41 7 * * 1', $$select app.ask_for_bank_holidays()$$);

-- Someone else's job, as another part of Supabase might have.
select cron.schedule('someone-else', '0 4 * * *', $$select 1$$);

create function pg_temp.job(name text) returns bigint language sql as $$
  select jobid from cron.job where jobname = name
$$;

-- A run of a job that ended some days ago, or that has no end recorded.
create function pg_temp.ran(name text, days_ago numeric, ended boolean default true)
returns void language sql as $$
  insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status,
    return_message, start_time, end_time)
  values (pg_temp.job(name), (select coalesce(max(runid), 0) + 1 from cron.job_run_details), 1,
    current_database(), 'postgres',
    'select 1', 'succeeded', '1 row',
    now() - make_interval(secs => days_ago * 86400) - interval '1 second',
    case when ended then now() - make_interval(secs => days_ago * 86400) end)
$$;

create function pg_temp.runs(name text) returns integer language sql as $$
  select count(*)::integer from cron.job_run_details where jobid = pg_temp.job(name)
$$;

delete from cron.job_run_details;

select pg_temp.ran('prepenny-reminders', 30);
select pg_temp.ran('prepenny-reminders', 8);
select pg_temp.ran('prepenny-reminders', 7.01);
select pg_temp.ran('prepenny-reminders', 6.99);
select pg_temp.ran('prepenny-reminders', 0.001);
select pg_temp.ran('prepenny-reminders', 9, false);
select pg_temp.ran('prepenny-bank-holidays', 14);
select pg_temp.ran('prepenny-bank-holidays', 0.5);
select pg_temp.ran('prepenny-job-history', 8);
select pg_temp.ran('prepenny-job-history', 1);
select pg_temp.ran('someone-else', 30);
select pg_temp.ran('someone-else', 1);

select is(app.forget_old_job_runs(), 6, 'Six runs of PrePenny''s jobs older than 7 days are cleared');
select is(pg_temp.runs('prepenny-reminders'), 2,
  'prepenny-reminders keeps its last 7 days, a run from just under 7 days ago included');
select ok(not exists (
    select 1 from cron.job_run_details
    where jobid = pg_temp.job('prepenny-reminders') and end_time is null),
  'a run with no end recorded goes by when it started');
select is(pg_temp.runs('prepenny-bank-holidays'), 1, 'prepenny-bank-holidays keeps its last 7 days');
select is(pg_temp.runs('prepenny-job-history'), 1, 'and so does prepenny-job-history itself');
select is(pg_temp.runs('someone-else'), 2, 'Another job''s history is left as it is');
select is(app.forget_old_job_runs(), 0, 'Run again, there''s nothing more to clear');

-- Nobody else can run it.
select ok(not has_function_privilege('authenticated', 'app.forget_old_job_runs()', 'execute'),
  'Someone signed in can''t run it');
select ok(not has_function_privilege('anon', 'app.forget_old_job_runs()', 'execute')
    and not has_function_privilege('service_role', 'app.forget_old_job_runs()', 'execute'),
  'nor can someone signed out, or Supabase''s own key');

select * from finish();
rollback;
