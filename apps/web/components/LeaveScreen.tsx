'use client';

// "Leave this plan" (brief 4.14, step 3g, D468), from Share with my partner.
// Anyone in a shared plan can leave it, whatever they can do in it, and
// nobody has to agree. What comes with them: everything only they see, with
// its history, into a plan of their own. What stays: every shared account,
// as it is, with their changes to it in their partner's Activity under their
// name. They choose whether to take a copy of the shared accounts, which is
// theirs alone and never changes after. A sheet asks first.
//
// The server does all of it in one step (supabase/migrations, step 3g).
// Then this phone brings down the new plan in place of the shared one, as
// any phone of theirs does when its plan is no longer in the account, and
// Home opens with it, saying "You've left the plan" (components/LeftNote.tsx).

import Link from 'next/link';
import { useId, useState } from 'react';
import { partnerOf, useSharedPlan } from '../data/shared-plan.ts';
import { connectPlan, sendEverythingThen, useSync } from '../data/sync.ts';
import { useAccount } from '../lib/account.ts';
import { keepLeftNote } from '../lib/left-note.ts';
import { type Done, type Left, leavePlan } from '../lib/sharing.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import formStyles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { StepSheet } from './StepSheet.tsx';

const t = strings.together.leave;

type Copy = 'copy' | 'own';

export function LeaveScreen() {
  const id = useId();
  const account = useAccount();
  const sync = useSync();
  const { loaded } = usePlanActions();
  const planId = loaded !== null && !loaded.plan.isExample ? loaded.plan.id : null;
  const shared = useSharedPlan(planId, loaded?.version ?? 0);
  const [copy, setCopy] = useState<Copy | null>(null);
  const [copyError, setCopyError] = useState<string | undefined>();
  const [asking, setAsking] = useState(false);
  // Left: the new plan is on its way to this phone, and Home opens with it.
  const [gone, setGone] = useState(false);

  const partner = partnerOf(shared);
  const partnerName = partner?.name ?? strings.share.someone;
  const header = (
    <ScreenHeader
      heading={t.heading}
      purpose={t.purpose(partnerName)}
      back={{ label: t.back, href: '/app/share/' }}
    />
  );

  if (gone) {
    return (
      <>
        {header}
        <section className={styles.card}>
          <p className={styles.line} role="status">
            {t.leaving}
          </p>
        </section>
      </>
    );
  }

  const kept = account.status === 'signed-in' && sync.kept && planId !== null && shared !== null;
  if (!kept || partner === null) {
    return (
      <>
        {header}
        <section className={styles.card}>
          <p className={styles.line}>{kept ? t.alone : strings.share.loading}</p>
        </section>
      </>
    );
  }

  const me = shared.personId;
  const iOwn = shared.roles[me] === 'owner';
  const accounts = loaded?.records.accounts ?? [];
  // A goal of this person's own that saves into a shared account brings a
  // copy of that account with it either way (D472).
  const goalsComing = (loaded?.records.goals ?? []).flatMap((goal) => {
    if (goal.closed === true || shared.sharedGoals.has(goal.id)) return [];
    if (!shared.sharedAccounts.has(goal.accountId)) return [];
    const where = accounts.find((one) => one.id === goal.accountId)?.name;
    return where === undefined ? [] : [t.goalComes(goal.name, where)];
  });

  async function leave(): Promise<string | null> {
    if (planId === null) return t.problem;
    const result = await sendEverythingThen(() => leavePlan(planId, copy === 'copy'));
    if (!result.sent) return t.waiting;
    const answer: Done<Left> = result.value;
    if (!answer.ok) {
      const kind = answer.problem.kind;
      return kind === 'alone' ? t.alone : kind === 'offline' ? t.offline : t.problem;
    }
    // Home says so, once the new plan is here: the app starts afresh with it.
    keepLeftNote(answer.value.copied ? 'copied' : copy === 'copy' ? 'not-copied' : 'own-only');
    setGone(true);
    void (async () => {
      await connectPlan();
      window.location.replace('/app/');
    })();
    return null;
  }

  return (
    <>
      {header}
      <section className={styles.card} aria-labelledby={`${id}-comes`} data-testid="leave-comes">
        <h2 id={`${id}-comes`} className={styles.cardTitle}>
          {t.comesHeading}
        </h2>
        <p className={styles.line}>{t.comes}</p>
      </section>
      <section className={styles.card} aria-labelledby={`${id}-stays`} data-testid="leave-stays">
        <h2 id={`${id}-stays`} className={styles.cardTitle}>
          {t.staysHeading(partnerName)}
        </h2>
        <p className={styles.line}>{t.staysShared}</p>
        <p className={styles.line}>{t.staysChanges(partnerName)}</p>
        <p className={styles.line}>{t.staysMoney(partnerName)}</p>
        {iOwn ? <p className={styles.second}>{t.ownerPasses(partnerName)}</p> : null}
      </section>
      <section className={styles.card} data-testid="leave-copy">
        <ChoiceList<Copy>
          legend={t.copyLegend}
          name={`${id}-copy`}
          value={copy}
          hintsUnder
          invalid={copyError !== undefined}
          describedBy={copyError === undefined ? undefined : `${id}-copy-error`}
          options={[
            { value: 'copy', label: t.copyYes, hint: t.copyYesHint(partnerName) },
            { value: 'own', label: t.copyNo },
          ]}
          onChange={(value) => {
            setCopy(value);
            setCopyError(undefined);
          }}
        />
        {copyError === undefined ? null : (
          <p id={`${id}-copy-error`} className={formStyles.error}>
            {copyError}
          </p>
        )}
        {goalsComing.map((words) => (
          <p key={words} className={styles.second}>
            {words}
          </p>
        ))}
        <div className={styles.actions}>
          <button
            type="button"
            className={formStyles.outlined}
            aria-haspopup="dialog"
            onClick={() => {
              if (copy === null) {
                setCopyError(t.copyError);
                document.getElementsByName(`${id}-copy`)[0]?.focus();
                return;
              }
              setAsking(true);
            }}
          >
            {t.leave}
          </button>
          <Link className={formStyles.outlined} href="/app/share/">
            {t.stay}
          </Link>
        </div>
      </section>
      <StepSheet
        open={asking}
        title={t.confirmTitle}
        intro={t.confirmIntro(partnerName)}
        yes={t.confirmYes}
        no={t.confirmNo}
        working={t.leaving}
        run={leave}
        onClose={() => setAsking(false)}
      />
    </>
  );
}
