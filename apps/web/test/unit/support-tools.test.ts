// Step 4j (D617 to D625): what the phone says and reads for the support
// tools. The database tests prove who may see what
// (supabase/tests/database/40-support-tools.test.sql); these prove the words.

import { describe, expect, it } from 'vitest';
import {
  type ActivityContext,
  type ActivityEdit,
  activityWords,
} from '../../lib/activity-words.ts';
import { taxYearWords } from '../../lib/tax-year-check.ts';
import { strings } from '../../strings/en-GB.ts';

const JESS = 'jess-id';
const TOM = 'tom-id';
const context: ActivityContext = {
  me: TOM,
  nicknames: { [JESS]: 'Jess', [TOM]: 'Tom' },
  today: '2026-11-13',
  nameOf: () => null,
  comesIn: () => false,
};
const edit = (over: Partial<ActivityEdit>): ActivityEdit => ({
  id: 'e1',
  by: JESS,
  madeAt: '2026-11-13T14:05:00Z',
  kind: 'support-access',
  mine: false,
  undone: false,
  undoes: null,
  canUndo: false,
  summary: null,
  records: [],
  ...over,
});

describe('Support access in Activity (question 13, D618)', () => {
  it('Tom is told Jess let support see the plan, until the day it ends by itself', () => {
    expect(activityWords(edit({ summary: { until: '2026-11-20' } }), context)).toBe(
      'Jess let PrePenny support see the plan until Fri 20 Nov.',
    );
  });

  it('and that she stopped it', () => {
    expect(activityWords(edit({ summary: { ended: true } }), context)).toBe(
      'Jess stopped PrePenny support seeing the plan.',
    );
  });

  it('Jess reads it as her own', () => {
    expect(
      activityWords(edit({ mine: true, summary: { until: '2027-01-02' } }), {
        ...context,
        me: JESS,
      }),
    ).toBe('You let PrePenny support see the plan until Sat 2 Jan 2027.');
  });
});

describe('The tax year check (brief 4.15, D45, D625)', () => {
  it('says nothing is missing until 1 March', () => {
    expect(taxYearWords('2027-02-28')).toEqual({
      missing: [],
      lines: [strings.supportTools.taxYearFine],
    });
  });

  it('from 1 March, names next tax year and the day it starts', () => {
    expect(taxYearWords('2027-03-01')).toEqual({
      missing: ['2027-28'],
      lines: [
        'The pay calculator has no tax file for the 2027 to 2028 tax year, which starts on Tue 6 Apr 2027. Ask Claude Code to add it (step 4r) before then.',
      ],
    });
  });
});

describe('Ready replies (brief 4.16, D626)', () => {
  it('the one for someone in distress has Samaritans and free debt advice, as checked on their websites', () => {
    const distress = strings.supportTools.ready.find((one) => one.key === 'distress');
    const words = distress?.words.join('\n') ?? '';
    expect(words).toContain('Call 116 123, free from any phone.');
    expect(words).toContain('StepChange: 0800 138 1111');
    expect(words).toContain('National Debtline: 0808 808 4000');
    expect(words).toContain("Citizens Advice's debt helpline: 0800 240 4420");
  });

  it('none holds an amount, a payment name or a note', () => {
    for (const one of strings.supportTools.ready) {
      expect(one.words.join(' ')).not.toMatch(/£/);
    }
  });
});
