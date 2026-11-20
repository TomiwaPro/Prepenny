'use client';

// One account on the support screen (step 4j, D619 to D622): who it is and
// what's set up, never amounts, payment names or notes; whether they've let
// support see their plan; what's under way; recent error codes; their
// messages; support's actions; and what support did, with the time.
//
// The actions (question 14): sign out everywhere; turn off two-step sign-in
// after a 7-day wait with "Stop it"; and a link to the backup email that
// wrong codes can't lock, with the 24-hour wait and "Stop it". Each asks
// once, is recorded with the time, and the person is emailed. Support never
// moves an account to a new address: the ready reply says what to do.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AccountDetail,
  type Done,
  supportAccount,
  supportSendBackupLink,
  supportSignOut,
  supportStartTwoStepWait,
  supportStopTwoStepWait,
  type ToolsProblem,
} from '../lib/support-tools.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import styles from './Screens.module.css';
import { Sheet } from './Sheet.tsx';
import { dayOfMoment, ViewHeader, when } from './SupportScreen.tsx';
import own from './SupportTools.module.css';

const t = strings.supportTools;

const problemWords = (problem: ToolsProblem) => t.problems[problem] ?? t.problems.server ?? '';

interface Action {
  readonly key: 'sign-out' | 'two-step' | 'stop-two-step' | 'backup-link';
  readonly title: string;
  readonly intro: string;
  readonly confirm: string;
  readonly keep: string;
  readonly run: () => Promise<Done<string>>;
}

/** Asks once before an action, then does it: the button that does it, and one that doesn't. */
function ActionSheet({
  action,
  onClose,
}: {
  readonly action: Action | null;
  readonly onClose: (said: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: starts afresh each time it opens
  useEffect(() => {
    setBusy(false);
    setProblem(null);
  }, [action?.key]);
  return (
    <Sheet
      open={action !== null}
      title={action?.title ?? ''}
      intro={action?.intro ?? ''}
      closeLabel={strings.sheet.goBack}
      onClose={() => onClose(null)}
    >
      <div className={formStyles.actions}>
        <button
          type="button"
          className={formStyles.main}
          aria-disabled={busy}
          onClick={async () => {
            if (busy || action === null) return;
            setBusy(true);
            setProblem(null);
            const done = await action.run();
            setBusy(false);
            if (done.ok) onClose(done.value);
            else setProblem(problemWords(done.problem));
          }}
        >
          {action?.confirm ?? ''}
        </button>
        <button type="button" className={formStyles.quiet} onClick={() => onClose(null)}>
          {action?.keep ?? ''}
        </button>
        <div role="alert">
          {problem === null ? null : <p className={formStyles.problem}>{problem}</p>}
        </div>
      </div>
    </Sheet>
  );
}

export function SupportAccountView({ id }: { readonly id: string }) {
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [said, setSaid] = useState('');
  const status = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    const answer = await supportAccount(id);
    if (answer.ok) setAccount(answer.value);
    else setFailed(problemWords(answer.problem));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const header = (
    <ViewHeader
      heading={t.accountHeading}
      purpose={t.accountPurpose}
      back={{ label: t.backToInbox, href: '#inbox' }}
    />
  );
  if (account === null) {
    return (
      <>
        {header}
        <section className={styles.card}>
          <p className={styles.line}>{failed ?? t.loading}</p>
        </section>
      </>
    );
  }
  const email = account.email ?? '';
  const actions: Action[] = [];
  const signOut: Action = {
    key: 'sign-out',
    title: t.signOutTitle(email),
    intro: t.signOutIntro,
    confirm: t.signOutYes,
    keep: t.signOutNo,
    run: async () => {
      const done = await supportSignOut(account.person);
      return done.ok ? { ok: true, value: t.signedOutDone(done.value) } : done;
    },
  };
  const twoStep: Action = {
    key: 'two-step',
    title: t.twoStepTitle,
    intro: t.twoStepIntro,
    confirm: t.twoStepYes,
    keep: t.twoStepNo,
    run: async () => {
      const done = await supportStartTwoStepWait(account.person);
      return done.ok ? { ok: true, value: t.twoStepStarted(when(done.value)) } : done;
    },
  };
  const stopTwoStep: Action = {
    key: 'stop-two-step',
    title: t.stopTitle,
    intro: t.stopIntro,
    confirm: t.stopYes,
    keep: t.stopNo,
    run: async () => {
      const done = await supportStopTwoStepWait(account.person);
      return done.ok ? { ok: true, value: t.stopped } : done;
    },
  };
  const backupLink: Action = {
    key: 'backup-link',
    title: t.backupLinkTitle,
    intro: t.backupLinkIntro(account.backupEmail ?? ''),
    confirm: t.backupLinkYes,
    keep: t.backupLinkNo,
    run: async () => {
      const done = await supportSendBackupLink(account.person);
      if (!done.ok) return done;
      const to = account.backupEmail ?? '';
      return {
        ok: true,
        value: done.value === 'finish' ? t.finishLinkSentNow(to) : t.backupLinkSent(to),
      };
    },
  };
  if (!account.isYou) {
    actions.push(signOut);
    if (account.twoStep && account.twoStepWait === null) actions.push(twoStep);
    if (account.backupEmail !== null) actions.push(backupLink);
  }
  const lines: Record<string, string> = {
    'sign-out': t.signOutLine,
    'two-step': t.twoStepLine,
    'backup-link': t.backupLinkLine,
  };
  const labels: Record<string, string> = {
    'sign-out': t.signOut,
    'two-step': t.twoStep,
    'backup-link': t.backupLink,
  };

  return (
    <>
      {header}
      <p
        ref={status}
        tabIndex={-1}
        className={styles.line}
        role="status"
        data-testid="support-account-said"
      >
        {said}
      </p>
      <section
        className={styles.card}
        aria-labelledby="support-about-account"
        data-testid="support-account"
      >
        <h2 id="support-about-account" className={styles.cardTitle}>
          {t.aboutHeading}
        </h2>
        <p className={`${styles.line} ${own.address}`}>{t.signsInWith(email)}</p>
        <p className={`${styles.line} ${own.address}`}>
          {account.backupEmail === null ? t.noBackup : t.backup(account.backupEmail)}
        </p>
        {account.signedUpAt === null ? null : (
          <p className={styles.line}>{t.signedUp(dayOfMoment(account.signedUpAt))}</p>
        )}
        <p className={styles.line}>
          {account.lastSignedInAt === null
            ? t.neverSignedIn
            : t.lastSignedIn(when(account.lastSignedInAt))}
        </p>
        <p className={styles.line}>{account.twoStep ? t.twoStepOn : t.twoStepOff}</p>
        <p className={styles.line}>{t.plans[account.plan]}</p>
        <p className={styles.line}>{t.devices(account.devices)}</p>
      </section>

      <section
        className={styles.card}
        aria-labelledby="support-their-plan"
        data-testid="support-their-plan"
      >
        <h2 id="support-their-plan" className={styles.cardTitle}>
          {t.planAccessHeading}
        </h2>
        {account.access.on && account.access.endsAt !== null ? (
          <>
            <p className={styles.line}>{t.accessOn(when(account.access.endsAt))}</p>
            <div className={styles.actions}>
              <a className={formStyles.outlined} href={`#plan=${account.person}`}>
                {t.seePlan}
              </a>
            </div>
          </>
        ) : (
          <p className={styles.line}>{t.accessOff}</p>
        )}
      </section>

      <section
        className={styles.card}
        aria-labelledby="support-under-way"
        data-testid="support-under-way"
      >
        <h2 id="support-under-way" className={styles.cardTitle}>
          {t.underWayHeading}
        </h2>
        {account.twoStepWait === null && account.getBackIn === null ? (
          <p className={styles.line}>{t.nothingUnderWay}</p>
        ) : null}
        {account.twoStepWait === null ? null : (
          <>
            <p className={styles.line}>{t.twoStepWaiting(when(account.twoStepWait.endsAt))}</p>
            {account.isYou ? null : (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={formStyles.outlined}
                  aria-haspopup="dialog"
                  onClick={() => setAction(stopTwoStep)}
                >
                  {t.stopTwoStepWait}
                </button>
              </div>
            )}
          </>
        )}
        {account.getBackIn === null ? null : (
          <>
            <p className={styles.line}>
              {t.getBackInWaiting(
                when(account.getBackIn.startedAt),
                when(account.getBackIn.readyAt),
              )}
            </p>
            {account.getBackIn.fromSupport ? (
              <p className={styles.second}>{t.getBackInFromSupport}</p>
            ) : null}
            {account.getBackIn.finishLinkAt === null ? null : (
              <p className={styles.second}>
                {t.finishLinkSent(when(account.getBackIn.finishLinkAt))}
              </p>
            )}
          </>
        )}
      </section>

      <section
        className={styles.card}
        aria-labelledby="support-actions"
        data-testid="support-actions"
      >
        <h2 id="support-actions" className={styles.cardTitle}>
          {t.actionsHeading}
        </h2>
        {account.isYou ? (
          <p className={styles.line}>{t.yourOwn}</p>
        ) : (
          <>
            <p className={styles.second}>{t.actionsLine}</p>
            <ul className={styles.list}>
              {actions.map((one) => (
                <li key={one.key} className={own.entry}>
                  <span className={styles.second}>{lines[one.key]}</span>
                  <span className={styles.actions}>
                    <button
                      type="button"
                      className={formStyles.outlined}
                      aria-haspopup="dialog"
                      onClick={() => setAction(one)}
                    >
                      {labels[one.key]}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.second}>{t.lostEmail}</p>
          </>
        )}
      </section>

      <section
        className={styles.card}
        aria-labelledby="support-errors"
        data-testid="support-errors"
      >
        <h2 id="support-errors" className={styles.cardTitle}>
          {t.errorsHeading}
        </h2>
        {account.errorCodes.length === 0 ? (
          <p className={styles.line}>{t.errorsEmpty}</p>
        ) : (
          <ul className={styles.list}>
            {account.errorCodes.map((code) => (
              <li key={`${code.at}-${code.code}`} className={own.entry} data-testid="support-error">
                <span className={styles.line}>
                  {t.errorLine(code.code, code.screen, when(code.at))}
                </span>
                <span className={styles.second}>{t.version(code.appVersion)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className={styles.card}
        aria-labelledby="support-their-messages"
        data-testid="support-their-messages"
      >
        <h2 id="support-their-messages" className={styles.cardTitle}>
          {t.messagesHeading}
        </h2>
        {account.messages.length === 0 ? (
          <p className={styles.line}>{t.noMessages}</p>
        ) : (
          <ul className={styles.list}>
            {account.messages.map((message) => (
              <li key={message.id}>
                <a className={styles.rowLink} href={`#message=${message.id}`}>
                  <span className={styles.rowBody}>
                    <span className={styles.rowName}>{t.kinds[message.kind]}</span>
                    <span className={styles.second}>
                      {t.messageLine(
                        when(message.sentAt),
                        message.replied ? t.replied : t.waitingReply,
                      )}
                    </span>
                  </span>
                  <span className={styles.arrow} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card} aria-labelledby="support-did" data-testid="support-did">
        <h2 id="support-did" className={styles.cardTitle}>
          {t.didHeading}
        </h2>
        {account.actions.length === 0 ? (
          <p className={styles.line}>{t.didNothing}</p>
        ) : (
          <ul className={styles.list}>
            {account.actions.map((done) => (
              <li
                key={`${done.at}-${done.action}`}
                className={own.entry}
                data-testid="support-did-entry"
              >
                <span className={styles.line}>
                  {t.didAt(t.did[done.action] ?? done.action, when(done.at))}
                </span>
                {done.emailed ? <span className={styles.second}>{t.emailed}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ActionSheet
        action={action}
        onClose={(done) => {
          setAction(null);
          if (done !== null) {
            setSaid(done);
            void load();
            status.current?.focus();
          }
        }}
      />
    </>
  );
}
