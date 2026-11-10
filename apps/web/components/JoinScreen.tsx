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
// Someone with a plan of their own brings it with them (step 3f-2, D426):
// before asking they're told it comes, private to them, and what the other
// plan's bank holidays change. Once allowed, this phone sends everything it
// has to the account, then asks the server to move the plan in one step,
// and the shared plan, with theirs in it, comes down. Opened as
// "/join/#invite=…" from "Finish joining", it finishes an invite already
// allowed, with no link to hand.

import type { Nation } from '@prepenny/engine';
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
import { connectPlan, phoneHasOwnPlan, sendEverythingThen } from '../data/sync.ts';
import { checkSignIn, useAccount } from '../lib/account.ts';
import {
  askToJoin,
  type Done,
  forgetToken,
  type InviteLook,
  inviteIdFrom,
  joinWithMyPlan,
  keepToken,
  keptToken,
  lookAtInvite,
  lookAtMyInvite,
  tokenFrom,
} from '../lib/sharing.ts';
import { signInConfig } from '../lib/sign-in-config.ts';
import { liveAddressFor } from '../lib/site.ts';
import { strings } from '../strings/en-GB.ts';
import { describedBy, Field, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import screenStyles from './Screens.module.css';
import styles from './SignInScreen.module.css';

const t = strings.join;
const nations = strings.setup.account.nations;

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

/** Which invite this page is for: a link's secret, or the id of one this person asked with. */
type Which = { readonly token: string } | { readonly invite: string };

/** Bringing the plan in, once allowed (D426). */
type Bringing =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'not-sent' }
  | { readonly kind: 'failed'; readonly words: string };

export function JoinScreen() {
  const account = useAccount();
  const id = useId();
  const off = signInConfig() === null;
  const [which, setWhich] = useState<Which | null>(null);
  const [seen, setSeen] = useState<Seen>({ kind: 'reading' });
  const [ownPlan, setOwnPlan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bringing, setBringing] = useState<Bringing>({ kind: 'idle' });
  const comingDown = useRef(false);
  const savedOnce = useRef(false);

  useEffect(() => {
    void checkSignIn();
  }, []);

  // The link's secret: from the address, kept while signing in, then taken
  // out of the address so it isn't left in the browser's history. At the old
  // address it's left where it is: the page moves to prepenny.co.uk with it (D428).
  useEffect(() => {
    if (liveAddressFor(window.location) !== null) return;
    const invite = inviteIdFrom(window.location.hash);
    if (invite !== null) {
      window.history.replaceState(null, '', '/join/');
      setWhich({ invite });
      return;
    }
    const fromLink = tokenFrom(window.location.hash);
    if (fromLink !== null) {
      keepToken(fromLink);
      window.history.replaceState(null, '', '/join/');
    }
    const found = fromLink ?? keptToken();
    if (found === null) setSeen({ kind: 'no-link' });
    else setWhich({ token: found });
  }, []);

  const look = useCallback(async () => {
    if (which === null) return;
    const [answer, hasOwn] = await Promise.all([
      'token' in which ? lookAtInvite(which.token) : lookAtMyInvite(which.invite),
      phoneHasOwnPlan(),
    ]);
    setOwnPlan(hasOwn);
    if (!answer.ok) {
      setSeen((now) => (now.kind === 'looked' ? now : { kind: 'failed' }));
      return;
    }
    setSeen({ kind: 'looked', look: answer.value });
    if (FINISHED.includes(answer.value.state)) forgetToken();
  }, [which]);

  useEffect(() => {
    if (account.status === 'signed-in' && which !== null) void look();
  }, [account.status, which, look]);

  const found = seen.kind === 'looked' ? seen.look : null;
  const state = found?.state ?? null;

  // A plan on this phone the account hasn't been given yet: it's saved there
  // first, once, so the server knows it comes with them (D426).
  const needsSaving = state === 'open' && found?.brings === null && ownPlan;
  useEffect(() => {
    if (!needsSaving || savedOnce.current) return;
    savedOnce.current = true;
    setSaving(true);
    void (async () => {
      await connectPlan();
      await look();
      setSaving(false);
    })();
  }, [needsSaving, look]);

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

  /** The shared plan comes down to this phone, and Home opens (item 33). */
  const comeDown = useCallback(async () => {
    if (comingDown.current) return;
    comingDown.current = true;
    const connection = await connectPlan();
    if (connection.kind === 'brought-down' || connection.kind === 'kept') {
      window.location.replace('/app/');
    } else {
      comingDown.current = false;
    }
  }, []);

  // Let in: the shared plan comes down to this phone straight away.
  useEffect(() => {
    if (state === 'joined') void comeDown();
  }, [state, comeDown]);

  /** Sends everything on this phone, then asks the server to bring the plan in (D426). */
  const bring = useCallback(
    async (invite: string, nation: Nation) => {
      setBringing({ kind: 'busy' });
      const result = await sendEverythingThen(() => joinWithMyPlan(invite, nation));
      if (!result.sent) {
        setBringing({ kind: 'not-sent' });
        return;
      }
      const answer: Done<unknown> = result.value;
      if (answer.ok) {
        forgetToken();
        await comeDown();
        return;
      }
      const kind = answer.problem.kind;
      if (kind === 'nation-changed') {
        // Told again, with the bank holidays as they are now.
        setBringing({ kind: 'idle' });
        await look();
        return;
      }
      if (kind === 'invite' || kind === 'has-a-plan' || kind === 'full') {
        const next: InviteLook['state'] =
          kind === 'invite' ? answer.problem.state : kind === 'full' ? 'full' : 'has-a-plan';
        setBringing({ kind: 'idle' });
        setSeen((now) =>
          now.kind === 'looked' ? { kind: 'looked', look: { ...now.look, state: next } } : now,
        );
        return;
      }
      setBringing({
        kind: 'failed',
        words:
          kind === 'offline'
            ? strings.share.offline
            : kind === 'could-not-move'
              ? t.couldNotMove
              : t.couldNotLoad,
      });
    },
    [comeDown, look],
  );

  // Allowed, with a plan whose bank holidays don't change: it comes straight
  // away, as they agreed when they asked. With different ones, they're told
  // again and choose "Bring my plan and join" (D426).
  const invite = found?.invite ?? null;
  const brings = found?.brings ?? null;
  const sameHolidays = brings === null || brings.nation === brings.ownNation;
  useEffect(() => {
    if (state !== 'allowed' || invite === null || !sameHolidays || bringing.kind !== 'idle') return;
    void bring(invite, brings?.nation ?? 'england-and-wales');
  }, [state, invite, sameHolidays, brings, bringing.kind, bring]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (busy || which === null || !('token' in which)) return;
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
    const answer = await askToJoin(which.token, typed);
    setBusy(false);
    if (answer.ok) {
      setSeen({ kind: 'looked', look: answer.value });
      return;
    }
    const refused = answer.problem;
    if (refused.kind === 'invite') {
      setSeen((now) =>
        now.kind === 'looked'
          ? { kind: 'looked', look: { ...now.look, state: refused.state } }
          : now,
      );
      return;
    }
    if (refused.kind === 'has-a-plan') {
      setSeen((now) =>
        now.kind === 'looked'
          ? { kind: 'looked', look: { ...now.look, state: 'has-a-plan' } }
          : now,
      );
      return;
    }
    if (refused.kind === 'needs-name') {
      setNameError(strings.share.nameError);
      return;
    }
    setProblem(refused.kind === 'offline' ? strings.share.offline : t.couldNotLoad);
  }

  const inviter =
    found !== null && found.inviter !== null && found.inviter !== '' ? found.inviter : t.someone;

  /** "Bank holidays: Tom's plan uses Scotland, and yours uses England and Wales…", when they differ. */
  const holidaysLine =
    brings === null || sameHolidays ? null : (
      <p className={styles.line} data-testid="join-holidays">
        {t.nationDiffers(inviter, nations[brings.nation], nations[brings.ownNation])}
      </p>
    );

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
    if (found === null) return <p className={styles.line}>{t.loading}</p>;
    const toPlan = (
      <Link className={formStyles.outlined} href="/app/">
        {t.goHome}
      </Link>
    );
    switch (found.state) {
      case 'open':
        if (needsSaving) {
          return saving ? (
            <p className={styles.line} role="status" data-testid="join-message">
              {t.saving}
            </p>
          ) : (
            <>
              <p className={styles.line} role="status" data-testid="join-message">
                {t.notSavedYet}
              </p>
              <button
                type="button"
                className={formStyles.outlined}
                onClick={() => {
                  savedOnce.current = false;
                  void look();
                }}
              >
                {t.tryAgain}
              </button>
            </>
          );
        }
        return (
          <form className={formStyles.actions} onSubmit={ask} noValidate>
            <p className={styles.line} data-testid="join-message">
              {t.invitedBy(inviter)}
            </p>
            <p className={styles.line}>{found.role === 'viewer' ? t.canView : t.canEdit}</p>
            {brings === null ? (
              <p className={styles.line}>{t.privateLine}</p>
            ) : (
              <>
                <p className={styles.line} data-testid="join-brings">
                  {t.bringsLine(inviter)}
                </p>
                <p className={styles.line}>{t.bringsPrivate(inviter)}</p>
                {holidaysLine}
              </>
            )}
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
      case 'allowed':
        return (
          <div className={formStyles.actions}>
            {bringing.kind === 'busy' || (sameHolidays && bringing.kind === 'idle') ? (
              <p className={styles.line} role="status" data-testid="join-message">
                {t.bringing(inviter)}
              </p>
            ) : (
              <>
                <p className={styles.line}>{t.letYouIn(inviter)}</p>
                {holidaysLine}
                <p className={styles.line} role="status" data-testid="join-message">
                  {bringing.kind === 'not-sent'
                    ? t.notSentYet
                    : bringing.kind === 'failed'
                      ? bringing.words
                      : t.bringsLine(inviter)}
                </p>
                <button
                  type="button"
                  className={formStyles.main}
                  onClick={() => {
                    if (invite !== null) void bring(invite, brings?.nation ?? 'england-and-wales');
                  }}
                >
                  {bringing.kind === 'idle' ? t.bringAndJoin : t.tryAgain}
                </button>
              </>
            )}
          </div>
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
