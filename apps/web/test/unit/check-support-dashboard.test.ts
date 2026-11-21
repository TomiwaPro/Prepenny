// The Deploy workflow's check that the support dashboard is only at its own
// address, behind Cloudflare Access (scripts/check-support-dashboard.ts,
// step 4j, D641): what counts as Access being in front, and what doesn't.

import { describe, expect, it } from 'vitest';
import {
  appProblem,
  DASHBOARD_WORKERS_DEV,
  dashboardProblem,
  workersDevProblem,
} from '../../scripts/check-support-dashboard.ts';

const TEAM = 'prepenny-test.cloudflareaccess.com';
const answer = (status: number, location: string | null = null, text = '') => ({
  status,
  location,
  text,
});

describe('The live check of the support dashboard', () => {
  it("passes only when someone not signed in is sent to Access's own sign-in, on the team's address", () => {
    expect(
      dashboardProblem(
        answer(302, `https://${TEAM}/cdn-cgi/access/login/admin.prepenny.co.uk?kid=1&meta=x`),
        TEAM,
      ),
    ).toBeNull();
    expect(dashboardProblem(answer(200, null, '<h1>PrePenny support</h1>'), TEAM)).toMatch(
      /without asking anyone to sign in/,
    );
    expect(dashboardProblem(answer(404, null, "This page isn't here."), TEAM)).toMatch(
      /Cloudflare Access isn't in front of it/,
    );
    expect(
      dashboardProblem(
        answer(302, 'https://someone-else.cloudflareaccess.com/cdn-cgi/access/login/x'),
        TEAM,
      ),
    ).toMatch(/not Cloudflare Access's sign-in/);
    expect(dashboardProblem(answer(302, 'https://example.com/'), TEAM)).toMatch(
      /not Cloudflare Access's sign-in/,
    );
  });

  it('passes only when the app answers 404 for /app/support/', () => {
    expect(appProblem(answer(404))).toBeNull();
    expect(appProblem(answer(200))).toBe('it answered 200, not 404');
  });

  it("passes when the dashboard's workers.dev address serves nothing of it", () => {
    expect(DASHBOARD_WORKERS_DEV).toBe('https://prepenny-admin.prepenny.workers.dev');
    expect(workersDevProblem(null)).toBeNull();
    expect(workersDevProblem(answer(404, null, 'There is nothing here yet'))).toBeNull();
    expect(workersDevProblem(answer(200, null, '<title>PrePenny support</title>'))).toBe(
      'it serves the dashboard',
    );
  });
});
