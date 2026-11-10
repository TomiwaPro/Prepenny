'use client';

// The page an invite link opens, /join/#… (brief 4.14, step 3f), outside
// the app's own frame. The link's secret is after a "#", so it never reaches
// PrePenny's site or its logs, and it leaves the address as soon as the page
// has read it. While the person signs in or signs up, it waits on this phone
// only, and goes once used or at signing out.
//
// Opening the link lets nobody in. Signed in, the person sees who invited
// them and what they could do, gives the name the inviter will see, and
// asks to join. The inviter then sees "Jess wants to join your plan" with
// the email address Jess signed in with, and chooses. Meanwhile this page
// looks every few seconds, and the moment it's allowed the shared plan comes
// down to this phone (PLAN.md item 33).
//
// Someone who already has a plan of their own can't join yet: what to do
// then is the owner's question (D416), so this page says so plainly.

import Link from 'next/link';
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { connectPlan, phoneHasOwnPlan } from '../data/sync.ts';
import { checkSignIn, useAccount } from '../lib/account.ts';
import {
  askToJoin,
  forgetToken,
  type InviteLook,
  keepToken,
  keptToken,
  lookAtInvite,
  tokenFrom,
} from '../lib/sharing.ts';
import { signInConfig } from '../lib/sign-in-config.ts';
import { strings } from '../strings/en-GB.ts';
import { describedBy, Field, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import screenStyles from './Screens.module.css';
import styles from './SignInScreen.module.css';

const t = strings.join;

/** How often a waiting phone looks whether it has been let in. */
const LOOK_EVERY_MS = 3000;

/** States after which the invite is no use on this phone any more. */
const FINISHED: readonly InviteLook['state'][] = [
  'joined',
  'not-allowed',
  'used',
  'ran-out',
  'cancelled',
  'not-found',
  'yours',
  'member',
];

type Seen =
  | { readonly kind: 'reading' }
  | { readonly kind: 'no-link' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'looked'; readonly look: InviteLook };

export function JoinScreen() {
  const account = useAccount();
  const id = useId();
  const off = signInConfig() === null;
  const [token, setToken] = useState<string | null>(null);
  const [seen, setSeen] = useState<Seen>({ kind: 'reading' });
  const [ownPlan, setOwnPlan] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bringing = useRef(false);

  useEffect(() => {
    void checkSignIn();
  }, []);

  // The link's secret: from the address, kept while signing in, then taken
  // out of the address so it isn't left in the browser's history.
  useEffect(() => {
    const fromLink = tokenFrom(window.location.hash);
    if (fromLink !== null) {
      keepToken(fromLink);
      window.history.replaceState(null, '', '/join/');
    }
    const found = fromLink ?? keptToken();
    setToken(found);
    if (found === null) setSeen({ kind: 'no-link' });
  }, []);

  const look = useCallback(async () => {
    if (token === null) return;
    const [answer, hasOwn] = await Promise.all([lookAtInvite(token), phoneHasOwnPlan()]);
    setOwnPlan(hasOwn);
    if (!answer.ok) {
      setSeen((now) => (now.kind === 'looked' ? now : { kind: 'failed' }));
      return;
    }
    setSeen({ kind: 'looked', look: answer.value });
    if (FINISHED.includes(answer.value.state)) forgetToken();
  }, [token]);

  useEffect(() => {
    if (account.status === 'signed-in' && token !== null) void look();
  }, [account.status, token, look]);

  const state = seen.kind === 'looked' ? seen.look.state : null;

  // Waiting: looks every few seconds while on screen, and at once on coming back.
  useEffect(() => {
    if (state !== 'waiting') return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void look();
    }, LOOK_EVERY_MS);
    const again = () => {
      if (document.visibilityState === 'visible') void look();
    };
    document.addEventListener('visibilitychange', again);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', again);
    };
  }, [state, look]);

  // Let in: the shared plan comes down to this phone straight away (item 33).
  useEffect(() => {
    if (state !== 'joined' || bringing.current) return;
    bringing.current = true;
    void (async () => {
      const connection = await connectPlan();
      if (connection.kind === 'brought-down' || connection.kind === 'kept') {
        window.location.replace('/app/');
      } else {
        bringing.current = false;
      }
    })();
  }, [state]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (busy || token === null) return;
    const typed = name.trim();
    const wrong =
      typed === ''
        ? strings.share.nameError
        : typed.length > 30
          ? strings.share.nameTooLong
          : undefined;
    setNameError(wrong);
    setProblem(null);
    if (wrong !== undefined) {
      document.getElementById(`${id}-name`)?.focus();
      return;
    }
    setBusy(true);
    const answer = await askToJoin(token, typed);
    setBusy(false);
    if (answer.ok) {
      setSeen({ kind: 'looked', look: answer.value });
      return;
    }
    const found = answer.problem;
    if (found.kind === 'invite') {
      setSeen((now) =>
        now.kind === 'looked' ? { kind: 'looked', look: { ...now.look, state: found.state } } : now,
      );
      return;
    }
    if (found.kind === 'has-a-plan') {
      setOwnPlan(true);
      return;
    }
    if (found.kind === 'needs-name') {
      setNameError(strings.share.nameError);
      return;
    }
    setProblem(found.kind === 'offline' ? strings.share.offline : t.couldNotLoad);
  }

  const inviter =
    seen.kind === 'looked' && seen.look.inviter !== null && seen.look.inviter !== ''
      ? seen.look.inviter
      : t.someone;

  function body() {
    if (off) return <p className={styles.line}>{t.off}</p>;
    if (seen.kind === 'no-link') {
      return (
        <>
          <p className={styles.line}>{t.noLink}</p>
          <Link className={formStyles.outlined} href="/">
            {t.goHome}
          </Link>
        </>
      );
    }
    if (account.status === 'signed-out') {
      return (
        <>
          <p className={styles.line}>{t.signInFirst}</p>
          <Link className={formStyles.main} href="/sign-in/?to=sign-up&from=join">
            {t.signIn}
          </Link>
        </>
      );
    }
    if (account.status === 'checking' || seen.kind === 'reading') {
      return <p className={styles.line}>{t.loading}</p>;
    }
    if (seen.kind === 'failed') {
      return (
        <>
          <p className={styles.line}>{t.couldNotLoad}</p>
          <button type="button" className={formStyles.outlined} onClick={() => void look()}>
            {t.tryAgain}
          </button>
        </>
      );
    }
    if (seen.kind !== 'looked') return <p className={styles.line}>{t.loading}</p>;
    const found = seen.look;
    const toPlan = (
      <Link className={formStyles.outlined} href="/app/">
        {t.goHome}
      </Link>
    );
    switch (found.state) {
      case 'open':
        if (ownPlan) {
          return (
            <>
              <p className={styles.line} data-testid="join-message">
                {t.hasAPlan(inviter)}
              </p>
              {toPlan}
            </>
          );
        }
        return (
          <form className={formStyles.actions} onSubmit={ask} noValidate>
            <p className={styles.line} data-testid="join-message">
              {t.invitedBy(inviter)}
            </p>
            <p className={styles.line}>{found.role === 'viewer' ? t.canView : t.canEdit}</p>
            <p className={styles.line}>{t.privateLine}</p>
            <Field
              id={`${id}-name`}
              label={t.nameLabel(inviter)}
              hint={t.seesEmail(inviter)}
              error={nameError}
            >
              <input
                id={`${id}-name`}
                className={formStyles.input}
                value={name}
                maxLength={60}
                autoComplete="nickname"
                aria-invalid={nameError !== undefined}
                aria-describedby={describedBy(`${id}-name`, nameError, [`${id}-name-hint`])}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <p className={styles.busy} role="status">
              {busy ? t.asking : ''}
            </p>
            <Problem text={problem} />
            <button type="submit" className={formStyles.main} aria-disabled={busy}>
              {t.ask}
            </button>
          </form>
        );
      case 'waiting':
        return (
          <p className={styles.line} role="status" data-testid="join-message">
            {t.waiting(inviter)}
          </p>
        );
      case 'joined':
        return (
          <>
            <p className={styles.line} role="status" data-testid="join-message">
              {t.joined(inviter)}
            </p>
            <Link className={formStyles.outlined} href="/app/">
              {t.goToPlan}
            </Link>
          </>
        );
      case 'not-allowed':
        return <Message words={t.notAllowed(inviter)} />;
      case 'used':
        return <Message words={t.used} />;
      case 'ran-out':
        return <Message words={t.ranOut} />;
      case 'cancelled':
        return <Message words={t.cancelled} />;
      case 'not-found':
        return <Message words={t.notFound} />;
      case 'yours':
        return <Message words={t.yours} link={toPlan} />;
      case 'member':
        return <Message words={t.member} link={toPlan} />;
      case 'has-a-plan':
        return <Message words={t.hasAPlan(inviter)} link={toPlan} />;
      case 'full':
        return <Message words={t.full(inviter)} />;
    }
  }

  return (
    <div className={styles.page}>
      <a className={styles.wordmark} href="/">
        {strings.app.name}
      </a>
      <main className={styles.main}>
        <header className={screenStyles.header}>
          <h1 className={screenStyles.heading}>{t.heading}</h1>
          <p className={screenStyles.purpose}>{t.purpose}</p>
        </header>
        <section className={styles.card} data-testid="join">
          {body()}
        </section>
      </main>
    </div>
  );
}

function Message({ words, link }: { readonly words: string; readonly link?: ReactNode }) {
  return (
    <>
      <p className={styles.line} role="status" data-testid="join-message">
        {words}
      </p>
      {link ?? (
        <Link className={formStyles.outlined} href="/">
          {t.goHome}
        </Link>
      )}
    </>
  );
}
