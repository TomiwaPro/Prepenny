'use client';

// The support dashboard's views (step 4j, brief 4.16, ARCHITECTURE.md 3.7,
// D617 to D625), on the dashboard's own address, admin.prepenny.co.uk, for
// PrePenny support only (D641). The database decides who that is: support's
// own account, whose address is in the SUPPORT_EMAIL secret, signed in with
// two-step sign-in on and passed. SupportDashboard.tsx signs in first.
//
// One page, as static export needs (D337), with what's shown after the "#":
// - nothing: the tax year check, the inbox, finding an account and usage;
// - #message=id: one message, its picture or plan copy, its replies, and
//   the reply box with ready replies;
// - #account=id: an account's status, what's under way, its error codes,
//   support's actions on it and what support did;
// - #plan=id: the plan someone let support see, read only;
// - #copy=id: a message's plan copy, read only.

import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { formatDay, formatTime } from '../lib/dates.ts';
import { momentWords } from '../lib/device-words.ts';
import { statusPageUrl } from '../lib/status-page.ts';
import {
  type Inbox,
  type InboxMessage,
  type ServiceStatus,
  STATUS_PARTS,
  serviceStatus,
  supportFind,
  supportInbox,
  supportUsage,
  type Usage,
} from '../lib/support-tools.ts';
import { taxYearWords } from '../lib/tax-year-check.ts';
import { testSetting } from '../lib/test-setting.ts';
import { localToday } from '../lib/today.ts';
import { supportStrings } from '../strings/support-en-GB.ts';
import { describedBy, Field } from './Fields.tsx';
import formStyles from './Form.module.css';
import styles from './Screens.module.css';
import { SupportAccountView } from './SupportAccount.tsx';
import { SupportMessageView } from './SupportMessage.tsx';
import { SupportCopyView, SupportPlanView } from './SupportPlan.tsx';
import own from './SupportTools.module.css';

const t = supportStrings.supportTools;

/** What's shown, from the address after "#". */
export type SupportView =
  | { readonly kind: 'home' }
  | { readonly kind: 'message' | 'account' | 'plan' | 'copy'; readonly id: string };

const ID = /^[0-9a-f-]{36}$/;

export function viewOf(hash: string): SupportView {
  const found = /^#?(message|account|plan|copy)=([0-9a-f-]{36})$/.exec(hash);
  if (found === null || !ID.test(found[2] ?? '')) return { kind: 'home' };
  return { kind: found[1] as 'message' | 'account' | 'plan' | 'copy', id: found[2] as string };
}

/** Today, "YYYY-MM-DD", by this computer's clock (the tests can set it, lib/test-setting.ts). */
export const supportToday = () => testSetting()?.today ?? localToday();

/** "2:05pm on Fri 20 Nov", by this phone's clock. */
export const when = (time: string) => momentWords(time);
/** "Fri 20 Nov", for a date. */
export const dayWords = (date: string) => formatDay(date, supportToday());
/** "Fri 20 Nov", for a moment, by this phone's clock. */
export const dayOfMoment = (time: string) => dayWords(localToday(new Date(time)));

/** The top of a view: an optional link back, its heading, which takes focus, and what it's for. */
export function ViewHeader({
  heading,
  purpose,
  back,
}: {
  readonly heading: string;
  readonly purpose: string;
  readonly back: { readonly label: string; readonly href: string } | null;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each new view's heading takes focus
  useEffect(() => {
    if (back !== null) ref.current?.focus();
  }, [heading, purpose]);
  return (
    <header className={styles.header}>
      {back === null ? null : (
        <a className={styles.back} href={back.href}>
          {back.label}
        </a>
      )}
      <h1 ref={ref} tabIndex={-1} className={styles.heading}>
        {heading}
      </h1>
      <p className={styles.purpose}>{purpose}</p>
    </header>
  );
}

/** The dashboard's views, once support is signed in with two-step sign-in passed (SupportDashboard.tsx). */
export function SupportScreen() {
  const [view, setView] = useState<SupportView>({ kind: 'home' });

  useEffect(() => {
    const follow = () => setView(viewOf(window.location.hash));
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  switch (view.kind) {
    case 'message':
      return <SupportMessageView key={view.id} id={view.id} />;
    case 'account':
      return <SupportAccountView key={view.id} id={view.id} />;
    case 'plan':
      return <SupportPlanView key={view.id} person={view.id} />;
    case 'copy':
      return <SupportCopyView key={view.id} message={view.id} />;
    default:
      return <SupportHome />;
  }
}

// ---------------------------------------------------------------------------
// The first view: the tax year check, the inbox, finding an account, usage.

function SupportHome() {
  const tax = taxYearWords(supportToday());
  return (
    <>
      <ViewHeader heading={t.heading} purpose={t.purpose} back={null} />
      <StatusCard />
      <section
        className={tax.missing.length === 0 ? styles.card : `${styles.card} ${own.notice}`}
        aria-labelledby="support-tax"
        data-testid="support-tax-year"
      >
        <h2 id="support-tax" className={styles.cardTitle}>
          {t.taxYearHeading}
        </h2>
        {tax.lines.map((line) => (
          <p key={line} className={styles.line}>
            {line}
          </p>
        ))}
      </section>
      <InboxCard />
      <FindCard />
      <UsageCard />
    </>
  );
}

/**
 * PrePenny's status, at the top (step 4k, D644): the status page's four
 * parts, checked now by the same function the status page asks, each with
 * its word. In the sunk colour with a brass edge when anything isn't
 * working, never Short's red (DESIGN.md).
 */
function StatusCard() {
  const [status, setStatus] = useState<ServiceStatus | null | 'checking'>('checking');
  const check = useCallback(() => {
    setStatus('checking');
    void serviceStatus().then(setStatus);
  }, []);
  useEffect(() => check(), [check]);
  const page = statusPageUrl();
  const down =
    status === null ||
    (status !== 'checking' && STATUS_PARTS.some((part) => !status.working[part]));
  return (
    <section
      className={down ? `${styles.card} ${own.notice}` : styles.card}
      aria-labelledby="support-status"
      data-testid="support-status"
    >
      <h2 id="support-status" className={styles.cardTitle}>
        {t.statusHeading}
      </h2>
      <p className={styles.second}>{t.statusLine}</p>
      <div role="status">
        {status === 'checking' ? (
          <p className={styles.line}>{t.checking}</p>
        ) : status === null ? (
          <p className={styles.line}>{t.noAnswer}</p>
        ) : (
          <>
            <ul className={styles.list}>
              {STATUS_PARTS.map((part) => (
                <li key={part} className={own.count} data-testid="support-status-part">
                  <span className={styles.line}>{t.statusParts[part]}</span>
                  <span className={own.figure}>
                    {status.working[part] ? t.working : t.notWorking}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.second}>{t.checkedAt(formatTime(status.checkedAt))}</p>
          </>
        )}
      </div>
      <div className={formStyles.actions}>
        <button
          type="button"
          className={formStyles.outlined}
          aria-disabled={status === 'checking'}
          onClick={() => {
            if (status !== 'checking') check();
          }}
        >
          {t.checkAgain}
        </button>
        {page === null ? null : (
          <a
            className={own.statusPage}
            href={page}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`${t.statusPage}, ${t.statusPageOpens}`}
          >
            {t.statusPage}
          </a>
        )}
      </div>
    </section>
  );
}

function MessageRow({ message }: { readonly message: InboxMessage }) {
  const kind = t.kinds[message.kind] ?? message.kind;
  const at = when(message.sentAt);
  // Named by its own words, so voice control can say what it shows (WCAG 2.5.3).
  const state =
    message.kind === 'idea'
      ? t.ideaStatus
      : message.repliedAt === null
        ? t.waitingReply
        : t.replied;
  return (
    <li>
      <a
        className={styles.rowLink}
        href={`#message=${message.id}`}
        data-testid="support-message-row"
      >
        <span className={styles.rowBody}>
          <span className={styles.rowTop}>
            <span className={styles.rowName}>{kind}</span>
            <span className={styles.tag}>{state}</span>
          </span>
          <span className={styles.second}>{at}</span>
          {message.from === null ? null : (
            <span className={`${styles.second} ${own.address}`}>{message.from}</span>
          )}
          {/* The first few lines only: the whole message is on its own view. */}
          <span className={`${styles.line} ${own.snippet}`}>{message.words}</span>
        </span>
        <span className={styles.arrow} aria-hidden="true" />
      </a>
    </li>
  );
}

function InboxCard() {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (olderThan: string | null) => {
    setBusy(true);
    setFailed(null);
    const answer = await supportInbox(olderThan);
    setBusy(false);
    if (!answer.ok) {
      setFailed(answer.problem === 'offline' ? t.offline : t.couldNotLoad);
      return;
    }
    setInbox((before) =>
      olderThan === null || before === null
        ? answer.value
        : { ...answer.value, messages: [...before.messages, ...answer.value.messages] },
    );
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  const oldest = inbox?.messages.at(-1)?.sentAt ?? null;
  return (
    <section className={styles.card} aria-labelledby="support-inbox" data-testid="support-inbox">
      <h2 id="support-inbox" className={styles.cardTitle}>
        {t.inboxHeading}
      </h2>
      {inbox === null ? (
        <p className={styles.line}>{failed ?? t.loading}</p>
      ) : (
        <>
          <p className={styles.second}>{t.inboxLine(inbox.waiting)}</p>
          {inbox.messages.length === 0 ? (
            <p className={styles.line}>{t.empty}</p>
          ) : (
            <ul className={styles.list}>
              {inbox.messages.map((message) => (
                <MessageRow key={message.id} message={message} />
              ))}
            </ul>
          )}
          {inbox.more && oldest !== null ? (
            <div className={styles.actions}>
              <button
                type="button"
                className={formStyles.outlined}
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) void load(oldest);
                }}
              >
                {t.showOlder}
              </button>
            </div>
          ) : null}
          <p className={styles.second} role="status">
            {busy && inbox !== null ? t.showingOlder : (failed ?? '')}
          </p>
        </>
      )}
      {failed !== null && inbox === null ? (
        <div className={styles.actions}>
          <button type="button" className={formStyles.outlined} onClick={() => void load(null)}>
            {t.tryAgain}
          </button>
        </div>
      ) : null}
    </section>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FindCard() {
  const id = useId();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  async function find(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const typed = email.trim();
    if (!EMAIL.test(typed)) {
      setError(t.findMissing);
      box.current?.focus();
      return;
    }
    setError(undefined);
    setBusy(true);
    setSaid(t.finding);
    const answer = await supportFind(typed);
    setBusy(false);
    if (!answer.ok) {
      setSaid(answer.problem === 'offline' ? t.offline : t.couldNotLoad);
      return;
    }
    if (answer.value === null) {
      setSaid(t.notFound);
      return;
    }
    setSaid('');
    window.location.hash = `account=${answer.value}`;
  }

  return (
    <section className={styles.card} aria-labelledby={`${id}-heading`} data-testid="support-find">
      <h2 id={`${id}-heading`} className={styles.cardTitle}>
        {t.findHeading}
      </h2>
      <form className={own.form} onSubmit={find} noValidate>
        <Field id={`${id}-email`} label={t.findLabel} error={error} hint={t.findLine}>
          <input
            ref={box}
            id={`${id}-email`}
            className={formStyles.input}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error !== undefined}
            aria-describedby={describedBy(`${id}-email`, error, [`${id}-email-hint`])}
          />
        </Field>
        <button type="submit" className={formStyles.outlined} aria-disabled={busy}>
          {t.find}
        </button>
      </form>
      <p className={styles.line} role="status" data-testid="support-find-said">
        {said}
      </p>
    </section>
  );
}

function UsageCard() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    void supportUsage().then((answer) => {
      if (answer.ok) setUsage(answer.value);
      else setFailed(answer.problem === 'offline' ? t.offline : t.couldNotLoad);
    });
  }, []);

  const counts: readonly (readonly [string, number])[] =
    usage === null
      ? []
      : [
          [t.opened7, usage.opened7],
          [t.opened30, usage.opened30],
          [t.sharedPlans, usage.sharedPlans],
          [t.remindersOn, usage.remindersOn],
          [t.waitingCount, usage.waiting],
        ];
  return (
    <section className={styles.card} aria-labelledby="support-usage" data-testid="support-usage">
      <h2 id="support-usage" className={styles.cardTitle}>
        {t.usageHeading}
      </h2>
      <p className={styles.second}>{t.usageLine}</p>
      {usage === null ? (
        <p className={styles.line}>{failed ?? t.loading}</p>
      ) : (
        <>
          <ul className={styles.list}>
            {counts.map(([label, value]) => (
              <li key={label} className={own.count} data-testid="support-count">
                <span className={styles.line}>{label}</span>
                <span className={`${own.figure} num`}>{value}</span>
              </li>
            ))}
          </ul>
          <h3 className={styles.label}>{t.signUpsCaption}</h3>
          <ul className={styles.list} data-testid="support-sign-ups">
            {usage.signUps.map((week) => (
              <li key={week.week} className={own.count} data-testid="support-week">
                <span className={styles.line}>{t.weekOf(dayWords(week.week))}</span>
                <span className={`${own.figure} num`}>{week.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
