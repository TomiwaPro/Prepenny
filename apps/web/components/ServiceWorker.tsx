'use client';

// Puts the offline helper on the phone (brief Part 6). Only in the built app:
// while developing, files change too often to keep copies.
//
// A page whose load started just before the helper took charge, and finished
// just after, isn't taken over by it: the helper takes over the pages open
// when it starts, and this one wasn't open yet. It would then work with no
// signal only once it's loaded again (PLAN.md item 37). So a page the helper
// hasn't taken over asks it to, once the helper is ready.

import { useEffect } from 'react';
import { TAKE_CHARGE } from '../service-worker/messages.ts';

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const helpers = navigator.serviceWorker;
    helpers
      .register('/sw.js', { scope: '/' })
      .then(() => helpers.ready)
      .then((registration) => {
        if (helpers.controller === null) registration.active?.postMessage(TAKE_CHARGE);
      })
      .catch(() => {
        // The app still works online without it.
      });
  }, []);
  return null;
}
