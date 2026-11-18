// Builds the reminders function's work (server/reminders.ts), with the
// engine, the words and the sealing it uses, into one file for Supabase's
// function runner: supabase/functions/reminders/_built/run.js (step 4e).
// Supabase runs functions with Deno, which can't read the app's own files
// as they are (a JSON file imported without saying so, for one), so the
// function imports this one file instead. It isn't kept in the repository:
// the Database workflow builds it before putting the function online, and
// building the app builds it for the end-to-end tests.
//
// Usage: node scripts/build-reminders.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const root = join(import.meta.dirname, '..');
const folder = join(root, '..', '..', 'supabase', 'functions', 'reminders', '_built');

const result = await build({
  entryPoints: [join(root, 'server', 'reminders.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
  write: false,
});
const code = result.outputFiles[0]?.contents;
if (code === undefined) throw new Error('esbuild gave no file for the reminders function.');
mkdirSync(folder, { recursive: true });
writeFileSync(
  join(folder, 'run.js'),
  `// Built by apps/web/scripts/build-reminders.ts from apps/web/server/reminders.ts. Not edited by hand.\n${new TextDecoder().decode(code)}`,
);
