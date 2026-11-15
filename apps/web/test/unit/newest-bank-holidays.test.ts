// The site's bank holiday list (step 4c, D537): scripts/newest-bank-holidays.ts
// swaps GOV.UK's newest list into the build when it's different.

import { createHash } from 'node:crypto';
import list from '@prepenny/engine/data/bank-holidays.json';
import source from '@prepenny/engine/data/bank-holidays.source.json';
import { describe, expect, it } from 'vitest';
import { londonToday, newestCopy, type SiteCopy } from '../../scripts/newest-bank-holidays.ts';

const builtInBytes = Buffer.from(JSON.stringify(list));
const builtIn: SiteCopy = {
  version: `${source.downloaded_on}:${source.sha256}`,
  source: source.source,
  downloaded_on: source.downloaded_on,
  sha256: createHash('sha256').update(builtInBytes).digest('hex'),
  list,
};
const withOneOff = structuredClone(list) as typeof list;
withOneOff['england-and-wales'].events.push({
  title: 'A one-off bank holiday',
  date: '2028-05-08',
  notes: '',
  bunting: true,
});
const newBytes = Buffer.from(JSON.stringify(withOneOff));
const newSha = createHash('sha256').update(newBytes).digest('hex');

describe("GOV.UK's newest list on the site", () => {
  it('keeps the built-in copy when GOV.UK has the same list', () => {
    expect(
      newestCopy({ downloaded: builtInBytes, builtIn, live: null, today: '2026-11-16' }),
    ).toBeNull();
  });

  it("puts a different list online with today's date and its checksum", () => {
    expect(newestCopy({ downloaded: newBytes, builtIn, live: null, today: '2026-11-16' })).toEqual({
      version: `2026-11-16:${newSha}`,
      source: 'https://www.gov.uk/bank-holidays.json',
      downloaded_on: '2026-11-16',
      sha256: newSha,
      list: withOneOff,
    });
  });

  it('keeps the day the same list first went online, so its version stays the same', () => {
    const live = { ...builtIn, downloaded_on: '2026-11-09', sha256: newSha };
    expect(newestCopy({ downloaded: newBytes, builtIn, live, today: '2026-11-16' })?.version).toBe(
      `2026-11-09:${newSha}`,
    );
  });

  it("refuses a download that isn't a list the engine can read", () => {
    const noScotland: Partial<typeof list> = structuredClone(list);
    delete noScotland.scotland;
    for (const bytes of [Buffer.from('{bad'), Buffer.from(JSON.stringify(noScotland))]) {
      expect(() =>
        newestCopy({ downloaded: bytes, builtIn, live: null, today: '2026-11-16' }),
      ).toThrow();
    }
  });

  it('works out today in London, not in UTC', () => {
    expect(londonToday(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
    expect(londonToday(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
  });
});
