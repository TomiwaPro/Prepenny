'use client';

// "Download my data" (brief 4.12, 4.13, step 3h): everything PrePenny keeps
// for the person, gathered on their phone, as a spreadsheet and a backup.
//
// - The plan comes from this phone, which only ever holds what the person
//   may see: the server never sends anyone a partner's private records
//   (supabase/tests, steps 3a to 3g). With changes not sent yet, it's the
//   plan as they see it now.
// - For someone signed in, their account comes from the server, for them
//   alone (my_account_data), and the plan's history from Activity, with
//   Activity's own rule and words (D458, D474).
//
// Nothing here writes an amount, a name, a note or an email address
// anywhere but the files the person saves (CLAUDE.md).

import type { PlanRecords } from '@prepenny/engine';
import { useEffect, useState } from 'react';
import { accountNow } from '../lib/account.ts';
import {
  type ActivityContext,
  activityEditsFrom,
  activityPeopleFrom,
  activityWords,
} from '../lib/activity-words.ts';
import {
  BACKUP_APP,
  BACKUP_KIND,
  BACKUP_VERSION,
  type Backup,
  type BackupAccount,
  type BackupChange,
  type BackupPerson,
  recordsForBackup,
} from '../lib/backup.ts';
import { deviceName } from '../lib/device-words.ts';
import { myAccountData } from '../lib/security.ts';
import { planActivity } from '../lib/sharing.ts';
import { strings } from '../strings/en-GB.ts';
import { loadRecords, openDb, ownPlanOnPhone, type PlanLink } from './db.ts';

/** The most of the plan's history a download reads: 50 changes a page, far more than years of use. */
const MOST_PAGES = 1_000;

export interface MyData {
  readonly records: PlanRecords;
  readonly today: string;
  readonly now: string;
  readonly account: BackupAccount | null;
  readonly people: readonly BackupPerson[] | null;
  readonly history: readonly BackupChange[] | null;
  /** Signed in, but the account or its history couldn't be fetched: the files have the plan only. */
  readonly planOnly: boolean;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);

/** The account as my_account_data gives it, in the backup's own words. */
function accountOf(value: unknown): BackupAccount | null {
  if (value === null || typeof value !== 'object') return null;
  const found = value as Record<string, unknown>;
  if (typeof found.email !== 'string') return null;
  const list = (key: string) =>
    Array.isArray(found[key]) ? (found[key] as Record<string, unknown>[]) : [];
  return {
    email: found.email,
    signedUpAt: text(found.signed_up_at),
    name: textOrNull(found.name),
    backupEmail: textOrNull(found.backup_email),
    twoStepSignIn: found.two_step === true,
    signsInWithGoogle: found.google === true,
    devices: list('devices').map((one) => ({
      device: deviceName(text(one.browser), text(one.device)),
      thisDevice: one.this === true,
      signedInAt: text(one.signed_in_at),
      lastUsedAt: text(one.last_used_at),
    })),
    plans: list('plans').map((one) => ({
      role: text(one.role),
      joinedAt: text(one.joined_at),
      leftAt: textOrNull(one.left_at),
    })),
  };
}

/** Every change in the plan's history this person may see, in Activity's words, newest first. */
async function historyOf(
  planId: string,
  records: PlanRecords,
  me: string,
  nicknames: Readonly<Record<string, string>>,
  today: string,
): Promise<BackupChange[] | null> {
  const changes: BackupChange[] = [];
  const seen = new Set<string>();
  let people: Record<string, string> = {};
  let olderThan: string | null = null;
  for (let page = 0; page < MOST_PAGES; page += 1) {
    const answer = await planActivity(planId, olderThan);
    if (!answer.ok) return null;
    const edits = activityEditsFrom(answer.value);
    people = { ...people, ...activityPeopleFrom(answer.value) };
    const context: ActivityContext = {
      me,
      nicknames: { ...people, ...nicknames },
      today,
      nameOf: (table, id) => {
        const list =
          table === 'series'
            ? records.series
            : table === 'accounts'
              ? records.accounts
              : table === 'budgets'
                ? records.budgets
                : table === 'debts'
                  ? records.debts
                  : table === 'goals'
                    ? records.goals
                    : undefined;
        const name = (list as readonly { id: string; name?: string }[] | undefined)?.find(
          (one) => one.id === id,
        )?.name;
        return name === undefined || name === '' ? null : name;
      },
      comesIn: (seriesId) => {
        const series = records.series.find((one) => one.id === seriesId);
        return series === undefined ? null : series.direction === 'in';
      },
    };
    for (const edit of edits) {
      // A change at the very time a page ended comes again at the start of the next.
      if (seen.has(edit.id)) continue;
      seen.add(edit.id);
      changes.push({
        at: edit.madeAt,
        words: activityWords(edit, context).replaceAll(' ', ' '),
        undone: edit.undone,
      });
    }
    const more = (answer.value as { more?: unknown } | null)?.more === true;
    const last = edits.at(-1);
    if (!more || last === undefined) break;
    olderThan = last.madeAt;
  }
  return changes;
}

/**
 * Everything to download, or null when there's no plan of the person's own
 * on this phone yet (Sam's example isn't theirs).
 */
export async function gatherMyData(today: string, now: Date = new Date()): Promise<MyData | null> {
  const db = openDb();
  let found: {
    records: PlanRecords;
    planId: string;
    link: PlanLink | undefined;
  } | null;
  try {
    const own = await ownPlanOnPhone(db);
    found =
      own === undefined
        ? null
        : {
            records: await loadRecords(db, own.id),
            planId: own.id,
            link: await db.links.get(own.id),
          };
  } finally {
    db.close();
  }
  if (found === null) return null;
  const base = {
    records: found.records,
    today,
    now: now.toISOString().replace(/\.\d+Z$/, 'Z'),
  };
  const signedIn = accountNow().status === 'signed-in';
  if (!signedIn) {
    return { ...base, account: null, people: null, history: null, planOnly: false };
  }
  const link = found.link;
  const asked = await myAccountData();
  const account = asked.ok ? accountOf(asked.value) : null;
  const me = link?.personId ?? (accountNow() as { id?: string }).id ?? '';
  const nicknames = link?.nicknames ?? {};
  const people: BackupPerson[] = Object.entries(nicknames).map(([id, name]) => ({
    name: name === '' ? strings.share.someone : name,
    role: link?.roles?.[id] ?? '',
    you: id === me,
  }));
  const history =
    link === undefined ? [] : await historyOf(found.planId, found.records, me, nicknames, today);
  return {
    ...base,
    account,
    people,
    history,
    planOnly: account === null || history === null,
  };
}

/** The backup file's content for what was gathered. */
export function backupFrom(data: MyData): Backup {
  return {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    about: strings.yourData.backupAbout,
    madeAt: data.now,
    plan: {
      nation: data.records.settings?.nation ?? 'england-and-wales',
      records: recordsForBackup(data.records),
    },
    account: data.account,
    people: data.people,
    history: data.history,
  };
}

/** Saves text as a file in the phone's downloads, without it leaving the phone. */
export function saveFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The id of the person's own plan on this phone, or null with none: undefined while it's looked up. */
export function useOwnPlanId(version: number): string | null | undefined {
  const [id, setId] = useState<string | null | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: looked up again whenever the plan changes
  useEffect(() => {
    let live = true;
    const db = openDb();
    void ownPlanOnPhone(db)
      .then((own) => {
        if (live) setId(own?.id ?? null);
      })
      .catch(() => {
        if (live) setId(null);
      })
      .finally(() => db.close());
    return () => {
      live = false;
    };
  }, [version]);
  return id;
}
