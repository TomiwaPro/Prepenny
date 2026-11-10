'use client';

// "Choose shared accounts" (brief 4.14, PLAN.md items 26 and 34, step 3f):
// the person ticks which of their own private accounts to share. Their
// partner then sees each one's balance and every payment in it. Sharing is
// the server's own step: the account and everything on it change privacy
// together, or nothing does, and savings goals, debts and job details stay
// private (supabase/migrations, step 3f). A shared account can't be made
// private again, so a sheet asks first.
//
// Money between two of the person's accounts can't cross from shared to
// private, so the server refuses to share one without the other, and says
// which; this screen names them.

import { useState } from 'react';
import { useSharedPlan } from '../data/shared-plan.ts';
import { allSent, syncNow, useSync } from '../data/sync.ts';
import { useAccount } from '../lib/account.ts';
import { shareAccounts } from '../lib/sharing.ts';
import { strings } from '../strings/en-GB.ts';
import { CheckOption, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { namesList } from './ShareScreen.tsx';
import { Sheet } from './Sheet.tsx';

const t = strings.share;

export function ShareAccountsScreen() {
  const account = useAccount();
  const sync = useSync();
  const { loaded } = usePlanActions();
  const planId = loaded !== null && !loaded.plan.isExample ? loaded.plan.id : null;
  const shared = useSharedPlan(planId, loaded?.version ?? 0);
  const [ticked, setTicked] = useState<readonly string[]>([]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState('');

  const header = (
    <ScreenHeader
      heading={t.accountsTitle}
      purpose={t.accountsPurpose}
      back={{ label: t.backToShare, href: '/app/share/' }}
    />
  );
  const kept = account.status === 'signed-in' && sync.kept && planId !== null && shared !== null;
  if (!kept) {
    return (
      <>
        {header}
        <section className={styles.card}>
          <p className={styles.line}>
            {loaded?.plan.isExample === true ? t.onExample : t.signInFirst}
          </p>
        </section>
      </>
    );
  }

  const accounts = (loaded?.records.accounts ?? []).filter((one) => one.closed !== true);
  const nameOf = (id: string) => accounts.find((one) => one.id === id)?.name ?? '';
  const mine = accounts.filter((one) => !shared.sharedAccounts.has(one.id));
  const alreadyShared = accounts.filter((one) => shared.sharedAccounts.has(one.id));
  const chosen = ticked.filter((id) => mine.some((one) => one.id === id));
  const chosenNames = namesList(chosen.map(nameOf));
  const partner =
    Object.entries(shared.nicknames).find(
      ([person, name]) => person !== shared.personId && name !== '',
    )?.[1] ?? t.partnerFallback;

  async function share() {
    if (busy || planId === null) return;
    setBusy(true);
    setProblem(null);
    // Sharing is the server's own step, on what the account has now.
    if (!(await allSent())) {
      setBusy(false);
      setAsking(false);
      setProblem(t.waitingToSend);
      return;
    }
    const done = await shareAccounts(planId, chosen);
    if (!done.ok) {
      setBusy(false);
      setAsking(false);
      const found = done.problem;
      setProblem(
        found.kind === 'share-together'
          ? t.shareTogether(namesList(found.ids.map(nameOf).filter((name) => name !== '')))
          : found.kind === 'share-has-halves'
            ? t.shareHalves(
                namesList(
                  found.ids
                    .map((id) => loaded?.records.series.find((one) => one.id === id)?.name ?? '')
                    .filter((name) => name !== ''),
                ),
              )
            : found.kind === 'view-only'
              ? t.viewOnly
              : found.kind === 'offline'
                ? t.offline
                : t.problem,
      );
      return;
    }
    await syncNow();
    setBusy(false);
    setAsking(false);
    setTicked([]);
    setSaid(t.sharedDone(chosenNames));
  }

  return (
    <>
      {header}
      <p className={styles.line} role="status" data-testid="share-said">
        {said}
      </p>
      <section className={styles.card} data-testid="share-accounts">
        {mine.length === 0 ? (
          <p className={styles.line}>{t.noPrivate}</p>
        ) : (
          <fieldset className={`${formStyles.plain} ${formStyles.stack}`}>
            <legend className={formStyles.legend}>{t.accountsLegend}</legend>
            {mine.map((one) => (
              <CheckOption
                key={one.id}
                checked={ticked.includes(one.id)}
                onChange={(on) =>
                  setTicked((now) => (on ? [...now, one.id] : now.filter((id) => id !== one.id)))
                }
              >
                {one.name}
              </CheckOption>
            ))}
          </fieldset>
        )}
        {alreadyShared.length === 0 ? null : (
          <ul className={styles.list} aria-label={t.alreadyShared}>
            {alreadyShared.map((one) => (
              <li key={one.id} className={styles.rowBody}>
                <span className={styles.rowName}>{one.name}</span>
                <span className={styles.second}>{t.alreadyShared}</span>
              </li>
            ))}
          </ul>
        )}
        <Problem text={problem} />
        {mine.length === 0 ? null : (
          <div className={styles.actions}>
            <button
              type="button"
              className={formStyles.main}
              aria-haspopup="dialog"
              onClick={() => {
                setSaid('');
                if (chosen.length === 0) {
                  setProblem(t.chooseOne);
                  return;
                }
                setProblem(null);
                setAsking(true);
              }}
            >
              {t.shareThese}
            </button>
          </div>
        )}
      </section>
      <Sheet
        open={asking}
        title={t.confirmTitle(chosenNames)}
        intro={t.confirmIntro(partner)}
        closeLabel={strings.sheet.goBack}
        onClose={() => setAsking(false)}
      >
        <div className={formStyles.actions}>
          <p className={formStyles.lede} role="status">
            {busy ? t.sharing : ''}
          </p>
          <button
            type="button"
            className={formStyles.main}
            aria-disabled={busy}
            onClick={() => void share()}
          >
            {t.confirmYes}
          </button>
          <button type="button" className={formStyles.outlined} onClick={() => setAsking(false)}>
            {t.confirmNo}
          </button>
        </div>
      </Sheet>
    </>
  );
}
