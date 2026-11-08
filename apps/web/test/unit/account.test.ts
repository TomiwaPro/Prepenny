// Signing in (step 3b): Supabase's refusals in PrePenny's words, which
// Supabase project the app signs in with, the plan on the phone becoming the
// person's, and signing out leaving nothing behind.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claimOwnPlan, openDb, type PrePennyDb, saveChange, savePlan } from '../../data/db.ts';
import { EXAMPLE_PLAN_ID, examplePlan } from '../../data/example-plan.ts';
import { forgetEverything, planSafelyKept } from '../../data/forget.ts';
import { problemOf } from '../../lib/account.ts';
import { LOCAL_SUPABASE, signInConfig } from '../../lib/sign-in-config.ts';
import { strings } from '../../strings/en-GB.ts';

/** Supabase's own refusal, as its client gives it. */
const refusal = (code: string, message: string, status = 400) => ({
  name: 'AuthApiError',
  code,
  message,
  status,
});

describe("Supabase's refusals, in PrePenny's words", () => {
  it('asking for a new code too soon says how long to wait', () => {
    expect(
      problemOf(
        refusal(
          'over_email_send_rate_limit',
          'For security purposes, you can only request this after 47 seconds.',
          429,
        ),
      ),
    ).toEqual({ kind: 'wait', seconds: 47 });
    expect(strings.signIn.wait(47)).toBe('You can ask for a new code in 47 seconds.');
    expect(strings.signIn.wait(1)).toBe('You can ask for a new code in 1 second.');
  });

  it("Supabase's limit on emails an hour, for everyone, offers Google instead", () => {
    expect(
      problemOf(refusal('over_email_send_rate_limit', 'email rate limit exceeded', 429)),
    ).toEqual({ kind: 'too-many-emails' });
    expect(strings.signIn.tooManyEmails).toContain('continue with Google');
  });

  it('too many tries from one connection says to wait 5 minutes', () => {
    expect(
      problemOf(refusal('over_request_rate_limit', 'Request rate limit reached', 429)),
    ).toEqual({
      kind: 'too-many-tries',
    });
  });

  it('a wrong or old code, and a used link, are one refusal: the page tells them apart by the time', () => {
    expect(problemOf(refusal('otp_expired', 'Token has expired or is invalid', 403))).toEqual({
      kind: 'code-refused',
    });
    expect(problemOf(refusal('flow_state_not_found', 'invalid flow state', 404))).toEqual({
      kind: 'code-refused',
    });
    // Google came back in another browser, without this one's secret.
    expect(
      problemOf(refusal('pkce_code_verifier_not_found', 'PKCE code verifier not found', 400)),
    ).toEqual({ kind: 'code-refused' });
  });

  it('an address that can get no email', () => {
    expect(problemOf(refusal('email_address_invalid', 'Email address is invalid'))).toEqual({
      kind: 'email-refused',
    });
  });

  it('no answer from Supabase is the server, or being offline when the phone says so', () => {
    expect(
      problemOf({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }),
    ).toEqual({ kind: 'server' });
    expect(problemOf(new Error('anything else'))).toEqual({ kind: 'server' });
  });

  it('every message says what to do, and none has an exclamation mark', () => {
    for (const words of [
      strings.signIn.codeWrong,
      strings.signIn.codeRanOut,
      strings.signIn.linkRanOut,
      strings.signIn.tooManyTries,
      strings.signIn.emailMissing,
      strings.signIn.codeMissing,
      strings.signIn.offline,
      strings.signIn.server,
      strings.signIn.googleCancelled,
    ]) {
      expect(words).toMatch(/\.$/);
      expect(words).not.toContain('!');
    }
  });
});

describe('Which Supabase project the app signs in with', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('with nothing given, signing in is off, so no build points at a local address by mistake', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_KEY;
    expect(signInConfig()).toBeNull();
  });

  it('the local one that `supabase start` runs, when the tests give it', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_SUPABASE.url;
    process.env.NEXT_PUBLIC_SUPABASE_KEY = LOCAL_SUPABASE.key;
    expect(signInConfig()).toEqual(LOCAL_SUPABASE);
  });

  it('given empty, as before the owner has set it up, signing in is off', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.NEXT_PUBLIC_SUPABASE_KEY = '';
    expect(signInConfig()).toBeNull();
  });

  it('the real project, by its https address only', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co/';
    process.env.NEXT_PUBLIC_SUPABASE_KEY = 'sb_publishable_example';
    expect(signInConfig()).toEqual({
      url: 'https://abcdefghijklmnopqrst.supabase.co',
      key: 'sb_publishable_example',
    });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://abcdefghijklmnopqrst.supabase.co';
    expect(signInConfig()).toBeNull();
  });
});

describe('The plan made on this phone becomes the person who signs in (brief 4.13 "Try first")', () => {
  let db: PrePennyDb;
  let count = 0;

  beforeEach(async () => {
    count += 1;
    db = openDb(`account-test-${count}`);
    await db.open();
  });

  afterEach(async () => {
    db.close();
  });

  it('a phone with only the example has no plan to claim', async () => {
    await savePlan(db, { id: EXAMPLE_PLAN_ID, isExample: true }, examplePlan);
    expect(await claimOwnPlan(db, 'sam')).toBe('no-plan');
    expect((await db.plans.get(EXAMPLE_PLAN_ID))?.owner).toBeUndefined();
  });

  it("the person's own plan becomes theirs, and stays theirs when they sign in again", async () => {
    await savePlan(db, { id: 'own', isExample: false }, examplePlan);
    expect(await claimOwnPlan(db, 'sam')).toBe('mine');
    expect((await db.plans.get('own'))?.owner).toBe('sam');
    expect(await claimOwnPlan(db, 'sam')).toBe('mine');
  });

  it('saving the plan again, as loaded before signing in, keeps it theirs (outside review)', async () => {
    const loadedBefore = { id: 'own', isExample: false } as const;
    await savePlan(db, loadedBefore, examplePlan);
    expect(await claimOwnPlan(db, 'sam')).toBe('mine');
    const saved = await saveChange(db, loadedBefore, []);
    expect(saved.owner).toBe('sam');
    expect((await db.plans.get('own'))?.owner).toBe('sam');
    await savePlan(db, loadedBefore, examplePlan);
    expect((await db.plans.get('own'))?.owner).toBe('sam');
  });

  it("a plan that's someone else's stays theirs", async () => {
    await savePlan(db, { id: 'own', isExample: false, owner: 'sam' }, examplePlan);
    expect(await claimOwnPlan(db, 'priya')).toBe('someone-else');
    expect((await db.plans.get('own'))?.owner).toBe('sam');
  });
});

describe('Signing out leaves nothing behind (brief 4.13, PLAN.md item 20)', () => {
  it("removes the phone's database and both of the browser's small stores", async () => {
    const kept = (): Storage => {
      const items = new Map<string, string>();
      return {
        get length() {
          return items.size;
        },
        clear: () => items.clear(),
        getItem: (key) => items.get(key) ?? null,
        key: (index) => [...items.keys()][index] ?? null,
        removeItem: (key) => {
          items.delete(key);
        },
        setItem: (key, value) => {
          items.set(key, value);
        },
      };
    };
    const local = kept();
    const session = kept();
    Reflect.set(globalThis, 'localStorage', local);
    Reflect.set(globalThis, 'sessionStorage', session);
    local.setItem('prepenny-sign-in', '{}');
    local.setItem('prepenny-colours', 'dark');
    session.setItem('prepenny-pay-draft', '{}');

    const db = openDb();
    await savePlan(db, { id: 'own', isExample: false, owner: 'sam' }, examplePlan);
    await db.device.put({
      key: 'what-if|own',
      value: [{ commands: [{}], message: 'Rent skipped.' }],
    });
    db.close();

    await forgetEverything();

    expect(local.length).toBe(0);
    expect(session.length).toBe(0);
    expect((await indexedDB.databases()).map((one) => one.name)).not.toContain('prepenny');
    Reflect.deleteProperty(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
});

describe('A sign-in that ends by itself removes the plan only once it is safely in the account (D326, PLAN.md item 29)', () => {
  let db: PrePennyDb;
  const own = { id: 'own-plan', isExample: false, owner: 'person-a' } as const;
  const link = { planId: 'own-plan', personId: 'person-a', shared: 3, mine: 9 } as const;
  const writes = [
    {
      kind: 'account',
      id: 'a',
      value: { id: 'a', kind: 'current', overdraftLimit: 0, warningLevel: 2000 },
    },
  ] as const;

  beforeEach(async () => {
    db = openDb('prepenny');
    await db.delete();
    db = openDb('prepenny');
  });
  afterEach(() => db.close());

  it('a phone with no plan of its own has nothing to lose', async () => {
    expect(await planSafelyKept()).toBe(true);
  });

  it("a plan that has never gone up to the account isn't safe to remove", async () => {
    await savePlan(db, own, { accounts: [], balanceUpdates: [], series: [] });
    expect(await planSafelyKept()).toBe(false);
  });

  it('a plan kept in the account, with everything sent, is', async () => {
    await savePlan(db, own, { accounts: [], balanceUpdates: [], series: [] });
    await db.links.put(link);
    expect(await planSafelyKept()).toBe(true);
  });

  it("a change made since, saved on the phone and queued in the same go, isn't sent yet, so it isn't safe", async () => {
    await savePlan(db, own, { accounts: [], balanceUpdates: [], series: [] });
    await db.links.put(link);
    await saveChange(db, own, writes, {
      editId: 'edit-1',
      madeOnPhone: Date.parse('2026-11-07T10:00:00.000Z'),
      kind: 'add-account',
    });
    expect(await db.unsent.count()).toBe(1);
    expect(await planSafelyKept()).toBe(false);
  });

  it('a change to a plan not kept in an account, or to the example, is never queued to send', async () => {
    await savePlan(db, own, { accounts: [], balanceUpdates: [], series: [] });
    await saveChange(db, own, writes, {
      editId: 'edit-1',
      madeOnPhone: Date.parse('2026-11-07T10:00:00.000Z'),
      kind: 'add-account',
    });
    const example = { id: EXAMPLE_PLAN_ID, isExample: true } as const;
    await savePlan(db, example, examplePlan);
    await db.links.put({ ...link, planId: EXAMPLE_PLAN_ID });
    await saveChange(db, example, writes, {
      editId: 'edit-2',
      madeOnPhone: Date.parse('2026-11-07T10:00:00.000Z'),
      kind: 'add-account',
    });
    expect(await db.unsent.count()).toBe(0);
  });
});
