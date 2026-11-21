// Whether PrePenny's server is answering this phone (step 4k, brief 4.16, D645).
//
// When a signed-in phone has a signal but PrePenny's server doesn't answer,
// changes can't be sent, and a calm note says so, with the status page.
// They stay saved on the phone, and go once the server answers (step 3d).
//
// "Doesn't answer" is told apart from the phone's own signal:
// - every request to the server is watched (`watchServer`, given to
//   Supabase's client): no answer in time, or its gateway saying the
//   service is down (502, 503, 504, or Cloudflare's own 52x and above),
//   starts a check; any other answer means it's answering;
// - the check asks PrePenny's own site which version is live (lib/version.ts):
//   no answer means it's the phone's signal, not the server, so no note;
// - then it asks the server once more, the same question the status page
//   asks: whether it can save a change now (supabase/functions/status). Only
//   "no", or no answer, means it's down. A blip on a weak signal gets
//   "yes", and no note.
// With no signal at all (navigator.onLine), the offline note says so instead.
// Nothing is kept: it starts afresh each time PrePenny opens.

import { useSyncExternalStore } from 'react';
import { signInConfig } from './sign-in-config.ts';
import { fetchWithTimeLimit } from './time-limit.ts';
import { liveVersion } from './version.ts';

let down = false;
const listeners = new Set<() => void>();

function setDown(next: boolean) {
  if (next === down) return;
  down = next;
  for (const listener of listeners) listener();
}

/** True when an answer is the server's own, rather than its gateway saying it's down. */
export function answeredBy(status: number): boolean {
  return !(status === 502 || status === 503 || status === 504 || status >= 520);
}

let checking: Promise<void> | null = null;

/** Asks the status function whether saving works now: true, false, or null with no answer. */
async function savingWorks(): Promise<boolean | null> {
  const config = signInConfig();
  if (config === null) return null;
  try {
    const answer = await fetchWithTimeLimit()(`${config.url}/functions/v1/status?part=saving`, {
      cache: 'no-store',
    });
    const body = (await answer.json().catch(() => null)) as { working?: unknown } | null;
    return body?.working === true;
  } catch {
    return null;
  }
}

async function lookAtServer(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setDown(false);
    return;
  }
  if ((await liveVersion()) === null) {
    // PrePenny's own site didn't answer either: it's the phone's signal.
    setDown(false);
    return;
  }
  setDown((await savingWorks()) !== true);
}

/** Looks whether it's the server, or the phone's signal, that didn't answer. One look at a time. */
export function checkServer(): Promise<void> {
  if (checking !== null) return checking;
  const look = lookAtServer().finally(() => {
    if (checking === look) checking = null;
  });
  checking = look;
  return look;
}

/** `fetch` for Supabase's client, noting whether PrePenny's server answers. */
export function watchServer(send: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      const response = await send(input, init);
      if (answeredBy(response.status)) setDown(false);
      else void checkServer();
      return response;
    } catch (error) {
      // A request PrePenny itself stopped, as signing out does, isn't the server.
      if (init?.signal?.aborted !== true) void checkServer();
      throw error;
    }
  };
}

function listen(changed: () => void) {
  listeners.add(changed);
  const offline = () => setDown(false);
  window.addEventListener('offline', offline);
  return () => {
    listeners.delete(changed);
    window.removeEventListener('offline', offline);
  };
}

/** True while PrePenny's server isn't answering a phone that has a signal. */
export function useServerDown(): boolean {
  return useSyncExternalStore(
    listen,
    () => down,
    () => false,
  );
}

/** The same, outside a screen: for the tests. */
export function serverDownNow(): boolean {
  return down;
}
