// A copy of GOV.UK's bank holiday list with its version (D57, step 4c). The
// app keeps the copy a plan uses with the plan, so every phone works the
// plan's dates out from the same list (D536), and takes a newer copy from
// PrePenny's own site each week (D537). The version says which copy is newer.

import { EngineInputError } from '../errors.ts';
import { type OfficialBankHolidays, parseBankHolidayList } from './bank-holidays.ts';
import { parseDate } from './day.ts';

/** One copy of GOV.UK's bank holiday list, and which one it is. */
export interface BankHolidayCopy {
  /**
   * "YYYY-MM-DD:" and the list's SHA-256 checksum in hex: the day this list
   * was downloaded from GOV.UK (Europe/London), and what's in it.
   */
  readonly version: string;
  /** GOV.UK's list, in the shape of https://www.gov.uk/bank-holidays.json. */
  readonly list: unknown;
}

const VERSION = /^(\d{4}-\d{2}-\d{2}):([0-9a-f]{64})$/;

interface VersionParts {
  readonly downloadedOn: string;
  readonly sha256: string;
}

function partsOf(version: unknown, what: string): VersionParts {
  const match = typeof version === 'string' ? VERSION.exec(version) : null;
  if (match === null) {
    throw new EngineInputError(
      'bad-bank-holiday-list',
      `${what} must be a date and a checksum, "YYYY-MM-DD:" then 64 hex digits.`,
    );
  }
  const downloadedOn = match[1] as string;
  parseDate(downloadedOn, `${what}: the date`);
  return { downloadedOn, sha256: match[2] as string };
}

/** The version of a list downloaded on a day with a checksum, as the source file beside it gives them. */
export function bankHolidayVersion(downloadedOn: string, sha256: string): string {
  const version = `${downloadedOn}:${sha256.toLowerCase()}`;
  partsOf(version, 'The bank holiday version');
  return version;
}

/**
 * Checks a copy: its version, and its list as GOV.UK's (parseBankHolidayList).
 * Gives back the copy and the list read.
 */
export function checkBankHolidayCopy(copy: unknown): {
  readonly copy: BankHolidayCopy;
  readonly official: OfficialBankHolidays;
} {
  if (typeof copy !== 'object' || copy === null || Array.isArray(copy)) {
    throw new EngineInputError('bad-bank-holiday-list', 'The bank holiday copy must be an object.');
  }
  const { version, list } = copy as { version?: unknown; list?: unknown };
  partsOf(version, 'The bank holiday version');
  const official = parseBankHolidayList(list);
  return { copy: { version: version as string, list }, official };
}

/**
 * True when the list with version `candidate` is newer than the one with
 * version `than` (D536): a different list, downloaded on a later day, or on
 * the same day with the larger checksum, so every phone chooses the same.
 * The same list downloaded again on another day isn't newer: its checksum is
 * the same. Any list is newer than none.
 */
export function isNewerBankHolidayVersion(candidate: string, than: string | null): boolean {
  const next = partsOf(candidate, 'The newer bank holiday version');
  if (than === null) return true;
  const now = partsOf(than, 'The bank holiday version');
  if (next.sha256 === now.sha256) return false;
  if (next.downloadedOn !== now.downloadedOn) return next.downloadedOn > now.downloadedOn;
  return next.sha256 > now.sha256;
}

/** True when the two versions are the same list: the same checksum, whatever day it was downloaded. */
export function sameBankHolidayList(a: string, b: string): boolean {
  return (
    partsOf(a, 'A bank holiday version').sha256 === partsOf(b, 'A bank holiday version').sha256
  );
}
