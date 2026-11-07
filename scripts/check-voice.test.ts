// Tests for scripts/check-voice.ts. Run with `pnpm test` (node --test).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  rulesFromVoice,
  stringsIn,
  voiceProblems,
  wordsInEmail,
  wordsInScreens,
} from './check-voice.ts';

const voice = readFileSync(join(import.meta.dirname, '..', 'docs', 'VOICE.md'), 'utf8');
const rules = rulesFromVoice(voice);
const problems = (text: string) => voiceProblems(text, rules);

describe('the banned words, read from VOICE.md', () => {
  it('finds every item on both lists', () => {
    const words = rules.map((rule) => rule.words);
    assert.deepEqual(words.slice(0, 5), [
      'transaction',
      'recurrence',
      'projection',
      'accrual',
      'categorisation',
    ]);
    for (const expected of [
      'seamless',
      'unlock',
      'game-changer',
      'smart',
      'simply',
      'take control of your finances',
      "we've got you covered",
      "whether you're ... or ...",
      "it's not just ..., it's ...",
      'AI-powered',
    ]) {
      assert.ok(words.includes(expected), `missing ${expected}`);
    }
    assert.equal(words.length, 34);
  });

  it('fails if VOICE.md loses the list', () => {
    assert.throws(() => rulesFromVoice('# Voice\n\nNo lists here.'));
  });
});

describe('voiceProblems', () => {
  it('passes the app’s own kind of sentence', () => {
    assert.deepEqual(
      problems('Spend no more than £22.54 to keep at least £20 until Fri 30 Oct.'),
      [],
    );
    assert.deepEqual(problems('Lowest point ahead'), []);
    assert.deepEqual(problems('−£30.00'), []);
    assert.deepEqual(problems('Write ranges as 2 to 3.'), []);
  });

  it('finds a banned word in any form and any case', () => {
    assert.deepEqual(problems('Unlock your money'), ['the banned "unlock"']);
    assert.deepEqual(problems('Your plan, unlocked'), ['the banned "unlock"']);
    assert.deepEqual(problems('Every transaction'), ['the banned "transaction"']);
    assert.deepEqual(problems('Seamlessly'), ['the banned "seamless"']);
    assert.deepEqual(problems('A smart planner'), ['the banned "smart"']);
    assert.deepEqual(problems('It is simply done'), ['the banned "simply"']);
  });

  it('finds banned phrases, with any words where VOICE.md has "..."', () => {
    assert.deepEqual(problems('Take control of your finances today'), [
      'the banned "take control of your finances"',
    ]);
    assert.deepEqual(problems('We’ve got you covered'), ['the banned "we\'ve got you covered"']);
    assert.deepEqual(problems("Whether you're paid weekly or monthly"), [
      'the banned "whether you\'re ... or ..."',
    ]);
    assert.deepEqual(problems("It's not just a budget, it's a plan"), [
      'the banned "it\'s not just ..., it\'s ..."',
    ]);
  });

  it('finds long dashes, exclamation marks and emoji', () => {
    assert.deepEqual(problems('Rent — tomorrow'), ['a long dash (—)']);
    assert.deepEqual(problems('2–3 days'), ['a long dash (–)']);
    assert.deepEqual(problems('Done!'), ['an exclamation mark']);
    assert.deepEqual(problems('Paid off \u{1F389}'), ['an emoji']);
  });

  it('allows the hyphen in a word like pay-later', () => {
    assert.deepEqual(problems('On the pay-later card: £80.00 left until Sat 28 Nov'), []);
  });
});

describe('stringsIn', () => {
  it('reads the words in strings and templates, but not comments or names', () => {
    const found = stringsIn(
      [
        '// A comment — with a long dash, never shown',
        "const unlock = 'Rent';",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: this is code for the check to read
        'const line = (amount: string) => `Spend no more than ${amount} today`;',
      ].join('\n'),
    );
    assert.deepEqual(
      found.map((one) => [one.text, one.line]),
      [
        ['Rent', 2],
        ['Spend no more than … today', 3],
      ],
    );
  });
});

describe('wordsInScreens', () => {
  it('finds words written into a screen instead of the strings file', () => {
    const found = wordsInScreens(
      [
        'export const A = () => (',
        '  <main aria-label="Home">',
        '    <h1>{strings.home.heading}</h1>',
        '    <p>Left to spend</p>',
        '    <Card heading="Next due" className="card wide" />',
        "    <p>{'Coming in'}</p>",
        '    <svg aria-hidden="true" viewBox="0 0 24 24" />',
        '  </main>',
        ');',
      ].join('\n'),
    );
    assert.deepEqual(
      found.map((one) => [one.text, one.line]),
      [
        ['Home', 2],
        ['Left to spend', 4],
        ['Next due', 5],
        ['Coming in', 6],
      ],
    );
  });
});

describe('wordsInEmail', () => {
  it('reads the words people read in an email, not its comments, styles or Supabase places', () => {
    const found = wordsInEmail(
      '<!doctype html>\n<!-- a note, unlock -->\n<head><title>Code</title><style>p{}</style></head>\n<p>Your code is</p>\n<p>{{ .Token }}</p>\n<a href="{{ .SiteURL }}">Sign in to PrePenny</a>',
    );
    assert.deepEqual(
      found.map((one) => one.text),
      ['Your code is', 'Sign in to PrePenny'],
    );
  });

  it('finds a banned word in an email', () => {
    const rules = rulesFromVoice(
      readFileSync(join(import.meta.dirname, '..', 'docs', 'VOICE.md'), 'utf8'),
    );
    const [found] = wordsInEmail('<p>Sign in to unlock your plan!</p>');
    assert.ok(found);
    assert.ok(voiceProblems(found.text, rules).length >= 2);
  });
});
