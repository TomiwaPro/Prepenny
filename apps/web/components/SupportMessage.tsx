'use client';

// One message on the support screen (step 4j, D617): what they wrote, who
// it's from, what came with it (a picture within its 30 days, shown here; a
// plan copy, read only on its own view), support's replies, and the reply
// box. A reply can start from a ready reply, including one for someone in
// distress (brief 4.16), and is emailed from hello@prepenny.co.uk through
// Resend, then kept with the message (supabase/migrations, support_reply).

import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  type MessageDetail,
  supportFile,
  supportFind,
  supportMessage,
  supportReply,
  type ToolsProblem,
} from '../lib/support-tools.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { describedBy, Field } from './Fields.tsx';
import formStyles from './Form.module.css';
import styles from './Screens.module.css';
import { dayOfMoment, dayWords, ViewHeader, when } from './SupportScreen.tsx';
import own from './SupportTools.module.css';

const t = strings.supportTools;
const MOST = 5000;

export function replyProblem(problem: ToolsProblem): string {
  switch (problem) {
    case 'busy':
      return t.busy;
    case 'email-off':
      return t.emailOff;
    case 'no-address':
      return t.noAddress;
    case 'offline':
      return t.offline;
    default:
      return t.server;
  }
}

export function SupportMessageView({ id }: { readonly id: string }) {
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const answer = await supportMessage(id);
    if (answer.ok) setMessage(answer.value);
    else
      setFailed(
        answer.problem === 'not-found'
          ? (t.problems['not-found'] ?? t.couldNotLoad)
          : t.couldNotLoad,
      );
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const kind = message === null ? t.heading : (t.kinds[message.kind] ?? t.heading);
  return (
    <>
      <ViewHeader
        heading={kind}
        purpose={t.messagePurpose}
        back={{ label: t.backToInbox, href: '#inbox' }}
      />
      {message === null ? (
        <section className={styles.card}>
          <p className={styles.line}>{failed ?? t.loading}</p>
        </section>
      ) : (
        <>
          <About message={message} />
          <section
            className={styles.card}
            aria-labelledby="support-wrote"
            data-testid="support-words"
          >
            <h2 id="support-wrote" className={styles.cardTitle}>
              {t.wroteHeading}
            </h2>
            <p className={own.words}>{message.words}</p>
          </section>
          <Attachment message={message} />
          <Replies message={message} />
          <ReplyForm message={message} onSent={() => void load()} />
        </>
      )}
    </>
  );
}

function About({ message }: { readonly message: MessageDetail }) {
  const [finding, setFinding] = useState<string | null>(null);
  async function findAccount(email: string) {
    setFinding(t.finding);
    const answer = await supportFind(email);
    if (answer.ok && answer.value !== null) {
      setFinding(null);
      window.location.hash = `account=${answer.value}`;
    } else {
      setFinding(answer.ok ? t.notFound : t.couldNotLoad);
    }
  }
  return (
    <section className={styles.card} data-testid="support-about">
      <p className={styles.line}>{t.sentAt(when(message.sentAt))}</p>
      {message.from === null ? null : (
        <p className={`${styles.line} ${own.address}`}>
          {message.person === null ? t.fromChecked(message.from) : t.fromSignedIn(message.from)}
        </p>
      )}
      {message.screen === null ? null : (
        <p className={styles.second}>{t.onScreen(message.screen)}</p>
      )}
      <p className={styles.second}>{t.phone(message.phoneType)}</p>
      <p className={styles.second}>{t.version(message.appVersion)}</p>
      {message.answerBy === null ? null : (
        <p className={styles.second}>{t.answerBy(dayWords(message.answerBy))}</p>
      )}
      <div className={styles.actions}>
        {message.person !== null ? (
          <a className={formStyles.outlined} href={`#account=${message.person}`}>
            {t.openAccount}
          </a>
        ) : message.from !== null ? (
          <button
            type="button"
            className={formStyles.outlined}
            onClick={() => void findAccount(message.from ?? '')}
          >
            {t.findTheirAccount}
          </button>
        ) : null}
      </div>
      <p className={styles.second} role="status">
        {finding ?? ''}
      </p>
    </section>
  );
}

function Attachment({ message }: { readonly message: MessageDetail }) {
  const [picture, setPicture] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const file = message.file;

  useEffect(() => {
    if (file?.kind !== 'picture') return;
    void supportFile(message.id).then((answer) => {
      if (answer.ok && /^image\/(png|jpeg)$/.test(answer.value.contentType)) {
        setPicture(`data:${answer.value.contentType};base64,${answer.value.data}`);
      } else {
        setFailed(true);
      }
    });
  }, [file?.kind, message.id]);

  if (message.fileKind === null) return null;
  if (file === null) {
    return (
      <section className={styles.card}>
        <p className={styles.line}>
          {t.fileGone(message.fileGoneAt === null ? '' : dayOfMoment(message.fileGoneAt))}
        </p>
      </section>
    );
  }
  const gone = when(file.goneAt);
  if (file.kind === 'plan') {
    return (
      <section
        className={styles.card}
        aria-labelledby="support-plan-copy"
        data-testid="support-plan-copy"
      >
        <h2 id="support-plan-copy" className={styles.cardTitle}>
          {t.planHeading}
        </h2>
        <p className={styles.second}>{t.planFacts(gone)}</p>
        <div className={styles.actions}>
          <a className={formStyles.outlined} href={`#copy=${message.id}`}>
            {t.readPlan}
          </a>
        </div>
      </section>
    );
  }
  return (
    <section
      className={styles.card}
      aria-labelledby="support-picture"
      data-testid="support-picture"
    >
      <h2 id="support-picture" className={styles.cardTitle}>
        {t.pictureHeading}
      </h2>
      {picture === null ? (
        <p className={styles.line}>{failed ? t.couldNotLoad : t.readingFile}</p>
      ) : (
        <>
          {/* biome-ignore lint/performance/noImgElement: a picture from the database, not a file */}
          <img className={own.picture} src={picture} alt={t.pictureAlt} />
        </>
      )}
      <p className={styles.second}>{t.pictureFacts(file.width ?? 0, file.height ?? 0, gone)}</p>
    </section>
  );
}

function Replies({ message }: { readonly message: MessageDetail }) {
  return (
    <section
      className={styles.card}
      aria-labelledby="support-replies"
      data-testid="support-replies"
    >
      <h2 id="support-replies" className={styles.cardTitle}>
        {t.repliesHeading}
      </h2>
      {message.replies.length === 0 ? (
        <p className={styles.line}>{t.noReply}</p>
      ) : (
        <ul className={styles.list}>
          {message.replies.map((reply) => (
            <li key={reply.sentAt} className={own.entry} data-testid="support-reply">
              <span className={styles.second}>{t.sentAt(when(reply.sentAt))}</span>
              <span className={own.words}>{reply.words}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReplyForm({
  message,
  onSent,
}: {
  readonly message: MessageDetail;
  readonly onSent: () => void;
}) {
  const id = useId();
  const [ready, setReady] = useState<string>('none');
  const [words, setWords] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const status = useRef<HTMLParagraphElement>(null);

  function choose(key: string) {
    setReady(key);
    const found = t.ready.find((one) => one.key === key);
    setWords(found === undefined ? '' : found.words.join('\n'));
    setError(undefined);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setProblem(null);
    const typed = words.trim();
    if (typed === '') {
      setError(t.replyMissing);
      box.current?.focus();
      return;
    }
    if (typed.length > MOST) {
      setError(t.replyTooLong(typed.length.toLocaleString('en-GB')));
      box.current?.focus();
      return;
    }
    setError(undefined);
    setBusy(true);
    setSaid(t.sendingReply);
    const done = await supportReply(message.id, typed);
    setBusy(false);
    if (!done.ok) {
      setSaid('');
      setProblem(replyProblem(done.problem));
      return;
    }
    setWords('');
    setReady('none');
    setSaid(t.replySent(message.from ?? ''));
    status.current?.focus();
    onSent();
  }

  return (
    <section
      className={styles.card}
      aria-labelledby={`${id}-heading`}
      data-testid="support-reply-form"
    >
      <h2 id={`${id}-heading`} className={styles.cardTitle}>
        {t.replyHeading}
      </h2>
      <form className={own.form} onSubmit={send} noValidate>
        <ChoiceList
          legend={t.readyLegend}
          name={`${id}-ready`}
          value={ready}
          options={[
            { value: 'none', label: t.readyNone },
            ...t.ready.map((one) => ({ value: one.key, label: one.title })),
          ]}
          onChange={choose}
        />
        <Field id={`${id}-words`} label={t.replyLabel} error={error} hint={t.replyHint}>
          <textarea
            ref={box}
            id={`${id}-words`}
            className={`${formStyles.input} ${own.box}`}
            value={words}
            rows={8}
            autoComplete="off"
            onChange={(event) => setWords(event.target.value)}
            aria-invalid={error !== undefined}
            aria-describedby={describedBy(`${id}-words`, error, [`${id}-words-hint`])}
          />
        </Field>
        <button type="submit" className={formStyles.main} aria-disabled={busy}>
          {t.sendReply}
        </button>
      </form>
      <p
        ref={status}
        tabIndex={-1}
        className={styles.line}
        role="status"
        data-testid="support-reply-said"
      >
        {said}
      </p>
      <div role="alert">
        {problem === null ? null : <p className={formStyles.problem}>{problem}</p>}
      </div>
    </section>
  );
}
