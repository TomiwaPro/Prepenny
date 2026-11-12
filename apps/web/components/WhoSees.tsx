'use client';

// Who sees a debt or a savings goal, in a shared plan (brief 4.14, D65,
// step 3g, D463): "Shared with Tom" or "Only you see this", with "Share this
// debt with Tom" or "Make it private". Both are the server's own steps, made
// on what the account has now, and each asks first. Only the person who
// shared one can make it private again. Nothing at all in a plan of one's own.

import { useState } from 'react';
import { hasPartner, nameOf, partnerOf } from '../data/shared-plan.ts';
import { makePrivate, shareRecord } from '../lib/sharing.ts';
import { strings } from '../strings/en-GB.ts';
import { useShared } from './ChangedBy.tsx';
import formStyles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { runPrivacyStep } from './privacy-step.ts';
import styles from './Screens.module.css';
import { StepSheet } from './StepSheet.tsx';

const t = strings.together;

export function WhoSees({
  what,
  id,
  name,
  account = null,
}: {
  readonly what: 'debt' | 'goal';
  readonly id: string;
  readonly name: string;
  /** A goal's account: a goal kept in a private account stays private. */
  readonly account?: { readonly id: string; readonly name: string } | null;
}) {
  const shared = useShared();
  const { loaded } = usePlanActions();
  const [asking, setAsking] = useState<'share' | 'private' | null>(null);
  const [said, setSaid] = useState('');
  if (shared === null || !hasPartner(shared) || loaded === null) return null;
  const planId = loaded.plan.id;
  const partner = partnerOf(shared)?.name ?? strings.share.someone;
  const isShared = (what === 'debt' ? shared.sharedDebts : shared.sharedGoals).has(id);
  const addedBy = shared.addedBy.get(`${what === 'debt' ? 'debts' : 'goals'}|${id}`);
  const theirs = addedBy !== undefined && addedBy !== shared.personId;
  const owner = addedBy === undefined ? partner : (nameOf(shared, addedBy) ?? partner);
  const inPrivateAccount = account !== null && !shared.sharedAccounts.has(account.id);

  return (
    <div className={styles.actions} data-testid="who-sees" data-shared={isShared}>
      <p className={styles.line}>{isShared ? t.sharedWith(partner) : t.onlyYou}</p>
      {isShared && theirs ? <p className={styles.second}>{t.sharedByThem(owner)}</p> : null}
      {!isShared && inPrivateAccount && account !== null ? (
        <p className={styles.second}>{t.goalStaysPrivate(account.name)}</p>
      ) : null}
      <p className={styles.second} role="status">
        {said}
      </p>
      {isShared && !theirs ? (
        <button
          type="button"
          className={formStyles.outlined}
          aria-haspopup="dialog"
          onClick={() => {
            setSaid('');
            setAsking('private');
          }}
        >
          {t.makeItPrivate}
        </button>
      ) : null}
      {!isShared && !inPrivateAccount ? (
        <button
          type="button"
          className={formStyles.outlined}
          aria-haspopup="dialog"
          onClick={() => {
            setSaid('');
            setAsking('share');
          }}
        >
          {what === 'debt' ? t.shareDebt(partner) : t.shareGoal(partner)}
        </button>
      ) : null}
      <StepSheet
        open={asking === 'share'}
        title={what === 'debt' ? t.shareDebtTitle(name, partner) : t.shareGoalTitle(name, partner)}
        intro={what === 'debt' ? t.shareDebtIntro(name, partner) : t.shareGoalIntro(name, partner)}
        yes={t.shareYes}
        no={t.shareNo}
        working={t.sharing}
        run={() =>
          runPrivacyStep(
            () => shareRecord(planId, what, id),
            (found) =>
              found.kind === 'view-only'
                ? t.viewOnlyShare
                : found.kind === 'goal-in-private-account'
                  ? t.goalInPrivateAccount(account?.name ?? '')
                  : null,
          )
        }
        onClose={(done) => {
          if (done) setSaid(t.sharedDone(name));
          setAsking(null);
        }}
      />
      <StepSheet
        open={asking === 'private'}
        title={t.recordPrivateTitle(name)}
        intro={
          what === 'debt' ? t.debtPrivateIntro(name, partner) : t.goalPrivateIntro(name, partner)
        }
        yes={t.privateYes}
        no={t.privateNo}
        working={t.makingPrivate}
        run={() =>
          runPrivacyStep(
            () => makePrivate(planId, what, id),
            (found) =>
              found.kind === 'not-yours'
                ? t.notYours(owner, name)
                : found.kind === 'partner-things'
                  ? t.recordPartnerThings(partner, name)
                  : null,
          )
        }
        onClose={(done) => {
          if (done) setSaid(t.privateDone(name));
          setAsking(null);
        }}
      />
    </div>
  );
}
