'use client';

// "Share with my partner", under More (brief 4.14, step 3f): who's in the
// plan, which accounts are shared, anyone asking to join with Allow and
// Don't allow, and the invite: "Can edit" or "Can view only", by a link the
// owner sends themselves or by an email from PrePenny. It lasts 7 days and
// works once, and nobody joins until the owner allows it.
//
// Only a plan kept in an account can be shared, so this needs signing in.
// The database decides everything (supabase/migrations, step 3f): only the
// plan's owner can invite, and only their own private accounts are theirs
// to share. Since step 3g the owner can change what their partner can do,
// and everyone sees what they can do themselves (D461).

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { useJoinRequests } from '../data/join-requests.ts';
import { useSharedPlan } from '../data/shared-plan.ts';
import { syncNow, useSync } from '../data/sync.ts';
import { useAccount } from '../lib/account.ts';
import { momentWords } from '../lib/device-words.ts';
import {
  cancelInvite,
  changeRole,
  inviteLink,
  type MadeInvite,
  makeInvite,
  type Role,
  type Sharing,
  sharingOf,
} from '../lib/sharing.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { describedBy, Field, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { type Answered, JoinRequestChoice } from './JoinRequest.tsx';
import { usePlanActions } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { Sheet } from './Sheet.tsx';

const t = strings.share;
const g = strings.together;

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly sharing: Sharing };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Names joined as in a sentence: "Joint", "Joint and Savings", "Joint, Savings and ISA". */
export function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The name a person gave, or "Your partner". */
const called = (nickname: string) => (nickname === '' ? t.someone : nickname);

export function ShareScreen() {
  const account = useAccount();
  const sync = useSync();
  const { loaded } = usePlanActions();
  const planId = loaded !== null && !loaded.plan.isExample ? loaded.plan.id : null;
  const shared = useSharedPlan(planId, loaded?.version ?? 0);
  const live = useJoinRequests();
  const [info, setInfo] = useState<Loaded>({ kind: 'loading' });
  const [answers, setAnswers] = useState<Readonly<Record<string, Answered>>>({});
  const [roleFor, setRoleFor] = useState<string | null>(null);
  // The role chosen in "Change what Tom can do": set from their role when it's
  // tapped, and kept here, so the sheet being drawn again never changes it.
  const [roleChoice, setRoleChoice] = useState<Role>('editor');
  const [roleSaid, setRoleSaid] = useState('');

  const load = useCallback(async () => {
    if (planId === null) return;
    const answer = await sharingOf(planId);
    setInfo(answer.ok ? { kind: 'ready', sharing: answer.value } : { kind: 'failed' });
  }, [planId]);

  const kept = account.status === 'signed-in' && sync.kept && planId !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: looks again when someone asks, or is let in
  useEffect(() => {
    if (kept) void load();
  }, [kept, load, live.length]);

  const header = (
    <ScreenHeader
      heading={t.heading}
      purpose={t.purpose}
      back={{ label: t.backToMore, href: '/app/more/' }}
    />
  );

  if (loaded?.plan.isExample === true) {
    return (
      <>
        {header}
        <section className={styles.card}>
          <p className={styles.line}>{t.onExample}</p>
        </section>
      </>
    );
  }
  if (!kept) {
    return (
      <>
        {header}
        <section className={styles.card} data-testid="share-sign-in">
          <p className={styles.line}>{t.signInFirst}</p>
          {account.status === 'signed-out' ? (
            <div className={styles.actions}>
              <Link className={formStyles.main} href="/sign-in/?from=more">
                {t.signIn}
              </Link>
            </div>
          ) : null}
        </section>
      </>
    );
  }
  if (info.kind !== 'ready') {
    return (
      <>
        {header}
        <section className={styles.card}>
          <p className={styles.line}>{info.kind === 'loading' ? t.loading : t.couldNotLoad}</p>
          {info.kind === 'failed' ? (
            <div className={styles.actions}>
              <button type="button" className={formStyles.outlined} onClick={() => void load()}>
                {t.tryAgain}
              </button>
            </div>
          ) : null}
        </section>
      </>
    );
  }

  const sharing = info.sharing;
  const me = shared?.personId ?? (account.status === 'signed-in' ? account.id : '');
  const owner = sharing.members.find((one) => one.role === 'owner');
  const iOwn = owner?.person === me;
  const full = sharing.members.length >= sharing.maxMembers;
  const requests = [
    ...live.filter((one) => one.plan === planId),
    ...sharing.requests.filter((one) => !live.some((other) => other.invite === one.invite)),
  ];
  const accounts = (loaded?.records.accounts ?? []).filter((one) => one.closed !== true);
  const sharedNames = accounts
    .filter((one) => shared?.sharedAccounts.has(one.id) === true)
    .map((one) => one.name ?? '');
  const privateNames = accounts
    .filter((one) => shared?.sharedAccounts.has(one.id) !== true)
    .map((one) => one.name ?? '');

  return (
    <>
      {header}
      {Object.entries(answers).map(([invite, answered]) => (
        <section key={invite} className={styles.card}>
          <p className={styles.line} role="status" data-testid="join-answered">
            {answered.words}
          </p>
        </section>
      ))}
      {requests
        .filter((request) => answers[request.invite] === undefined)
        .map((request) => (
          <section
            key={request.invite}
            className={styles.card}
            aria-labelledby={`request-${request.invite}`}
          >
            <h2 id={`request-${request.invite}`} className={styles.cardTitle}>
              {t.requestTitle(called(request.nickname))}
            </h2>
            <p className={styles.second}>{t.requestIntro}</p>
            <JoinRequestChoice
              request={request}
              onAnswered={(said) => {
                setAnswers((now) => ({ ...now, [request.invite]: said }));
                void load();
              }}
            />
          </section>
        ))}

      <section className={styles.card} aria-labelledby="who-heading" data-testid="who">
        <h2 id="who-heading" className={styles.cardTitle}>
          {t.whoHeading}
        </h2>
        <ul className={styles.list}>
          {sharing.members.map((one) => (
            <li key={one.person} className={styles.stackRow} data-testid="member">
              <span className={styles.rowName}>
                {one.person === me ? t.you(one.nickname) : called(one.nickname)}
              </span>
              <span className={styles.second}>{t.roles[one.role]}</span>
              {iOwn && one.person !== me ? (
                <button
                  type="button"
                  className={formStyles.outlined}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setRoleSaid('');
                    setRoleChoice(one.role === 'viewer' ? 'viewer' : 'editor');
                    setRoleFor(one.person);
                  }}
                >
                  {g.changeRole(called(one.nickname))}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {iOwn ? null : (
          <p className={styles.second} data-testid="my-role">
            {sharing.members.find((one) => one.person === me)?.role === 'viewer'
              ? g.youCanView(called(owner?.nickname ?? ''))
              : g.youCanEdit}
          </p>
        )}
        <p className={styles.line} role="status" data-testid="role-said">
          {roleSaid}
        </p>
        <div className={styles.actions}>
          <Link className={formStyles.outlined} href="/app/activity/">
            {g.activityLink}
          </Link>
        </div>
      </section>

      <section
        className={styles.card}
        aria-labelledby="accounts-heading"
        data-testid="shared-accounts"
      >
        <h2 id="accounts-heading" className={styles.cardTitle}>
          {t.accountsHeading}
        </h2>
        {sharedNames.length === 0 ? (
          <p className={styles.line}>{t.accountsNone}</p>
        ) : (
          <p className={styles.line}>{t.accountsShared(namesList(sharedNames))}</p>
        )}
        {privateNames.length === 0 ? null : (
          <p className={styles.second}>{t.accountsPrivate(namesList(privateNames))}</p>
        )}
        <div className={styles.actions}>
          <Link className={formStyles.outlined} href="/app/share/accounts/">
            {t.chooseAccounts}
          </Link>
        </div>
      </section>

      <RoleSheet
        planId={planId}
        member={sharing.members.find((one) => one.person === roleFor) ?? null}
        role={roleChoice}
        onRole={setRoleChoice}
        onClose={(said, role) => {
          const person = roleFor;
          setRoleFor(null);
          if (said !== null) {
            setRoleSaid(said);
            // Shown at once, before the server's own answer comes back.
            if (role !== undefined && info.kind === 'ready') {
              setInfo({
                kind: 'ready',
                sharing: {
                  ...info.sharing,
                  members: info.sharing.members.map((one) =>
                    one.person === person ? { ...one, role } : one,
                  ),
                },
              });
            }
            void load();
          }
        }}
      />

      <section className={styles.card} aria-labelledby="invite-heading" data-testid="invite">
        <h2 id="invite-heading" className={styles.cardTitle}>
          {t.inviteHeading}
        </h2>
        {!iOwn ? (
          <p className={styles.line}>{t.notOwner(called(owner?.nickname ?? ''))}</p>
        ) : full ? (
          <p className={styles.line}>{t.full}</p>
        ) : (
          <Invite planId={planId} sharing={sharing} onChanged={() => void load()} />
        )}
      </section>

      {sharing.members.some((one) => one.person !== me) ? (
        <section className={styles.card} aria-labelledby="leave-heading" data-testid="leave">
          <h2 id="leave-heading" className={styles.cardTitle}>
            {g.leave.link}
          </h2>
          <p className={styles.line}>
            {g.leave.linkLine(
              sharing.members.find((one) => one.person !== me)?.nickname || g.yourPartner,
            )}
          </p>
          <div className={styles.actions}>
            <Link className={formStyles.outlined} href="/app/share/leave/">
              {g.leave.link}
            </Link>
          </div>
        </section>
      ) : null}
    </>
  );
}

/** The owner's invite: the one open now, or the form to make one. */
function Invite({
  planId,
  sharing,
  onChanged,
}: {
  readonly planId: string;
  readonly sharing: Sharing;
  readonly onChanged: () => void;
}) {
  const id = useId();
  const [made, setMade] = useState<MadeInvite | null>(null);
  const [name, setName] = useState(sharing.myName);
  const [role, setRole] = useState<Role>('editor');
  const [how, setHow] = useState<'link' | 'email'>('link');
  const [email, setEmail] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const open =
    sharing.invite !== null &&
    (sharing.invite.state === 'open' ||
      sharing.invite.state === 'waiting' ||
      sharing.invite.state === 'allowed')
      ? sharing.invite
      : null;

  async function make(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const typed = name.trim();
    const nameWrong = typed === '' ? t.nameError : typed.length > 30 ? t.nameTooLong : undefined;
    const emailWrong = how === 'email' && !EMAIL.test(email.trim()) ? t.emailError : undefined;
    setNameError(nameWrong);
    setEmailError(emailWrong);
    setProblem(null);
    if (nameWrong !== undefined) {
      document.getElementById(`${id}-name`)?.focus();
      return;
    }
    if (emailWrong !== undefined) {
      document.getElementById(`${id}-email`)?.focus();
      return;
    }
    setBusy(true);
    const done = await makeInvite(planId, role, typed, how === 'email' ? email.trim() : null);
    setBusy(false);
    if (!done.ok) {
      const kind = done.problem.kind;
      if (kind === 'needs-name') setNameError(t.nameError);
      else if (kind === 'bad-email') setEmailError(t.emailError);
      else
        setProblem(
          kind === 'too-many-emails'
            ? t.tooManyEmails
            : kind === 'full'
              ? t.full
              : kind === 'offline'
                ? t.offline
                : t.problem,
        );
      return;
    }
    setMade(done.value);
    setSaid(done.value.token === null ? t.emailSent(email.trim()) : '');
    onChanged();
  }

  async function cancel(invite: string) {
    if (busy) return;
    setBusy(true);
    const done = await cancelInvite(invite);
    setBusy(false);
    if (!done.ok) {
      setProblem(done.problem.kind === 'offline' ? t.offline : t.problem);
      return;
    }
    setMade(null);
    // Joined or answered meanwhile, it isn't cancelled: the screen shows what it is now.
    const state = (done.value as { state?: unknown } | null)?.state;
    setSaid(state === undefined || state === 'cancelled' ? t.cancelled : t.answerGone);
    onChanged();
  }

  const link = made?.token === null || made === null ? null : inviteLink(made.token);

  return (
    <>
      <p className={styles.line} role="status" data-testid="invite-said">
        {said}
      </p>
      {link !== null ? (
        <div className={formStyles.actions} data-testid="invite-link">
          <p className={styles.cardTitle}>{t.linkHeading}</p>
          <p className={styles.second}>{t.linkLine}</p>
          <Field id={`${id}-link`} label={t.linkLabel}>
            <input
              id={`${id}-link`}
              className={formStyles.input}
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </Field>
          <button
            type="button"
            className={formStyles.main}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setSaid(t.copied);
              } catch {
                document.getElementById(`${id}-link`)?.focus();
              }
            }}
          >
            {t.copy}
          </button>
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
            <button
              type="button"
              className={formStyles.outlined}
              onClick={() =>
                void navigator.share({ title: t.shareText, url: link }).catch(() => {})
              }
            >
              {t.shareLink}
            </button>
          ) : null}
          <p className={styles.second}>{t.afterAsk}</p>
          <button
            type="button"
            className={formStyles.outlined}
            onClick={() => void cancel(made?.invite ?? '')}
          >
            {t.cancel}
          </button>
        </div>
      ) : open !== null ? (
        <div className={formStyles.actions} data-testid="invite-open">
          {open.state === 'allowed' ? (
            // Allowed, while their phone brings their plan in (D426).
            <p className={styles.line}>
              {t.allowedBringing(open.asker === null || open.asker === '' ? t.someone : open.asker)}
            </p>
          ) : (
            <>
              <p className={styles.line}>
                {open.email === null
                  ? t.openInvite(t.roles[open.role] ?? '', momentWords(open.expiresAt))
                  : t.openInviteTo(
                      open.email,
                      t.roles[open.role] ?? '',
                      momentWords(open.expiresAt),
                    )}
              </p>
              <p className={styles.second}>{t.afterAsk}</p>
            </>
          )}
          <button
            type="button"
            className={formStyles.outlined}
            onClick={() => void cancel(open.id)}
          >
            {t.cancel}
          </button>
        </div>
      ) : (
        <form className={formStyles.actions} onSubmit={make} noValidate>
          <Field id={`${id}-name`} label={t.nameLabel} hint={t.nameHint} error={nameError}>
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
          <ChoiceList
            legend={t.roleLegend}
            name={`${id}-role`}
            value={role}
            hintsUnder
            options={[
              { value: 'editor', label: t.canEdit, hint: t.canEditHint },
              { value: 'viewer', label: t.canView, hint: t.canViewHint },
            ]}
            onChange={setRole}
          />
          <ChoiceList
            legend={t.howLegend}
            name={`${id}-how`}
            value={how}
            hintsUnder
            options={[
              { value: 'link', label: t.byLink, hint: t.byLinkHint },
              { value: 'email', label: t.byEmail },
            ]}
            onChange={setHow}
          />
          {how === 'email' ? (
            <Field id={`${id}-email`} label={t.emailLabel} error={emailError}>
              <input
                id={`${id}-email`}
                className={formStyles.input}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                aria-invalid={emailError !== undefined}
                aria-describedby={describedBy(`${id}-email`, emailError)}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          ) : null}
          <p className={styles.second} role="status">
            {busy ? t.making : ''}
          </p>
          <Problem text={problem} />
          <button type="submit" className={formStyles.main} aria-disabled={busy}>
            {how === 'email' ? t.sendEmail : t.makeLink}
          </button>
        </form>
      )}
    </>
  );
}

/** "Change what Tom can do": the plan's owner chooses "Can edit" or "Can view only" (D461). */
function RoleSheet({
  planId,
  member,
  role,
  onRole,
  onClose,
}: {
  readonly planId: string | null;
  readonly member: Sharing['members'][number] | null;
  /** The role chosen, kept by Share with my partner from when the sheet was opened. */
  readonly role: Role;
  readonly onRole: (role: Role) => void;
  /** Closed: what was saved, in words, and the role now, or null when nothing was. */
  readonly onClose: (said: string | null, role?: Role) => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = called(member?.nickname ?? '');
  const person = member?.person ?? null;
  // Nothing from an earlier time it was open.
  useEffect(() => {
    if (person !== null) {
      setProblem(null);
      setBusy(false);
    }
  }, [person]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || member === null || planId === null) return;
    setBusy(true);
    setProblem(null);
    const done = await changeRole(planId, member.person, role);
    setBusy(false);
    if (!done.ok) {
      setProblem(done.problem.kind === 'offline' ? g.roleOffline : g.roleProblem);
      return;
    }
    await syncNow();
    onClose(role === 'viewer' ? g.roleSavedView(name) : g.roleSavedEdit(name), role);
  }

  return (
    <Sheet
      open={member !== null}
      title={g.roleTitle(name)}
      intro={g.roleIntro(name)}
      closeLabel={g.close}
      onClose={() => onClose(null)}
    >
      <form className={formStyles.actions} onSubmit={save} noValidate>
        <ChoiceList
          legend={g.roleLegend(name)}
          name={`${id}-role`}
          value={role}
          hintsUnder
          options={[
            { value: 'editor', label: t.canEdit, hint: t.canEditHint },
            { value: 'viewer', label: t.canView, hint: t.canViewHint },
          ]}
          onChange={onRole}
        />
        <p className={formStyles.lede} role="status">
          {busy ? g.savingRole : ''}
        </p>
        <Problem text={problem} />
        <button type="submit" className={formStyles.main} aria-disabled={busy}>
          {g.saveRole}
        </button>
      </form>
    </Sheet>
  );
}
