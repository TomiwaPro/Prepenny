// The reminders function's part for a partner's changes (step 4f,
// server/reminders.ts, D575 to D579), with a stand-in database and stand-in
// phones that open what they're sent with their own keys: the person's own
// Activity read back to when they were last told, a group sent only once
// it's due, taken once and let go when no phone took it, their own changes
// never told, and nothing logged.

import type { PlanRecords } from '@prepenny/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { NO_REMINDERS, type ReminderChoices } from '../../lib/reminders.ts';
import { type PlanChangesRows, rowsOf } from '../../lib/sync-rows.ts';
import { base64url, openOnPhone } from '../../lib/web-push.ts';
import { type ReminderServer, runReminders } from '../../server/reminders.ts';

const PLAN = '01900000-0000-7000-8000-000000000001';
const JESS = '01900000-0000-7000-8000-00000000000a';
const TOM = '01900000-0000-7000-8000-00000000000b';
const SESSION = '01900000-0000-7000-8000-0000000000aa';
const SINCE = '2026-11-12T09:00:00.000000Z';

/** Sam's example plan, as Jess's phone reads it, to name payments from. */
function rows(records: PlanRecords = examplePlan): PlanChangesRows {
  const wanted = rowsOf(records, { planId: PLAN, personId: JESS }, new Map(), undefined);
  return {
    plan: { id: PLAN, nation: 'england-and-wales', version: 1, seq: 1 },
    rows: [...wanted.values()]
      .filter((one) => one.table !== 'plans')
      .map((one) => ({
        table: one.table,
        row: { ...one.values, id: one.id, version: 1, seq: 1, private_to: null, deleted: false },
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

/** A change as plan_activity gives it to Jess. */
function change(over: Record<string, unknown>) {
  return {
    id: `edit-${Math.random()}`,
    by: TOM,
    made_at: '2026-11-12T10:00:00.000Z',
    saved_at: '2026-11-12T10:00:00.000000Z',
    kind: 'add-payment',
    mine: false,
    undone: false,
    undoes: null,
    can_undo: false,
    summary: null,
    records: [
      {
        table: 'series',
        id: 'mot',
        before: null,
        after: {
          name: 'Car MOT',
          amount: 5485,
          direction: 'out',
          start_date: '2026-11-13',
          schedule: { kind: 'once', date: '2026-11-13' },
        },
      },
    ],
    ...over,
  };
}

function standIn(options: {
  readonly now: string;
  readonly edits: readonly Record<string, unknown>[];
  readonly phones: readonly Phone[];
  readonly choices?: Partial<ReminderChoices>;
  readonly settledTo?: string | null;
  readonly claim?: (args: Readonly<Record<string, unknown>>) => unknown;
  readonly status?: number;
}) {
  const asked: { name: string; args: Readonly<Record<string, unknown>> }[] = [];
  const opened: { message: Record<string, string> }[] = [];
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
                person: JESS,
                session: SESSION,
                mark: 'm',
                version: 2,
                choices: { ...NO_REMINDERS, partner: true, ...options.choices },
                known: [],
                partner: { plan: PLAN, since: SINCE, settledTo: options.settledTo ?? null },
              },
            ],
          };
        case 'keep_signing_key':
          return { publicKey: args.public_key, privateJwk: args.private_jwk };
        case 'keep_push_token':
          return args.token;
        case 'reminder_plan':
          return rows();
        case 'partner_activity': {
          // 50 at a time, newest first, older than the page before.
          const older = args.older_than as string | null;
          const list = options.edits.filter(
            (one) => older === null || String(one.saved_at) < older,
          );
          return {
            edits: list.slice(0, 50),
            more: list.length > 50,
            people: { [JESS]: 'Jess', [TOM]: 'Tom' },
            plan: PLAN,
            mark: '3:123',
            now: options.now,
          };
        }
        case 'claim_partner_changes':
          return (
            options.claim?.(args) ?? {
              sent: true,
              phones: options.phones.map(({ endpoint, p256dh, auth }) => ({
                endpoint,
                p256dh,
                auth,
              })),
            }
          );
        default:
          return null;
      }
    },
    push: async (endpoint, _headers, body) => {
      const target = options.phones.find((one) => one.endpoint === endpoint);
      if (target !== undefined && (options.status ?? 201) < 300) {
        opened.push({
          message: JSON.parse(await openOnPhone(body, target)) as Record<string, string>,
        });
      }
      return options.status ?? 201;
    },
  };
  const calls = (name: string) => asked.filter((one) => one.name === name).map((one) => one.args);
  return { server, asked, opened, calls };
}

afterEach(() => vi.restoreAllMocks());

describe("a partner's changes (step 4f)", () => {
  it('a change 2 minutes old comes as Activity says it, opening Activity, taken once', async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/jess')];
    const run = standIn({ now: '2026-11-12T10:02:00Z', edits: [change({})], phones });
    expect(await runReminders(run.server, null)).toEqual({
      looked: 1,
      sent: 1,
      notSent: 0,
      problems: 0,
    });
    expect(run.opened.map((one) => one.message)).toEqual([
      {
        title: 'PrePenny',
        body: 'Tom added Car MOT, −£54.85 on Fri 13 Nov.',
        tag: 'prepenny-partner',
        url: '/app/activity/',
      },
    ]);
    expect(run.calls('claim_partner_changes')).toEqual([
      {
        person: JESS,
        plan: PLAN,
        since: SINCE,
        through: '2026-11-12T10:00:00.000000Z',
        hide_amounts: false,
        mark: '3:123',
        at_time: null,
      },
    ]);
    expect(run.calls('unclaim_partner_changes')).toEqual([]);
    // Done looking, with nothing to look at again.
    expect(run.asked.at(-1)?.args).toMatchObject({ person: JESS, mark: 'm' });
  });

  it('sealed for each of her phones, sent to them all at once', async () => {
    const phones = [
      await phone('https://fcm.googleapis.com/fcm/send/jess'),
      await phone('https://web.push.apple.com/jess-iphone'),
    ];
    const run = standIn({ now: '2026-11-12T10:02:00Z', edits: [change({})], phones });
    expect(await runReminders(run.server, null)).toMatchObject({ sent: 1, problems: 0 });
    expect(run.opened.map((one) => one.message.body)).toEqual([
      'Tom added Car MOT, −£54.85 on Fri\u00a013\u00a0Nov.',
      'Tom added Car MOT, −£54.85 on Fri\u00a013\u00a0Nov.',
    ]);
  });

  it('changes close together wait for 2 minutes of nothing, then come as one', async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/jess')];
    const edits = [
      change({ saved_at: '2026-11-12T10:01:30.000000Z', id: 'b' }),
      change({
        saved_at: '2026-11-12T10:00:00.000000Z',
        id: 'a',
        kind: 'spend',
        records: [
          { table: 'spends', id: 'p1', before: null, after: { budget_id: 'x', amount: 1250 } },
        ],
      }),
    ];
    const early = standIn({ now: '2026-11-12T10:03:00Z', edits, phones });
    expect(await runReminders(early.server, null)).toMatchObject({ sent: 0 });
    expect(early.calls('claim_partner_changes')).toEqual([]);
    // Looked at again at the next run.
    expect(early.asked.at(-1)?.args).toMatchObject({ mark: '' });

    const due = standIn({ now: '2026-11-12T10:03:30Z', edits, phones });
    expect(await runReminders(due.server, null)).toMatchObject({ sent: 1 });
    expect(due.opened[0]?.message.body).toBe('Tom made 2 changes, including Car MOT, −£54.85.');
  });

  it('with amounts hidden, no amount reaches the phone (D561)', async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/jess')];
    const run = standIn({
      now: '2026-11-12T10:05:00Z',
      edits: [change({})],
      phones,
      choices: { hideAmounts: true },
    });
    await runReminders(run.server, null);
    expect(run.opened[0]?.message.body).toBe('Tom added Car MOT on Fri 13 Nov.');
    expect(run.calls('claim_partner_changes')[0]).toMatchObject({ hide_amounts: true });
  });

  it("never the person's own changes: with none of anyone else's they can see, passed over", async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/jess')];
    const run = standIn({
      now: '2026-11-12T10:05:00Z',
      edits: [change({ by: JESS, mine: true })],
      phones,
      settledTo: '2026-11-12T10:03:00.000000Z',
    });
    expect(await runReminders(run.server, null)).toMatchObject({ sent: 0, notSent: 0 });
    expect(run.opened).toEqual([]);
    expect(run.calls('claim_partner_changes')).toEqual([]);
    expect(run.calls('partner_seen')).toEqual([
      { person: JESS, plan: PLAN, since: SINCE, through: '2026-11-12T10:03:00.000000Z' },
    ]);
  });

  it('a change and its undo together tell nothing, and are passed over', async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/jess')];
    const run = standIn({
      now: '2026-11-12T10:05:00Z',
      edits: [
        change({ id: 'u', kind: 'undo', undoes: 'c', saved_at: '2026-11-12T10:01:00.000000Z' }),
        change({ id: 'c' }),
      ],
      phones,
    });
    await runReminders(run.server, null);
    expect(run.opened).toEqual([]);
    expect(run.calls('partner_seen')).toEqual([
      { person: JESS, plan: PLAN, since: SINCE, through: '2026-11-12T10:01:00.000000Z' },
    ]);
  });

  it('something changed while it looked: nothing sent, and looked at again', async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/jess')];
    const run = standIn({
      now: '2026-11-12T10:05:00Z',
      edits: [change({})],
      phones,
      claim: () => ({ sent: false, why: 'changed' }),
    });
    expect(await runReminders(run.server, null)).toMatchObject({ sent: 0 });
    expect(run.opened).toEqual([]);
    expect(run.asked.at(-1)?.args).toMatchObject({ mark: '' });
  });

  it('no phone took it: let go, to go at the next run', async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/jess')];
    const run = standIn({ now: '2026-11-12T10:05:00Z', edits: [change({})], phones, status: 500 });
    expect(await runReminders(run.server, null)).toMatchObject({ sent: 0, notSent: 1 });
    expect(run.calls('unclaim_partner_changes')).toEqual([
      {
        person: JESS,
        plan: PLAN,
        since: SINCE,
        through: '2026-11-12T10:00:00.000000Z',
      },
    ]);
    expect(run.asked.at(-1)?.args).toMatchObject({ mark: '' });
  });

  it('reads Activity back to when they were last told, 50 at a time', async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/jess')];
    const edits = Array.from({ length: 60 }, (_, index) =>
      change({
        id: `e${index}`,
        saved_at: `2026-11-12T10:${String(59 - index).padStart(2, '0')}:00.000000Z`,
      }),
    );
    const run = standIn({ now: '2026-11-12T11:05:00Z', edits, phones });
    await runReminders(run.server, null);
    expect(run.calls('partner_activity').map((one) => one.older_than)).toEqual([
      null,
      '2026-11-12T10:10:00.000000Z',
    ]);
    expect(run.opened[0]?.message.body).toBe('Tom made 60 changes, including Car MOT, −£54.85.');
  });

  it('with the choice off, its part is never run', async () => {
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/jess')];
    const run = standIn({
      now: '2026-11-12T10:05:00Z',
      edits: [change({})],
      phones,
      choices: { partner: false },
    });
    await runReminders(run.server, null);
    expect(run.calls('partner_activity')).toEqual([]);
    expect(run.opened).toEqual([]);
  });

  it('logs nothing, ever', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) =>
      vi.spyOn(console, name),
    );
    const phones = [await phone('https://fcm.googleapis.com/fcm/send/jess')];
    const run = standIn({ now: '2026-11-12T10:05:00Z', edits: [change({})], phones });
    await runReminders(run.server, null);
    // A step that fails is counted, never described.
    const counts = await runReminders(
      {
        ...run.server,
        step: async (name, args) => {
          if (name === 'partner_activity') throw new Error('Car MOT £54.85 jess@example.com');
          return run.server.step(name, args);
        },
      },
      null,
    );
    expect(counts.problems).toBe(1);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
