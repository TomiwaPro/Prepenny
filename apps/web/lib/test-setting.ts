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
  /**
   * Opens on the example when this phone hasn't chosen a plan yet, as the
   * tests from before setup expect (step 2e). A test plan does the same.
   */
  readonly example?: true;
  /**
   * The version this copy of PrePenny says it is, in place of its own
   * (step 3e, lib/version.ts), so a test can play a phone still on an older
   * version. Once that phone has updated itself and loaded afresh, it's its
   * own version again: an updated phone is on the new version.
   */
  readonly version?: { readonly database: string; readonly build: string };
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
  const { today, plan, example, version } = value as {
    readonly today?: unknown;
    readonly plan?: unknown;
    readonly example?: unknown;
    readonly version?: { readonly database?: unknown; readonly build?: unknown } | null;
  };
  return {
    ...(typeof today === 'string' && DATE.test(today) ? { today } : {}),
    ...(plan !== null && typeof plan === 'object' ? { plan: plan as PlanRecords } : {}),
    ...(example === true ? { example } : {}),
    ...(typeof version?.database === 'string' &&
    typeof version.build === 'string' &&
    !updatedInTest()
      ? { version: { database: version.database, build: version.build } }
      : {}),
  };
}

/** Where a test phone notes it has updated itself, for this tab only. */
const UPDATED_KEY = 'prepenny-test-updated';

function updatedInTest(): boolean {
  try {
    return sessionStorage.getItem(UPDATED_KEY) !== null;
  } catch {
    return false;
  }
}

/** A test phone playing an older version has updated itself: from now on it's its own version. */
export function noteUpdatedInTest(): void {
  if (testSetting()?.version === undefined) return;
  try {
    sessionStorage.setItem(UPDATED_KEY, '1');
  } catch {
    // Nothing kept: the test sees the phone stay on its older version.
  }
}
