// Builds the background worker that runs the engine (worker/engine.worker.ts)
// into one plain file, public/engine-worker-<fingerprint>.js, before Next.js
// builds the app, and tells the app its name in .env.local.
//
// It also says which version this build is (step 3e, lib/version.ts): the
// newest migration in supabase/migrations, which the database checks on
// every request, and the commit it was built from. Both go into the app
// (.env.local) and into public/version.json, which the live site serves
// fresh, so a phone can tell when a newer version is live, and
// public/offline-version.json, which the offline helper keeps (step 4h). And the bank
// holiday list phones fetch each week, public/bank-holidays.json (step 4c).
//
// It's built on its own, not by Next.js, because Turbopack's workers read
// their settings from the end of their own address (#params=...), and that
// part is lost when the offline helper serves the file from the phone. The
// name changes with the contents, so a page can only ever start the worker
// it was built with (D170).
//
// Usage: node scripts/build-worker.ts

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const root = join(import.meta.dirname, '..');
const publicFolder = join(root, 'public');

const result = await build({
  entryPoints: [join(root, 'worker', 'engine.worker.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  write: false,
});
const code = result.outputFiles[0]?.contents;
if (code === undefined) throw new Error('esbuild gave no worker file.');

const name = `engine-worker-${createHash('sha256').update(code).digest('hex').slice(0, 12)}.js`;
for (const old of readdirSync(publicFolder)) {
  if (/^engine-worker.*\.js$/.test(old)) rmSync(join(publicFolder, old));
}
writeFileSync(join(publicFolder, name), code);

// The version of the database this build works with: its newest migration.
const migrations = readdirSync(join(root, '..', '..', 'supabase', 'migrations'))
  .map((file) => /^(\d{14})_/.exec(file)?.[1])
  .filter((version): version is string => version !== undefined)
  .sort();
const database = migrations.at(-1);
if (database === undefined) throw new Error('No migrations in supabase/migrations.');
// The commit it was built from, or the worker's fingerprint where there's no git.
let commit = name.slice('engine-worker-'.length, -'.js'.length);
try {
  commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root })
    .toString()
    .trim();
} catch {
  // Not built from a git checkout: the worker's fingerprint says which build it is.
}
// The updating test's second build of the same commit names itself, so it's a
// newer version for a phone on the first (e2e/updating.ts, step 4h). Never
// set when PrePenny is built to go online.
const named = process.env.PREPENNY_BUILD_NAME;
if (named !== undefined && named !== '') {
  if (!/^[a-z0-9-]{1,40}$/.test(named))
    throw new Error('PREPENNY_BUILD_NAME: a-z, 0-9 and - only.');
  commit = named;
}
// The same again in offline-version.json, which the offline helper keeps with
// every page of this build: a phone asks it which version a fresh load would
// give, so it loads a new version only once it's on the phone (step 4h, D594).
for (const file of ['version.json', 'offline-version.json']) {
  writeFileSync(join(publicFolder, file), `${JSON.stringify({ database, build: commit })}\n`);
}
// The bank holiday list phones fetch each week (step 4c, D537): the built-in
// copy, with its version. Putting the live app online swaps in GOV.UK's
// newest list (scripts/newest-bank-holidays.ts), as the Bank holidays
// workflow does each Monday when GOV.UK's has changed.
const engineData = join(root, '..', '..', 'packages', 'engine', 'data');
const source = JSON.parse(readFileSync(join(engineData, 'bank-holidays.source.json'), 'utf8')) as {
  source: string;
  downloaded_on: string;
  sha256: string;
};
writeFileSync(
  join(publicFolder, 'bank-holidays.json'),
  `${JSON.stringify({
    version: `${source.downloaded_on}:${source.sha256}`,
    source: source.source,
    downloaded_on: source.downloaded_on,
    sha256: source.sha256,
    list: JSON.parse(readFileSync(join(engineData, 'bank-holidays.json'), 'utf8')),
  })}\n`,
);
writeFileSync(
  join(root, '.env.local'),
  `# Written by scripts/build-worker.ts. Don't edit.\nNEXT_PUBLIC_ENGINE_WORKER=/${name}\nNEXT_PUBLIC_DATABASE_VERSION=${database}\nNEXT_PUBLIC_APP_BUILD=${commit}\n`,
);
console.log(`Built public/${name}, for the database at ${database}, build ${commit}`);
