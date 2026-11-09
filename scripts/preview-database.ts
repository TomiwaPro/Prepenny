// How a pull request's database changes reach the preview Supabase project
// (step 3e-2, D405). There's one preview database for every open pull
// request, so it follows the pull request whose preview was put online last:
//
// - It already has exactly this pull request's database changes: nothing
//   changes, and anyone signed up on it stays signed up. This is the usual
//   case: two pull requests that don't change the database share it happily.
// - It has all of them but this pull request's newest: those are added.
// - Anything else (another pull request's changes it doesn't have, or a
//   change written differently): the preview database starts again, empty,
//   with exactly this pull request's changes. It never holds real people's
//   data, so nothing is lost but test accounts.
//
// Each change is known by its file's version and a fingerprint of its words
// (SHA-256), kept in the preview database itself (preview.migrations), so a
// change edited in a later commit of a pull request is noticed too.
//
// Usage, from the Deploy workflow:
//   node scripts/preview-database.ts decide <what the preview database has, as JSON>
//   node scripts/preview-database.ts record <pull request number>

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Migration {
  readonly version: string;
  readonly sha256: string;
}

/** What the preview database has: the changes applied, and their fingerprints where it kept them. */
export interface PreviewHas {
  readonly applied: readonly string[];
  readonly fingerprints: readonly Migration[];
}

export type Decision =
  | { readonly action: 'nothing'; readonly why: string }
  | { readonly action: 'add'; readonly why: string; readonly adding: readonly string[] }
  | { readonly action: 'start-again'; readonly why: string };

/** This pull request's database changes, oldest first, with their fingerprints. */
export function migrationsIn(folder: string): Migration[] {
  return readdirSync(folder)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort()
    .map((name) => ({
      version: name.slice(0, 14),
      sha256: createHash('sha256')
        .update(readFileSync(join(folder, name)))
        .digest('hex'),
    }));
}

/** What to do to the preview database so it has exactly these changes. */
export function decide(has: PreviewHas, wanted: readonly Migration[]): Decision {
  const applied = [...has.applied].sort();
  if (applied.length === 0) {
    return {
      action: 'add',
      why: 'The preview database has no database changes yet, so all of them are added.',
      adding: wanted.map((one) => one.version),
    };
  }
  const kept = new Map(has.fingerprints.map((one) => [one.version, one.sha256]));
  for (const [place, version] of applied.entries()) {
    const ours = wanted[place];
    if (ours === undefined || ours.version !== version) {
      return {
        action: 'start-again',
        why: `The preview database has a database change this pull request doesn't (${version}), from another pull request, so it starts again with this one's.`,
      };
    }
    if (kept.get(version) !== ours.sha256) {
      return {
        action: 'start-again',
        why: `The database change ${version} is written differently here from the one the preview database has, so it starts again with this pull request's.`,
      };
    }
  }
  const adding = wanted.slice(applied.length).map((one) => one.version);
  if (adding.length === 0) {
    return {
      action: 'nothing',
      why: "The preview database has exactly this pull request's database changes already, so nothing changes and test accounts stay.",
    };
  }
  return {
    action: 'add',
    why: `The preview database has every earlier database change, so ${adding.length === 1 ? 'the new one is' : `the ${adding.length} new ones are`} added: ${adding.join(', ')}.`,
    adding,
  };
}

/**
 * The SQL that notes, in the preview database, the fingerprints of the
 * changes it now has and which pull request it follows. Its own schema, which
 * the Data API never shows, and which starting again removes with the rest.
 */
export function recordSql(migrations: readonly Migration[], pullRequest: number): string {
  const rows = migrations.map((one) => `('${one.version}', '${one.sha256}')`).join(', ');
  return [
    'create schema if not exists preview',
    'revoke all on schema preview from public, anon, authenticated',
    'create table if not exists preview.migrations (version text primary key, sha256 text not null)',
    'create table if not exists preview.following (only_one boolean primary key default true check (only_one), pull_request integer not null, since timestamptz not null default now())',
    'delete from preview.migrations',
    ...(rows === '' ? [] : [`insert into preview.migrations (version, sha256) values ${rows}`]),
    `insert into preview.following (pull_request) values (${Math.trunc(pullRequest)}) on conflict (only_one) do update set pull_request = excluded.pull_request, since = case when preview.following.pull_request = excluded.pull_request then preview.following.since else now() end`,
  ].join(';\n');
}

function main() {
  const [command, argument = ''] = process.argv.slice(2);
  const folder = join(import.meta.dirname, '..', 'supabase', 'migrations');
  if (command === 'decide') {
    const has = JSON.parse(argument) as PreviewHas;
    console.log(JSON.stringify(decide(has, migrationsIn(folder))));
    return;
  }
  if (command === 'record' && /^\d+$/.test(argument)) {
    console.log(recordSql(migrationsIn(folder), Number(argument)));
    return;
  }
  console.error('Usage: preview-database.ts decide <json> | record <pull request number>');
  process.exit(2);
}

if (import.meta.main) main();
