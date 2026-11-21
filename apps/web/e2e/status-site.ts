// A stand-in for PrePenny's own site, for the status tests (step 4k, D644).
// The status function, running in the local Supabase, asks the app's address
// for /version.json to say whether the app is working. It never asks the real
// prepenny.co.uk from a test: supabase/seed.sql points it at the building
// computer, and this server, on a port of the test's own, answers there,
// reached from Supabase's function runner as host.docker.internal, as the
// reminders tests' stand-in push service is (e2e/push-service.ts).

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql } from './two-phones.ts';

export interface StandInSite {
  /** Whether it answers as PrePenny's site does, or as a site that's down (503). */
  working: boolean;
  readonly close: () => Promise<void>;
}

/** Starts the stand-in and points the status function at it, until it's closed. */
export async function standInSite(): Promise<StandInSite> {
  const site = {
    working: true,
    close: async () => {},
  };
  const server: Server = createServer((request, response) => {
    if (!site.working || request.url !== '/version.json') {
      response.statusCode = 503;
      response.end();
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ database: '20261125200000', build: 'stand-in' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
  const { port } = server.address() as AddressInfo;
  sql(`update app.service_checks set site = 'http://host.docker.internal:${port}' where only_one`);
  site.close = async () => {
    sql(`update app.service_checks set site = 'http://host.docker.internal:1' where only_one`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  return site;
}

/**
 * The reminders job, as it runs on the real project every minute: on the
 * local Supabase it's switched off (supabase/seed.sql), so the test makes it
 * look as if it finished well just now, then takes it away again.
 */
export function remindersJobRanJustNow(): () => void {
  sql(`select cron.schedule('prepenny-reminders', '0 0 1 1 *', 'select 1')`);
  sql('delete from cron.job_run_details where runid = 9000000000101');
  sql(`insert into cron.job_run_details (runid, jobid, status, start_time, end_time, username, database, command)
    select 9000000000101, j.jobid, 'succeeded', now(), now(), 'postgres', 'postgres', 'select 1'
    from cron.job j where j.jobname = 'prepenny-reminders'`);
  return () => {
    sql('delete from cron.job_run_details where runid = 9000000000101');
    sql(`select cron.unschedule('prepenny-reminders')`);
  };
}
