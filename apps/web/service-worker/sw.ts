// The offline helper (ARCHITECTURE.md 1.1, brief Part 6): keeps every file of
// the app on the phone, so it opens with no signal. Built by Serwist's
// command-line build step after `next build`, which lists every file in the
// export in `self.__SW_MANIFEST` (serwist.config.js).
//
// It stores only the app's own files, never anything from the plan: the
// plan lives in the phone's database (data/db.ts).

import { type PrecacheEntry, Serwist } from 'serwist';
import { TAKE_CHARGE } from './messages.ts';

declare const self: ServiceWorkerGlobalScope & {
  readonly __SW_MANIFEST: (PrecacheEntry | string)[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    // "/app/" is served by "/app/index.html", and "/app/plan" by "/app/plan/index.html".
    directoryIndex: 'index.html',
    // A screen for one record takes its id after a question mark (ARCHITECTURE.md 5),
    // and What if says where it was opened from: each is still the same file, so
    // it opens with no signal straight from a saved link or a refresh (step 2h).
    // The same for the sign-in page's "Sign up", and the welcome just after
    // signing out, which may happen with no signal (step 3b). Google's
    // one-time code, or its "didn't finish", is answered from the phone too,
    // so it isn't sent to PrePenny's site (D314).
    ignoreURLParametersMatching: [
      /^utm_/,
      /^_rsc$/,
      /^id$/,
      /^from$/,
      /^to$/,
      /^signed-out$/,
      /^code$/,
      /^error/,
      /^state$/,
    ],
  },
  // A new version takes over straight away, so a phone never runs an old copy for long.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
});

// A page that loaded while this helper was taking charge, and so wasn't
// taken over with the others, asks to be (PLAN.md item 37).
self.addEventListener('message', (event) => {
  const data: unknown = event.data;
  if (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === TAKE_CHARGE.type
  ) {
    event.waitUntil(self.clients.claim());
  }
});

// Reminders (step 4e, D564): a reminder arrives sealed for this phone, and
// the browser opens it before it gets here. It's shown as it came: its
// words, worked out on PrePenny's server, and a tag, so a newer reminder of
// the same kind replaces an older one. A tap opens PrePenny. Nothing is
// kept, and nothing is sent anywhere.

/** The name, shown as the title if a reminder's own can't be read. */
const NAME = 'PrePenny';

interface Reminder {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly url: string;
}

function reminderOf(data: PushMessageData | null): Reminder {
  const shown: Reminder = { title: NAME, body: '', tag: 'prepenny', url: '/app/' };
  try {
    const sent: unknown = data?.json();
    if (typeof sent !== 'object' || sent === null) return shown;
    const field = (name: keyof Reminder) => {
      const value = (sent as Record<string, unknown>)[name];
      return typeof value === 'string' && value.length <= 1000 ? value : shown[name];
    };
    // Only one of PrePenny's own pages opens from a tap.
    const url = field('url');
    return {
      title: field('title'),
      body: field('body'),
      tag: field('tag'),
      url: /^\/app\/[A-Za-z0-9/_#-]*$/.test(url) ? url : shown.url,
    };
  } catch {
    return shown;
  }
}

self.addEventListener('push', (event) => {
  const reminder = reminderOf(event.data);
  event.waitUntil(
    self.registration.showNotification(reminder.title, {
      body: reminder.body,
      tag: reminder.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: reminder.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data: unknown = event.notification.data;
  const path =
    typeof data === 'object' && data !== null && typeof (data as { url?: unknown }).url === 'string'
      ? (data as { url: string }).url
      : '/app/';
  const target = new URL(path, self.location.origin);
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const app = open.find((client) => new URL(client.url).pathname.startsWith('/app'));
      if (app !== undefined) {
        await app.focus();
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

serwist.addEventListeners();
