// The reminders function's work (step 4e, D560 to D566), run by
// supabase/functions/reminders each time the scheduled job starts it.
// Bundled into that function with esbuild (scripts/build-reminders.ts), so
// it works out reminders with exactly the app's own engine and words.
//
// For each person the database says may be due a reminder now:
// 1. read their plan exactly as their own phone reads it (reminder_plan,
//    D564), and turn it into the engine's records as the phone does;
// 2. work out what's due and its words (lib/reminders.ts);
// 3. take each one once only, checked again at that moment (claim_reminder),
//    seal it for each of their phones (lib/web-push.ts) and send it to that
//    phone's push service, signed with PrePenny's key;
// 4. note that it has looked, and the shortfalls they know about now.
//
// Nothing is ever written to a log or kept: the figures and words exist
// only in memory here and inside the sealed message (D564, CLAUDE.md). What
// it gives back is counts only.

import {
  type DueReminder,
  REMINDER_HOURS,
  type ReminderChoices,
  type ShortfallMark,
  ukClock,
  workOutReminders,
} from '../lib/reminders.ts';
import { type PlanChangesRows, recordsFromRows, rowsOfChanges } from '../lib/sync-rows.ts';
import {
  makeSigningKey,
  type PushTarget,
  type SigningKey,
  sealForPhone,
  signatureFor,
  withSignature,
} from '../lib/web-push.ts';
import { strings } from '../strings/en-GB.ts';

/** How the function reaches the database and the push services. */
export interface ReminderServer {
  /** One of the database's steps for the reminders function (supabase/migrations, 20261120100000_reminders.sql). */
  readonly step: (name: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;
  /** Sends one request to a push service: its status, or 0 when it couldn't be reached. */
  readonly push: (
    endpoint: string,
    headers: Readonly<Record<string, string>>,
    body: Uint8Array<ArrayBuffer>,
  ) => Promise<number>;
  /** The real time now, in seconds, for how long PrePenny's signature lasts. */
  readonly seconds: () => number;
}

/** What one run did: counts only, never a name, an amount or an address. */
export interface RemindersRun {
  readonly looked: number;
  readonly sent: number;
  readonly notSent: number;
  readonly problems: number;
}

interface Work {
  readonly now: string;
  readonly key: SigningKey | null;
  readonly testPushPrefix?: string | null;
  readonly people: readonly {
    readonly person: string;
    readonly session: string | null;
    readonly mark: string;
    readonly choices: ReminderChoices;
    readonly known: readonly ShortfallMark[];
  }[];
}

interface Claim {
  readonly sent: boolean;
  readonly why?: string;
  readonly phones?: readonly PushTarget[];
}

/** The browsers' push services (app.push_address_ok): nothing is ever sent anywhere else. */
const PUSH_SERVICE =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

/**
 * How long a push service keeps a reminder for a phone that's switched off:
 * until 9pm that evening on a UK clock, when quiet hours start, so a
 * reminder never arrives in quiet hours (D560); a minute at least.
 */
export function keepFor(now: string): number {
  const clock = ukClock(now);
  const left = (REMINDER_HOURS.quietFrom * 60 - (clock.hour * 60 + clock.minute)) * 60;
  return Math.max(60, left);
}

/** What the phone's offline helper shows (service-worker/sw.ts): the words, and where a tap goes. */
export function messageOf(due: DueReminder): string {
  return JSON.stringify({
    title: strings.reminders.notification.title,
    body: due.text,
    tag: `prepenny-${due.kind}`,
    url: '/app/',
  });
}

export async function runReminders(
  server: ReminderServer,
  at: string | null,
  testPerson: string | null = null,
): Promise<RemindersRun> {
  const counts = { looked: 0, sent: 0, notSent: 0, problems: 0 };
  const work = (await server.step('reminder_work', {
    at_time: at,
    test_person: testPerson,
  })) as Work;
  let key = work.key;
  if (key === null) {
    // The first run makes PrePenny's signing key; the database keeps it,
    // and if another run made one at the same moment, gives back that one.
    const made = await makeSigningKey();
    key = (await server.step('keep_signing_key', {
      public_key: made.publicKey,
      private_jwk: made.privateJwk,
    })) as SigningKey;
  }
  const signingKey = key;
  // PrePenny's signature for each push service, kept an hour, as Apple asks
  // ("Don't refresh your JWT more frequently than once per hour", D573).
  const signatures = new Map<string, string>();
  const signature = async (endpoint: string) => {
    const audience = new URL(endpoint).origin;
    let token = signatures.get(audience);
    if (token === undefined) {
      token = ((await server.step('push_token', { audience })) as string | null) ?? undefined;
    }
    if (token === undefined) {
      token = (await server.step('keep_push_token', {
        audience,
        token: await signatureFor(endpoint, signingKey, server.seconds()),
      })) as string;
    }
    signatures.set(audience, token);
    return withSignature(token, signingKey);
  };
  const allowed = (endpoint: string) =>
    PUSH_SERVICE.test(endpoint) ||
    (typeof work.testPushPrefix === 'string' && endpoint.startsWith(work.testPushPrefix));

  for (const one of work.people) {
    try {
      if (one.session === null) continue;
      const changes = (await server.step('reminder_plan', {
        person: one.person,
        session: one.session,
      })) as PlanChangesRows | null;
      if (changes === null) continue;
      counts.looked += 1;
      const { records } = recordsFromRows(rowsOfChanges(changes), one.person);
      const found = workOutReminders({
        records,
        now: work.now,
        choices: one.choices,
        knownShortfalls: one.known,
      });
      const known = [...found.stillKnown];
      for (const due of found.due) {
        const claim = (await server.step('claim_reminder', {
          person: one.person,
          kind: due.kind,
          for_day: due.key,
          hide_amounts: one.choices.hideAmounts,
          at_time: at,
        })) as Claim;
        if (!claim.sent) {
          counts.notSent += 1;
          continue;
        }
        let delivered = 0;
        for (const phone of claim.phones ?? []) {
          if (!allowed(phone.endpoint)) continue;
          const status = await deliver(
            server,
            await signature(phone.endpoint),
            phone,
            due,
            work.now,
          );
          if (status >= 200 && status < 300) delivered += 1;
          else if (status === 404 || status === 410) {
            // The phone's push service says the address is gone, as when
            // PrePenny was removed from the phone: forgotten.
            await server.step('forget_push_address', { endpoint: phone.endpoint });
          }
        }
        if (delivered === 0) {
          // No phone took it: it can go at the next look, while its time lasts.
          await server.step('unclaim_reminder', {
            person: one.person,
            kind: due.kind,
            for_day: due.key,
          });
          counts.notSent += 1;
          continue;
        }
        counts.sent += 1;
        if (due.shortfall !== undefined) known.push(due.shortfall);
      }
      await server.step('done_looking', {
        person: one.person,
        mark: one.mark,
        known,
        at_time: at,
      });
    } catch {
      // Never the error's words, which could name something: a count only.
      counts.problems += 1;
    }
  }
  return counts;
}

async function deliver(
  server: ReminderServer,
  authorization: string,
  phone: PushTarget,
  due: DueReminder,
  now: string,
): Promise<number> {
  const body = await sealForPhone(messageOf(due), phone);
  return server.push(
    phone.endpoint,
    {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(keepFor(now)),
      Urgency: 'normal',
    },
    body,
  );
}
