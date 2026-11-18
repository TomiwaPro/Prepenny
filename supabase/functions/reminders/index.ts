// PrePenny's reminders (step 4e, brief 4.11, D560 to D566).
//
// Started every 15 minutes by the database's scheduled job, with the tick
// only the database knows (supabase/migrations, 20261120100000_reminders.sql).
// The work itself is apps/web/server/reminders.ts, built into ./_built/run.js
// by apps/web/scripts/build-reminders.ts: it reads each due person's plan
// exactly as their own phone reads it, works out their reminders with the
// app's own engine and words, and sends each, sealed for that phone alone,
// to its push service.
//
// It holds no key of its own: Supabase gives every function the project's
// secret key, used only for the database's steps, and PrePenny's signing
// key is kept in Supabase's Vault. Nothing is written to the function's
// log, and an error never carries words: only counts come back.

import { runReminders } from './_built/run.js';

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
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** A step the database refused: its status only, never its words. */
class Refused extends Error {
  constructor(readonly status: number) {
    super('refused');
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return answer(405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = secretKey();
  if (url === undefined || key === null) return answer(503);
  const tick = request.headers.get('x-prepenny-tick') ?? '';
  // A test clock and a test's own person, which the database takes only on a local Supabase.
  const at = request.headers.get('x-prepenny-test-now');
  const testPerson = request.headers.get('x-prepenny-test-person');

  // A new secret key goes in "apikey" only, as Supabase asks; the older
  // service key, a token itself, goes in both.
  const headers: Record<string, string> = {
    apikey: key,
    ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
    'Content-Type': 'application/json',
  };
  const step = async (name: string, args: Readonly<Record<string, unknown>>) => {
    const done = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tick, ...args }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!done.ok) {
      await done.body?.cancel();
      throw new Refused(done.status);
    }
    // A step that gives nothing back answers with nothing at all (204).
    const text = await done.text();
    return text === '' ? null : JSON.parse(text);
  };
  const push = async (
    endpoint: string,
    pushHeaders: Readonly<Record<string, string>>,
    body: Uint8Array<ArrayBuffer>,
  ) => {
    try {
      const sent = await fetch(endpoint, {
        method: 'POST',
        headers: pushHeaders,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
      await sent.body?.cancel();
      return sent.status;
    } catch {
      return 0;
    }
  };

  const work = runReminders(
    { step, push, seconds: () => Date.now() / 1000 },
    at === null || at === '' ? null : at,
    testPerson === null || testPerson === '' ? null : testPerson,
  );
  // The scheduled job doesn't wait; the end-to-end tests do, to check what was sent.
  if (request.headers.get('x-prepenny-wait') === 'yes') {
    try {
      return answer(200, await work);
    } catch (error) {
      return answer(error instanceof Refused && error.status < 500 ? 403 : 503);
    }
  }
  // @ts-expect-error: EdgeRuntime is Supabase's own, in its function runner only.
  EdgeRuntime.waitUntil(work.catch(() => undefined));
  return answer(202);
});
