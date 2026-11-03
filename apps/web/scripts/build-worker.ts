// Builds the background worker that runs the engine (worker/engine.worker.ts)
// into one plain file, public/engine-worker.js, before Next.js builds the app.
//
// It's built on its own, not by Next.js, because Turbopack's workers read
// their settings from the end of their own address (#params=...), and that
// part is lost when the offline helper serves the file from the phone (D170).
//
// Usage: node scripts/build-worker.ts

import { join } from 'node:path';
import { build } from 'esbuild';

const root = join(import.meta.dirname, '..');

await build({
  entryPoints: [join(root, 'worker', 'engine.worker.ts')],
  outfile: join(root, 'public', 'engine-worker.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});
console.log('Built public/engine-worker.js');
