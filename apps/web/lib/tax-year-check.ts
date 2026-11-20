// The tax year check (brief 4.15, D45, step 4j, D625): from 1 March, the file
// for the tax year starting on the coming 6 April is needed too. The engine
// knows which files are built in (checkTaxYearFiles); this says it in words,
// for the support screen and the GitHub check (scripts/check-tax-year.ts).

import { checkTaxYearFiles } from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';
import { formatDayAndYear } from './dates.ts';

export interface TaxYearWords {
  /** The tax years needed now with no file, such as "2027-28". Empty when none is missing. */
  readonly missing: readonly string[];
  /** One sentence for each missing year, or one saying every file is there. */
  readonly lines: readonly string[];
}

/** What the check finds on a day, "YYYY-MM-DD", in words. */
export function taxYearWords(today: string): TaxYearWords {
  const { missing } = checkTaxYearFiles(today);
  if (missing.length === 0) return { missing, lines: [strings.supportTools.taxYearFine] };
  return {
    missing,
    lines: missing.map((year) =>
      strings.supportTools.taxYearMissing(
        strings.pay.taxYearWords(year),
        formatDayAndYear(`${year.slice(0, 4)}-04-06`),
      ),
    ),
  };
}
