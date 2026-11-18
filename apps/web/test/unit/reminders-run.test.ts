// The reminders function's work (step 4e, server/reminders.ts), with a
// stand-in database and stand-in phones that open what they're sent with
// their own keys: the plan read as the person's own phone reads it, each
// reminder taken once, sealed for each phone, an address that's gone
// forgotten, a reminder nobody took tried again, and nothing logged.

import { type PlanRecords, parsePounds as pounds } from '@prepenny/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { NO_REMINDERS, type ReminderChoices } from '../../lib/reminders.ts';
import { type PlanChangesRows, rowsOf } from '../../lib/sync-rows.ts';
import { base64url, openOnPhone } from '../../lib/web-push.ts';
import { keepFor, type ReminderServer, runReminders } from '../../server/reminders.ts';

const PLAN = '01900000-0000-7000-8000-000000000001';
const SAM = '01900000-0000-7000-8000-00000000000a';
const SESSION = '01900000-0000-7000-8000-0000000000aa';

/** Sam's example plan as plan_changes gives it to his own phone. */
function samsRows(records: PlanRecords = examplePlan): PlanChangesRows {
  const wanted = rowsOf(records, { planId: PLAN, personId: SAM }, new Map(), undefined);
  return {
    plan: { id: PLAN, nation: 'england-and-wales', version: 1, seq: 1 },
    rows: [...wanted.values()]
      .filter((one) => one.table !== 'plans')
      .map((one) => ({
        table: one.table,
        row: { ...one.values, id: one.id, version: 1, seq: 1, private_to: SAM, deleted: false },
      })),
  };
}

async function phone(endpoint: string) {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  return {
    endpoint,
    keys,
    p256dh: base64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))),
    auth: base64url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

type Phone = Awaited<ReturnType<typeof phone>>;

/** A stand-in database and push services: what each step was asked, and what each phone opened. */
function standIn(options: {
  readonly now: string;
  readonly choices: ReminderChoices;
  readonly phones: readonly Phone[];
  readonly status?: (endpoint: string) => number;
  readonly claimed?: Set<string>;
  readonly records?: PlanRecords;
}) {
  const asked: { name: string; args: Readonly<Record<string, unknown>> }[] = [];
  const opened: {
    endpoint: string;
    message: Record<string, string>;
    headers: Record<string, string>;
  }[] = [];
  const claimed = options.claimed ?? new Set<string>();
  const tokens = new Map<string, string>();
  const server: ReminderServer = {
    seconds: () => 1_794_000_000,
    step: async (name, args) => {
      asked.push({ name, args });
      switch (name) {
        case 'reminder_work':
          return {
            now: options.now,
            key: null,
            testPushPrefix: null,
            people: [
              {
                person: SAM,
                session: SESSION,
                mark: 'm',
                version: 3,
                choices: options.choices,
                known: [],
              },
            ],
          };
        case 'keep_signing_key':
          return { publicKey: args.public_key, privateJwk: args.private_jwk };
        case 'push_token':
          return tokens.get(String(args.audience)) ?? null;
        case 'keep_push_token':
          tokens.set(String(args.audience), String(args.token));
          return args.token;
        case 'reminder_plan':
          return samsRows(options.records);
        case 'claim_reminder': {
          const key = `${String(args.kind)}|${String(args.for_day)}`;
          if (claimed.has(key)) return { sent: false, why: 'sent' };
          claimed.add(key);
          return {
            sent: true,
            phones: options.phones.map(({ endpoint, p256dh, auth }) => ({
              endpoint,
              p256dh,
              auth,
            })),
          };
        }
        case 'unclaim_reminder':
          claimed.delete(`${String(args.kind)}|${String(args.for_day)}`);
          return null;
        default:
          return null;
      }
    },
    push: async (endpoint, headers, body) => {
      const target = options.phones.find((one) => one.endpoint === endpoint);
      if (target !== undefined) {
        opened.push({
          endpoint,
          headers: { ...headers },
          message: JSON.parse(await openOnPhone(body, target)) as Record<string, string>,
        });
      }
      const status = options.status?.(endpoint) ?? 201;
      if (status < 0) throw new Error('no answer');
      return status;
    },
  };
  return { server, asked, opened, claimed, tokens };
}

afterEach(() => vi.restoreAllMocks());

describe('the reminders function (D564)', () => {
  it("sends Sam's evening reminder, sealed for each of his phones, once", async () => {
    const phones = [
      await phone('https://fcm.googleapis.com/fcm/send/one'),
      await phone('https://web.push.apple.com/two'),
    ];
    const run = standIn({
      now: '2026-10-31T19:00:00Z',
      choices: { ...NO_REMINDERS, evening: true },
      phones,
    });
    expect(await runReminders(run.server, null)).toEqual({
      looked: 1,
      sent: 1,
      notSent: 0,
      problems: 0,
    });
    expect(run.opened.map((one) => one.message)).toEqual([
      {
        title: 'PrePenny',
        body: "Rent goes out tomorrow. You'll have £4.53 left until Friday.",
        tag: 'prepenny-evening',
        url: '/app/',
      },
      {
        title: 'PrePenny',
        body: "Rent goes out tomorrow. You'll have £4.53 left until Friday.",
        tag: 'prepenny-evening',
        url: '/app/',
      },
    ]);
    const headers = run.opened[0]?.headers ?? {};
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers.Authorization).toMatch(/^vapid t=[^ ]+, k=B[A-Za-z0-9_-]{86}$/);
    // Kept by the push service only until 9pm, so it never arrives in quiet hours.
    expect(headers.TTL).toBe(String(2 * 60 * 60));
    // Taken once, for tomorrow, and done looking.
    expect(run.asked.filter((one) => one.name === 'claim_reminder').map((one) => one.args)).toEqual(
      [
        {
          person: SAM,
          kind: 'evening',
          for_day: '2026-11-01',
          hide_amounts: false,
          at_time: null,
        },
      ],
    );
    expect(run.asked.at(-1)).toEqual({
      name: 'done_looking',
      args: { person: SAM, mark: 'm', known: [], at_time: null, version: 3 },
    });

    // The next run, a minute later, sends nothing more.
    const again = standIn({
      now: '2026-10-31T19:15:00Z',
      choices: { ...NO_REMINDERS, evening: true },
      phones,
      claimed: run.claimed,
    });
    expect(await runReminders(again.server, null)).toMatchObject({ sent: 0, notSent: 1 });
    expect(again.opened).toEqual([]);
  });

  it('one signature for each push service, kept an hour, as Apple asks (D573)', async () => {
    const phones = [
      await phone('https://fcm.googleapis.com/fcm/send/one'),
      await phone('https://fcm.googleapis.com/fcm/send/two'),
      await phone('https://web.push.apple.com/three'),
    ];
    const run = standIn({
      now: '2026-10-31T19:00:00Z',
      choices: { ...NO_REMINDERS, evening: true },
      phones,
    });
    await runReminders(run.server, null);
    const [one, two, three] = run.opened.map((item) => item.headers.Authorization);
    expect(one).toBe(two);
    expect(three).not.toBe(one);
    // Made once for each push service, and kept for the next run.
    expect(run.asked.filter((item) => item.name === 'keep_push_token')).toHaveLength(2);
    expect([...run.tokens.keys()].sort()).toEqual([
      'https://fcm.googleapis.com',
      'https://web.push.apple.com',
    ]);
  });

  it('with amounts hidden, no amount reaches the phone (D561)', async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/one')];
    const run = standIn({
      now: '2026-10-31T19:00:00Z',
      choices: { ...NO_REMINDERS, evening: true, hideAmounts: true },
      phones,
    });
    await runReminders(run.server, null);
    expect(run.opened[0]?.message.body).toBe('Rent goes out tomorrow.');
  });

  it('forgets an address the push service says is gone, and tries again when nobody took it', async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/gone')];
    const run = standIn({
      now: '2026-10-30T09:00:00Z',
      choices: { ...NO_REMINDERS, payday: true },
      phones,
      status: () => 410,
    });
    expect(await runReminders(run.server, null)).toMatchObject({ sent: 0, notSent: 1 });
    expect(run.asked.map((one) => one.name)).toContain('forget_push_address');
    expect(run.asked.find((one) => one.name === 'unclaim_reminder')?.args).toEqual({
      person: SAM,
      kind: 'payday',
      for_day: '2026-10-30',
    });
    // And the next run looks again: no mark of having looked (D574).
    expect(run.asked.at(-1)?.args.mark).toBe('');
  });

  it("one phone's trouble never stops the others, and a reminder no phone took is let go (D574)", async () => {
    const phones = [
      await phone('https://fcm.googleapis.com/fcm/send/broken'),
      await phone('https://fcm.googleapis.com/fcm/send/fine'),
    ];
    const run = standIn({
      now: '2026-10-30T09:00:00Z',
      choices: { ...NO_REMINDERS, payday: true },
      phones,
      status: (endpoint) => (endpoint.endsWith('broken') ? -1 : 201),
    });
    expect(await runReminders(run.server, null)).toMatchObject({ sent: 1, problems: 1 });
    expect(run.opened).toHaveLength(2);
    expect(run.asked.map((one) => one.name)).not.toContain('unclaim_reminder');

    const none = standIn({
      now: '2026-10-30T09:00:00Z',
      choices: { ...NO_REMINDERS, payday: true },
      phones: [await phone('https://fcm.googleapis.com/fcm/send/broken')],
      status: () => -1,
    });
    expect(await runReminders(none.server, null)).toMatchObject({ sent: 0, notSent: 1 });
    expect(none.asked.map((one) => one.name)).toContain('unclaim_reminder');
    expect(none.claimed.size).toBe(0);
    expect(none.asked.at(-1)?.args.mark).toBe('');
  });

  it('never sends anywhere but a push service', async () => {
    const phones = [await phone('https://example.com/not-a-push-service')];
    const run = standIn({
      now: '2026-10-30T09:00:00Z',
      choices: { ...NO_REMINDERS, payday: true },
      phones,
    });
    await runReminders(run.server, null);
    expect(run.opened).toEqual([]);
  });

  it('keeps the shortfall it warned about as known: its account and date only', async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/one')];
    // Sam's rent on Sun 1 Nov as £640.00: £35.47 short that day.
    const short: PlanRecords = {
      ...examplePlan,
      changes: (examplePlan.changes ?? []).map((one) =>
        one.seriesId === 'rent' ? { ...one, amount: pounds('640.00') } : one,
      ),
    };
    const run = standIn({
      now: '2026-10-26T10:00:00Z',
      choices: { ...NO_REMINDERS, shortfall: true },
      phones,
      records: short,
    });
    await runReminders(run.server, null);
    expect(run.opened.map((one) => (one.message.body ?? '').replaceAll('\u00a0', ' '))).toEqual([
      "You'll be £35.47 short on Sun 1 Nov.",
    ]);
    expect(run.asked.at(-1)?.args.known).toEqual([{ accountId: 'current', date: '2026-11-01' }]);

    // Not short: nothing is known.
    const fine = standIn({
      now: '2026-10-26T10:00:00Z',
      choices: { ...NO_REMINDERS, shortfall: true },
      phones,
    });
    await runReminders(fine.server, null);
    expect(fine.asked.at(-1)?.args.known).toEqual([]);
  });

  it('logs nothing, ever', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) =>
      vi.spyOn(console, name),
    );
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/one')];
    const run = standIn({
      now: '2026-10-25T18:00:00Z',
      choices: { payday: true, evening: true, shortfall: true, weekly: true, hideAmounts: false },
      phones,
    });
    await runReminders(run.server, null);
    // A step that fails is counted, never described.
    await runReminders(
      {
        ...run.server,
        step: async (name, args) => {
          if (name === 'reminder_plan') throw new Error('Rent £600.00');
          return run.server.step(name, args);
        },
      },
      null,
    );
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('keeps a reminder until quiet hours start, a minute at least', () => {
    expect(keepFor('2026-10-31T19:00:00Z')).toBe(7200);
    // In summer, 7pm UTC is 8pm BST: one hour to quiet hours.
    expect(keepFor('2027-06-05T19:00:00Z')).toBe(3600);
    expect(keepFor('2026-10-31T20:59:30Z')).toBe(60);
  });
});
