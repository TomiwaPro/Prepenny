// Builds the background worker that runs the engine (worker/engine.worker.ts)
// into one plain file, public/engine-worker-<fingerprint>.js, before Next.js
// builds the app, and tells the app its name in .env.local.
//
// It also says which version this build is (step 3e, lib/version.ts): the
// newest migration in supabase/migrations, which the database checks on
// every request, and the commit it was built from. Both go into the app
// (.env.local) and into public/version.json, which the live site serves
// fresh, so a phone can tell when a newer version is live.
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
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
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
writeFileSync(
  join(publicFolder, 'version.json'),
  `${JSON.stringify({ database, build: commit })}\n`,
);
writeFileSync(
  join(root, '.env.local'),
  `# Written by scripts/build-worker.ts. Don't edit.\nNEXT_PUBLIC_ENGINE_WORKER=/${name}\nNEXT_PUBLIC_DATABASE_VERSION=${database}\nNEXT_PUBLIC_APP_BUILD=${commit}\n`,
);
console.log(`Built public/${name}, for the database at ${database}, build ${commit}`);
