import { EngineInputError } from '../errors.ts';
import { type Day, dayFromParts } from './day.ts';

/**
 * A moment, as whole microseconds since midnight UTC on Thu 1 Jan 1970.
 *
 * Balance updates and ticks store when they happened (D33), as UTC times like
 * "2026-10-30T09:14:05Z". The engine only compares these times with each
 * other, so it still needs no clock (ARCHITECTURE.md, "For future sessions:
 * the engine"). A `bigint`, because microseconds in year 2999 pass 2^53.
 */
export type Moment = bigint;

const TIME_TEXT =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,6}))?(?:Z|\+00:00)$/;

const MICROSECONDS_IN_A_SECOND = 1_000_000n;

/**
 * Reads a UTC time: "2026-10-30T09:14:05Z", with up to 6 digits after the
 * seconds, and "Z" or "+00:00" at the end. Times in other zones are refused,
 * so two times always compare correctly, even across the clocks changing.
 */
export function parseTime(text: string, field = 'time'): Moment {
  const match = typeof text === 'string' ? TIME_TEXT.exec(text) : null;
  if (match === null) {
    throw new EngineInputError(
      'bad-time',
      `${field} must be a UTC time written like 2026-10-30T09:14:05Z.`,
    );
  }
  const [, year = '', month = '', dayOfMonth = '', h = '', m = '', s = '', fraction = ''] = match;
  let day: Day;
  try {
    day = dayFromParts(Number(year), Number(month), Number(dayOfMonth));
  } catch {
    throw new EngineInputError('bad-time', `${field} (${text}) is not a real date.`);
  }
  const hours = Number(h);
  const minutes = Number(m);
  const seconds = Number(s);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new EngineInputError('bad-time', `${field} (${text}) is not a real time of day.`);
  }
  const wholeSeconds =
    ((BigInt(day) * 24n + BigInt(hours)) * 60n + BigInt(minutes)) * 60n + BigInt(seconds);
  return wholeSeconds * MICROSECONDS_IN_A_SECOND + BigInt(fraction.padEnd(6, '0'));
}
