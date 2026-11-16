// Adding PrePenny to the phone's home screen (step 4d, D546, D547).
//
// PrePenny suggests it once on Home, on the second day someone uses their
// own plan, and on an iPhone in Safari also on the welcome, before setup
// starts; never again once it's answered or PrePenny is on the home screen.
// What's kept for that is on this phone only, in the browser's small store
// like Light or Dark (D173): the first day Home showed the person's own
// plan, whether the suggestion was answered, and whether PrePenny was seen
// on the home screen. Signing out removes it with everything else (D308).
//
// Where the phone offers its own install (Chrome on Android sends
// `beforeinstallprompt`), it's kept for a button of PrePenny's, so the
// browser doesn't suggest it by itself on the first day as well; nothing
// else about the phone is read or sent anywhere.

import { useSyncExternalStore } from 'react';

/** The phones PrePenny has steps for. An iPad counts as an iPhone: the same steps work there. */
export type Phone = 'android' | 'iphone' | 'other';

/** What's kept on this phone. */
export interface Kept {
  /** The first day Home showed the person's own plan, "YYYY-MM-DD". */
  readonly firstDay?: string;
  /** "Show me how", the browser's own install or "Not now" was tapped. */
  readonly answered?: true;
  /** PrePenny was seen running from the home screen, or the browser said it was added. */
  readonly installed?: true;
}

/** Everything the suggestion and the steps need to know about this phone. */
export interface HomeScreenState {
  readonly phone: Phone;
  /** Safari itself on an iPhone, not another browser or an app's own browser. */
  readonly safari: boolean;
  /** PrePenny is open from the home screen now. */
  readonly asApp: boolean;
  readonly kept: Kept;
  /** The browser offers its own install, so one tap can add PrePenny. */
  readonly canInstall: boolean;
}

export const INSTALL_KEY = 'prepenny-home-screen';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Which phone this is, from the browser's own description of itself. */
export function phoneOf(userAgent: string, touchPoints = 0): Phone {
  if (/iPhone|iPod|iPad/.test(userAgent)) return 'iphone';
  // An iPad says it's a Mac; only the iPad has a touch screen.
  if (/Macintosh/.test(userAgent) && touchPoints > 1) return 'iphone';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}

/** Safari itself on an iPhone: Chrome, Firefox, Edge and apps' own browsers say who they are. */
export function isSafari(userAgent: string): boolean {
  return (
    /Safari\//.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|FBAN|FBAV|Instagram|Line\//.test(
      userAgent,
    )
  );
}

/** Reads what's kept, leaving out anything that isn't as written. */
export function readKept(text: string | null): Kept {
  if (text === null) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object') return {};
    const { firstDay, answered, installed } = value as Record<string, unknown>;
    return {
      ...(typeof firstDay === 'string' && DAY.test(firstDay) ? { firstDay } : {}),
      ...(answered === true ? { answered } : {}),
      ...(installed === true ? { installed } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Home suggests it on the second day someone uses their own plan: a later
 * day than the first, on a phone, once, and never once it's answered or
 * PrePenny is on the home screen (D546, D547).
 */
export function suggestOnHome(state: HomeScreenState, today: string): boolean {
  const { phone, asApp, kept } = state;
  return (
    phone !== 'other' &&
    !asApp &&
    kept.answered !== true &&
    kept.installed !== true &&
    kept.firstDay !== undefined &&
    today > kept.firstDay
  );
}

/**
 * On an iPhone in Safari, the welcome suggests it too, before setup starts,
 * as a plan made in Safari stays in Safari (D546, D549).
 */
export function suggestOnWelcome(state: HomeScreenState, setupStarted: boolean): boolean {
  const { phone, safari, asApp, kept } = state;
  return (
    phone === 'iphone' &&
    safari &&
    !asApp &&
    !setupStarted &&
    kept.answered !== true &&
    kept.installed !== true
  );
}

// What follows runs only in the browser.

/** What Chrome sends when it would offer to install PrePenny. */
interface InstallOffer extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

let offer: InstallOffer | null = null;
const listeners = new Set<() => void>();
let snapshot: HomeScreenState | null = null;

const SERVER: HomeScreenState = {
  phone: 'other',
  safari: false,
  asApp: false,
  kept: {},
  canInstall: false,
};

function storedText(): string | null {
  try {
    return localStorage.getItem(INSTALL_KEY);
  } catch {
    return null;
  }
}

function keep(change: Partial<Kept>) {
  const kept = { ...readKept(storedText()), ...change };
  try {
    localStorage.setItem(INSTALL_KEY, JSON.stringify(kept));
  } catch {
    // Nothing kept, as in some private windows: it's asked again next time.
  }
  changed();
}

/** PrePenny is open from the home screen: as an app on Android, or from the Home Screen on an iPhone. */
function openAsApp(): boolean {
  if (Reflect.get(navigator, 'standalone') === true) return true;
  return ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches === true,
  );
}

function current(): HomeScreenState {
  if (snapshot !== null) return snapshot;
  const userAgent = navigator.userAgent;
  const asApp = openAsApp();
  let kept = readKept(storedText());
  if (asApp && kept.installed !== true) {
    // Seen on the home screen: never suggested again (D546).
    kept = { ...kept, installed: true };
    try {
      localStorage.setItem(INSTALL_KEY, JSON.stringify(kept));
    } catch {
      // Open from the home screen, it's never suggested anyway.
    }
  }
  snapshot = {
    phone: phoneOf(userAgent, navigator.maxTouchPoints),
    safari: isSafari(userAgent),
    asApp,
    kept,
    canInstall: offer !== null && !asApp,
  };
  return snapshot;
}

function changed() {
  snapshot = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const fromAnotherTab = (event: StorageEvent) => {
    if (event.key === INSTALL_KEY || event.key === null) changed();
  };
  window.addEventListener('storage', fromAnotherTab);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', fromAnotherTab);
  };
}

/** This phone and what's kept, for the suggestion and the steps. Nothing on the page built ahead of time. */
export function useHomeScreen(): HomeScreenState {
  return useSyncExternalStore(subscribe, current, () => SERVER);
}

/** Home showed the person's own plan today: the first such day is kept. */
export function noteOwnPlanDay(today: string) {
  if (!DAY.test(today)) return;
  if (readKept(storedText()).firstDay !== undefined) return;
  keep({ firstDay: today });
}

/** "Show me how", the browser's own install or "Not now": never suggested again (D546). */
export function answerSuggestion() {
  keep({ answered: true });
}

/**
 * Asks the browser to add PrePenny, with its own confirm. "accepted" once
 * the person said yes, "dismissed" when they didn't, and "unavailable" when
 * the browser no longer offers it. The browser's offer works once.
 */
export async function installWithBrowser(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const now = offer;
  if (now === null) return 'unavailable';
  offer = null;
  changed();
  try {
    await now.prompt();
    const { outcome } = await now.userChoice;
    if (outcome === 'accepted') keep({ installed: true });
    return outcome;
  } catch {
    return 'unavailable';
  }
}

/**
 * Listens for the browser's offer to install, and for PrePenny being added.
 * Started once, as soon as PrePenny's code starts on any page, so an offer
 * made before a screen asks for it isn't missed.
 */
function listen() {
  if (typeof window === 'undefined' || Reflect.get(window, '__prepennyInstall') === true) return;
  Reflect.set(window, '__prepennyInstall', true);
  window.addEventListener('beforeinstallprompt', (event) => {
    // PrePenny's own button asks instead, once, on the second day (D546).
    event.preventDefault();
    offer = event as InstallOffer;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    keep({ installed: true });
  });
}

listen();
