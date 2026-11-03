// A setting for the end-to-end tests only (D201): a different "today", or a
// test plan in place of Sam's example. The real app can't reach it. It's
// read only in a browser that test software is driving, which says so with
// `navigator.webdriver` (people's own browsers never set it), and only from
// a value the tests put on the page before PrePenny starts. Nothing on
// screen, no web address and nothing stored on the phone turns it on.

import type { PlanRecords } from '@prepenny/engine';

/** What a test can set. */
export interface TestSetting {
  /** "Today" for the plan, "YYYY-MM-DD", in place of the example's Sun 25 Oct 2026 (D133). */
  readonly today?: string;
  /** A plan to use in place of the example, such as the example with a budget added. */
  readonly plan?: PlanRecords;
}

/** Where the tests put the setting, with Playwright's `addInitScript`. */
export const TEST_SETTING_KEY = '__prepennyTestSetting';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The test setting, or null in every browser that isn't driven by test software. */
export function testSetting(): TestSetting | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  if (navigator.webdriver !== true) return null;
  const value: unknown = Reflect.get(window, TEST_SETTING_KEY);
  if (value === null || typeof value !== 'object') return null;
  const { today, plan } = value as { readonly today?: unknown; readonly plan?: unknown };
  return {
    ...(typeof today === 'string' && DATE.test(today) ? { today } : {}),
    ...(plan !== null && typeof plan === 'object' ? { plan: plan as PlanRecords } : {}),
  };
}
