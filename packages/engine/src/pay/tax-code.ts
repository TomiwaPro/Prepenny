// Reading a tax code (brief 4.15): 1257L and the other suffix codes, 0T, BR,
// the D codes, NT and K codes, each with an S prefix for Scotland or C for
// Wales, and W1, M1 or X at the end for an emergency code, which works on
// the week 1/month 1 basis. HMRC's PAYE manual PAYE11015 and PAYE11085, and
// the Specification for PAYE tax table routines (sections 4 to 12, D121).

import { EngineInputError } from '../errors.ts';
import type { TaxRegime } from './tax-year.ts';

/** A tax code, read. */
export type TaxCode =
  /** A number and a letter, such as 1257L, or 0T: tax-free pay worked out from the number. */
  | {
      readonly kind: 'suffix';
      readonly regime: TaxRegime;
      readonly number: number;
      readonly letter: 'L' | 'M' | 'N' | 'T';
      readonly weekOne: boolean;
    }
  /** K and a number, such as K475: pay added to the taxable pay instead of taken off. */
  | {
      readonly kind: 'k';
      readonly regime: TaxRegime;
      readonly number: number;
      readonly weekOne: boolean;
    }
  /** BR: all pay at the basic rate. */
  | { readonly kind: 'basic-rate'; readonly regime: TaxRegime; readonly weekOne: boolean }
  /** D0, D1 and so on: all pay at the rate that many steps above the basic rate. */
  | {
      readonly kind: 'd';
      readonly regime: TaxRegime;
      readonly above: number;
      readonly weekOne: boolean;
    }
  /** NT: no tax at all. It has no Scottish or Welsh version. */
  | { readonly kind: 'no-tax'; readonly weekOne: boolean };

function refuse(): never {
  throw new EngineInputError(
    'bad-tax-code',
    'That tax code isn’t one the calculator knows. Type it as it is on the payslip, for example 1257L.',
  );
}

/**
 * Reads a tax code as typed, in capitals or not, with or without spaces:
 * "1257L", "s1257l", "C0T", "BR", "SD1", "K475", "NT", "1257L W1", "1257L X".
 * A code ending in W1, M1, X or NONCUM is an emergency code on the week
 * 1/month 1 basis (GOV.UK, "Emergency tax codes", D140).
 */
export function parseTaxCode(text: string): TaxCode {
  if (typeof text !== 'string') refuse();
  let code = text.replace(/\s+/g, '').toUpperCase();
  let weekOne = false;
  const marker = /(W1|M1|X|NONCUM)$/.exec(code);
  if (marker !== null && code.length > marker[0].length) {
    weekOne = true;
    code = code.slice(0, -marker[0].length);
  }
  if (code === 'NT') return { kind: 'no-tax', weekOne };
  let regime: TaxRegime = 'england-and-northern-ireland';
  if (code.startsWith('S')) {
    regime = 'scotland';
    code = code.slice(1);
  } else if (code.startsWith('C')) {
    regime = 'wales';
    code = code.slice(1);
  }
  if (code === 'BR') return { kind: 'basic-rate', regime, weekOne };
  const d = /^D([0-9])$/.exec(code);
  if (d !== null) return { kind: 'd', regime, above: Number(d[1]) + 1, weekOne };
  const k = /^K([0-9]{1,6})$/.exec(code);
  if (k !== null) {
    const number = Number(k[1]);
    // There's no K0: a negative allowance under £20 is 0T (PAYE tax table routines 4.3.1b).
    if (number === 0) refuse();
    return { kind: 'k', regime, number, weekOne };
  }
  const suffix = /^([0-9]{1,6})([LMNT])$/.exec(code);
  if (suffix !== null) {
    return {
      kind: 'suffix',
      regime,
      number: Number(suffix[1]),
      letter: suffix[2] as 'L' | 'M' | 'N' | 'T',
      weekOne,
    };
  }
  return refuse();
}
