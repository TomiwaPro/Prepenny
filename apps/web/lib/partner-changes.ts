// A partner's changes, as notifications (step 4f, brief 4.14, D575 to D579).
//
// PrePenny's server reads the person's own Activity exactly as their phone
// reads it (plan_activity as their own sign-in session, D458), so these
// words can only ever name what that person's Activity shows them: never
// anything private to someone else, and nothing of something shared then
// made private again. The person's own changes are never in them.
//
// - One change is Activity's own sentence: "Tom added Car MOT, −£54.85 on
//   Fri 13 Nov."
// - Changes made close together come as one: "Tom made 3 changes,
//   including Car MOT, −£54.85.", naming the biggest amount.
// - With "Hide amounts in notifications" on, no amount at all: "Tom added
//   Car MOT on Fri 13 Nov.", "Tom made 3 changes, including Car MOT."
//
// When: a notification waits until the partner has made no change for 2
// minutes, so changes close together come as one, and comes 10 minutes
// after their first at most, while they're still going. Quiet hours apply
// as for reminders (lib/reminders.ts): nothing between 9pm and 8am.
//
// Pure: "now" is passed in, and nothing is written anywhere but the return
// value. Never log what it returns (CLAUDE.md).

import { strings } from '../strings/en-GB.ts';
import {
  type ActivityContext,
  type ActivityEdit,
  activityWords,
  type Headline,
  headlineOf,
  shownAt,
  whoStarts,
} from './activity-words.ts';

const words = strings.reminders.notification;

/** How long a notification waits, in milliseconds (D576). */
export const PARTNER_WAIT = {
  /** Once the partner has made no change for this long, what they did comes as one. */
  quietFor: 2 * 60_000,
  /** At most this long after the first change still to be told, while they're still going. */
  atMost: 10 * 60_000,
  /**
   * Only changes saved at least this long ago go in, so a change still being
   * saved, and saved with an earlier time than one already told, is never
   * passed over. Saving one takes a second or two at most.
   */
  settled: 60_000,
} as const;

/**
 * A moment as the server writes it ("2026-11-13T10:00:00.123456Z"), with its
 * fraction to the microsecond, so two compare exactly as text.
 */
export function exactMoment(moment: string): string {
  const found = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(moment);
  if (found === null) throw new RangeError('Not a moment.');
  return `${found[1]}.${(found[2] ?? '').padEnd(6, '0')}Z`;
}

const later = (a: string, b: string) => exactMoment(a) > exactMoment(b);

/** Someone else's changes, as Activity shows them to this person, saved after `since`. */
export function waitingChanges(edits: readonly ActivityEdit[], since: string): ActivityEdit[] {
  return edits.filter((edit) => !edit.mine && later(shownAt(edit), since));
}

export interface PartnerGroup {
  /** Whether a notification is due now. */
  readonly due: boolean;
  /** The changes it's about, newest first: those settled, as below. */
  readonly group: readonly ActivityEdit[];
  /** The newest of them, when they were saved: told up to here. Null when there are none. */
  readonly through: string | null;
}

/**
 * Whether the changes waiting are due as a notification now (D576): once
 * the partner has made no change for 2 minutes, or 10 minutes after the
 * first, with every change saved at least a minute ago.
 */
export function dueGroup(waiting: readonly ActivityEdit[], now: string): PartnerGroup {
  const at = Date.parse(now);
  const times = waiting.map((edit) => Date.parse(shownAt(edit)));
  const group = waiting.filter((_, index) => (times[index] ?? at) <= at - PARTNER_WAIT.settled);
  const through = group.reduce<string | null>(
    (most, edit) => (most === null || later(shownAt(edit), most) ? shownAt(edit) : most),
    null,
  );
  if (group.length === 0) return { due: false, group, through };
  const newest = Math.max(...times);
  const oldest = Math.min(...times);
  const due = newest <= at - PARTNER_WAIT.quietFor || oldest <= at - PARTNER_WAIT.atMost;
  return { due, group, through };
}

/**
 * A change and the undo of it, both made in Activity by the same person
 * within one group, cancel out: nothing is left to tell about either.
 */
export function withoutUndone(group: readonly ActivityEdit[]): ActivityEdit[] {
  const ids = new Map(group.map((edit) => [edit.id, edit]));
  const gone = new Set<string>();
  // Newest first: an undo that was itself undone in the group cancels nothing.
  for (const edit of group) {
    if (edit.kind !== 'undo' || edit.undoes === null || gone.has(edit.id)) continue;
    const undone = ids.get(edit.undoes);
    if (undone !== undefined && undone.by === edit.by && !gone.has(undone.id)) {
      gone.add(undone.id);
      gone.add(edit.id);
    }
  }
  return group.filter((edit) => !gone.has(edit.id));
}

/**
 * The payment to name in "including Car MOT, −£54.85": the biggest amount a
 * change set, the newest of two the same; with no amount anywhere, the
 * newest change about a payment.
 */
function headlineFor(group: readonly ActivityEdit[], context: ActivityContext): Headline | null {
  let found: Headline | null = null;
  for (const edit of group) {
    const one = headlineOf(edit, context);
    if (one === null) continue;
    if (found === null) {
      found = one;
      continue;
    }
    if (one.amount !== null && (found.amount === null || one.amount > found.amount)) found = one;
  }
  return found;
}

/**
 * The words of the notification, from changes newest first: Activity's own
 * sentence for one, "Tom made 3 changes, including Car MOT, −£54.85." for
 * more (D579). With amounts hidden, no amount (D561).
 */
export function partnerWords(
  group: readonly ActivityEdit[],
  context: ActivityContext,
  hideAmounts: boolean,
): string | null {
  const first = group[0];
  if (first === undefined) return null;
  if (group.length === 1) return activityWords(first, context, { hideAmounts });
  const people: string[] = [];
  for (const edit of group) {
    const who = whoStarts(edit.by, context);
    if (!people.includes(who)) people.push(who);
  }
  const who = words.people(people);
  const headline = headlineFor(group, context);
  if (headline === null) return words.madeChanges(who, group.length);
  const thing =
    hideAmounts || headline.money === null
      ? headline.name
      : words.thing(headline.name, headline.money);
  return words.madeChangesIncluding(who, group.length, thing);
}
