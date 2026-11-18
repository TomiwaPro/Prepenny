// Step 4g: every article in content/help (D587 to D589). Each reads; its
// words follow docs/VOICE.md; every other organisation's link and every
// phone number has a dated "Checked:" note saying where it was checked, on
// that organisation's own website; and the figures the articles give are
// the app's own. Searching finds the right article.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEBTS_MONTHS_AHEAD } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { rulesFromVoice, voiceProblems } from '../../../../scripts/check-voice.ts';
import { helpArticles } from '../../lib/help-articles.ts';
import { type Article, type Inline, textsOf } from '../../lib/help-markdown.ts';
import { MONEY_TIGHT_SLUG } from '../../lib/help-routes.ts';
import { hasSearchWords, searchEntries, searchHelp } from '../../lib/help-search.ts';
import { HOME_MONTHS_AHEAD } from '../../lib/plan-input.ts';
import { strings } from '../../strings/en-GB.ts';

const articles = helpArticles();
const bySlug = (slug: string) => articles.find((one) => one.slug === slug) as Article;

function linksIn(article: Article): Extract<Inline, { kind: 'link' }>[] {
  return article.blocks.flatMap((block) => {
    const inlines =
      block.kind === 'paragraph' ? [block.inlines] : block.kind === 'list' ? block.items : [];
    return inlines.flat().filter((one) => one.kind === 'link');
  });
}

describe('The help articles', () => {
  it("are the brief's topics, with Help when money is tight; billing comes with Phase 5", () => {
    expect(articles.map((one) => one.slug)).toEqual([
      'getting-started',
      'how-the-balance-works',
      'changing-payments',
      'updating-your-balance',
      'debts',
      'shared-plans',
      'pay-calculator',
      'sign-in-problems',
      'deleting-your-data',
      MONEY_TIGHT_SLUG,
    ]);
  });

  it('have titles that are statements, never questions (D58)', () => {
    for (const article of articles) {
      expect(article.title, article.file).not.toMatch(/\?/);
      expect(article.title, article.file).toMatch(/^[A-Z]/);
      expect(article.title, article.file).not.toMatch(/\.$/);
    }
    expect(bySlug(MONEY_TIGHT_SLUG).title).toBe(strings.help.moneyTight);
  });

  it('follow docs/VOICE.md: no banned word, long dash, exclamation mark or emoji', () => {
    const rules = rulesFromVoice(
      readFileSync(join(process.cwd(), '..', '..', 'docs', 'VOICE.md'), 'utf8'),
    );
    const problems = articles.flatMap((article) =>
      textsOf(article).flatMap((text) =>
        voiceProblems(text, rules).map((problem) => `${article.file}: ${problem} in "${text}"`),
      ),
    );
    expect(problems).toEqual([]);
  });

  it("give each other organisation's link and each phone number a dated note of where it was checked (D589)", () => {
    const missing: string[] = [];
    for (const article of articles) {
      const notes = article.checked.join(' ');
      for (const note of article.checked) {
        expect(note, article.file).toMatch(/\b\d{1,2} [A-Z][a-z]{2} \d{4}\b/);
      }
      for (const link of linksIn(article)) {
        if (link.to.kind === 'web' && !notes.includes(link.to.href)) {
          missing.push(`${article.file}: ${link.to.href}`);
        }
        if (link.to.kind === 'phone') {
          // The number people read is the number tapped, and the number checked.
          expect(link.text.replace(/\D/g, ''), article.file).toBe(
            link.to.href.slice('tel:'.length),
          );
          if (!notes.includes(link.text)) missing.push(`${article.file}: ${link.text}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('link to each organisation on its own website', () => {
    const hosts = (slug: string) =>
      new Set(
        linksIn(bySlug(slug)).flatMap((link) =>
          link.to.kind === 'web' ? [new URL(link.to.href).host] : [],
        ),
      );
    expect([...hosts(MONEY_TIGHT_SLUG)].sort()).toEqual([
      'nationaldebtline.org',
      'survivingeconomicabuse.org',
      'www.citizensadvice.org.uk',
      'www.stepchange.org',
    ]);
    expect([...hosts('shared-plans')]).toEqual(['survivingeconomicabuse.org']);
  });

  it("give the app's own figures", () => {
    const has = (slug: string, words: string) =>
      expect(textsOf(bySlug(slug)).join(' '), slug).toContain(words);
    // Each figure, beside the words or constant in the app that it comes from.
    expect(strings.welcome.once).toContain('about 5 minutes');
    has('getting-started', 'about 5 minutes');
    expect(strings.setup.partOf(3, 3, strings.setup.parts['your-plan'])).toBe(
      'Part 3 of 3: Your plan',
    );
    has('getting-started', 'There are 6 screens, in 3 parts');
    expect(strings.signIn.emailHint).toContain('6-digit code');
    has('getting-started', '6-digit code');
    expect(HOME_MONTHS_AHEAD).toBe(12);
    has('how-the-balance-works', 'looking 12 months ahead');
    expect(DEBTS_MONTHS_AHEAD).toBe(24);
    has('debts', 'within 24 months');
    expect(strings.share.linkLine).toContain('It lasts 7 days and works once.');
    has('shared-plans', 'It lasts 7 days and works once.');
    expect(strings.signIn.sentTo('sam@example.com')).toContain('It lasts 10 minutes.');
    has('sign-in-problems', 'A code lasts 10 minutes.');
    expect(strings.getBackIn.whatHappens).toContain('takes 24 hours');
    has('sign-in-problems', 'this takes 24 hours');
    expect(strings.yourData.whenGone).toContain('are gone within 30 days');
    has('deleting-your-data', 'are gone within 30 days');
    expect(strings.home.spendNoMoreThan('£16.54', '£20', 'Fri 30 Oct')).toBe(
      'Spend no more than £16.54 to keep at least £20 until Fri 30 Oct.',
    );
    has(
      'how-the-balance-works',
      '"Spend no more than £16.54 to keep at least £20 until Fri 30 Oct."',
    );
    expect(strings.updateBalance.less('£4.53')).toBe("That's £4.53 less.");
    has('updating-your-balance', `"${strings.updateBalance.less('£4.53')}"`);
    expect(strings.rows.left('£4.53')).toBe('£4.53 left');
    has('how-the-balance-works', '"£4.53 left"');
    expect(strings.home.shortOn('£40.00', 'Sun 1 Nov')).toBe('£40.00 short on Sun 1 Nov.');
    has('how-the-balance-works', '"£40.00 short on Sun 1 Nov."');
    expect(strings.pay.notAdvice).toBe('An estimate, not tax advice.');
    has('pay-calculator', "It's an estimate, not tax advice.");
    expect(strings.setup.pay.taxCodeHint).toContain('Most people have 1257L.');
    has('pay-calculator', 'Most people have 1257L.');
  });

  it("name the app's own buttons and screens", () => {
    // Every bold name in an article is words the app shows, in a string or
    // in the words around a figure, such as "Left to spend until ${date}".
    const words: string[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === 'string') words.push(value);
      else if (typeof value === 'function') words.push(String(value));
      else if (value !== null && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(strings);
    const shown = words.join('\n');
    const named = articles.flatMap((article) =>
      article.blocks.flatMap((block) => {
        const inlines =
          block.kind === 'paragraph' ? [block.inlines] : block.kind === 'list' ? block.items : [];
        return inlines
          .flat()
          .filter((one) => one.kind === 'strong')
          .map((one) => ({ file: article.file, text: one.text }));
      }),
    );
    expect(named.length).toBeGreaterThan(40);
    const unknown = named.filter((one) => !shown.includes(one.text));
    expect(unknown).toEqual([]);
  });
});

describe('Searching the help articles (D588)', () => {
  const entries = searchEntries(articles);
  const first = (query: string) => searchHelp(entries, query)[0]?.slug;
  const all = (query: string) => searchHelp(entries, query).map((one) => one.slug);

  it('finds the article a person means, best first', () => {
    expect(first('debt')).toBe('debts');
    expect(first('delete my account')).toBe('deleting-your-data');
    expect(first("can't sign in")).toBe('sign-in-problems');
    expect(first('update balance')).toBe('updating-your-balance');
    expect(first('take-home pay')).toBe('pay-calculator');
    expect(first('payslip')).toBe('pay-calculator');
    expect(first('StepChange')).toBe(MONEY_TIGHT_SLUG);
    expect(first('struggling with money')).toBe(MONEY_TIGHT_SLUG);
    expect(first('undo')).toBe('changing-payments');
    expect(all('overdrawn')).toContain('how-the-balance-works');
    expect(all('partner controls my money')).toContain('shared-plans');
    expect(all('lowest point')).toContain('how-the-balance-works');
  });

  it('gives the sentence it found the first word in', () => {
    const [found] = searchHelp(entries, 'Relay UK');
    expect(found?.slug).toBe(MONEY_TIGHT_SLUG);
    expect(found?.line).toContain('Relay UK');
  });

  it('finds nothing for words in no article, and leaves out words too common to count', () => {
    expect(searchHelp(entries, 'zebra crossing')).toEqual([]);
    expect(hasSearchWords('how do I')).toBe(false);
    expect(searchHelp(entries, 'how do I')).toEqual([]);
    expect(hasSearchWords('  ')).toBe(false);
  });
});
