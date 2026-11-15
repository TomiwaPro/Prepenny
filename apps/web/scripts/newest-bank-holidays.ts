// Puts GOV.UK's newest bank holiday list on PrePenny's own site (step 4c,
// D537). Run by the Deploy workflow after the app is built, before it goes
// online: the build wrote the built-in copy to out/bank-holidays.json, and
// this swaps in the list just downloaded from GOV.UK when it's different,
// with its own version. Phones fetch it each week and never contact GOV.UK
// themselves (D57).
//
// The list is checked as the engine reads it first: anything else, and the
// built-in copy stays, with a warning. The same list keeps the day it was
// first put online (from the live site's copy), so its version doesn't
// change from one deploy to the next.
//
// Usage: node scripts/newest-bank-holidays.ts <GOV.UK file> <out/bank-holidays.json> [<live copy>]

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseBankHolidayList } from '@prepenny/engine';

/** The file phones fetch: the list, its version, and where it came from. */
export interface SiteCopy {
  readonly version: string;
  readonly source: string;
  readonly downloaded_on: string;
  readonly sha256: string;
  readonly list: unknown;
}

const SOURCE = 'https://www.gov.uk/bank-holidays.json';

/** Today in London, "YYYY-MM-DD". */
export function londonToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
}

/**
 * The copy to put online: GOV.UK's list just downloaded, or null to keep
 * `builtIn` when it's the same list. Throws when the download isn't a list
 * the engine can read.
 */
export function newestCopy(input: {
  readonly downloaded: Buffer;
  readonly builtIn: SiteCopy;
  readonly live: SiteCopy | null;
  readonly today: string;
}): SiteCopy | null {
  const list: unknown = JSON.parse(input.downloaded.toString('utf8'));
  parseBankHolidayList(list);
  const sha256 = createHash('sha256').update(input.downloaded).digest('hex');
  if (sha256 === input.builtIn.sha256) return null;
  const downloadedOn =
    input.live !== null && input.live.sha256 === sha256 ? input.live.downloaded_on : input.today;
  return {
    version: `${downloadedOn}:${sha256}`,
    source: SOURCE,
    downloaded_on: downloadedOn,
    sha256,
    list,
  };
}

function readCopy(path: string): SiteCopy | null {
  try {
    const copy = JSON.parse(readFileSync(path, 'utf8')) as Partial<SiteCopy>;
    return typeof copy.sha256 === 'string' && typeof copy.downloaded_on === 'string'
      ? (copy as SiteCopy)
      : null;
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const [downloaded, target, live] = process.argv.slice(2);
  if (downloaded === undefined || target === undefined) {
    throw new Error(
      'Usage: node scripts/newest-bank-holidays.ts <GOV.UK file> <out file> [<live copy>]',
    );
  }
  const builtIn = readCopy(target);
  if (builtIn === null) throw new Error(`${target} isn't the built-in copy the build writes.`);
  try {
    const copy = newestCopy({
      downloaded: readFileSync(downloaded),
      builtIn,
      live: live !== undefined && existsSync(live) ? readCopy(live) : null,
      today: londonToday(),
    });
    if (copy === null) {
      console.log(`GOV.UK's list is the built-in copy, ${builtIn.version}.`);
    } else {
      writeFileSync(target, `${JSON.stringify(copy)}\n`);
      console.log(`The site has GOV.UK's newest list, ${copy.version}.`);
    }
  } catch (error) {
    console.log(
      `::warning title=Built-in bank holidays::GOV.UK's list couldn't be read (${(error as Error).message}), so the site keeps the built-in copy, ${builtIn.version}.`,
    );
  }
}
