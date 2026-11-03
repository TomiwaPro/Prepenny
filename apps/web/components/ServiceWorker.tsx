'use client';

// Puts the offline helper on the phone (brief Part 6). Only in the built app:
// while developing, files change too often to keep copies.

import { useEffect } from 'react';

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // The app still works online without it.
    });
  }, []);
  return null;
}
