// Step 4h (D596, D597): every sentence of the "?" sheets and the tour, for a
// plan, is what the engine works out for that plan. The figures are checked
// against the engine's own days and rows, not only against the words.

import { type PlanRecords, parsePounds as pounds } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { shortThreeRunning, TIGHT_TODAY } from '../../e2e/money-tight-plans.ts';
import { workOutActionsView } from '../../lib/actions-view.ts';
import { helpArticles } from '../../lib/help-articles.ts';
import { homeAccountId, workOutHome, workOutHomePlan } from '../../lib/home.ts';
import { workOutPlanView } from '../../lib/plan-view.ts';
import { tourSteps } from '../../lib/tour-steps.ts';
import { lowestWhy, notTickedWhy, tickingWhy, WHY_ARTICLES } from '../../lib/why.ts';
import { strings } from '../../strings/en-GB.ts';

const w = strings.why;
const t = strings.tour;
const day = (words: string) => words.replaceAll(' ', ' ');

describe("The lowest point's sheet", () => {
  const home = workOutHome(examplePlan, '2026-10-25');
  const words = lowestWhy(home);

  it("says why Sam's is on Sun 1 Nov, in his own figures", () => {
    expect(words.title).toBe(w.lowest.title(day('Sun 1 Nov')));
    expect(words.intro).toBe(w.lowest.intro('Current account'));
    expect(words.lines).toEqual([
      w.lowest.on(day('Sun 1 Nov'), 'Rent', '£4.53'),
      w.lowest.payAfter(day('Fri 6 Nov')),
      w.lowest.tight('£20'),
      w.lowest.raise,
    ]);
    expect(words.article).toBe(WHY_ARTICLES.balance);
  });

  it('is right about the engine: no day in the 12 months ends lower, Rent is the last payment that day, and Fri 6 Nov is the next main payday', () => {
    const plan = workOutHomePlan(examplePlan, '2026-10-25');
    const account = plan.accounts.find((one) => one.account.id === homeAccountId(examplePlan));
    const ahead = account?.days.filter((one) => one.date >= '2026-10-25') ?? [];
    expect(ahead.length).toBeGreaterThan(360);
    expect(Math.min(...ahead.map((one) => one.balance))).toBe(453);
    expect(ahead.filter((one) => one.balance < 453)).toEqual([]);
    const lowest = ahead.find((one) => one.date === '2026-11-01');
    expect(lowest?.balance).toBe(453);
    expect(lowest?.after?.payment.name).toBe('Rent');
    expect(lowest?.after?.date).toBe('2026-11-01');
    expect(plan.mainPaydays.find((one) => one > '2026-11-01')).toBe('2026-11-06');
    // Tight: under the £20 warning level, above £0.00.
    expect(account?.account.warningLevel).toBe(2000);
    expect(lowest?.status).toBe('tight');
  });

  it('says Short below £0.00, and nothing about Tight', () => {
    const short = lowestWhy(workOutHome(shortThreeRunning, TIGHT_TODAY));
    expect(short.lines).toContain(w.lowest.short);
    expect(short.lines.some((line) => line.startsWith('It says Tight'))).toBe(false);
  });

  it('says Short past an overdraft, naming the overdraft', () => {
    const withOverdraft: PlanRecords = {
      ...shortThreeRunning,
      accounts: shortThreeRunning.accounts.map((one) => ({
        ...one,
        overdraftLimit: pounds('10.00'),
      })),
    };
    const home = workOutHome(withOverdraft, TIGHT_TODAY);
    expect(home.lowest.status).toBe('short');
    expect(home.lowest.balance).toBeLessThan(-1000);
    expect(lowestWhy(home).lines).toContain(w.lowest.shortOverdraft('£10.00'));
  });

  it('says nothing about Tight or Short when it is neither, and without a main pay no payday', () => {
    const plain: PlanRecords = {
      ...shortThreeRunning,
      series: [],
      ticks: [],
      settings: { nation: 'england-and-wales', mainPayFamilyId: null },
    };
    const home = workOutHome(plain, TIGHT_TODAY);
    expect(home.lowest.status).toBe('ok');
    expect(home.lowest.after).toBeNull();
    expect(lowestWhy(home).lines).toEqual([
      w.lowest.onNothingYet(day('Wed 18 Nov'), '£120.00'),
      w.lowest.raise,
    ]);
  });
});

describe('The "Not ticked yet" sheet', () => {
  it("counts the account's payments from before today, and names the day the balance was checked", () => {
    const view = workOutPlanView(examplePlan, '2026-10-30');
    const account = view.accounts.find((one) => one.id === 'current');
    if (account === undefined) throw new Error('No current account.');
    expect(account.notTickedYet).toHaveLength(5);
    expect(account.notTickedYet.every((row) => row.date < '2026-10-30' && !row.ticked)).toBe(true);
    const words = notTickedWhy(account, '2026-10-30');
    expect(words.title).toBe(w.notTicked.title);
    expect(words.lines).toEqual([
      w.notTicked.count('Current account', 5),
      w.notTicked.before(day('Sun 25 Oct')),
      w.notTicked.howToTick,
    ]);
  });

  it('leaves out the balance check when every one is after it', () => {
    const view = workOutPlanView(examplePlan, '2026-10-30');
    const account = view.accounts.find((one) => one.id === 'current');
    if (account === undefined) throw new Error('No current account.');
    const after = {
      ...account,
      notTickedYet: account.notTickedYet.filter((row) => row.date > account.checkedOn),
    };
    expect(after.notTickedYet.length).toBeGreaterThan(0);
    expect(notTickedWhy(after, '2026-10-30').lines).toEqual([
      w.notTicked.count('Current account', after.notTickedYet.length),
      w.notTicked.howToTick,
    ]);
  });
});

describe("Update balance's ticking sheet", () => {
  const view = workOutActionsView(examplePlan, '2026-10-30');
  const account = view.accounts.find((one) => one.id === 'current');

  it('names what was typed, and the first payment to tick, going out', () => {
    if (account === undefined) throw new Error('No current account.');
    const first = account.toTick[0];
    expect(first?.name).toBe('Spending money until payday');
    expect(first?.change).toBe(-3000);
    expect(tickingWhy(pounds('600.00'), 'Current account', account.toTick).lines).toEqual([
      w.ticking.typed('£600.00', 'Current account'),
      w.ticking.out('Spending money until payday', '£30.00'),
    ]);
  });

  it('says "adds it again" for money coming in', () => {
    if (account === undefined) throw new Error('No current account.');
    const coming = account.toTick.find((row) => row.change > 0);
    if (coming === undefined) throw new Error('No money coming in to tick.');
    expect(tickingWhy(0, 'Current account', [coming]).lines[1]).toBe(
      w.ticking.in(coming.name, `£${(coming.change / 100).toFixed(2)}`),
    );
  });
});

describe('The articles the sheets link to', () => {
  it('are help articles, by their own titles', () => {
    const articles = helpArticles();
    for (const article of Object.values(WHY_ARTICLES)) {
      expect(articles.find((one) => one.slug === article.slug)?.title).toBe(article.title);
    }
  });
});

describe("The tour's steps", () => {
  it("walk round Home in five steps, in Sam's own figures", () => {
    const steps = tourSteps(workOutHome(examplePlan, '2026-10-25'));
    expect(steps.map((one) => one.target)).toEqual([
      '[data-tour="balance"]',
      '[data-testid="lowest-point"]',
      '[data-testid="next-due"]',
      '[data-tour="actions"]',
      '[data-tour="nav"]',
    ]);
    expect(steps.map((one) => one.title)).toEqual([
      t.balance.title,
      t.lowest.title,
      t.nextDue.title,
      t.actions.title,
      t.nav.title,
    ]);
    expect(steps[0]?.text).toBe(`${t.balance.text('Current account')} ${t.balance.leftToSpend}`);
    expect(steps[1]?.text).toBe(`${t.lowest.text('£4.53', day('Sun 1 Nov'))} ${t.lowest.why}`);
  });

  it('leave out Left to spend when there is none', () => {
    const plain: PlanRecords = {
      ...shortThreeRunning,
      series: [],
      ticks: [],
      settings: { nation: 'england-and-wales', mainPayFamilyId: null },
    };
    const home = workOutHome(plain, TIGHT_TODAY);
    expect(home.leftToSpend).toBeNull();
    expect(tourSteps(home)[0]?.text).toBe(t.balance.text('Current account'));
  });
});
