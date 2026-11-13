'use client';

// Delete my account and all my data (brief 4.12, 4.13, 7.2, step 3h).
//
// Signed in: it says what's deleted and when it's gone, then asks the
// person to sign in again with a code sent to their address, and the code
// from their authenticator app when two-step sign-in is on, and to type
// "delete". The server checks all three again and deletes everything in one
// step (delete_my_account), then an email says it's done. This phone forgets
// everything, and the person's other phones do within a minute.
//
// Not signed in: the plan is only on this phone, so "Remove everything from
// this phone" removes it, and everything else PrePenny keeps here.

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { forgetEverything } from '../data/forget.ts';
import { hasPartner, partnerOf, useSharedPlan } from '../data/shared-plan.ts';
import { useOwnPlanId } from '../data/your-data.ts';
import {
  accountDeletedHere,
  type Problem as SignInProblem,
  sendCodeAgain,
  signInAgainWithCode,
  useAccount,
  whileDeletingHere,
} from '../lib/account.ts';
import { deleteMyAccount, passSecondStep, twoStep } from '../lib/security.ts';
import { strings } from '../strings/en-GB.ts';
import { CodeBox, sixDigits } from './CodeBox.tsx';
import { describedBy, Field, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { securityWords } from './SecondStepSheet.tsx';
import { Sheet } from './Sheet.tsx';
import { wordsFor } from './SignInScreen.tsx';

const t = strings.yourData;
const s = strings.security;

export function DeleteScreen() {
  const account = useAccount();
  const header = (
    <ScreenHeader
      heading={t.deleteHeading}
      purpose={t.deletePurpose}
      back={{ label: t.backToMore, href: '/app/more/' }}
    />
  );
  if (account.status === 'checking') return header;
  if (account.status !== 'signed-in') {
    return (
      <>
        {header}
        <RemoveHere offerSignIn={account.status === 'signed-out'} />
      </>
    );
  }
  return (
    <>
      {header}
      <DeleteAccount email={account.email} />
    </>
  );
}

/** Not signed in: remove everything from this phone. */
function RemoveHere({ offerSignIn }: { readonly offerSignIn: boolean }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <section className={styles.card} data-testid="remove-here">
        <p className={styles.line}>{t.notSignedIn}</p>
        <div className={styles.actions}>
          <button type="button" className={formStyles.outlined} onClick={() => setAsking(true)}>
            {t.removeHere}
          </button>
        </div>
      </section>
      {offerSignIn ? (
        <section className={styles.card}>
          <p className={styles.line}>{t.haveAccount}</p>
          <div className={styles.actions}>
            <Link className={formStyles.outlined} href="/sign-in/?from=more">
              {t.signIn}
            </Link>
          </div>
        </section>
      ) : null}
      <Sheet
        open={asking}
        title={t.removeTitle}
        intro={t.removeIntro}
        closeLabel={strings.sheet.goBack}
        onClose={() => {
          if (!busy) setAsking(false);
        }}
      >
        <div className={formStyles.actions}>
          <button
            type="button"
            className={formStyles.main}
            aria-disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              await forgetEverything();
              window.location.replace('/?removed');
            }}
          >
            {t.removeConfirm}
          </button>
          <button
            type="button"
            className={formStyles.quiet}
            onClick={() => {
              if (!busy) setAsking(false);
            }}
          >
            {t.removeKeep}
          </button>
        </div>
      </Sheet>
    </>
  );
}

/** Signed in: what's deleted, when it's gone, then the check and the typed "delete". */
function DeleteAccount({ email }: { readonly email: string }) {
  const id = useId();
  const { loaded } = usePlanActions();
  const ownId = useOwnPlanId(loaded?.version ?? 0);
  const shared = useSharedPlan(ownId ?? null, loaded?.version ?? 0);
  const partner = hasPartner(shared) ? partnerOf(shared) : null;
  const [twoStepOn, setTwoStepOn] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState('');
  const [appCode, setAppCode] = useState('');
  const [typed, setTyped] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void twoStep().then((state) => {
      if (state.ok) setTwoStepOn(state.value.on);
    });
  }, []);

  const signInWords = (found: SignInProblem) => wordsFor(found, null);

  async function send() {
    if (sending) return;
    setSending(true);
    setProblem(null);
    setSaid(t.sendingCode);
    const done = await sendCodeAgain(email);
    setSending(false);
    if (!done.ok) {
      setSaid('');
      setProblem(signInWords(done.problem));
      return;
    }
    setSent(true);
    setSaid(t.codeSent(email));
  }

  async function remove() {
    if (busy) return;
    setProblem(null);
    const found: Record<string, string | undefined> = {};
    const emailCode = sixDigits(code);
    if (emailCode === null) found.code = s.emailCodeMissing;
    const app = twoStepOn ? sixDigits(appCode) : null;
    if (twoStepOn && app === null) found.app = s.appCodeMissing;
    if (typed.trim().toLowerCase() !== 'delete') found.confirm = t.confirmMissing;
    setErrors(found);
    const first = ['code', 'app', 'confirm'].find((key) => found[key] !== undefined);
    if (first !== undefined) {
      document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setSaid(t.deleting);
    // While it's asked, the phone's own look at the account leaves the
    // clearing up to this screen, so it says "deleted" and nothing else (D504).
    const deleted = await whileDeletingHere(() => checkAndDelete(emailCode ?? '', app));
    if (!deleted) return;
    await accountDeletedHere();
    window.location.replace('/?account-deleted');
  }

  /** Signs in afresh with the code, and the app's code with two-step on, then deletes: true once it's deleted. */
  async function checkAndDelete(emailCode: string, app: string | null): Promise<boolean> {
    const signedIn = await signInAgainWithCode(email, emailCode);
    if (!signedIn.ok) {
      setBusy(false);
      setSaid('');
      if (signedIn.problem.kind === 'code-refused') {
        setErrors({ code: s.emailCodeWrong });
        document.getElementById(`${id}-code`)?.focus();
      } else {
        setProblem(signInWords(signedIn.problem));
      }
      return false;
    }
    if (twoStepOn) {
      const passed = await passSecondStep(app ?? '');
      if (!passed.ok) {
        setBusy(false);
        setSaid('');
        if (passed.problem === 'code-wrong') {
          setErrors({ app: s.appCodeWrong });
          document.getElementById(`${id}-app`)?.focus();
        } else {
          setProblem(securityWords(passed.problem));
        }
        return false;
      }
    }
    const done = await deleteMyAccount(typed);
    if (!done.ok) {
      setBusy(false);
      setSaid('');
      switch (done.problem) {
        case 'sign-in-again':
          setSent(false);
          setCode('');
          setProblem(t.signInAgain);
          return false;
        case 'second-step-needed':
          setErrors({ app: s.appCodeWrong });
          return false;
        case 'confirm':
          setErrors({ confirm: t.confirmMissing });
          return false;
        default:
          setProblem(securityWords(done.problem));
          return false;
      }
    }
    return true;
  }

  return (
    <>
      <p className={styles.line} role="status" data-testid="delete-said">
        {said}
      </p>
      <section className={styles.card} aria-labelledby={`${id}-what`}>
        <h2 id={`${id}-what`} className={styles.cardTitle}>
          {t.whatGoesHeading}
        </h2>
        <p className={styles.line}>{t.whatGoesPlan}</p>
        <p className={styles.line}>{t.whatGoesAccount}</p>
        <p className={styles.line}>
          <Link href="/app/download/">{t.cantUndo}</Link>
        </p>
      </section>
      {partner !== null ? (
        <section
          className={styles.card}
          aria-labelledby={`${id}-shared`}
          data-testid="delete-shared"
        >
          <h2 id={`${id}-shared`} className={styles.cardTitle}>
            {t.sharedHeading}
          </h2>
          <p className={styles.line}>{t.sharedWhat(partner.name ?? strings.share.someone)}</p>
          <p className={styles.line}>{t.sharedHistory(partner.name ?? strings.share.someone)}</p>
        </section>
      ) : null}
      <section className={styles.card} aria-labelledby={`${id}-when`}>
        <h2 id={`${id}-when`} className={styles.cardTitle}>
          {t.whenGoneHeading}
        </h2>
        <p className={styles.line}>{t.whenGone}</p>
      </section>
      <section className={styles.card} aria-labelledby={`${id}-check`} data-testid="delete-check">
        <h2 id={`${id}-check`} className={styles.cardTitle}>
          {t.checkHeading}
        </h2>
        {!sent ? (
          <>
            <p className={styles.line}>{t.checkLine(email)}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={formStyles.main}
                aria-disabled={sending}
                onClick={() => void send()}
              >
                {t.sendCode}
              </button>
            </div>
          </>
        ) : (
          <form
            className={formStyles.form}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void remove();
            }}
          >
            <CodeBox
              id={`${id}-code`}
              label={t.emailCodeLabel}
              error={errors.code}
              value={code}
              onChange={setCode}
            />
            {twoStepOn ? (
              <CodeBox
                id={`${id}-app`}
                label={s.appCodeLabel}
                hint={s.appCodeHint}
                error={errors.app}
                value={appCode}
                onChange={setAppCode}
              />
            ) : null}
            <Field
              id={`${id}-confirm`}
              label={t.confirmLabel}
              hint={t.confirmHint}
              error={errors.confirm}
            >
              <input
                id={`${id}-confirm`}
                className={formStyles.input}
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                aria-invalid={errors.confirm !== undefined}
                aria-describedby={describedBy(`${id}-confirm`, errors.confirm, [
                  `${id}-confirm-hint`,
                ])}
              />
            </Field>
            <div className={formStyles.actions}>
              <button type="submit" className={formStyles.main} aria-disabled={busy}>
                {t.deleteButton}
              </button>
              <Link className={formStyles.quiet} href="/app/more/">
                {t.keepAccount}
              </Link>
            </div>
          </form>
        )}
        <Problem text={problem} />
      </section>
    </>
  );
}
