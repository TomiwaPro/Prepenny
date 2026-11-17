// How the offline helper reads a reminder that arrives (step 4e,
// service-worker/reminder.ts): its own words and tag, a tap opening only one
// of PrePenny's own pages, and PrePenny's name when it can't be read.

import { describe, expect, it } from 'vitest';
import { reminderOf } from '../../service-worker/reminder.ts';

describe('a reminder arriving on the phone', () => {
  it('shows its own words and tag, and a tap opens PrePenny', () => {
    expect(
      reminderOf(() => ({
        title: 'PrePenny',
        body: "Rent goes out tomorrow. You'll have £4.53 left until Friday.",
        tag: 'prepenny-evening',
        url: '/app/',
      })),
    ).toEqual({
      title: 'PrePenny',
      body: "Rent goes out tomorrow. You'll have £4.53 left until Friday.",
      tag: 'prepenny-evening',
      url: '/app/',
    });
  });

  it('a tap never opens anywhere but PrePenny', () => {
    for (const url of [
      'https://example.com/',
      '//example.com/app/',
      'javascript:alert(1)',
      '/sign-in/',
    ]) {
      expect(reminderOf(() => ({ title: 'PrePenny', body: 'x', tag: 't', url })).url).toBe('/app/');
    }
  });

  it("shows PrePenny's name when what arrived can't be read", () => {
    const shown = { title: 'PrePenny', body: '', tag: 'prepenny', url: '/app/' };
    expect(reminderOf(() => null)).toEqual(shown);
    expect(reminderOf(() => 'text')).toEqual(shown);
    expect(
      reminderOf(() => {
        throw new SyntaxError('not JSON');
      }),
    ).toEqual(shown);
    expect(reminderOf(() => ({ title: 3, body: 'x'.repeat(1001) }))).toEqual(shown);
  });
});
