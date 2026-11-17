// PrePenny's own site's bank holiday list, played by the tests (step 4c):
// the built-in list with one-off bank holidays added, as GOV.UK added the
// coronation's, or no signal for that one file.

import { createHash } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';
import { officialJson } from '../../../packages/engine/test/fixtures/holidays.ts';
import { sql } from './two-phones.ts';

type Event = { title: string; date: string; notes: string; bunting: boolean };
type GovUk = Record<string, { division?: string; events: Event[] }>;

/** The site's file: the built-in list with one-off bank holidays added in England and Wales. */
export function siteList(extra: readonly string[], downloadedOn = '2026-10-30') {
  const list = structuredClone(officialJson) as GovUk;
  for (const date of extra) {
    list['england-and-wales']?.events.push({
      title: 'A one-off bank holiday',
      date,
      notes: '',
      bunting: true,
    });
  }
  const sha256 = createHash('sha256').update(JSON.stringify(list)).digest('hex');
  return {
    version: `${downloadedOn}:${sha256}`,
    source: 'https://www.gov.uk/bank-holidays.json',
    downloaded_on: downloadedOn,
    sha256,
    list,
  };
}

/**
 * What PrePenny's own site answers for the bank holiday list from now on:
 * a list, or no signal. Counts each time the phone asks.
 */
export async function siteHas(
  context: BrowserContext,
  body: ReturnType<typeof siteList> | 'no signal',
): Promise<{ asked: number }> {
  const count = { asked: 0 };
  await context.unroute('**/bank-holidays.json');
  await context.route('**/bank-holidays.json', (route) => {
    count.asked += 1;
    return body === 'no signal'
      ? route.abort('internetdisconnected')
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'cache-control': 'no-store' },
          body: JSON.stringify(body),
        });
  });
  return count;
}

/**
 * The database's own weekly fetch of PrePenny's site (step 4e, D545), played
 * by the tests: the list is kept as one the database fetched, so a phone
 * sending it is believed. Only kept, not given to every plan as the real
 * fetch does (app.take_bank_holiday_list), so tests running beside this one
 * keep their own lists.
 */
export function databaseFetched(file: ReturnType<typeof siteList>) {
  const quoted = (text: string) => `'${text.replaceAll("'", "''")}'`;
  sql(
    `insert into app.bank_holiday_lists (list_version, list) values (${quoted(file.version)}, ${quoted(JSON.stringify(file.list))}::jsonb) on conflict do nothing`,
  );
}
