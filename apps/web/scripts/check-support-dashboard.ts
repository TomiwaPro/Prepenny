// Checks the support dashboard is only at its own address, behind Cloudflare
// Access (step 4j, D641), after each update goes live. Run by the Deploy
// workflow straight after the dashboard is put online:
//
// - prepenny.co.uk/app/support/ is "This page isn't here": the app has no
//   support pages.
// - admin.prepenny.co.uk sends someone who hasn't signed in with Cloudflare
//   Access to Access's own sign-in, on the team's address, before anything
//   of the dashboard loads.
// - The dashboard's Worker has no workers.dev address.
//
// A new address can take a few minutes to get its certificate the first
// time, so each is asked again for up to 5 minutes before the check fails.
// Nothing about a person is sent or written: these are plain requests with
// no sign-in.
//
// Usage: node scripts/check-support-dashboard.ts <team>.cloudflareaccess.com

import { LIVE_SITE, OLD_LIVE_HOST } from '../lib/site.ts';

export const DASHBOARD_SITE = 'https://admin.prepenny.co.uk';

/** The dashboard Worker's workers.dev address, if it had one: on the same account subdomain as the app's. */
export const DASHBOARD_WORKERS_DEV = `https://prepenny-admin.${OLD_LIVE_HOST.slice(OLD_LIVE_HOST.indexOf('.') + 1)}`;

export interface Answer {
  readonly status: number;
  readonly location: string | null;
  readonly text: string;
}

/** What's wrong with the dashboard's answer to someone not signed in with Access, or null when Access is in front. */
export function dashboardProblem(answer: Answer, team: string): string | null {
  if (answer.status >= 300 && answer.status < 400 && answer.location !== null) {
    let to: URL;
    try {
      to = new URL(answer.location, DASHBOARD_SITE);
    } catch {
      return `it sends people to an address that can't be read: ${answer.location}`;
    }
    if (to.hostname === team && to.pathname.startsWith('/cdn-cgi/access/login')) return null;
    return `it sends people to ${to.origin}${to.pathname}, not Cloudflare Access's sign-in on ${team}`;
  }
  if (answer.status === 404) {
    return "it answered \"This page isn't here.\": Cloudflare Access isn't in front of it, or the dashboard's Access settings don't match the application (README.md, part W)";
  }
  return `it answered ${answer.status} without asking anyone to sign in with Cloudflare Access`;
}

/** What's wrong with the app's answer for /app/support/, or null when it's not there. */
export function appProblem(answer: Answer): string | null {
  return answer.status === 404 ? null : `it answered ${answer.status}, not 404`;
}

/** What's wrong with the workers.dev address's answer, or null when it serves nothing of the dashboard. */
export function workersDevProblem(answer: Answer | null): string | null {
  if (answer === null) return null;
  return answer.status === 200 && answer.text.includes('PrePenny support')
    ? 'it serves the dashboard'
    : null;
}

async function ask(url: string): Promise<Answer | null> {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' },
    });
    return {
      status: response.status,
      location: response.headers.get('location'),
      text: await response.text(),
    };
  } catch {
    return null;
  }
}

/** Asks again every 15 seconds for up to 5 minutes, until there's no problem. */
async function settled(
  url: string,
  judge: (answer: Answer | null) => string | null,
): Promise<string | null> {
  let problem: string | null = 'no answer';
  for (let tries = 0; tries < 20; tries += 1) {
    problem = judge(await ask(url));
    if (problem === null) return null;
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  return problem;
}

async function main() {
  const team = (process.argv[2] ?? '').trim().toLowerCase();
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) {
    console.error('Usage: node scripts/check-support-dashboard.ts <team>.cloudflareaccess.com');
    process.exit(1);
  }
  const problems: string[] = [];
  const app = await settled(`${LIVE_SITE}/app/support/`, (answer) =>
    answer === null ? 'no answer' : appProblem(answer),
  );
  if (app !== null) problems.push(`${LIVE_SITE}/app/support/: ${app}.`);
  const dashboard = await settled(`${DASHBOARD_SITE}/`, (answer) =>
    answer === null
      ? 'no answer yet: its certificate can take a few minutes the first time'
      : dashboardProblem(answer, team),
  );
  if (dashboard !== null) problems.push(`${DASHBOARD_SITE}: ${dashboard}.`);
  const workersDev = workersDevProblem(await ask(`${DASHBOARD_WORKERS_DEV}/`));
  if (workersDev !== null) problems.push(`${DASHBOARD_WORKERS_DEV}: ${workersDev}.`);

  if (problems.length > 0) {
    for (const problem of problems) console.log(`::error title=Support dashboard::${problem}`);
    process.exit(1);
  }
  console.log(
    `The support dashboard is only at ${DASHBOARD_SITE}, behind Cloudflare Access, and the app has no support pages.`,
  );
}

if (process.argv[1]?.endsWith('check-support-dashboard.ts')) await main();
