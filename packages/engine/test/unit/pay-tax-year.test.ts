// The tax year file (brief 4.15, ARCHITECTURE.md 2.7) and the tax year
// check (D45): test 6 of step 1f, and checks that every figure in the
// 2026-27 file carries its GOV.UK source and agrees with the GOV.UK pages.

import { describe, expect, it } from 'vitest';
import {
  checkTaxYear,
  checkTaxYearFiles,
  parseDate,
  TAX_YEAR_FILES,
  type TaxYearFile,
  taxYearFor,
  taxYearName,
  taxYearsOf,
  workOutTakeHome,
} from '../../src/index.ts';
import file202627 from '../../src/pay/tax-years/2026-27.json' with { type: 'json' };

const file = file202627 as TaxYearFile;
const year = checkTaxYear(file);

/** The top of each band but the last, in whole pounds: the running total of the widths. */
function bandTops(bands: readonly { readonly width: bigint | null }[]): number[] {
  const tops: number[] = [];
  let total = 0;
  for (const band of bands) {
    if (band.width === null) break;
    total += Number(band.width);
    tops.push(total);
  }
  return tops;
}

/** Every figure in a tax year file, wherever it is. */
function figures(
  value: unknown,
  path: string[] = [],
): { path: string; figure: Record<string, unknown> }[] {
  if (value === null || typeof value !== 'object') return [];
  if ('value' in value && 'source' in value) {
    return [{ path: path.join('.'), figure: value as Record<string, unknown> }];
  }
  return Object.entries(value).flatMap(([key, inner]) => figures(inner, [...path, key]));
}

describe('test 6 (D45): the tax year check', () => {
  it('warns on Mon 1 Mar 2027 that there is no 2027-28 file', () => {
    expect(checkTaxYearFiles('2027-03-01')).toEqual({
      needed: ['2026-27', '2027-28'],
      missing: ['2027-28'],
    });
  });

  it('doesn’t warn on Sun 28 Feb 2027', () => {
    expect(checkTaxYearFiles('2027-02-28')).toEqual({ needed: ['2026-27'], missing: [] });
  });

  it('doesn’t warn on 1 March once the next file is there', () => {
    const next = {
      ...file,
      taxYear: '2027-28',
      firstDay: { ...file.firstDay, value: '2027-04-06' },
      lastDay: { ...file.lastDay, value: '2028-04-05' },
    };
    expect(checkTaxYearFiles('2027-03-01', [file, next]).missing).toEqual([]);
  });

  it('warns about this year too, after 5 April, if its file is still missing', () => {
    expect(checkTaxYearFiles('2027-04-06').missing).toEqual(['2027-28']);
  });
});

describe('the 2026-27 tax year file', () => {
  it('is the one built-in file, for 6 April 2026 to 5 April 2027', () => {
    expect(TAX_YEAR_FILES.map((one) => one.taxYear)).toEqual(['2026-27']);
    expect([taxYearName(parseDate('2026-04-05')), taxYearName(parseDate('2026-04-06'))]).toEqual([
      '2025-26',
      '2026-27',
    ]);
    expect(taxYearFor(parseDate('2027-04-05'), taxYearsOf()).id).toBe('2026-27');
    expect(() => taxYearFor(parseDate('2027-04-06'), taxYearsOf())).toThrow(
      expect.objectContaining({ code: 'no-tax-year' }),
    );
  });

  it('gives every figure its www.gov.uk source link, and says where on the page', () => {
    const all = figures(file);
    expect(all.length).toBeGreaterThan(60);
    for (const { path, figure } of all) {
      expect([path, String(figure.source)]).toEqual([
        path,
        expect.stringMatching(/^https:\/\/www\.gov\.uk\//),
      ]);
      expect([path, typeof figure.where, String(figure.where).length > 0]).toEqual([
        path,
        'string',
        true,
      ]);
      if (figure.file !== undefined) {
        expect(String(figure.file)).toMatch(/^https:\/\/assets\.publishing\.service\.gov\.uk\//);
      }
    }
  });

  it('refuses a figure without its source link', () => {
    const noSource = structuredClone(file) as { incomeTax: { maxRate: { source: string } } };
    noSource.incomeTax.maxRate.source = 'https://example.com/rates';
    expect(() => checkTaxYear(noSource as unknown as TaxYearFile)).toThrow(
      expect.objectContaining({ code: 'bad-tax-year' }),
    );
  });

  it('agrees with the rates and thresholds page: England and Northern Ireland, and Wales', () => {
    // GOV.UK: basic rate 20% up to £37,700, higher 40% from £37,701 to
    // £125,140, additional 45% above £125,140, on earnings above the PAYE threshold.
    for (const regime of ['england-and-northern-ireland', 'wales'] as const) {
      const bands = year.regimes[regime].bands;
      const tops = bandTops(bands);
      expect(tops).toEqual([0, 37700, 125140]);
      expect(bands.map((band) => Number(band.rate.units) / 10 ** band.rate.scale)).toEqual([
        10, 20, 40, 45,
      ]);
      expect(year.regimes[regime].basicRate).toBe(2);
    }
  });

  it('agrees with the rates and thresholds page: Scotland', () => {
    // GOV.UK: starter 19% up to £3,967, basic 20% to £16,956, intermediate
    // 21% to £31,092, higher 42% to £62,430, advanced 45% to £125,140, top 48% above.
    const bands = year.regimes.scotland.bands;
    const tops = bandTops(bands);
    expect(tops).toEqual([3967, 16956, 31092, 62430, 125140]);
    expect(bands.map((band) => Number(band.rate.units) / 10 ** band.rate.scale)).toEqual([
      19, 20, 21, 42, 45, 48,
    ]);
  });

  it('gives the tax on each band that HMRC’s specification lists', () => {
    // Appendix A: K2 = £7,540 and K3 = £42,516. Appendix B: SK1 = £753.73,
    // SK2 = £3,351.53, SK3 = £6,320.09, SK4 = £19,482.05, SK5 = £47,701.55.
    const cumulative = (regime: 'england-and-northern-ireland' | 'scotland') => {
      let total = 0;
      return year.regimes[regime].bands
        .filter((band) => band.width !== null)
        .map((band) => {
          total +=
            (Number(band.width) * 100 * Number(band.rate.units)) / 10 ** band.rate.scale / 100;
          return Math.round(total);
        });
    };
    expect(cumulative('england-and-northern-ireland')).toEqual([0, 754000, 4251600]);
    expect(cumulative('scotland')).toEqual([75373, 335153, 632009, 1948205, 4770155]);
  });

  it('agrees with the National Insurance thresholds and the emergency code', () => {
    const shown = (frequency: 'weekly' | 'two-weekly' | 'four-weekly' | 'monthly') => [
      year.nationalInsurance.thresholds[frequency].primaryThreshold / 100,
      year.nationalInsurance.thresholds[frequency].upperEarningsLimit / 100,
    ];
    expect(shown('weekly')).toEqual([242, 967]);
    expect(shown('two-weekly')).toEqual([484, 1934]);
    expect(shown('four-weekly')).toEqual([967, 3867]);
    expect(shown('monthly')).toEqual([1048, 4189]);
    expect([year.emergencyCode, year.personalAllowance]).toEqual(['1257L', 1257000]);
  });

  it('refuses to work out pay on a day with no tax year file', () => {
    expect(() =>
      workOutTakeHome({
        settings: { frequency: 'weekly', taxCode: '1257L', basis: 'cumulative' },
        lines: [{ name: 'Basic', kind: 'basic', hours: '10', rate: '12' }],
        payDate: '2027-04-09',
      }),
    ).toThrow(expect.objectContaining({ code: 'no-tax-year' }));
  });
});
