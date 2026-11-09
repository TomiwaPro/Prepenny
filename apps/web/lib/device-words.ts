// A signed-in device in plain words (step 3e): "Chrome on an Android phone",
// "This device", "Last used yesterday". Never an IP address or a place: the
// server gives only the kind of browser and device, as codes.

import { strings } from '../strings/en-GB.ts';
import { formatDay } from './dates.ts';
import { localToday } from './today.ts';

const t = strings.devices;

/** "Chrome on an Android phone", or "an iPhone" when the browser can't be told, as inside a sentence. */
export function deviceInSentence(browser: string, device: string): string {
  const kind = t.kinds[device] ?? t.someDevice;
  const named = t.browsers[browser];
  return named === undefined ? kind : t.browserOn(named, kind);
}

/** "Chrome on an Android phone", or "An iPhone" when the browser can't be told, as for an app on the home screen. */
export function deviceName(browser: string, device: string): string {
  const words = deviceInSentence(browser, device);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The day before a "YYYY-MM-DD" date. */
function dayBefore(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const before = new Date(Date.UTC(year, month - 1, day - 1));
  return before.toISOString().slice(0, 10);
}

/** "Last used today", "Last used yesterday" or "Last used Tue 3 Nov", by this phone's own dates. */
export function lastUsedWords(lastUsedAt: string, now: Date = new Date()): string {
  const today = localToday(now);
  const used = localToday(new Date(lastUsedAt));
  if (used >= today) return t.lastUsedToday;
  if (used === dayBefore(today)) return t.lastUsedYesterday;
  return t.lastUsedOn(formatDay(used, today));
}
