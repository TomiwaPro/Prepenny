-- Step 4g: PrePenny's own scheduled jobs keep 7 days of history (D590).
--
-- Supabase Cron writes a row to cron.job_run_details for every run of every
-- job: the command, its status, a short message and when it started and
-- ended. Supabase's own documentation says these rows are never cleared by
-- themselves: "cron.job_run_details grows with every Job run and is never
-- cleaned up automatically, even after a Job is unscheduled. Schedule a Job
-- to delete old records, keeping only the last 7 days"
-- (https://supabase.com/docs/guides/cron/quickstart, "Clean up job run
-- history", read on 18 Nov 2026). Since step 4f, prepenny-reminders runs
-- every minute (D578), so 1,440 rows a day.
--
-- Once a day, at 3:23am UTC, prepenny-job-history removes the history older
-- than 7 days of PrePenny's own jobs, the ones named "prepenny-...", its own
-- included. Any other job's history is left as it is. The rows hold no
-- amounts, names or notes: only the command a job runs and how it went.
--
-- Checks: supabase/tests/database/38-job-history.test.sql.

create function app.forget_old_job_runs() returns integer
language sql volatile security definer set search_path = '' as $$
  with gone as (
    delete from cron.job_run_details d
    where d.jobid in (select j.jobid from cron.job j where j.jobname like 'prepenny-%')
      and coalesce(d.end_time, d.start_time) < now() - interval '7 days'
    returning 1
  )
  select count(*)::integer from gone
$$;

-- Only the scheduled job runs it, as the database's own owner.
revoke all on function app.forget_old_job_runs() from public, anon, authenticated, service_role;

select cron.schedule('prepenny-job-history', '23 3 * * *', $$select app.forget_old_job_runs()$$);
