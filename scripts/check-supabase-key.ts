// Checks GitHub's Supabase key has every permission a run of the Database
// workflow, or of a preview's database, needs, before anything is changed
// (step 3e-2, D406). Missing any, it stops with one message listing all of
// them, as Supabase's token page names them, such as "Database: Read-write".
//
// Supabase has no way to ask a key what it may do, so each permission is
// tried with a call that needs it and changes nothing: a read, a write that
// sets a value to what it is already, a table that lasts only for its own
// query, or a change to something that can't exist, which Supabase answers
// "not found" only once the key may make it. Where Supabase might let a call
// through without the permission and answer in a weaker way, the answer
// itself must show the permission: the table made, the secret keys revealed.
// Which call needs which permission is from Supabase's own description of its
// API (its "x-fga-permissions"), read on 9 Nov 2026 from
// github.com/supabase/supabase, apps/docs/spec/api_v1_openapi.json.
//
// Usage: SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abcdefghijklmnopqrst \
//   KEY_NAME=SUPABASE_ACCESS_TOKEN PROJECT_NAME=prepenny node scripts/check-supabase-key.ts
// For the preview's key, also EXPECT_PROJECT_NAME=prepenny-preview, so it
// stops before anything that writes on a project with another name, and
// README_PART, where README.md lists its permissions.
// The key is never printed, and nor is anything Supabase answers.

/** How Supabase's token page names a permission, and the level a run needs. */
export interface Permission {
  readonly name: string;
  readonly level: 'Read' | 'Read-write';
}

/** One call that needs a permission, and changes nothing. */
interface Probe {
  readonly permission: string;
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** After /v1/projects/{ref}. */
  readonly path: string;
  /** The body, worked out from what the project's own GET gave, when it needs it. */
  readonly body?: (project: { readonly name?: unknown }) => unknown;
  /** True for a write: "write" is checked only once "read" has passed. */
  readonly write?: true;
  /** Needs another permission too: checked only when that one has passed. */
  readonly alsoNeeds?: string;
  /**
   * Allowed only when the answer shows it, not just when it isn't refused:
   * Supabase may answer a call it lets through without the permission in a
   * weaker way (D406).
   */
  readonly shows?: (status: number, answer: unknown) => boolean;
  /**
   * Any answer but a refusal counts as allowed: on a brand-new project the
   * list of database changes may not exist yet, and Supabase can fail asking
   * for it.
   */
  readonly anyAnswer?: true;
}

/** A secret key, revealed in full: Supabase's newer kind, or its older one. */
function hasRevealedSecret(answer: unknown): boolean {
  if (!Array.isArray(answer)) return false;
  return answer.some(
    (key: { readonly type?: unknown; readonly name?: unknown; readonly api_key?: unknown }) => {
      const value = typeof key.api_key === 'string' ? key.api_key : '';
      return (
        (key.type === 'secret' && /^sb_secret_[A-Za-z0-9_-]{16,}$/.test(value)) ||
        (key.name === 'service_role' && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(value))
      );
    },
  );
}

/**
 * Every permission a run needs, as Supabase's token page names them on
 * 9 Nov 2026, in the order it lists them (README.md, "The database", step 5).
 */
export const NEEDED: readonly Permission[] = [
  { name: 'Project Settings', level: 'Read-write' },
  { name: 'Auth Config', level: 'Read-write' },
  { name: 'Database', level: 'Read-write' },
  { name: 'Migrations', level: 'Read-write' },
  { name: 'Edge Functions', level: 'Read-write' },
  { name: 'API Keys', level: 'Read' },
  { name: 'API Key Secrets', level: 'Read' },
  { name: 'Data API Config', level: 'Read' },
  { name: 'Database Config', level: 'Read' },
  { name: 'Connection Pooling', level: 'Read' },
  { name: 'Storage Config', level: 'Read' },
];

/** The id Supabase never gives anything, so a change to it can't touch a thing. */
const NOTHING = '00000000-0000-0000-0000-000000000000';

const PROBES: readonly Probe[] = [
  // project_admin_read, then project_admin_write: the project's name set to what it is.
  { permission: 'Project Settings', method: 'GET', path: '' },
  {
    permission: 'Project Settings',
    method: 'PATCH',
    path: '',
    write: true,
    body: (project) => ({ name: project.name }),
  },
  // auth_config_read, then auth_config_write: removing a sign-in provider that can't exist.
  { permission: 'Auth Config', method: 'GET', path: '/config/auth' },
  {
    permission: 'Auth Config',
    method: 'DELETE',
    path: `/config/auth/third-party-auth/${NOTHING}`,
    write: true,
  },
  // database_read, then database_write: "select 1" read-only, then a table that
  // lasts only for this one query, which a read-only query can't make.
  {
    permission: 'Database',
    method: 'POST',
    path: '/database/query/read-only',
    body: () => ({ query: 'select 1' }),
  },
  {
    permission: 'Database',
    method: 'POST',
    path: '/database/query',
    write: true,
    body: () => ({
      query: 'create temporary table prepenny_key_check (checked boolean) on commit drop',
    }),
    shows: (status) => status >= 200 && status < 300,
  },
  // database_migrations_read, then database_migrations_write: nothing changed on a migration that can't exist.
  { permission: 'Migrations', method: 'GET', path: '/database/migrations', anyAnswer: true },
  {
    permission: 'Migrations',
    method: 'PATCH',
    path: '/database/migrations/19700101000000',
    write: true,
    body: () => ({}),
    anyAnswer: true,
  },
  // edge_functions_read, then edge_functions_write: nothing changed on a function that can't exist.
  { permission: 'Edge Functions', method: 'GET', path: '/functions' },
  {
    permission: 'Edge Functions',
    method: 'PATCH',
    path: '/functions/prepenny-key-check-never-made',
    write: true,
    body: () => ({}),
  },
  // api_gateway_keys_read, then with api_gateway_keys_secret_read: the keys, revealed, never kept.
  { permission: 'API Keys', method: 'GET', path: '/api-keys' },
  {
    permission: 'API Key Secrets',
    method: 'GET',
    path: '/api-keys?reveal=true',
    alsoNeeds: 'API Keys',
    shows: (status, answer) => status >= 200 && status < 300 && hasRevealedSecret(answer),
  },
  // data_api_config_read, database_config_read, database_pooling_config_read, storage_config_read.
  { permission: 'Data API Config', method: 'GET', path: '/postgrest' },
  { permission: 'Database Config', method: 'GET', path: '/config/database/postgres' },
  { permission: 'Connection Pooling', method: 'GET', path: '/config/database/pooler' },
  { permission: 'Storage Config', method: 'GET', path: '/config/storage' },
];

export type KeyCheck =
  | { readonly kind: 'ok' }
  /** Missing permissions, in the token page's order, each at the level a run needs. */
  | { readonly kind: 'missing'; readonly missing: readonly Permission[] }
  /** Supabase doesn't accept the key at all: run out, deleted or mistyped. */
  | { readonly kind: 'not-accepted' }
  /** No project with this Project ID that the key can reach. */
  | { readonly kind: 'no-project' }
  /** The project isn't the one this run is for: nothing more is tried on it. */
  | { readonly kind: 'wrong-project'; readonly name: string }
  /** Supabase didn't answer clearly, so nothing can be said: try again. */
  | { readonly kind: 'no-answer'; readonly status: number };

interface Options {
  readonly token: string;
  readonly ref: string;
  /** Supabase's Management API, or a pretend one in the tests. */
  readonly apiUrl?: string;
  readonly send?: typeof fetch;
  /** How long to wait before asking again after "too many requests". */
  readonly pauseMs?: number;
  /**
   * The name the project must have, read first: any other, and the check
   * stops before trying anything that writes (the preview's, D405).
   */
  readonly expectName?: string;
}

/** Tries every permission, changing nothing, and says what's missing. */
export async function checkKey(options: Options): Promise<KeyCheck> {
  const apiUrl = options.apiUrl ?? 'https://api.supabase.com';
  const send = options.send ?? fetch;
  const pauseMs = options.pauseMs ?? 5000;
  const missing = new Set<string>();
  let project: { readonly name?: unknown } = {};

  for (const probe of PROBES) {
    // A write is tried only once its read has passed: without the read, the
    // permission is missing already. "API Key Secrets" can only be tried with
    // "API Keys", so without that it's listed too: they go together.
    if (probe.write === true && missing.has(probe.permission)) continue;
    if (probe.alsoNeeds !== undefined && missing.has(probe.alsoNeeds)) {
      missing.add(probe.permission);
      continue;
    }
    let status = 0;
    let answer: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        answer = await send(`${apiUrl}/v1/projects/${options.ref}${probe.path}`, {
          method: probe.method,
          headers: {
            Authorization: `Bearer ${options.token}`,
            ...(probe.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(probe.body === undefined ? {} : { body: JSON.stringify(probe.body(project)) }),
          signal: AbortSignal.timeout(30_000),
        });
        status = answer.status;
      } catch {
        status = 0;
      }
      if (status !== 429) break;
      await new Promise((resolve) => setTimeout(resolve, pauseMs * (attempt + 1)));
    }
    if (status === 401) return { kind: 'not-accepted' };
    if (probe.method === 'GET' && probe.path === '') {
      if (status === 404) return { kind: 'no-project' };
      if (status >= 200 && status < 300 && answer !== null) {
        project = (await answer.json().catch(() => ({}))) as { readonly name?: unknown };
        // Without the name, the next call couldn't set it to what it is.
        if (typeof project.name !== 'string') return { kind: 'no-answer', status };
        if (options.expectName !== undefined && project.name !== options.expectName) {
          return { kind: 'wrong-project', name: project.name };
        }
      }
    }
    let shown: unknown = null;
    if (probe.shows !== undefined && answer !== null && status >= 200 && status < 300) {
      // Read only to see its shape: nothing Supabase answers is kept or printed.
      shown = await answer.json().catch(() => null);
    } else if (!(probe.method === 'GET' && probe.path === '')) {
      await answer?.body?.cancel().catch(() => undefined);
    }
    if (status === 403) missing.add(probe.permission);
    else if (status === 0 || status === 429) return { kind: 'no-answer', status };
    else if (probe.shows !== undefined) {
      if (status >= 500) return { kind: 'no-answer', status };
      if (!probe.shows(status, shown)) missing.add(probe.permission);
    }
    // "Not found" for something that can't exist means the key may change it;
    // anything else but a refusal or a failure means the call was allowed.
    else if (status >= 500 && probe.anyAnswer !== true) return { kind: 'no-answer', status };
  }
  if (missing.size === 0) return { kind: 'ok' };
  return { kind: 'missing', missing: NEEDED.filter((one) => missing.has(one.name)) };
}

/** A permission as Supabase's token page shows it: "Database: Read-write". */
export const named = (permission: Permission) => `${permission.name}: ${permission.level}`;

/** What the run says, in plain words, with what to do. */
export function report(
  check: KeyCheck,
  keyName: string,
  projectName: string,
  /** Where README.md says which permissions to give the key. */
  where = '"The database", step 5',
): string {
  const fix = `make a new key with every permission in README.md, ${where}, on the ${projectName} project, and replace ${keyName} in GitHub's secrets with it. Then run this again.`;
  switch (check.kind) {
    case 'ok':
      return `GitHub's Supabase key (${keyName}) has every permission this run needs: ${NEEDED.map(named).join(', ')}.`;
    case 'missing': {
      const count =
        check.missing.length === 1 ? '1 permission' : `${check.missing.length} permissions`;
      return `Nothing was changed. GitHub's Supabase key (${keyName}) is missing ${count} this run needs: ${check.missing.map(named).join(', ')}. On Supabase's token page, ${fix}`;
    }
    case 'not-accepted':
      return `Nothing was changed. Supabase doesn't accept GitHub's Supabase key (${keyName}): it may have run out or been deleted. On Supabase's token page, ${fix}`;
    case 'no-project':
      return `Nothing was changed. Supabase can't find the ${projectName} project with this key: check the Project ID in GitHub's secrets, and that the key was made for the ${projectName} project.`;
    case 'wrong-project':
      return `Nothing was changed. The project with this Project ID is called "${check.name}", not ${projectName}, so nothing more was tried on it. Put the ${projectName} project's Project ID in GitHub's secrets.`;
    case 'no-answer':
      return `Nothing was changed. Supabase didn't answer the check of its key clearly (${check.status === 0 ? 'no answer' : `it answered ${check.status}`}). Run this again in a few minutes. On the free plan, a project that hasn't been used for a week is paused: restore it on supabase.com first.`;
  }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
  const ref = process.env.SUPABASE_PROJECT_REF ?? '';
  const keyName = process.env.KEY_NAME ?? 'SUPABASE_ACCESS_TOKEN';
  const projectName = process.env.PROJECT_NAME ?? 'prepenny';
  const where = process.env.README_PART;
  // Only a preview's check insists on the name: the real project's is whatever the owner chose.
  const expectName = process.env.EXPECT_PROJECT_NAME;
  if (token === '' || !/^[a-z]{20}$/.test(ref)) {
    console.log(
      `::error title=Supabase key::The key or the Project ID for the ${projectName} project isn't in GitHub's secrets. Nothing was changed.`,
    );
    process.exit(1);
  }
  const check = await checkKey({
    token,
    ref,
    ...(process.env.SUPABASE_API_URL === undefined ? {} : { apiUrl: process.env.SUPABASE_API_URL }),
    ...(expectName === undefined || expectName === '' ? {} : { expectName }),
  });
  const words = report(check, keyName, projectName, where);
  if (check.kind === 'ok') {
    console.log(words);
    return;
  }
  console.log(`::error title=Supabase key::${words}`);
  process.exit(1);
}

if (import.meta.main) await main();
