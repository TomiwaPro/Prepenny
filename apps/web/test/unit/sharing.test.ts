// Step 3f's pieces that work on the phone alone: money between a private
// account and a shared one as two halves (lib/private-transfer.ts), reading
// an invite link and the server's refusals (lib/sharing.ts), names in a
// sentence, and the private links' ids, which the server works out the same
// way when an account is shared (supabase/tests/database/24-sharing-accounts.test.sql).

import type { NewSeries } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { namesList } from '../../components/ShareScreen.tsx';
import { addPaymentCommand } from '../../lib/private-transfer.ts';
import {
  finishJoiningLink,
  inviteIdFrom,
  inviteLink,
  joiningOf,
  lookOf,
  problemOf,
  requestsOf,
  tokenFrom,
} from '../../lib/sharing.ts';
import { LIVE_SITE, liveAddressFor, OLD_LIVE_HOST, siteOrigin } from '../../lib/site.ts';
import { derivedId } from '../../lib/sync-ids.ts';

const move: NewSeries = {
  id: 'move',
  accountId: 'jess',
  toAccountId: 'joint',
  name: 'To our account',
  direction: 'transfer',
  type: 'savings',
  amount: 60000,
  start: '2026-10-30',
  schedule: { kind: 'once' },
  end: { kind: 'never' },
  holidayRule: 'keep',
  isEstimate: false,
  note: 'For the bills',
};
const shared = { sharedAccounts: new Set(['joint']), myName: 'Jess' };
const noGoal = () => undefined;

describe('Add a payment between a private account and a shared one (D16, D52)', () => {
  it('is an ordinary transfer when nothing is shared, or both accounts are', () => {
    expect(addPaymentCommand(move, 'now', null, 'half', noGoal)).toEqual({
      kind: 'add-payment',
      series: move,
      madeAt: 'now',
    });
    const both = { sharedAccounts: new Set(['jess', 'joint']), myName: 'Jess' };
    expect(addPaymentCommand(move, 'now', both, 'half', noGoal)).toEqual({
      kind: 'add-payment',
      series: move,
      madeAt: 'now',
    });
  });

  it('from her own account: money going out of it, and "From Jess" in the shared one', () => {
    const { toAccountId: _to, ...rest } = move;
    expect(addPaymentCommand(move, 'now', shared, 'half', noGoal)).toEqual({
      kind: 'add-payment',
      series: { ...rest, direction: 'out' },
      madeAt: 'now',
      otherHalf: { id: 'half', accountId: 'joint', name: 'From Jess' },
    });
  });

  it('into her own account: money coming into it, and "To Jess" leaving the shared one', () => {
    const back = { ...move, accountId: 'joint', toAccountId: 'jess' };
    const command = addPaymentCommand(back, 'now', shared, 'half', noGoal);
    expect(command.kind === 'add-payment' && command.series.accountId).toBe('jess');
    expect(command.kind === 'add-payment' && command.series.direction).toBe('in');
    expect(command.kind === 'add-payment' && command.otherHalf).toEqual({
      id: 'half',
      accountId: 'joint',
      name: 'To Jess',
    });
  });

  it('with no name given, "From your partner"; a goal stays only when it is in her own account', () => {
    const unnamed = { sharedAccounts: shared.sharedAccounts, myName: null };
    const command = addPaymentCommand(
      { ...move, goalId: 'holiday' },
      'now',
      unnamed,
      'half',
      () => 'joint',
    );
    expect(command.kind === 'add-payment' && command.otherHalf?.name).toBe('From your partner');
    expect(command.kind === 'add-payment' && command.series.goalId).toBeUndefined();
    const kept = addPaymentCommand(
      { ...move, goalId: 'holiday' },
      'now',
      shared,
      'half',
      () => 'jess',
    );
    expect(kept.kind === 'add-payment' && kept.series.goalId).toBe('holiday');
  });
});

describe('the invite link', () => {
  it('carries its secret after a "#", so it never reaches the site', () => {
    expect(inviteLink('abcdefghijklmnopqrstuvwxyz012345', 'https://prepenny.co.uk')).toBe(
      'https://prepenny.co.uk/join/#abcdefghijklmnopqrstuvwxyz012345',
    );
  });

  it('reads only a secret that could be one', () => {
    expect(tokenFrom('#abcdefghijklmnopqrstuvwxyz_-0123')).toBe('abcdefghijklmnopqrstuvwxyz_-0123');
    expect(tokenFrom('#short')).toBeNull();
    expect(tokenFrom('#token_hash=abcdefghijklmnopqrstuvwxyz')).toBeNull();
    expect(tokenFrom('')).toBeNull();
  });
});

describe("the server's refusals, read by their code alone", () => {
  it('names the accounts to share together, and what an invite is now', () => {
    expect(problemOf({ message: 'share-together', details: '["isa"]' })).toEqual({
      kind: 'share-together',
      ids: ['isa'],
    });
    expect(problemOf({ message: 'share-has-halves', details: 'not json' })).toEqual({
      kind: 'share-has-halves',
      ids: [],
    });
    expect(problemOf({ message: 'used' })).toEqual({ kind: 'invite', state: 'used' });
    expect(problemOf({ message: 'has-a-plan' })).toEqual({ kind: 'has-a-plan' });
    expect(problemOf({ message: 'something else entirely' })).toEqual({ kind: 'server' });
  });

  it('keeps only well-formed requests to join', () => {
    expect(
      requestsOf([
        {
          invite: 'i',
          plan: 'p',
          role: 'viewer',
          nickname: 'Jess',
          email: 'jess@example.com',
          asked_at: '2026-11-10T09:00:00Z',
        },
        { invite: 'broken' },
      ]),
    ).toEqual([
      {
        invite: 'i',
        plan: 'p',
        role: 'viewer',
        nickname: 'Jess',
        email: 'jess@example.com',
        askedAt: '2026-11-10T09:00:00Z',
      },
    ]);
    expect(requestsOf(null)).toEqual([]);
  });
});

describe('names in a sentence', () => {
  it('joins them with commas and "and"', () => {
    expect(namesList([])).toBe('');
    expect(namesList(['Joint'])).toBe('Joint');
    expect(namesList(['Joint', 'Savings'])).toBe('Joint and Savings');
    expect(namesList(['Joint', 'Savings', 'ISA'])).toBe('Joint, Savings and ISA');
  });
});

describe('private link ids', () => {
  it('are the ones the server works out when an account is shared (app.derived_id)', () => {
    expect(derivedId('0190a3d0-0000-7000-8000-000000000001', 'family-debt', 'abc')).toBe(
      '3424324e-fea7-885a-8863-d0467a5decd3',
    );
  });
});

// Step 3f-2: joining with a plan of one's own (D426) and the live address (D428).

describe('the address an invite link uses (D428)', () => {
  it('is always prepenny.co.uk on the live app, even with the old address open', () => {
    const at = (origin: string) => ({ origin, hostname: new URL(origin).hostname });
    expect(siteOrigin(at('https://prepenny.prepenny.workers.dev'))).toBe(LIVE_SITE);
    expect(siteOrigin(at('https://prepenny.co.uk'))).toBe('https://prepenny.co.uk');
    expect(
      inviteLink('abcdefghijklmnopqrstuvwxyz012345', siteOrigin(at(`https://${OLD_LIVE_HOST}`))),
    ).toBe('https://prepenny.co.uk/join/#abcdefghijklmnopqrstuvwxyz012345');
  });

  it("is a preview's own address on a preview, and this computer's in the tests", () => {
    const at = (origin: string) => ({ origin, hostname: new URL(origin).hostname });
    expect(siteOrigin(at('https://pr-31-prepenny.prepenny.workers.dev'))).toBe(
      'https://pr-31-prepenny.prepenny.workers.dev',
    );
    expect(siteOrigin(at('http://127.0.0.1:4173'))).toBe('http://127.0.0.1:4173');
  });

  it('sends a page at the old address to the same page on prepenny.co.uk, with what follows the "#"', () => {
    const page = (hostname: string) => ({
      hostname,
      pathname: '/join/',
      search: '?from=x',
      hash: '#secret',
    });
    expect(liveAddressFor(page(OLD_LIVE_HOST))).toBe('https://prepenny.co.uk/join/?from=x#secret');
    expect(liveAddressFor(page('prepenny.co.uk'))).toBeNull();
    expect(liveAddressFor(page('pr-31-prepenny.prepenny.workers.dev'))).toBeNull();
    expect(liveAddressFor(page('127.0.0.1'))).toBeNull();
  });
});

describe('finishing joining (D426)', () => {
  it('opens the join page with the invite after a "#", and reads it back', () => {
    const invite = '0190a3d0-0000-7000-8000-000000000001';
    expect(finishJoiningLink(invite)).toBe(`/join/#invite=${invite}`);
    expect(inviteIdFrom(`#invite=${invite}`)).toBe(invite);
    expect(inviteIdFrom('#abcdefghijklmnopqrstuvwxyz012345')).toBeNull();
    expect(tokenFrom(`#invite=${invite}`)).toBeNull();
  });

  it('turns the bank holidays refusal into its own problem', () => {
    expect(problemOf({ message: 'nation-changed' })).toEqual({ kind: 'nation-changed' });
    expect(problemOf({ message: 'allowed' })).toEqual({ kind: 'invite', state: 'allowed' });
    // A plan that couldn't move says so, never what was in it.
    expect(problemOf({ message: 'bad-record' })).toEqual({ kind: 'could-not-move' });
    expect(problemOf({ message: 'family-broken' })).toEqual({ kind: 'could-not-move' });
  });

  it('reads who was let in from the server, and nothing malformed', () => {
    expect(joiningOf([{ invite: 'a', inviter: 'Jess' }, { invite: 1 }, null])).toEqual([
      { invite: 'a', inviter: 'Jess' },
    ]);
    expect(joiningOf('nothing')).toEqual([]);
  });

  it("works out a row's id as the server does when it moves a plan (25-bring-your-plan.test.sql)", () => {
    expect(
      derivedId('00000000-0000-0000-0000-000000000001', 'ticks', 'series-1', '2026-11-01', ''),
    ).toBe('cf3d9097-5a3a-8576-a553-461f2d754e45');
  });
});

describe("an invite's bank holidays, only once let in (D439)", () => {
  const regions = { brings: true, nation: 'scotland', own_nation: 'england-and-wales' };

  it('knows a plan comes along before Allow, and never the bank holidays, even if sent', () => {
    for (const state of ['open', 'waiting'] as const) {
      const look = lookOf({ state, role: 'editor', inviter: 'Jess', ...regions });
      expect(look.brings).toBe(true);
      expect(look.holidays).toBeNull();
    }
  });

  it("gives both plans' bank holidays once allowed", () => {
    const look = lookOf({
      state: 'allowed',
      role: 'editor',
      inviter: 'Jess',
      invite: 'x',
      ...regions,
    });
    expect(look.holidays).toEqual({ nation: 'scotland', ownNation: 'england-and-wales' });
  });

  it('has nothing to bring, and no bank holidays, for someone with no plan of their own', () => {
    const look = lookOf({ state: 'allowed', role: 'editor', inviter: 'Jess', invite: 'x' });
    expect(look.brings).toBe(false);
    expect(look.holidays).toBeNull();
  });
});
