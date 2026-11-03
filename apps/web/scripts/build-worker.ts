// Builds the background worker that runs the engine (worker/engine.worker.ts)
// into one plain file, public/engine-worker-<fingerprint>.js, before Next.js
// builds the app, and tells the app its name in .env.local.
//
// It's built on its own, not by Next.js, because Turbopack's workers read
// their settings from the end of their own address (#params=...), and that
// part is lost when the offline helper serves the file from the phone. The
// name changes with the contents, so a page can only ever start the worker
// it was built with (D170).
//
// Usage: node scripts/build-worker.ts

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
writeFileSync(
  join(root, '.env.local'),
  `# Written by scripts/build-worker.ts. Don't edit.\nNEXT_PUBLIC_ENGINE_WORKER=/${name}\n`,
);
console.log(`Built public/${name}`);
