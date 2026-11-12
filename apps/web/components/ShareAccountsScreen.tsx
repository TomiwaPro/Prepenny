'use client';

// "Choose shared accounts" (brief 4.14, PLAN.md items 26 and 34, step 3f):
// the person ticks which of their own private accounts to share. Their
// partner then sees each one's balance and every payment in it. Sharing is
// the server's own step: the account and everything on it change privacy
// together, or nothing does, and savings goals, debts and job details stay
// private (supabase/migrations, step 3f). A sheet asks first.
//
// Since step 3g, the person who shared an account can make it private again,
// with everything on it, once nothing of their partner's own is in it (D462).
//
// Money between two of the person's accounts can't cross from shared to
// private, so the server refuses to share one without the other, and says
// which; this screen names them.

import { useState } from 'react';
import { partnerOf, nameOf as personName, useSharedPlan } from '../data/shared-plan.ts';
import { allSent, syncNow, useSync } from '../data/sync.ts';
import { useAccount } from '../lib/account.ts';
import { makePrivate, type SharingProblem, shareAccounts } from '../lib/sharing.ts';
import { strings } from '../strings/en-GB.ts';
import { CheckOption, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { runPrivacyStep } from './privacy-step.ts';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { namesList } from './ShareScreen.tsx';
import { Sheet } from './Sheet.tsx';
import { StepSheet } from './StepSheet.tsx';

const t = strings.share;
const g = strings.together;

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
  const [unsharing, setUnsharing] = useState<string | null>(null);

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

  const records = loaded?.records;
  const seriesName = (id: string) =>
    records?.series.find((one) => one.id === id)?.name ??
    records?.budgets?.find((one) => one.id === id)?.name ??
    '';
  const goalName = (id: string) => records?.goals?.find((one) => one.id === id)?.name ?? '';
  const named = (ids: readonly string[], name: (id: string) => string) =>
    namesList(ids.map(name).filter((one) => one !== ''));
  const partnerWords = partnerOf(shared)?.name ?? t.partnerFallback;

  /** Why the account can't be made private, in words. */
  function privateProblem(found: SharingProblem, account: string, by: string): string | null {
    switch (found.kind) {
      case 'not-yours':
        return g.notYours(by, account);
      case 'partner-things': {
        const names = named(found.ids, seriesName);
        return names === ''
          ? g.partnerThingsUnnamed(partnerWords, account)
          : g.partnerThings(partnerWords, account, names);
      }
      case 'goal-here':
        return g.goalHere(named(found.ids, goalName), account);
      case 'move-together':
        return g.moveTogether(account, named(found.ids, nameOf));
      case 'share-has-halves':
        return g.hasHalves(named(found.ids, seriesName), account);
      default:
        return null;
    }
  }
  const unsharingName = unsharing === null ? '' : nameOf(unsharing);
  const addedByOf = (id: string) => shared.addedBy.get(`accounts|${id}`);

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
          <ul className={styles.list} aria-label={t.alreadyShared} data-testid="already-shared">
            {alreadyShared.map((one) => {
              const by = addedByOf(one.id);
              const theirs = by !== undefined && by !== shared.personId;
              return (
                <li key={one.id} className={styles.rowBody}>
                  <span className={styles.rowName}>{one.name}</span>
                  <span className={styles.second}>{t.alreadyShared}</span>
                  {theirs ? (
                    <span className={styles.second}>
                      {g.onlyTheyCan(personName(shared, by) ?? t.partnerFallback)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={formStyles.outlined}
                      aria-haspopup="dialog"
                      onClick={() => {
                        setSaid('');
                        setProblem(null);
                        setUnsharing(one.id);
                      }}
                    >
                      {g.makePrivate(one.name ?? '')}
                    </button>
                  )}
                </li>
              );
            })}
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
      <StepSheet
        open={unsharing !== null}
        title={g.privateTitle(unsharingName)}
        intro={g.privateIntro(unsharingName, partnerWords)}
        yes={g.privateYes}
        no={g.privateNo}
        working={g.makingPrivate}
        run={() =>
          runPrivacyStep(
            () => makePrivate(planId ?? '', 'account', unsharing ?? ''),
            (found) => {
              const by = unsharing === null ? undefined : addedByOf(unsharing);
              return privateProblem(
                found,
                unsharingName,
                (by === undefined ? null : personName(shared, by)) ?? t.partnerFallback,
              );
            },
          )
        }
        onClose={(done) => {
          if (done) setSaid(g.privateDone(unsharingName));
          setUnsharing(null);
        }}
      />
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
