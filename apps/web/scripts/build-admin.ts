// Builds the support dashboard (step 4j, D641), after the app, into
// admin/out: its own site, with only the dashboard's page, from the admin
// folder. It's told the same things the app was told when it was built
// (the Supabase project, and the versions scripts/build-worker.ts wrote in
// .env.local), then its security policy is written as the app's is
// (scripts/write-headers.ts). Then it checks that nothing in it keeps
// anything on the computer: no offline helper, no home-screen app details
// (D642).
//
// Usage: node scripts/build-admin.ts (part of `pnpm build`)

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const web = join(import.meta.dirname, '..');
const admin = join(web, 'admin');
const out = join(admin, 'out');

// The updating test's second build of the app (step 4h) has no dashboard.
if (process.env.PREPENNY_BUILD_NAME === 'update-test') {
  console.log('Support dashboard: not built for the updating test.');
  process.exit(0);
}

/** The versions the app was just built with, from .env.local. */
function builtWith(): Record<string, string> {
  const found: Record<string, string> = {};
  for (const line of readFileSync(join(web, '.env.local'), 'utf8').split('\n')) {
    const match = /^(NEXT_PUBLIC_DATABASE_VERSION|NEXT_PUBLIC_APP_BUILD)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) found[match[1]] = match[2];
  }
  if (found.NEXT_PUBLIC_DATABASE_VERSION === undefined) {
    throw new Error('.env.local has no database version: build the app first (pnpm build).');
  }
  return found;
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const done = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (done.status !== 0) process.exit(done.status ?? 1);
}

rmSync(out, { recursive: true, force: true });
const env = { ...process.env, ...builtWith(), NEXT_TELEMETRY_DISABLED: '1' };
run(join(web, 'node_modules', '.bin', 'next'), ['build'], admin, env);
run(process.execPath, [join(web, 'scripts', 'write-headers.ts'), out], web, env);

const files = readdirSync(out, { recursive: true }).map(String);
const pages = files.filter((file) => file.endsWith('.html')).sort();
for (const kept of ['sw.js', 'manifest.webmanifest', 'version.json', 'offline-version.json']) {
  if (existsSync(join(out, kept)))
    throw new Error(`The support dashboard must not have ${kept} (D642).`);
}
if (!pages.includes('index.html')) throw new Error('The support dashboard has no page.');
console.log(`Support dashboard: ${pages.length} pages in admin/out (${pages.join(', ')}).`);
