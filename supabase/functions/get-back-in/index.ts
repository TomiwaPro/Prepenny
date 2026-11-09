// Getting back in with a backup email (brief 4.13, step 3e hardening).
//
// The phone sends the backup email address and the 6-digit code sent to it.
// The database decides what the code does (supabase/migrations,
// 20261111100000_safer_recovery.sql, get_back_in_with_code): nothing for a
// wrong code, an address that's nobody's backup or a locked one, all alike;
// start the 24-hour wait; say when it can be finished; or, with a fresh code
// after 24 hours, finish. Only then does this function make the backup the
// address the account signs in with, through Supabase's own admin route
// (PUT /auth/v1/admin/users/{id}), which checks the address isn't anyone
// else's, keeps the email sign-in in step and notes the change in
// Supabase's own log. Then the database signs every device out, uses the
// backup up and tells the old address.
//
// It holds no key of its own: Supabase gives every function the project's
// secret key, and it's used only here, never sent back. Nothing is written
// to the function's log, so no address or code ever is (CLAUDE.md).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-prepenny-version',
  'Access-Control-Max-Age': '86400',
};

/** The refusals the phone has words for; anything else is "server". */
const KNOWN = new Set(['update-needed', 'server-behind', 'email-off']);

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

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

interface Finish {
  readonly in: true;
  readonly state: 'finish';
  readonly request: string;
  readonly person: string;
  readonly email: string;
  readonly in_the_way: string | null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return answer(405, { problem: 'server' });

  const url = Deno.env.get('SUPABASE_URL');
  const key = secretKey();
  if (url === undefined || key === null) return answer(503, { problem: 'server' });

  let email: unknown;
  let code: unknown;
  try {
    const text = await request.text();
    if (text.length > 1000) return answer(400, { problem: 'bad-email' });
    ({ email, code } = JSON.parse(text) as { email?: unknown; code?: unknown });
  } catch {
    return answer(400, { problem: 'bad-email' });
  }
  if (typeof email !== 'string' || typeof code !== 'string') {
    return answer(400, { problem: 'bad-email' });
  }

  // The version of the database the phone was built for goes on to the
  // database, which checks it as for every other request (step 3e).
  const version = request.headers.get('x-prepenny-version') ?? '';
  // A new secret key goes in "apikey" only, as Supabase asks; the older
  // service key, a token itself, goes in both.
  const headers: Record<string, string> = {
    apikey: key,
    ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
    'Content-Type': 'application/json',
    'x-prepenny-version': version,
  };
  const rpc = (name: string, args: Record<string, unknown>) =>
    fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });

  try {
    const checked = await rpc('get_back_in_with_code', { email, code });
    if (!checked.ok) {
      const refusal = (await checked.json().catch(() => ({}))) as { message?: unknown };
      const problem =
        typeof refusal.message === 'string' && KNOWN.has(refusal.message) ? refusal.message : 'server';
      return answer(problem === 'server' ? 503 : 409, { problem });
    }
    const found = (await checked.json()) as { in: boolean; state?: string } | Finish;
    if (found.state !== 'finish') return answer(200, found);

    const finish = found as Finish;
    const admin = (path: string, method: string, body?: unknown) =>
      fetch(`${url}/auth/v1/admin/users/${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    // A sign-up with the backup address that was never confirmed holds
    // nothing, and is in the way: Supabase's admin route removes it.
    if (finish.in_the_way !== null) {
      const removed = await admin(encodeURIComponent(finish.in_the_way), 'DELETE');
      if (!removed.ok && removed.status !== 404) {
        await rpc('get_back_in_not_finished', { request: finish.request });
        return answer(503, { problem: 'server' });
      }
    }
    // The backup becomes the address the account signs in with, confirmed,
    // as the code from its inbox shows it's theirs.
    const changed = await admin(encodeURIComponent(finish.person), 'PUT', {
      email: finish.email,
      email_confirm: true,
    });
    if (!changed.ok) {
      // Taken by another account since the database looked: Supabase's
      // admin route refuses it (its database says "23505").
      const refusal = (await changed.json().catch(() => ({}))) as { code?: unknown };
      const inUse = changed.status === 422 || refusal.code === '23505';
      await rpc('get_back_in_not_finished', { request: finish.request });
      return answer(inUse ? 409 : 503, { problem: inUse ? 'in-use' : 'server' });
    }
    // Every device signed out, the backup used up and the old address told.
    // Tried twice, as the change above is made already: on the second try,
    // "nothing to do" means the first did it and its answer was lost.
    for (let tries = 0; tries < 2; tries += 1) {
      try {
        const done = await rpc('get_back_in_finished', { request: finish.request });
        const said = (await done.json()) as { done?: unknown };
        if (done.ok && (said.done === true || tries > 0)) {
          return answer(200, { in: true, state: 'finished' });
        }
      } catch {
        // Tried again below.
      }
    }
    return answer(503, { problem: 'server' });
  } catch {
    return answer(503, { problem: 'server' });
  }
});
