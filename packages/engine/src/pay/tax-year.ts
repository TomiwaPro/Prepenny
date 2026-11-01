// The tax year files (brief 4.15, ARCHITECTURE.md 2.7): one data file per tax
// year in ./tax-years, every figure with the GOV.UK page it comes from. This
// file reads and checks them, finds the tax year of a payday, and says from
// 1 March whether next year's file is missing (D45).

import { addDays, type Day, dayFromParts, parseDate, partsOfDay } from '../dates/day.ts';
import { EngineInputError } from '../errors.ts';
import { type Decimal, parseDecimal } from '../money/decimal.ts';
import { type Pence, parsePounds } from '../money/pence.ts';
import year202627 from './tax-years/2026-27.json' with { type: 'json' };

/** One figure in a tax year file, with where it comes from. */
export interface SourcedFigure {
  /** The figure as text: pounds such as "37700", a percentage such as "8", or a code such as "1257L". */
  readonly value: string;
  /** The www.gov.uk page it's on, or the www.gov.uk page that links to the file it's in (D120). */
  readonly source: string;
  /** Where on that page or in that file. */
  readonly where: string;
  /** The GOV.UK file it's in, when it isn't on the page itself (D120). */
  readonly file?: string;
}

/** One rate of income tax, and how wide its band is. The top band has no width. */
export interface TaxBandFile {
  readonly rate: SourcedFigure;
  readonly width?: SourcedFigure;
}

/** The tax rates and bands of England and Northern Ireland, Scotland or Wales. */
export interface TaxRegimeFile {
  /** Which rate is the basic rate, counting from 1: the "Gpointer" of HMRC's specification. */
  readonly basicRate: SourcedFigure;
  readonly bands: readonly TaxBandFile[];
}

export const TAX_REGIMES = ['england-and-northern-ireland', 'scotland', 'wales'] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];

export const PAY_FREQUENCIES = ['weekly', 'two-weekly', 'four-weekly', 'monthly'] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export const STUDENT_LOAN_PLANS = ['plan-1', 'plan-2', 'plan-4', 'plan-5', 'postgraduate'] as const;
export type StudentLoanPlan = (typeof STUDENT_LOAN_PLANS)[number];

/** A tax year file as stored in ./tax-years. */
export interface TaxYearFile {
  /** "2026-27". */
  readonly taxYear: string;
  readonly firstDay: SourcedFigure;
  readonly lastDay: SourcedFigure;
  readonly incomeTax: {
    readonly personalAllowance: SourcedFigure;
    readonly emergencyCode: SourcedFigure;
    /** The overriding regulatory limit: the most tax taken from one payday, as a percentage of its pay. */
    readonly maxRate: SourcedFigure;
    readonly regimes: Readonly<Record<TaxRegime, TaxRegimeFile>>;
  };
  readonly nationalInsurance: {
    readonly thresholds: Readonly<
      Record<
        PayFrequency,
        { readonly primaryThreshold: SourcedFigure; readonly upperEarningsLimit: SourcedFigure }
      >
    >;
    /** Employee rates for each category letter: up to the upper earnings limit, and above it. */
    readonly employeeRates: Readonly<
      Record<string, { readonly main: SourcedFigure; readonly upper: SourcedFigure }>
    >;
  };
  readonly studentLoans: Readonly<
    Record<
      StudentLoanPlan,
      { readonly annualThreshold: SourcedFigure; readonly rate: SourcedFigure }
    >
  >;
}

/** A rate band, checked and ready for the sums. */
export interface TaxBand {
  readonly rate: Decimal;
  /** Whole pounds. Null for the top band. */
  readonly width: bigint | null;
}

/** A tax year, checked and ready for the sums. */
export interface TaxYear {
  readonly id: string;
  readonly firstDay: Day;
  readonly lastDay: Day;
  readonly personalAllowance: Pence;
  readonly emergencyCode: string;
  readonly maxRate: Decimal;
  readonly regimes: Readonly<
    Record<TaxRegime, { readonly basicRate: number; readonly bands: readonly TaxBand[] }>
  >;
  readonly nationalInsurance: {
    readonly thresholds: Readonly<
      Record<PayFrequency, { readonly primaryThreshold: Pence; readonly upperEarningsLimit: Pence }>
    >;
    readonly employeeRates: ReadonlyMap<
      string,
      { readonly main: Decimal; readonly upper: Decimal }
    >;
  };
  readonly studentLoans: Readonly<
    Record<StudentLoanPlan, { readonly annualThreshold: Pence; readonly rate: Decimal }>
  >;
}

/** The tax year files built into the engine, oldest first. A new one is added every year. */
export const TAX_YEAR_FILES: readonly TaxYearFile[] = [year202627 as TaxYearFile];

const GOV_UK_PAGE = /^https:\/\/www\.gov\.uk\/[^\s]*$/;
const GOV_UK_FILE = /^https:\/\/assets\.publishing\.service\.gov\.uk\/[^\s]*$/;
const TAX_YEAR_NAME = /^(\d{4})-(\d{2})$/;

function bad(what: string, problem: string): never {
  throw new EngineInputError('bad-tax-year', `${what}: ${problem}`);
}

/** Checks a figure has a value and a GOV.UK source (brief 4.15, D120), and returns its value. */
function figure(item: unknown, what: string): string {
  const one = item as SourcedFigure | null | undefined;
  if (
    one === null ||
    typeof one !== 'object' ||
    typeof one.value !== 'string' ||
    one.value === ''
  ) {
    bad(what, 'needs a value.');
  }
  if (typeof one.source !== 'string' || !GOV_UK_PAGE.test(one.source)) {
    bad(what, 'needs its www.gov.uk source link.');
  }
  if (typeof one.where !== 'string' || one.where === '') {
    bad(what, 'needs to say where on the page it is.');
  }
  if (one.file !== undefined && (typeof one.file !== 'string' || !GOV_UK_FILE.test(one.file))) {
    bad(what, 'the file must be one of GOV.UK’s own files.');
  }
  return one.value;
}

function pounds(item: unknown, what: string): Pence {
  const pence = parsePounds(figure(item, what), what);
  if (pence < 0) bad(what, "can't be below zero.");
  return pence;
}

function percent(item: unknown, what: string): Decimal {
  const rate = parseDecimal(figure(item, what), what);
  if (rate.units < 0n || rate.units > 100n * 10n ** BigInt(rate.scale)) {
    bad(what, 'must be a percentage from 0 to 100.');
  }
  return rate;
}

function wholePounds(item: unknown, what: string): bigint {
  const pence = pounds(item, what);
  if (pence % 100 !== 0) bad(what, 'must be whole pounds.');
  return BigInt(pence / 100);
}

/**
 * Checks a tax year file and makes it ready for the sums. Refuses one with a
 * figure that has no GOV.UK source link, a value that isn't a number, or
 * dates that aren't 6 April to 5 April.
 */
export function checkTaxYear(file: TaxYearFile): TaxYear {
  const id = typeof file?.taxYear === 'string' ? file.taxYear : '';
  const name = TAX_YEAR_NAME.exec(id);
  if (name === null || (Number(name[1]) + 1) % 100 !== Number(name[2])) {
    bad('A tax year file', 'its tax year must be written like "2026-27".');
  }
  const startYear = Number(name[1]);
  const what = `Tax year ${id}`;
  const firstDay = parseDate(figure(file.firstDay, `${what}: first day`), `${what}: first day`);
  const lastDay = parseDate(figure(file.lastDay, `${what}: last day`), `${what}: last day`);
  if (firstDay !== dayFromParts(startYear, 4, 6) || lastDay !== dayFromParts(startYear + 1, 4, 5)) {
    bad(what, 'a tax year runs from 6 April to 5 April.');
  }
  const tax = file.incomeTax;
  if (tax === null || typeof tax !== 'object') bad(what, 'needs income tax.');
  const regimes = {} as Record<
    TaxRegime,
    { readonly basicRate: number; readonly bands: readonly TaxBand[] }
  >;
  for (const regime of TAX_REGIMES) {
    const one = tax.regimes?.[regime];
    const where = `${what}: ${regime}`;
    if (one === undefined || !Array.isArray(one.bands) || one.bands.length < 2) {
      bad(where, 'needs at least two rates of tax.');
    }
    const bands = one.bands.map((band, i) => {
      const top = i === one.bands.length - 1;
      if (top !== (band.width === undefined)) {
        bad(where, 'every band but the top one needs a width, and the top one has none.');
      }
      return {
        rate: percent(band.rate, `${where}: rate ${i + 1}`),
        width: top ? null : wholePounds(band.width, `${where}: band ${i + 1}`),
      };
    });
    const basicRate = Number(figure(one.basicRate, `${where}: basic rate`));
    if (!Number.isInteger(basicRate) || basicRate < 1 || basicRate > bands.length) {
      bad(where, 'the basic rate must be one of its rates.');
    }
    regimes[regime] = { basicRate, bands };
  }
  const ni = file.nationalInsurance;
  const thresholds = {} as Record<
    PayFrequency,
    { readonly primaryThreshold: Pence; readonly upperEarningsLimit: Pence }
  >;
  for (const frequency of PAY_FREQUENCIES) {
    const one = ni?.thresholds?.[frequency];
    const where = `${what}: National Insurance, ${frequency}`;
    const primaryThreshold = pounds(one?.primaryThreshold, `${where} primary threshold`);
    const upperEarningsLimit = pounds(one?.upperEarningsLimit, `${where} upper earnings limit`);
    if (upperEarningsLimit < primaryThreshold) {
      bad(where, 'the upper earnings limit is below the primary threshold.');
    }
    thresholds[frequency] = { primaryThreshold, upperEarningsLimit };
  }
  const employeeRates = new Map<string, { readonly main: Decimal; readonly upper: Decimal }>();
  for (const [letter, rates] of Object.entries(ni?.employeeRates ?? {})) {
    if (!/^[A-Z]$/.test(letter)) bad(what, 'a National Insurance category is one capital letter.');
    employeeRates.set(letter, {
      main: percent(rates.main, `${what}: National Insurance ${letter}`),
      upper: percent(rates.upper, `${what}: National Insurance ${letter} above the limit`),
    });
  }
  if (!employeeRates.has('A')) bad(what, 'needs National Insurance category A.');
  const studentLoans = {} as Record<
    StudentLoanPlan,
    { readonly annualThreshold: Pence; readonly rate: Decimal }
  >;
  for (const plan of STUDENT_LOAN_PLANS) {
    const one = file.studentLoans?.[plan];
    studentLoans[plan] = {
      annualThreshold: pounds(one?.annualThreshold, `${what}: ${plan} threshold`),
      rate: percent(one?.rate, `${what}: ${plan} rate`),
    };
  }
  return {
    id,
    firstDay,
    lastDay,
    personalAllowance: pounds(tax.personalAllowance, `${what}: personal allowance`),
    emergencyCode: figure(tax.emergencyCode, `${what}: emergency code`),
    maxRate: percent(tax.maxRate, `${what}: regulatory limit`),
    regimes,
    nationalInsurance: { thresholds, employeeRates },
    studentLoans,
  };
}

/** The tax year of a day: "2026-27" for any day from 6 April 2026 to 5 April 2027. */
export function taxYearName(day: Day): string {
  const { year, month, day: dayOfMonth } = partsOfDay(day);
  const start = month > 4 || (month === 4 && dayOfMonth >= 6) ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Checks the tax year files given, or the built-in ones, and finds each by name. */
export function taxYearsOf(files: readonly TaxYearFile[] = TAX_YEAR_FILES): Map<string, TaxYear> {
  if (!Array.isArray(files)) bad('The tax year files', 'must be a list.');
  const years = new Map<string, TaxYear>();
  for (const file of files) {
    const year = checkTaxYear(file);
    if (years.has(year.id)) bad(`Tax year ${year.id}`, 'is listed twice.');
    years.set(year.id, year);
  }
  return years;
}

/** The tax year a payday is in. Refused when there's no file for that year. */
export function taxYearFor(day: Day, years: ReadonlyMap<string, TaxYear>): TaxYear {
  const name = taxYearName(day);
  return years.get(name) ?? refuseTaxYear(name);
}

function refuseTaxYear(name: string): never {
  throw new EngineInputError(
    'no-tax-year',
    `There's no tax year file for ${name}, so pay on that day can't be worked out.`,
  );
}

/** What the tax year check found (D45). */
export interface TaxYearCheck {
  /** The tax years whose files are needed now: this one, and from 1 March the next one too. */
  readonly needed: readonly string[];
  /** The ones of those with no file, for the admin check's warning. Empty when all are there. */
  readonly missing: readonly string[];
}

/**
 * The admin check (brief 4.15, D45): the file for the tax year we're in is
 * always needed, and from 1 March the file for the tax year starting on
 * 6 April is needed too. `today` is "YYYY-MM-DD". Built-in files unless
 * others are given.
 */
export function checkTaxYearFiles(
  today: string,
  files: readonly TaxYearFile[] = TAX_YEAR_FILES,
): TaxYearCheck {
  const day = parseDate(today, 'today');
  const have = taxYearsOf(files);
  const { year } = partsOfDay(day);
  const needed = [taxYearName(day)];
  // From 1 March, the tax year that starts on the coming 6 April.
  const nextStart = dayFromParts(year, 4, 6);
  if (day >= dayFromParts(year, 3, 1) && day < nextStart) {
    needed.push(taxYearName(nextStart));
  }
  return { needed, missing: needed.filter((name) => !have.has(name)) };
}

/** The first day of the tax year after this one. */
export function nextTaxYearStart(year: TaxYear): Day {
  return addDays(year.lastDay, 1);
}
