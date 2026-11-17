'use client';

// Reminders, under More (step 4e, brief 4.11, D560 to D566): each reminder
// with what it does and when, every one off until it's turned on (D560);
// "Hide amounts in notifications" on the same screen (D561); quiet hours;
// and whether this phone gets them.
//
// Reminders need an account, and on an iPhone, PrePenny opened from the
// Home Screen: the screen says so plainly, with a link to the steps (D562).
// Turning the first one on asks the phone to allow notifications, from the
// tap itself, as phones ask.

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import { useAccount } from '../lib/account.ts';
import { useHomeScreen } from '../lib/install.ts';
import {
  anyOn,
  blocked,
  browserAddress,
  type Choices,
  chooseReminders,
  getOnThisPhone,
  myReminders,
  phoneCan,
  type RemindersState,
} from '../lib/reminders-phone.ts';
import { signInConfig } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import choiceStyles from './ChoiceList.module.css';
import formStyles from './Form.module.css';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';

const t = strings.reminders;

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly offline: boolean }
  | { readonly kind: 'ready'; readonly state: RemindersState; readonly here: string | null };

const KINDS = [
  { key: 'payday', label: t.payday, line: t.paydayLine },
  { key: 'evening', label: t.evening, line: t.eveningLine },
  { key: 'shortfall', label: t.shortfall, line: t.shortfallLine },
  { key: 'weekly', label: t.weekly, line: t.weeklyLine },
] as const;

export function RemindersScreen() {
  const account = useAccount();
  const { asApp } = useHomeScreen();
  const [can, setCan] = useState<ReturnType<typeof phoneCan> | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  // What was just tapped, shown at once while it's saved; gone back if it can't be.
  const [shown, setShown] = useState<Choices | null>(null);
  const base = useId();

  useEffect(() => setCan(phoneCan(asApp)), [asApp]);

  const load = useCallback(async () => {
    const answer = await myReminders();
    if (!answer.ok) {
      setLoaded({ kind: 'failed', offline: answer.problem === 'offline' });
      return;
    }
    setLoaded({ kind: 'ready', state: answer.value, here: await browserAddress() });
  }, []);

  useEffect(() => {
    if (account.status === 'signed-in' && can === 'yes') void load();
  }, [account.status, can, load]);

  const header = (
    <ScreenHeader
      heading={t.heading}
      purpose={t.purpose}
      back={{ label: t.back, href: '/app/more/' }}
    />
  );

  const needs = (words: string, link?: { href: string; label: string }) => (
    <>
      {header}
      <section className={styles.card} data-testid="reminders-needs">
        <p className={styles.line}>{words}</p>
        {link === undefined ? null : (
          <div className={styles.actions}>
            <Link className={formStyles.outlined} href={link.href}>
              {link.label}
            </Link>
          </div>
        )}
      </section>
    </>
  );

  // On an iPhone in Safari, signing in there wouldn't help: the Home Screen
  // app keeps its own sign-in (D548), so that comes first (D562).
  if (can === null) return needs(t.loading);
  if (can === 'iphone-home-screen') {
    return needs(t.iphone, { href: '/app/home-screen/', label: t.iphoneSteps });
  }
  if (signInConfig() === null || account.status === 'off') return needs(t.signInOff);
  if (account.status === 'signed-out') {
    return needs(t.signedOut, { href: '/sign-in/?to=sign-up&from=more', label: t.signIn });
  }
  if (can === 'no') return needs(t.cantHere);
  if (account.status === 'checking' || loaded.kind === 'loading') return needs(t.loading);
  if (loaded.kind === 'failed') {
    return (
      <>
        {header}
        <section className={styles.card} data-testid="reminders-needs">
          <p className={styles.line}>{loaded.offline ? t.offline : t.server}</p>
          <div className={styles.actions}>
            <button type="button" className={formStyles.outlined} onClick={() => void load()}>
              {t.tryAgain}
            </button>
          </div>
        </section>
      </>
    );
  }

  const { state, here } = loaded;
  const thisPhoneGets = state.thisPhone !== null && state.thisPhone === here;

  /** Saves a change of choices; the first reminder on, or this phone not getting them yet, asks the phone first. */
  async function change(next: Choices, askPhone: boolean) {
    if (busy) return;
    setBusy(true);
    setShown(next);
    setSaid(t.saving);
    try {
      if (askPhone) {
        if (blocked()) {
          setSaid(t.blocked);
          return;
        }
        if (state.publicKey === null) {
          setSaid(t.server);
          return;
        }
        const got = await getOnThisPhone(state.publicKey);
        if (!got.ok) {
          setSaid(
            got.problem === 'refused'
              ? t.askedNo
              : got.problem === 'offline'
                ? t.offline
                : t.server,
          );
          return;
        }
      }
      const saved = await chooseReminders(next);
      if (!saved.ok) {
        setSaid(saved.problem === 'offline' ? t.offline : t.server);
        return;
      }
      setLoaded({ kind: 'ready', state: saved.value, here: await browserAddress() });
      setSaid(t.saved);
    } finally {
      setShown(null);
      setBusy(false);
    }
  }

  const choices: Choices = shown ?? {
    payday: state.payday,
    evening: state.evening,
    shortfall: state.shortfall,
    weekly: state.weekly,
    hideAmounts: state.hideAmounts,
  };

  return (
    <>
      {header}
      <section className={styles.card} data-testid="reminders">
        <fieldset className={choiceStyles.choice}>
          <legend className={choiceStyles.legend}>{t.choose}</legend>
          {KINDS.map((kind) => {
            const labelId = `${base}-${kind.key}`;
            const lineId = `${base}-${kind.key}-line`;
            return (
              <label key={kind.key} className={`${choiceStyles.option} ${choiceStyles.stacked}`}>
                <input
                  type="checkbox"
                  checked={choices[kind.key]}
                  aria-labelledby={labelId}
                  aria-describedby={lineId}
                  aria-disabled={busy ? true : undefined}
                  data-testid={`reminder-${kind.key}`}
                  onChange={(event) => {
                    const on = event.target.checked;
                    const next = { ...choices, [kind.key]: on };
                    void change(next, on && !thisPhoneGets);
                  }}
                />
                <span className={choiceStyles.words}>
                  <span id={labelId}>{kind.label}</span>
                  <span id={lineId} className={choiceStyles.under}>
                    {kind.line}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <label className={`${choiceStyles.option} ${choiceStyles.stacked}`}>
          <input
            type="checkbox"
            checked={choices.hideAmounts}
            aria-labelledby={`${base}-hide`}
            aria-describedby={`${base}-hide-line`}
            aria-disabled={busy ? true : undefined}
            data-testid="reminder-hide-amounts"
            onChange={(event) =>
              void change({ ...choices, hideAmounts: event.target.checked }, false)
            }
          />
          <span className={choiceStyles.words}>
            <span id={`${base}-hide`}>{t.hideAmounts}</span>
            <span id={`${base}-hide-line`} className={choiceStyles.under}>
              {t.hideAmountsLine}
            </span>
          </span>
        </label>
        <p className={styles.line}>{t.quiet}</p>
      </section>
      <section
        className={styles.card}
        aria-labelledby={`${base}-phone`}
        data-testid="reminders-phone"
      >
        <h2 id={`${base}-phone`} className={styles.cardTitle}>
          {t.thisPhone}
        </h2>
        <p className={styles.line}>
          {!anyOn(choices) ? t.phoneAllOff : thisPhoneGets ? t.phoneOn : t.phoneOff}
        </p>
        {anyOn(choices) && !thisPhoneGets ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={formStyles.outlined}
              aria-disabled={busy ? true : undefined}
              onClick={() => void change(choices, true)}
            >
              {t.getOnThisPhone}
            </button>
          </div>
        ) : null}
      </section>
      <p className={styles.line} role="status" data-testid="reminders-said">
        {said}
      </p>
    </>
  );
}
