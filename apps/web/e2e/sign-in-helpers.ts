// Shared steps for the sign-in tests (step 3b). They run against the local
// Supabase that `supabase start` runs (supabase/config.toml), whose emails are
// caught by its test inbox (Mailpit) and never sent anywhere.

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, type Page, type Request } from '@playwright/test';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { box, fillAccount, lastForm, next, skip, startSetup } from './setup.ts';

/** The local test inbox's own address (supabase/config.toml, [local_smtp]). */
const INBOX = 'http://127.0.0.1:54324';

/** The local database's container, from the project's name in supabase/config.toml. */
const DATABASE_CONTAINER = 'supabase_db_prepenny';

export const TODAY = '2026-10-25';

/** A new email address for each test, so tests never share a person or an inbox. */
export function newEmail(who: string): string {
  return `${who}-${randomUUID().slice(0, 12)}@example.com`;
}

/** Empties the local test inbox, for the screenshots, which use the owner's own example address. */
export async function emptyInbox() {
  await fetch(`${INBOX}/api/v1/messages`, { method: 'DELETE' });
}

interface Found {
  readonly ID: string;
  readonly Created: string;
}

/** The emails sent to an address, newest first. */
async function emailsTo(address: string): Promise<readonly Found[]> {
  const response = await fetch(
    `${INBOX}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
  );
  expect(response.ok, 'the local test inbox answers').toBe(true);
  const { messages } = (await response.json()) as { messages: Found[] };
  return messages;
}

export interface SignInEmail {
  readonly subject: string;
  readonly code: string;
  /** The link, as the email has it. */
  readonly link: string;
  readonly html: string;
}

/**
 * Waits for the email number `count` sent to an address (1 for the first),
 * and reads the code and the link from it.
 */
export async function signInEmail(address: string, count = 1): Promise<SignInEmail> {
  let found: readonly Found[] = [];
  await expect
    .poll(
      async () => {
        found = await emailsTo(address);
        return found.length;
      },
      { message: `email ${count} to ${address}`, timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(count);
  const newestFirst = [...found].sort((a, b) => b.Created.localeCompare(a.Created));
  const wanted = newestFirst[newestFirst.length - count];
  if (wanted === undefined) throw new Error('No such email.');
  const response = await fetch(`${INBOX}/api/v1/message/${wanted.ID}`);
  const message = (await response.json()) as { Subject: string; HTML: string };
  const code = />\s*(\d{6})\s*</.exec(message.HTML)?.[1];
  const link = /href="([^"]*\/sign-in\/#token_hash=[^"]+)"/.exec(message.HTML)?.[1];
  if (code === undefined || link === undefined) {
    throw new Error('The sign-in email should have a 6-digit code and a link.');
  }
  return {
    subject: message.Subject,
    code,
    link: link.replaceAll('&amp;', '&'),
    html: message.HTML,
  };
}

/**
 * Makes a code run out: moves the time it was sent back 11 minutes in the
 * local database, as if 11 minutes had passed. Its "lasts 10 minutes" is
 * Supabase's own (otp_expiry), so Supabase itself refuses it after this.
 */
export function makeCodeRunOut(address: string) {
  const sql = `
    update auth.users
      set confirmation_sent_at = confirmation_sent_at - interval '11 minutes',
          recovery_sent_at = recovery_sent_at - interval '11 minutes'
      where email = '${address.replaceAll("'", "''")}';
    update auth.one_time_tokens
      set created_at = created_at - interval '11 minutes'
      where user_id = (select id from auth.users where email = '${address.replaceAll("'", "''")}');`;
  execFileSync('docker', [
    'exec',
    DATABASE_CONTAINER,
    'psql',
    '--quiet',
    '--no-psqlrc',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    sql,
  ]);
}

/**
 * Makes a plan of one's own on the phone, as someone trying PrePenny before
 * signing up: one account with £267.54 today, every other step skipped.
 */
export async function makeAPlan(page: Page) {
  await startSetup(page, TODAY);
  await fillAccount(lastForm(page, 'account'), {
    name: 'Current account',
    balance: '267.54',
    warning: '20',
  });
  await next(page);
  // Each step is waited for before the next tap, so a tap never lands between two.
  for (let step = 2; step <= 7; step += 1) {
    await expect(page.getByText(`Step ${step} of 8`, { exact: true })).toBeVisible();
    await skip(page);
  }
  await expect(page.getByText('Step 8 of 8', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go to my plan' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByTestId('balance')).toContainText('£267.54');
}

/** Types an email address on the sign-in page and asks for a code. */
export async function askForCode(page: Page, address: string) {
  await box(page, 'Email address').fill(address);
  await page.getByRole('button', { name: 'Send me a code', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Type your code' })).toBeVisible();
  await expect(
    page.getByText(`We've sent a 6-digit code to ${address}. It lasts 10 minutes.`),
  ).toBeVisible();
}

/** Every request PrePenny sends to Supabase while a test runs. */
export function watchSupabase(page: Page): Request[] {
  const sent: Request[] = [];
  page.context().on('request', (request) => {
    if (request.url().startsWith(LOCAL_SUPABASE.url)) sent.push(request);
  });
  return sent;
}

/** What PrePenny keeps in the browser, everywhere it can keep anything. */
export async function whatThePhoneKeeps(page: Page) {
  return page.evaluate(async () => {
    const rows: Record<string, number> = {};
    const databases = await indexedDB.databases();
    for (const { name } of databases) {
      if (name === undefined) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        rows[`${name}.${store}`] = await new Promise<number>((resolve, reject) => {
          const count = db.transaction(store).objectStore(store).count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        });
      }
      db.close();
    }
    return {
      localStorage: Object.keys(localStorage),
      sessionStorage: Object.keys(sessionStorage),
      rows,
    };
  });
}
