// PrePenny's status (step 4k, brief 4.16, D644).
//
// Answers whether the app, signing in, saving changes and reminders are
// working, for PrePenny's status page at UptimeRobot, which asks every 5
// minutes, one part at a time (?part=sign-in: 200 working, 503 not), and for
// the support dashboard, which asks for every part at once.
//
// Anyone can ask, with no sign-in, as the status page is for everyone: the
// answer is four words' worth, working or not, and nothing it checks uses
// anyone's account or data. Saving changes is checked by saving the time of
// the check, in a row of its own (supabase/migrations,
// 20261125200000_service_status.sql). Nothing is written to the log.
//
// The rules are in ./checks.ts, tested with Node (scripts/status-function.test.ts).

import {
  type DatabaseAnswer,
  everyPart,
  functionAnswers,
  HEADERS,
  isVersion,
  onePart,
  type Part,
  partAsked,
  readDatabaseAnswer,
  type Working,
} from './checks.ts';

/** How long each check waits for an answer, well inside UptimeRobot's own wait. */
const CHECK_WITHIN_MS = 8_000;

/** The project's secret key: one of the new keys if there are any, or the older service key. */
function secretKey(): string | null {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys !== undefined && keys !== '') {
    try {
      const parsed = JSON.parse(keys) as Record<string, unknown>;
      const first = parsed.default ?? Object.values(parsed)[0];
      if (typeof first === 'string' && first !== '') return first;
    } catch {
      // Not as expected: the older key below.
    }
  }
  const older = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return older === undefined || older === '' ? null : older;
}

const answer = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: HEADERS });

/** A request with a time limit: its answer, or null when there was none in time. */
async function ask(address: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(address, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(CHECK_WITHIN_MS),
    });
  } catch {
    return null;
  }
}

async function readJson(response: Response | null): Promise<unknown> {
  if (response === null) return null;
  try {
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    if (!response.bodyUsed) await response.body?.cancel();
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...HEADERS, 'Access-Control-Allow-Methods': 'GET, HEAD' },
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return answer(405);
  const part = partAsked(new URL(request.url).search);
  if (part === undefined) return answer(404, { parts: ['app', 'sign-in', 'saving', 'reminders'] });
  const url = Deno.env.get('SUPABASE_URL');
  const key = secretKey();
  if (url === undefined || key === null) {
    return part === null ? answer(503) : answer(503, { part, working: false });
  }
  // A new secret key goes in "apikey" only, as Supabase asks; the older
  // service key, a token itself, goes in both.
  const headers: Record<string, string> = {
    apikey: key,
    ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
  };
  const wanted = (one: Part) => part === null || part === one;

  // The database's own answer, needed for saving, reminders and the app's address.
  const database: Promise<DatabaseAnswer | null> =
    wanted('saving') || wanted('reminders') || wanted('app')
      ? ask(`${url}/rest/v1/rpc/service_status`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: '{}',
        })
          .then(readJson)
          .then(readDatabaseAnswer)
      : Promise.resolve(null);

  const checks: Record<Part, () => Promise<boolean>> = {
    'sign-in': async () => {
      const health = await ask(`${url}/auth/v1/health`, { headers });
      await health?.body?.cancel();
      return health?.ok === true;
    },
    saving: async () => (await database)?.saving === true,
    reminders: async () => {
      const [db, look] = await Promise.all([database, ask(`${url}/functions/v1/reminders`)]);
      await look?.body?.cancel();
      return db?.remindersJob === true && functionAnswers(look?.status ?? null);
    },
    app: async () => {
      const site = (await database)?.site ?? null;
      if (site === null) return false;
      return isVersion(await readJson(await ask(`${site}/version.json`, { cache: 'no-store' })));
    },
  };

  if (part !== null) {
    const done = onePart(part, await checks[part]());
    return answer(done.status, request.method === 'HEAD' ? undefined : done.body);
  }
  const [app, signIn, saving, reminders] = await Promise.all([
    checks.app(),
    checks['sign-in'](),
    checks.saving(),
    checks.reminders(),
  ]);
  const working: Working = { app, 'sign-in': signIn, saving, reminders };
  const done = everyPart(working, new Date().toISOString());
  return answer(done.status, request.method === 'HEAD' ? undefined : done.body);
});
