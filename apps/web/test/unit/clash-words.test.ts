// The words for a clash and a refused change (step 3d, lib/clash-words.ts),
// and the phone's clock corrected against the server's (data/clock.ts).

import { describe, expect, it } from 'vitest';
import type { ClashToShow } from '../../data/clashes.ts';
import { clockFrom, correctedTime } from '../../data/clock.ts';
import type { ClashFacts } from '../../lib/clash.ts';
import { clashWords } from '../../lib/clash-words.ts';

const TODAY = '2026-11-08';
const rent: ClashFacts = {
  by: 'tom',
  name: 'Rent',
  on: '2026-12-01',
  theirs: { kind: 'amount', amount: 65000 },
  ours: { kind: 'amount', amount: 64000 },
};
const putBack = { commands: [], payments: [] };

function clash(
  kind: ClashToShow['kind'],
  facts: ClashFacts,
  who: ClashToShow['who'],
  more: Partial<ClashToShow> = {},
): ClashToShow {
  return { id: 'one', planId: 'plan', kind, facts, at: 0, who, ...more };
}

// Dates are joined with non-breaking spaces, so they never split across lines.
const words = (text: string) => text.replaceAll(' ', ' ');

describe('The words of a clash', () => {
  it("Tom's newer change is kept: the owner's example, with the payment's date", () => {
    const said = clashWords(
      clash('kept-theirs', rent, { kind: 'partner', nickname: 'Tom' }, { putBack }),
      TODAY,
    );
    expect(said.title).toBe('Changed on two phones');
    expect(words(said.message)).toBe(
      "Tom changed Rent on Tue 1 Dec to £650 after you changed it to £640. Tom's change is kept.",
    );
    expect(said.putBack).toBe('Put mine back');
    expect(said.keep).toBe("Keep Tom's change");
  });

  it('a change of this phone that a newer one replaced says the same', () => {
    const said = clashWords(
      clash('replaced', rent, { kind: 'partner', nickname: 'Jess' }, { putBack }),
      TODAY,
    );
    expect(words(said.message)).toBe(
      "Jess changed Rent on Tue 1 Dec to £650 after you changed it to £640. Jess's change is kept.",
    );
  });

  it('the person\'s own two phones: "your other phone"', () => {
    const said = clashWords(
      clash('kept-theirs', rent, { kind: 'other-phone' }, { putBack }),
      TODAY,
    );
    expect(words(said.message)).toBe(
      "Your other phone changed Rent on Tue 1 Dec to £650 after you changed it to £640 on this phone. Your other phone's change is kept.",
    );
    expect(said.keep).toBe("Keep your other phone's change");
  });

  it('a partner with no nickname yet is "your partner"', () => {
    const said = clashWords(
      clash('kept-theirs', rent, { kind: 'partner', nickname: '' }, { putBack }),
      TODAY,
    );
    expect(words(said.message)).toMatch(/^Your partner changed Rent/);
    expect(words(said.message)).toMatch(/Your partner's change is kept\.$/);
    expect(said.keep).toBe("Keep your partner's change");
  });

  it('moved, removed and marked as paid each say what happened', () => {
    const said = (theirs: ClashFacts['theirs'], ours: ClashFacts['ours']) =>
      words(
        clashWords(
          clash('kept-theirs', { ...rent, theirs, ours }, { kind: 'partner', nickname: 'Tom' }),
          TODAY,
        ).message,
      );
    expect(said({ kind: 'moved', to: '2026-12-04' }, { kind: 'moved', to: '2026-12-02' })).toBe(
      "Tom moved Rent on Tue 1 Dec to Fri 4 Dec after you moved it to Wed 2 Dec. Tom's change is kept.",
    );
    expect(said({ kind: 'removed' }, { kind: 'amount', amount: 64050 })).toBe(
      "Tom removed Rent on Tue 1 Dec after you changed it to £640.50. Tom's change is kept.",
    );
    expect(said({ kind: 'not-paid' }, { kind: 'paid' })).toBe(
      "Tom marked Rent on Tue 1 Dec as not paid after you marked it as paid. Tom's change is kept.",
    );
  });

  it("a change that can't be made any more has nothing to put back", () => {
    const said = clashWords(
      clash('cant', { ...rent, theirs: { kind: 'removed' } }, { kind: 'partner', nickname: 'Tom' }),
      TODAY,
    );
    expect(words(said.message)).toBe(
      "Tom removed Rent on Tue 1 Dec, so your change to it can't be made. Make it again if you still want it.",
    );
    expect(said.putBack).toBeNull();
    const changed = clashWords(
      clash('cant', { ...rent, theirs: { kind: 'changed' } }, { kind: 'partner', nickname: 'Tom' }),
      TODAY,
    );
    expect(words(changed.message)).toBe(
      "Tom changed Rent on Tue 1 Dec after you changed it to £640. Yours can't be made on the plan as it is now, so it wasn't saved.",
    );
    expect(said.putBack).toBeNull();
    expect(said.keep).toBe('Got it');
  });

  it('a change the account refused says plainly what happened to it (PLAN.md item 32)', () => {
    const said = clashWords(
      clash('refused', { ...rent, by: null }, { kind: 'other-phone' }, { code: 'bad-record' }),
      TODAY,
    );
    expect(said.title).toBe("A change wasn't saved");
    expect(words(said.message)).toBe(
      "Your change to Rent on Tue 1 Dec wasn't saved in your account, so it has been taken off this phone. Make it again if you still want it.",
    );
    expect(said.putBack).toBeNull();
    const viewOnly = clashWords(
      clash('refused', { ...rent, by: null }, { kind: 'other-phone' }, { code: 'not-allowed' }),
      TODAY,
    );
    expect(words(viewOnly.message)).toMatch(/You can look at this plan but not change it\.$/);
  });
});

describe("The phone's clock, corrected against the server's", () => {
  it('a phone an hour fast takes an hour off', () => {
    const phone = Date.parse('2026-11-08T11:00:00.000Z');
    const clock = clockFrom('2026-11-08T10:00:00.100Z', phone, phone + 200);
    expect(clock).toEqual({ offsetMs: -3_600_000, roundTripMs: 200 });
    expect(correctedTime(phone + 60_000, clock)).toBe('2026-11-08T10:01:00.000Z');
  });

  it('a phone a day slow adds a day', () => {
    const phone = Date.parse('2026-11-07T10:00:00.000Z');
    const clock = clockFrom('2026-11-08T10:00:00.050Z', phone, phone + 100);
    expect(clock?.offsetMs).toBe(86_400_000);
    expect(correctedTime(phone, clock)).toBe('2026-11-08T10:00:00.000Z');
  });

  it('an answer that took too long, or no time from the server, is not used', () => {
    expect(clockFrom('2026-11-08T10:00:00.000Z', 0, 20_000)).toBeNull();
    expect(clockFrom(undefined, 0, 100)).toBeNull();
    expect(correctedTime(Date.parse('2026-11-08T10:00:00.000Z'), null)).toBe(
      '2026-11-08T10:00:00.000Z',
    );
  });
});
