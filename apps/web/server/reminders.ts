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
// 4. with the partner choice on, in a shared plan (step 4f, D575 to D579):
//    read their own Activity exactly as their phone reads it
//    (partner_activity), and once a partner's changes are due, take them
//    once only (claim_partner_changes) and send them as one notification;
// 5. note that it has looked, and the shortfalls they know about now.
//
// Nothing is ever written to a log or kept: the figures and words exist
// only in memory here and inside the sealed message (D564, CLAUDE.md). What
// it gives back is counts only.

import type { PlanRecords } from '@prepenny/engine';
import {
  type ActivityEdit,
  activityEditsFrom,
  activityPeopleFrom,
  contextFromRecords,
  shownAt,
} from '../lib/activity-words.ts';
import {
  dueGroup,
  exactMoment,
  partnerWords,
  waitingChanges,
  withoutUndone,
} from '../lib/partner-changes.ts';
import {
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
    readonly version: number;
    readonly choices: ReminderChoices;
    readonly known: readonly ShortfallMark[];
    /** With the partner choice on (step 4f): their plan, and from when changes are still to be told. */
    readonly partner?: Partner | null;
  }[];
}

interface Partner {
  readonly plan: string;
  /** Changes saved after this are still to be told. */
  readonly since: string;
  /** The newest change someone else made since then, saved a minute ago or more: passed over if they can see none. */
  readonly settledTo: string | null;
}

/** One page of the person's Activity, as partner_activity gives it. */
interface ActivityPage {
  readonly edits: unknown;
  readonly more?: boolean;
  readonly people?: unknown;
  readonly plan?: string;
  readonly mark?: string;
}

/** A notification as it's sent: its kind, for its tag, and its words. */
interface Message {
  readonly kind: string;
  readonly text: string;
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

/**
 * What the phone's offline helper shows (service-worker/sw.ts): the words,
 * and where a tap goes: Home, or Activity for a partner's changes.
 */
export function messageOf(due: Message): string {
  return JSON.stringify({
    title: strings.reminders.notification.title,
    body: due.text,
    tag: `prepenny-${due.kind}`,
    url: due.kind === 'partner' ? '/app/activity/' : '/app/',
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
  // PrePenny's signature for each push service, kept 11 hours, as Apple asks
  // ("Don't refresh your JWT more frequently than once per hour", D573, D574).
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
    let known: ShortfallMark[] = [...one.known];
    // Something let go, or a problem part-way: the next run looks again (D574).
    let again = false;
    try {
      if (one.session === null) continue;
      const changes = (await server.step('reminder_plan', {
        person: one.person,
        session: one.session,
      })) as PlanChangesRows | null;
      if (changes === null) continue;
      counts.looked += 1;
      const rows = rowsOfChanges(changes);
      const { records } = recordsFromRows(rows, one.person);
      // The accounts everyone in the plan sees: a shortfall in one names it (D580).
      const sharedAccounts = new Set(
        rows
          .filter((row) => row.table === 'accounts' && row.privateTo === null && !row.deleted)
          .map((row) => row.id),
      );
      const found = workOutReminders({
        records,
        now: work.now,
        choices: one.choices,
        knownShortfalls: one.known,
        sharedAccounts,
      });
      known = [...found.stillKnown];
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
        try {
          for (const phone of claim.phones ?? []) {
            if (!allowed(phone.endpoint)) continue;
            // One phone's trouble never stops the others getting it.
            try {
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
            } catch {
              counts.problems += 1;
            }
          }
        } finally {
          if (delivered === 0) {
            // No phone took it: let go, so it can go at the next look, while its time lasts.
            again = true;
            await server.step('unclaim_reminder', {
              person: one.person,
              kind: due.kind,
              for_day: due.key,
            });
          }
        }
        if (delivered === 0) {
          counts.notSent += 1;
          continue;
        }
        counts.sent += 1;
        if (due.shortfall !== undefined) known.push(due.shortfall);
      }
      // A partner's changes (step 4f).
      if (one.choices.partner === true && one.partner !== undefined && one.partner !== null) {
        const told = await tellPartnerChanges(server, {
          person: one.person,
          session: one.session,
          partner: one.partner,
          hideAmounts: one.choices.hideAmounts,
          records,
          now: work.now,
          at,
          send: async (phones, message) => {
            let delivered = 0;
            for (const phone of phones) {
              if (!allowed(phone.endpoint)) continue;
              try {
                const status = await deliver(
                  server,
                  await signature(phone.endpoint),
                  phone,
                  message,
                  work.now,
                );
                if (status >= 200 && status < 300) delivered += 1;
                else if (status === 404 || status === 410) {
                  await server.step('forget_push_address', { endpoint: phone.endpoint });
                }
              } catch {
                counts.problems += 1;
              }
            }
            return delivered;
          },
        });
        if (told === 'sent') counts.sent += 1;
        else if (told === 'not-sent') counts.notSent += 1;
        if (told === 'again' || told === 'not-sent') again = true;
      }
    } catch {
      // Never the error's words, which could name something: a count only.
      counts.problems += 1;
      again = true;
    }
    try {
      // Looked at: not again until the plan changes or a reminder's time
      // comes, unless something was let go. Only if their choices haven't
      // changed since this run began (D574).
      await server.step('done_looking', {
        person: one.person,
        mark: again ? '' : one.mark,
        known,
        at_time: at,
        version: one.version,
      });
    } catch {
      counts.problems += 1;
    }
  }
  return counts;
}

/**
 * A partner's changes for one person (step 4f, D576 to D579): their own
 * Activity, 50 changes at a time back to `since`; the changes someone else
 * made since then; and once they're due, the words, taken once only and
 * sent. Says what happened: 'sent'; 'not-sent' when no phone took it, to be
 * tried at the next run; 'again' when they're not due yet, or something
 * changed while it looked; 'nothing' when there's nothing to tell.
 */
async function tellPartnerChanges(
  server: ReminderServer,
  one: {
    readonly person: string;
    readonly session: string;
    readonly partner: Partner;
    readonly hideAmounts: boolean;
    readonly records: PlanRecords;
    readonly now: string;
    readonly at: string | null;
    readonly send: (phones: readonly PushTarget[], message: Message) => Promise<number>;
  },
): Promise<'sent' | 'not-sent' | 'again' | 'nothing'> {
  const { person, session, partner } = one;
  const since = exactMoment(partner.since);
  const edits: ActivityEdit[] = [];
  let people: Record<string, string> = {};
  let mark: string | null = null;
  let olderThan: string | null = null;
  // Back to `since`, 50 at a time; 500 at most, which is far more than anyone changes in minutes.
  for (let page = 0; page < 10; page += 1) {
    const answer = (await server.step('partner_activity', {
      person,
      session,
      older_than: olderThan,
    })) as ActivityPage | null;
    if (answer === null) return 'nothing';
    // They've moved to another plan since the database said which: look again.
    if (answer.plan !== partner.plan || typeof answer.mark !== 'string') return 'again';
    mark ??= answer.mark;
    people = { ...activityPeopleFrom(answer), ...people };
    const found = activityEditsFrom(answer);
    edits.push(...found);
    const oldest = found.at(-1);
    if (answer.more !== true || oldest === undefined) break;
    if (exactMoment(shownAt(oldest)) <= since) break;
    olderThan = shownAt(oldest);
  }
  if (mark === null) return 'nothing';

  const waiting = waitingChanges(edits, since);
  const passOver = async (through: string | null) => {
    if (through !== null && exactMoment(through) > since) {
      await server.step('partner_seen', { person, plan: partner.plan, since, through });
    }
  };
  if (waiting.length === 0) {
    // Nothing among the changes since then is anything they can see.
    await passOver(partner.settledTo);
    return 'nothing';
  }
  const { due, group, through } = dueGroup(waiting, one.now);
  if (!due || through === null) return 'again';
  const told = withoutUndone(group);
  const context = contextFromRecords(one.records, person, people, ukClock(one.now).date);
  const text = partnerWords(told, context, one.hideAmounts);
  if (text === null) {
    // Each was undone again straight away: nothing left to tell.
    await passOver(through);
    return 'nothing';
  }
  const claim = (await server.step('claim_partner_changes', {
    person,
    plan: partner.plan,
    since,
    through: exactMoment(through),
    hide_amounts: one.hideAmounts,
    mark,
    at_time: one.at,
  })) as Claim;
  if (!claim.sent) return claim.why === 'changed' || claim.why === 'quiet' ? 'again' : 'nothing';
  let delivered = 0;
  try {
    delivered = await one.send(claim.phones ?? [], { kind: 'partner', text });
  } finally {
    if (delivered === 0) {
      // No phone took it: let go, so it goes at the next run.
      await server.step('unclaim_partner_changes', {
        person,
        plan: partner.plan,
        since,
        through: exactMoment(through),
      });
    }
  }
  return delivered === 0 ? 'not-sent' : 'sent';
}

async function deliver(
  server: ReminderServer,
  authorization: string,
  phone: PushTarget,
  due: Message,
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
