// The words for a clash or a refused change (step 3d), from the strings file:
// "Tom changed Rent on Tue 1 Dec to £650 after you changed it to £640.
// Tom's change is kept." Every part comes from what this phone holds, which
// is only what the person can read (lib/clash.ts).

import type { ClashToShow } from '../data/clashes.ts';
import { strings } from '../strings/en-GB.ts';
import type { Action, ClashFacts } from './clash.ts';
import { formatDay } from './dates.ts';
import { deviceInSentence } from './device-words.ts';
import { formatMoney } from './money.ts';

const t = strings.clash;

export interface ClashWords {
  readonly title: string;
  /** What the sheet is for, in one plain sentence (D213). */
  readonly purpose: string;
  readonly message: string;
  /** "Put mine back", when the change can be made again. */
  readonly putBack: string | null;
  /** The button that closes it: "Keep Tom's change", or "Got it". */
  readonly keep: string;
}

/** A sentence's first letter in capitals, and the rest as it is. */
const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);
/** The same words inside a sentence: "your other phone", but "Tom" stays "Tom". */
const inside = (words: string, builtIn: boolean) =>
  builtIn ? words.charAt(0).toLowerCase() + words.slice(1) : words;

function theirAction(action: Action, name: string, on: string | null, today: string): string {
  switch (action.kind) {
    case 'amount':
      return t.theirs.amount(name, on, formatMoney(action.amount, { wholePounds: true }));
    case 'moved':
      return t.theirs.moved(name, on, formatDay(action.to, today));
    case 'removed':
      return t.theirs.removed(name, on);
    case 'paid':
      return t.theirs.paid(name, on);
    case 'not-paid':
      return t.theirs.notPaid(name, on);
    case 'changed':
      return t.theirs.changed(name, on);
  }
}

function ourAction(action: Action, today: string): string {
  switch (action.kind) {
    case 'amount':
      return t.ours.amount(formatMoney(action.amount, { wholePounds: true }));
    case 'moved':
      return t.ours.moved(formatDay(action.to, today));
    case 'removed':
      return t.ours.removed;
    case 'paid':
      return t.ours.paid;
    case 'not-paid':
      return t.ours.notPaid;
    case 'changed':
      return t.ours.changed;
  }
}

/** "Tom changed Rent on Tue 1 Dec to £650 after you changed it to £640." */
function sentence(clash: ClashToShow, facts: ClashFacts, today: string): string {
  const otherPhone = clash.who.kind === 'other-phone';
  const nickname = clash.who.kind === 'partner' ? clash.who.nickname : '';
  const who = otherPhone ? t.otherPhone : nickname === '' ? t.partner : nickname;
  const name = facts.name === '' ? t.unnamed : facts.name;
  const on = facts.on === null ? null : formatDay(facts.on, today);
  return t.sentence(
    who,
    theirAction(facts.theirs, name, on, today),
    ourAction(facts.ours, today),
    otherPhone,
  );
}

export function clashWords(clash: ClashToShow, today: string): ClashWords {
  const facts = clash.facts;
  if (clash.kind === 'refused') {
    const name = facts.name === '' ? t.unnamed : facts.name;
    const what = facts.on === null ? name : t.refusedOn(name, formatDay(facts.on, today));
    return {
      title: t.refusedTitle,
      purpose: t.refusedPurpose,
      message: `${t.refused(what)} ${clash.code === 'not-allowed' ? t.notAllowed : t.makeAgain}`,
      putBack: null,
      keep: t.gotIt,
    };
  }
  const builtIn = clash.who.kind === 'other-phone' || clash.who.nickname === '';
  const who =
    clash.who.kind === 'other-phone'
      ? t.otherPhone
      : clash.who.nickname === ''
        ? t.partner
        : clash.who.nickname;
  const whose = t.whose(who);
  if (clash.kind === 'elsewhere') {
    // Made on another of the person's devices (step 3e, PLAN.md item 39).
    const name = facts.name === '' ? t.unnamed : facts.name;
    const what = facts.on === null ? name : t.refusedOn(name, formatDay(facts.on, today));
    const device =
      clash.madeOn === undefined
        ? t.anotherDevice
        : deviceInSentence(clash.madeOn.browser, clash.madeOn.device);
    return {
      title: t.title,
      purpose: t.purpose,
      message: `${t.elsewhere(who, what, device)} ${t.kept(capital(whose))}`,
      putBack: null,
      keep: t.gotIt,
    };
  }
  const first = sentence(clash, facts, today);
  if (clash.kind === 'cant' && facts.theirs.kind === 'removed') {
    const name = facts.name === '' ? t.unnamed : facts.name;
    const what = facts.on === null ? name : t.refusedOn(name, formatDay(facts.on, today));
    return {
      title: t.title,
      purpose: t.purpose,
      message: t.cantRemoved(who, what),
      putBack: null,
      keep: t.gotIt,
    };
  }
  if (clash.kind === 'cant') {
    return {
      title: t.title,
      purpose: t.purpose,
      message: `${first} ${t.cant}`,
      putBack: null,
      keep: t.gotIt,
    };
  }
  return {
    title: t.title,
    purpose: t.purpose,
    message: `${first} ${t.kept(capital(whose))}`,
    // Making the change again wouldn't bring back a payment the newer change removed.
    putBack: clash.putBack === undefined || facts.theirs.kind === 'removed' ? null : t.putBack,
    keep:
      clash.putBack === undefined || facts.theirs.kind === 'removed'
        ? t.gotIt
        : t.keepTheirs(inside(whose, builtIn)),
  };
}
