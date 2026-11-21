// What PrePenny's status function decides (step 4k, D644), kept apart from
// Deno, so the same rules are tested with Node (scripts/status-function.test.ts).
//
// Four parts, each working or not, worked out from answers the function gets,
// never from anyone's account or data:
// - the app: PrePenny's own site answers /version.json with a version;
// - signing in: Supabase's sign-in service says it's healthy;
// - saving changes: the database takes a change now (public.service_status);
// - reminders: the scheduled job that starts them ran well in the last 5
//   minutes, and the reminders function itself answers.

export const PARTS = ['app', 'sign-in', 'saving', 'reminders'] as const;
export type Part = (typeof PARTS)[number];

/** A part named in the address (?part=sign-in), or null for every part; undefined for a name that isn't one. */
export function partAsked(search: string): Part | null | undefined {
  const named = new URLSearchParams(search).get('part');
  if (named === null || named === '') return null;
  return (PARTS as readonly string[]).includes(named) ? (named as Part) : undefined;
}

/** What the database said (public.service_status), or null when it didn't answer. */
export interface DatabaseAnswer {
  readonly saving: boolean;
  readonly remindersJob: boolean;
  readonly site: string | null;
}

/** The database's answer, read with care: anything unexpected is null. */
export function readDatabaseAnswer(body: unknown): DatabaseAnswer | null {
  if (body === null || typeof body !== 'object') return null;
  const { saving, reminders_job: job, site } = body as Record<string, unknown>;
  if (typeof saving !== 'boolean' || typeof job !== 'boolean') return null;
  return {
    saving,
    remindersJob: job,
    site:
      typeof site === 'string' && /^https?:\/\/[a-z0-9.-]+(:[0-9]{1,5})?$/.test(site) ? site : null,
  };
}

/** True when an answer is PrePenny's /version.json: a database version and a build. */
export function isVersion(body: unknown): boolean {
  if (body === null || typeof body !== 'object') return false;
  const { database, build } = body as Record<string, unknown>;
  return (
    typeof database === 'string' &&
    /^[0-9]{14}$/.test(database) &&
    typeof build === 'string' &&
    build !== ''
  );
}

/**
 * The reminders function answers when it gives any answer of its own: it
 * takes only a POST with the database's tick, so a plain look gets 405.
 * Supabase answers 5xx (or nothing) when the function can't start.
 */
export function functionAnswers(status: number | null): boolean {
  return status !== null && status < 500;
}

export type Working = Readonly<Record<Part, boolean>>;

/** The answer for one part: 200 when it's working, 503 when it isn't, with the part's name. */
export function onePart(part: Part, working: boolean): { status: number; body: unknown } {
  return { status: working ? 200 : 503, body: { part, working } };
}

/** The answer for every part, always 200, as the dashboard reads each part's word. */
export function everyPart(working: Working, checkedAt: string): { status: number; body: unknown } {
  return { status: 200, body: { working, checked_at: checkedAt } };
}

/** The headers of every answer: never kept, and readable by the dashboard, which is at its own address. */
export const HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
};
