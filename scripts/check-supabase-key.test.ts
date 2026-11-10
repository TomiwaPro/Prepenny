// Tests for scripts/check-supabase-key.ts (step 3e-2, D406). Run with `pnpm test` (node --test).
//
// A pretend Supabase Management API on this computer answers as the real one
// does for each key: each call needs the permissions Supabase's own
// description of its API gives it ("x-fga-permissions", read on 9 Nov 2026),
// a call the key lacks one for is refused (403), and anything that would
// change the project is noted, so a test can show nothing was changed.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { checkKey, NEEDED, named, report } from './check-supabase-key.ts';

const REF = 'abcdefghijklmnopqrst';
const PROJECT_NAME = 'prepenny-preview';

/** Supabase's permissions behind each name on its token page. */
const ON_THE_TOKEN_PAGE: Record<string, { read: string; write?: string }> = {
  'Project Settings': { read: 'project_admin_read', write: 'project_admin_write' },
  'Auth Config': { read: 'auth_config_read', write: 'auth_config_write' },
  Database: { read: 'database_read', write: 'database_write' },
  Migrations: { read: 'database_migrations_read', write: 'database_migrations_write' },
  'Edge Functions': { read: 'edge_functions_read', write: 'edge_functions_write' },
  'API Keys': { read: 'api_gateway_keys_read' },
  'API Key Secrets': { read: 'api_gateway_keys_secret_read' },
  'Data API Config': { read: 'data_api_config_read', write: 'data_api_config_write' },
  'Database Config': { read: 'database_config_read', write: 'database_config_write' },
  'Connection Pooling': {
    read: 'database_pooling_config_read',
    write: 'database_pooling_config_write',
  },
  'Storage Config': { read: 'storage_config_read', write: 'storage_config_write' },
};

/** The permissions each call needs, from Supabase's description of its API. */
function needs(method: string, path: string, query: string, body: unknown): string[] | null {
  const base = `/v1/projects/${REF}`;
  const call = `${method} ${path.startsWith(base) ? path.slice(base.length) : path}`;
  switch (call) {
    case 'GET ':
      return ['project_admin_read'];
    case 'PATCH ':
      return ['project_admin_write'];
    case 'GET /config/auth':
      return ['auth_config_read'];
    case 'PATCH /config/auth':
      return ['auth_config_write', 'project_admin_write'];
    case 'POST /database/query':
      return (body as { read_only?: boolean }).read_only === true
        ? ['database_read']
        : ['database_write'];
    case 'POST /database/query/read-only':
      return ['database_read'];
    case 'GET /database/migrations':
      return ['database_migrations_read'];
    case 'GET /functions':
      return ['edge_functions_read'];
    case 'GET /api-keys':
      return query.includes('reveal=true')
        ? ['api_gateway_keys_read', 'api_gateway_keys_secret_read']
        : ['api_gateway_keys_read'];
    case 'GET /postgrest':
      return ['data_api_config_read'];
    case 'GET /config/database/postgres':
      return ['database_config_read'];
    case 'GET /config/database/pooler':
      return ['database_pooling_config_read'];
    case 'GET /config/storage':
      return ['storage_config_read'];
  }
  if (/^DELETE \/config\/auth\/third-party-auth\/[0-9a-f-]+$/.test(call))
    return ['auth_config_write'];
  if (/^PATCH \/database\/migrations\/\d+$/.test(call)) return ['database_migrations_write'];
  if (/^(PATCH|DELETE) \/functions\/[A-Za-z0-9_-]+$/.test(call)) return ['edge_functions_write'];
  return null;
}

/** How the pretend Supabase answers a call it could let through in a weaker way. */
type Behaviour = 'refuses' | 'weaker' | 'brand-new';

interface Pretend {
  readonly url: string;
  /** Every call made, as "METHOD path". */
  readonly calls: string[];
  /** Anything that would have changed the project. */
  readonly changes: string[];
  give(token: string, permissions: readonly string[]): void;
  answerEverythingWith(status: number | null): void;
  /**
   * "refuses": a call without its permission is refused (403), as the
   * description reads. "weaker": a query is run read-only and the secret keys
   * hidden, instead of refusing. "brand-new": a project with no database
   * changes yet, whose list of them fails (500).
   */
  behave(behaviour: Behaviour): void;
}

let server: Server;
let pretend: Pretend;

before(async () => {
  const keys = new Map<string, Set<string>>();
  const calls: string[] = [];
  const changes: string[] = [];
  let forced: number | null = null;
  let behaviour: Behaviour = 'refuses';
  server = createServer((request, response) => {
    let text = '';
    request.on('data', (chunk) => {
      text += chunk;
    });
    request.on('end', () => {
      const [path = '', query = ''] = (request.url ?? '').split('?');
      const method = request.method ?? 'GET';
      calls.push(`${method} ${path}${query === '' ? '' : `?${query}`}`);
      const body: unknown = text === '' ? {} : JSON.parse(text);
      const send = (status: number, value: unknown = {}) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(value));
      };
      if (forced !== null) return send(forced);
      const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
      const granted = keys.get(token);
      if (granted === undefined) return send(401, { message: 'Unauthorized' });
      if (!path.startsWith(`/v1/projects/${REF}`)) return send(404, { message: 'Not found' });
      const needed = needs(method, path, query, body);
      if (needed === null) {
        changes.push(`an unknown call: ${method} ${path}`);
        return send(404);
      }
      const call = path.slice(`/v1/projects/${REF}`.length);
      const sql = (body as { query?: unknown }).query;
      if (
        behaviour === 'weaker' &&
        method === 'POST' &&
        call === '/database/query' &&
        granted.has('database_read') &&
        !granted.has('database_write')
      ) {
        // Run read-only rather than refused: making a table fails.
        if (typeof sql === 'string' && sql.startsWith('create')) {
          return send(400, { message: 'cannot execute CREATE TABLE in a read-only transaction' });
        }
      } else if (
        behaviour === 'weaker' &&
        call === '/api-keys' &&
        granted.has('api_gateway_keys_read') &&
        !granted.has('api_gateway_keys_secret_read')
      ) {
        // Secret keys hidden rather than refused.
        return send(200, [{ type: 'secret', name: 'default', api_key: 'sb_secret_Qxyz····' }]);
      } else if (!needed.every((one) => granted.has(one))) {
        return send(403, { message: 'Forbidden' });
      }
      if (behaviour === 'brand-new' && call.startsWith('/database/migrations')) {
        return send(500, { message: 'the list of database changes does not exist yet' });
      }
      if (method === 'GET' && call === '') return send(200, { ref: REF, name: PROJECT_NAME });
      if (method === 'PATCH' && call === '') {
        if ((body as { name?: unknown }).name !== PROJECT_NAME) changes.push('the project renamed');
        return send(200, { ref: REF, name: PROJECT_NAME });
      }
      // Nothing with these ids exists: Supabase says so, and nothing changes.
      if (method === 'DELETE' || (method === 'PATCH' && call !== ''))
        return send(404, { message: 'Not found' });
      if (method === 'POST' && call.startsWith('/database/query')) {
        // A table made "on commit drop" is gone when its query ends.
        if (
          sql !== 'select 1' &&
          !/^create temporary table \w+ \(.*\) on commit drop$/.test(String(sql))
        ) {
          changes.push(`a query: ${text}`);
        }
        return send(201, []);
      }
      if (call === '/api-keys') {
        return send(200, [
          { type: 'publishable', name: 'default', api_key: 'sb_publishable_abcdefghijklmnop' },
          {
            type: 'secret',
            name: 'default',
            api_key: query.includes('reveal')
              ? `sb_secret_${'Q'.repeat(32)}`
              : 'sb_secret_Qxyz····',
          },
        ]);
      }
      return send(200, {});
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address !== null && typeof address === 'object');
  pretend = {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    changes,
    give: (token, permissions) => keys.set(token, new Set(permissions)),
    answerEverythingWith: (status) => {
      forced = status;
    },
    behave: (chosen) => {
      behaviour = chosen;
    },
  };
});

after(() => server.close());

/** A key with these permissions from the token page, as "Database: Read-write" or "API Keys: Read". */
function keyWith(token: string, chosen: readonly string[]): string {
  const permissions: string[] = [];
  for (const choice of chosen) {
    const [name = '', level = ''] = choice.split(': ');
    const ids = ON_THE_TOKEN_PAGE[name];
    assert(ids !== undefined, choice);
    permissions.push(ids.read);
    if (level === 'Read-write' && ids.write !== undefined) permissions.push(ids.write);
  }
  pretend.give(token, permissions);
  return token;
}

const EVERY = NEEDED.map(named);
const check = (token: string) => checkKey({ token, ref: REF, apiUrl: pretend.url, pauseMs: 1 });

describe('The Supabase key check', () => {
  it('lists the permissions as Supabase\'s token page names them, as README.md, "The database", step 5 does', () => {
    assert.deepEqual(EVERY, [
      'Project Settings: Read-write',
      'Auth Config: Read-write',
      'Database: Read-write',
      'Migrations: Read-write',
      'Edge Functions: Read-write',
      'API Keys: Read',
      'API Key Secrets: Read',
      'Data API Config: Read',
      'Database Config: Read',
      'Connection Pooling: Read',
      'Storage Config: Read',
    ]);
  });

  it('passes a key with every permission, and changes nothing', async () => {
    const before = pretend.calls.length;
    const result = await check(keyWith('sbp_every', EVERY));
    assert.deepEqual(result, { kind: 'ok' });
    assert.deepEqual(pretend.changes, []);
    // Every permission was tried, writes too.
    const made = pretend.calls.slice(before);
    assert.equal(made.length, 16);
    assert(made.includes(`PATCH /v1/projects/${REF}`));
    assert(made.includes(`GET /v1/projects/${REF}/api-keys?reveal=true`));
  });

  it('stops a key missing two permissions with one message listing both, and nothing changed', async () => {
    // "Migrations: Read" where it needs Read-write, and no "Edge Functions" at all.
    const token = keyWith(
      'sbp_missing_two',
      EVERY.filter((one) => one !== 'Edge Functions: Read-write').map((one) =>
        one === 'Migrations: Read-write' ? 'Migrations: Read' : one,
      ),
    );
    const result = await check(token);
    assert.deepEqual(result, {
      kind: 'missing',
      missing: [
        { name: 'Migrations', level: 'Read-write' },
        { name: 'Edge Functions', level: 'Read-write' },
      ],
    });
    assert.deepEqual(pretend.changes, []);
    const words = report(result, 'PREVIEW_SUPABASE_ACCESS_TOKEN', 'prepenny-preview');
    assert.equal(
      words,
      "Nothing was changed. GitHub's Supabase key (PREVIEW_SUPABASE_ACCESS_TOKEN) is missing 2 permissions this run needs: Migrations: Read-write, Edge Functions: Read-write. On Supabase's token page, make a new key with every permission in README.md, \"The database\", step 5, on the prepenny-preview project, and replace PREVIEW_SUPABASE_ACCESS_TOKEN in GitHub's secrets with it. Then run this again.",
    );
  });

  it('finds two others missing, a write and a read: Project Settings: Read only, and no API Key Secrets', async () => {
    const token = keyWith(
      'sbp_missing_two_more',
      EVERY.filter((one) => one !== 'API Key Secrets: Read').map((one) =>
        one === 'Project Settings: Read-write' ? 'Project Settings: Read' : one,
      ),
    );
    const result = await check(token);
    assert.deepEqual(result, {
      kind: 'missing',
      missing: [
        { name: 'Project Settings', level: 'Read-write' },
        { name: 'API Key Secrets', level: 'Read' },
      ],
    });
    assert.deepEqual(pretend.changes, []);
  });

  it('finds every one missing on a key with none', async () => {
    const result = await check(keyWith('sbp_none', []));
    assert.equal(result.kind, 'missing');
    assert.deepEqual(result.kind === 'missing' ? result.missing.map(named) : [], EVERY);
    assert.deepEqual(pretend.changes, []);
  });

  it("says plainly when Supabase doesn't accept the key, or the project isn't there", async () => {
    assert.deepEqual(await check('sbp_unknown'), { kind: 'not-accepted' });
    assert.deepEqual(
      await checkKey({
        token: keyWith('sbp_other', EVERY),
        ref: 'zzzzzzzzzzzzzzzzzzzz',
        apiUrl: pretend.url,
      }),
      { kind: 'no-project' },
    );
  });

  it("says nothing is missing when Supabase doesn't answer clearly", async () => {
    pretend.answerEverythingWith(503);
    try {
      assert.deepEqual(await check(keyWith('sbp_busy', EVERY)), { kind: 'no-answer', status: 503 });
    } finally {
      pretend.answerEverythingWith(null);
    }
  });

  it("isn't fooled when Supabase runs a query read-only, or hides the secret keys, instead of refusing", async () => {
    pretend.behave('weaker');
    try {
      const token = keyWith(
        'sbp_weaker',
        EVERY.filter((one) => one !== 'API Key Secrets: Read').map((one) =>
          one === 'Database: Read-write' ? 'Database: Read' : one,
        ),
      );
      assert.deepEqual(await check(token), {
        kind: 'missing',
        missing: [
          { name: 'Database', level: 'Read-write' },
          { name: 'API Key Secrets', level: 'Read' },
        ],
      });
      assert.deepEqual(await check(keyWith('sbp_weaker_every', EVERY)), { kind: 'ok' });
      assert.deepEqual(pretend.changes, []);
    } finally {
      pretend.behave('refuses');
    }
  });

  it('passes a key with every permission on a brand-new project, whose list of database changes fails', async () => {
    pretend.behave('brand-new');
    try {
      assert.deepEqual(await check(keyWith('sbp_new', EVERY)), { kind: 'ok' });
      // A refusal is still a refusal.
      const token = keyWith(
        'sbp_new_missing',
        EVERY.map((one) => (one === 'Migrations: Read-write' ? 'Migrations: Read' : one)),
      );
      assert.deepEqual(await check(token), {
        kind: 'missing',
        missing: [{ name: 'Migrations', level: 'Read-write' }],
      });
    } finally {
      pretend.behave('refuses');
    }
  });

  it('stops before trying anything that writes on a project with the wrong name', async () => {
    const before = pretend.calls.length;
    const result = await checkKey({
      token: keyWith('sbp_wrong_project', EVERY),
      ref: REF,
      apiUrl: pretend.url,
      expectName: 'prepenny',
    });
    assert.deepEqual(result, { kind: 'wrong-project', name: PROJECT_NAME });
    assert.deepEqual(pretend.calls.slice(before), [`GET /v1/projects/${REF}`]);
    assert.equal(
      report(result, 'PREVIEW_SUPABASE_ACCESS_TOKEN', 'prepenny'),
      'Nothing was changed. The project with this Project ID is called "prepenny-preview", not prepenny, so nothing more was tried on it. Put the prepenny project\'s Project ID in GitHub\'s secrets.',
    );
  });

  it("as a command: says what's missing, fails the step, and never prints the key", async () => {
    const token = keyWith(
      'sbp_SECRET_never_printed',
      EVERY.filter((one) => one !== 'Database: Read-write' && one !== 'Storage Config: Read'),
    );
    const run = promisify(execFile)(
      process.execPath,
      [join(import.meta.dirname, 'check-supabase-key.ts')],
      {
        env: {
          ...process.env,
          SUPABASE_ACCESS_TOKEN: token,
          SUPABASE_PROJECT_REF: REF,
          SUPABASE_API_URL: pretend.url,
          KEY_NAME: 'PREVIEW_SUPABASE_ACCESS_TOKEN',
          PROJECT_NAME: 'prepenny-preview',
          EXPECT_PROJECT_NAME: 'prepenny-preview',
          README_PART: '"The preview database", steps 6 to 8',
        },
      },
    );
    await assert.rejects(run, (error: { code?: number; stdout?: string; stderr?: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout ?? '', /^::error title=Supabase key::Nothing was changed\./);
      assert.match(
        error.stdout ?? '',
        /missing 2 permissions this run needs: Database: Read-write, Storage Config: Read\./,
      );
      assert.match(
        error.stdout ?? '',
        /README\.md, "The preview database", steps 6 to 8, on the prepenny-preview project/,
      );
      assert.doesNotMatch(`${error.stdout}${error.stderr}`, /SECRET|sb_secret/);
      return true;
    });
    assert.deepEqual(pretend.changes, []);
  });
});
