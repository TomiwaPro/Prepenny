'use client';

// The form behind Contact us, Something looks wrong and Suggest a feature
// (step 4i, brief 4.16, D601 to D613).
//
// 1. The words, and for Something looks wrong a picture or a copy of the
//    plan, chosen only after the consent message (D602).
// 2. Signed in, Send sends it as the person. Signed out, Send first emails a
//    6-digit code to the address typed, and the message goes only with that
//    code (D605): nothing typed is sent before then.
// 3. Sent: when to expect an answer, aiming for 1 working day, and where the
//    reply goes. For an idea, just thanks.
//
// What the phone adds by itself is said in words under the form (D610).
// Nothing typed is kept on the phone or written anywhere: the words stay in
// memory while PrePenny is open, so closing the sheet to take a screenshot
// loses nothing.

import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useAccount } from '../lib/account.ts';
import { formatDay } from '../lib/dates.ts';
import type { Picture, PlanCopy } from '../lib/picture.ts';
import {
  askForCode,
  MOST_CHARACTERS,
  type SupportKind,
  type SupportProblem,
  sendToSupport,
  thisPhone,
  thisVersion,
} from '../lib/support.ts';
import { localToday } from '../lib/today.ts';
import { strings } from '../strings/en-GB.ts';
import { CodeBox, sixDigits } from './CodeBox.tsx';
import { describedBy, Field } from './Fields.tsx';
import formStyles from './Form.module.css';
import styles from './Support.module.css';

const t = strings.support;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Words for a problem, each saying what to do. */
export function supportWords(problem: SupportProblem, wait?: number): string {
  switch (problem) {
    case 'offline':
      return t.offline;
    case 'off':
      return t.off;
    case 'too-many':
      return t.tooMany;
    case 'busy':
      return t.busy;
    case 'email-off':
      return t.emailOff;
    case 'not-allowed':
      return t.notAllowed;
    case 'wait':
      return t.wait(wait ?? 60);
    case 'files-full':
      return t.problem.filesFull;
    case 'bad-picture':
    case 'bad-plan':
    case 'file-too-big':
      return t.problem.fileRefused;
    case 'code-wrong':
      return t.codeWrong;
    case 'code-ran-out':
      return t.codeRanOut;
    case 'bad-email':
      return t.emailMissing;
    default:
      return t.server;
  }
}

/** What's needed from the attachment part before sending, or null when it's fine. */
export interface AttachmentState {
  readonly file: Picture | PlanCopy | null;
  /** A mistake to show beside the choice, or null when it's ready. */
  readonly missing: string | null;
}

export interface SupportFormProps {
  readonly kind: SupportKind;
  readonly wordsLabel: string;
  readonly wordsHint: string;
  readonly wordsMissing: string;
  /** Something looks wrong: the screen's name, read when it's sent. */
  readonly screen?: () => string;
  /** Something looks wrong: the picture or plan copy part. */
  readonly attachment?: {
    readonly state: AttachmentState;
    readonly node: ReactNode;
    readonly focus: () => void;
    readonly reset: () => void;
  };
  /** Words under the form, such as "You can also email hello@prepenny.co.uk". */
  readonly after?: ReactNode;
  /** Once sent, what the person can do next, such as "Write another message". */
  readonly onWriteAnother?: (() => void) | null;
  /** Called once it's sent. */
  readonly onSent?: () => void;
}

type Step = 'write' | 'code' | 'sent';

export function SupportForm({
  kind,
  wordsLabel,
  wordsHint,
  wordsMissing,
  screen,
  attachment,
  after = null,
  onWriteAnother = null,
  onSent,
}: SupportFormProps) {
  const id = useId();
  const account = useAccount();
  const signedOut = account.status === 'signed-out';
  const [step, setStep] = useState<Step>('write');
  const [words, setWords] = useState('');
  const [wordsError, setWordsError] = useState<string | undefined>();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<{
    readonly answerBy: string | null;
    readonly replied: boolean;
    readonly to: string;
  } | null>(null);
  const wordsBox = useRef<HTMLTextAreaElement>(null);
  const emailBox = useRef<HTMLInputElement>(null);
  const codeBox = useRef<HTMLInputElement>(null);
  const stepStart = useRef<HTMLParagraphElement>(null);
  const sentTitle = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  // Each step starts where a screen reader reads it (WCAG 2.4.3).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the step changes
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    if (step === 'code') stepStart.current?.focus();
    if (step === 'sent') {
      sentTitle.current?.focus();
      onSent?.();
    }
    if (step === 'write') wordsBox.current?.focus();
  }, [step]);

  const said = words.trim();
  const message = () => ({
    kind,
    words: said,
    screen: screen?.() ?? null,
    file: attachment?.state.file ?? null,
  });

  /** Checks the words, the attachment and, signed out, the address. True when all are fine. */
  function ready(): boolean {
    let fine = true;
    let first: (() => void) | null = null;
    if (said === '') {
      setWordsError(wordsMissing);
      first ??= () => wordsBox.current?.focus();
      fine = false;
    } else if (said.length > MOST_CHARACTERS) {
      setWordsError(t.tooLong(said.length.toLocaleString('en-GB')));
      first ??= () => wordsBox.current?.focus();
      fine = false;
    } else {
      setWordsError(undefined);
    }
    if (attachment !== undefined && attachment.state.missing !== null) {
      first ??= attachment.focus;
      fine = false;
    }
    if (signedOut) {
      if (!EMAIL.test(email.trim())) {
        setEmailError(t.emailMissing);
        first ??= () => emailBox.current?.focus();
        fine = false;
      } else {
        setEmailError(undefined);
      }
    }
    first?.();
    return fine;
  }

  function showProblem(found: SupportProblem, wait?: number) {
    if (found === 'bad-email') {
      setEmailError(t.emailMissing);
      emailBox.current?.focus();
      return;
    }
    setProblem(supportWords(found, wait));
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy !== null) return;
    setProblem(null);
    if (!ready()) return;
    if (signedOut) {
      const address = email.trim().toLowerCase();
      setBusy(t.sendingCode);
      const asked = await askForCode(address);
      setBusy(null);
      if (!asked.ok && asked.problem !== 'wait') {
        if (asked.problem === 'too-many') setProblem(t.tooManyCodes);
        else showProblem(asked.problem);
        return;
      }
      setEmail(address);
      setCode('');
      setCodeError(undefined);
      setStep('code');
      if (!asked.ok) setProblem(supportWords('wait', asked.wait));
      return;
    }
    setBusy(t.sending);
    const done = await sendToSupport(message(), null);
    setBusy(null);
    if (!done.ok) {
      showProblem(done.problem);
      return;
    }
    setSent({
      answerBy: done.answerBy,
      replied: done.replied,
      to: account.status === 'signed-in' ? account.email : '',
    });
    setStep('sent');
  }

  async function sendWithCode(event: FormEvent) {
    event.preventDefault();
    if (busy !== null) return;
    setProblem(null);
    const typed = sixDigits(code);
    if (typed === null) {
      setCodeError(t.codeMissing);
      codeBox.current?.focus();
      return;
    }
    setCodeError(undefined);
    setBusy(t.sending);
    const done = await sendToSupport(message(), { email, code: typed });
    setBusy(null);
    if (!done.ok) {
      if (done.problem === 'code-wrong' || done.problem === 'code-ran-out') {
        setCodeError(done.problem === 'code-wrong' ? t.codeWrong : t.codeRanOut);
        codeBox.current?.focus();
        return;
      }
      showProblem(done.problem);
      return;
    }
    setSent({ answerBy: done.answerBy, replied: done.replied, to: email });
    setStep('sent');
  }

  async function newCode() {
    if (busy !== null) return;
    setProblem(null);
    setBusy(t.sendingCode);
    const asked = await askForCode(email);
    setBusy(null);
    if (!asked.ok) {
      setProblem(
        asked.problem === 'too-many' ? t.tooManyCodes : supportWords(asked.problem, asked.wait),
      );
      return;
    }
    setCode('');
    setCodeError(undefined);
    codeBox.current?.focus();
  }

  function writeAnother() {
    setWords('');
    setCode('');
    setSent(null);
    setProblem(null);
    attachment?.reset();
    setStep('write');
    onWriteAnother?.();
  }

  const busyLine = (
    <p className={styles.busy} role="status">
      {busy ?? ''}
    </p>
  );
  const problemLine = (
    <div role="alert">
      {problem === null ? null : <p className={formStyles.problem}>{problem}</p>}
    </div>
  );

  if (step === 'sent' && sent !== null) {
    const today = localToday();
    return (
      <section className={styles.sent} data-testid="support-sent">
        <h2 ref={sentTitle} tabIndex={-1} className={styles.sentTitle}>
          {t.sentTitle}
        </h2>
        {kind === 'idea' || sent.answerBy === null ? (
          <p className={styles.line}>{t.sentIdea}</p>
        ) : (
          <>
            <p className={styles.line}>{t.sentAnswerBy(formatDay(sent.answerBy, today))}</p>
            {sent.to === '' ? null : (
              <p className={styles.line}>
                {sent.replied ? t.sentEmailed(sent.to) : t.sentReplyTo(sent.to)}
              </p>
            )}
          </>
        )}
        {onWriteAnother === null ? null : (
          <button type="button" className={formStyles.outlined} onClick={writeAnother}>
            {t.writeAnother}
          </button>
        )}
      </section>
    );
  }

  if (step === 'code') {
    return (
      <form className={styles.form} onSubmit={sendWithCode} noValidate>
        <p ref={stepStart} tabIndex={-1} className={styles.line}>
          {t.codeSent(email)}
        </p>
        <CodeBox
          id={`${id}-code`}
          label={t.codeLabel}
          error={codeError}
          value={code}
          onChange={setCode}
          inputRef={codeBox}
        />
        <button type="submit" className={formStyles.main} aria-disabled={busy !== null}>
          {t.sendWithCode}
        </button>
        <button
          type="button"
          className={formStyles.outlined}
          aria-disabled={busy !== null}
          onClick={() => void newCode()}
        >
          {t.newCode}
        </button>
        <button
          type="button"
          className={formStyles.outlined}
          onClick={() => {
            setProblem(null);
            setStep('write');
          }}
        >
          {t.otherEmail}
        </button>
        {busyLine}
        {problemLine}
      </form>
    );
  }

  const version = thisVersion();
  const phone = thisPhone();
  return (
    <form className={styles.form} onSubmit={send} noValidate>
      <Field id={`${id}-words`} label={wordsLabel} error={wordsError} hint={wordsHint}>
        <textarea
          ref={wordsBox}
          id={`${id}-words`}
          className={`${formStyles.input} ${styles.words}`}
          value={words}
          rows={5}
          // Nothing typed is remembered by the browser either.
          autoComplete="off"
          onChange={(event) => setWords(event.target.value)}
          aria-invalid={wordsError !== undefined}
          aria-describedby={describedBy(`${id}-words`, wordsError, [`${id}-words-hint`])}
        />
      </Field>
      {attachment?.node ?? null}
      {signedOut ? (
        <Field id={`${id}-email`} label={t.emailLabel} error={emailError} hint={t.emailHint}>
          <input
            ref={emailBox}
            id={`${id}-email`}
            className={formStyles.input}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailError !== undefined}
            aria-describedby={describedBy(`${id}-email`, emailError, [`${id}-email-hint`])}
          />
        </Field>
      ) : null}
      <p className={styles.added} data-testid="support-added">
        {kind === 'problem' ? t.addedWithScreen(version, phone) : t.added(version, phone)}
      </p>
      <button type="submit" className={formStyles.main} aria-disabled={busy !== null}>
        {t.send}
      </button>
      {busyLine}
      {problemLine}
      {after}
    </form>
  );
}
