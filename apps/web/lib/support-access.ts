'use client';

// A person's own "Let support see my plan" (question 13, D617, D618), under
// More, Security in the app, with the app's own sign-in. The support
// dashboard's steps are in lib/support-tools.ts, never in the app (D641).

import { signedInClient } from './account.ts';
import { type AccessState, accessOf, callWith, type Done } from './support-calls.ts';

export type { AccessState } from './support-calls.ts';

const call = <T>(name: string) => callWith<T>(signedInClient, name);

export async function mySupportAccess(): Promise<Done<AccessState>> {
  const answer = await call<unknown>('my_support_access');
  return answer.ok ? { ok: true, value: accessOf(answer.value) } : answer;
}

export async function giveSupportAccess(): Promise<Done<AccessState>> {
  const answer = await call<unknown>('give_support_access');
  return answer.ok ? { ok: true, value: accessOf(answer.value) } : answer;
}

export async function endSupportAccess(): Promise<Done<AccessState>> {
  const answer = await call<unknown>('end_support_access');
  return answer.ok ? { ok: true, value: accessOf(answer.value) } : answer;
}
