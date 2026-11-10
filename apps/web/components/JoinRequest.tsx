'use client';

// "Jess wants to join your plan" (brief 4.14, step 3f): someone opened the
// owner's invite and asked to join. A forwarded link can reach anyone, so
// nobody joins until the owner says "Allow"; they see the name given and the
// email address it was signed in with. "Don't allow" uses the invite up for
// good. The same words on the Share screen, and in a sheet that opens by
// itself on any screen of the app, once no other sheet is open.

import { useEffect, useState } from 'react';
import { answeredHere, useJoinRequests } from '../data/join-requests.ts';
import { syncNow } from '../data/sync.ts';
import { momentWords } from '../lib/device-words.ts';
import { answerJoin, type JoinRequest } from '../lib/sharing.ts';
import { strings } from '../strings/en-GB.ts';
import { Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';

const t = strings.share;

/** What was said once the owner answered, for the line that replaces the buttons. */
export type Answered = { readonly allowed: boolean; readonly words: string };

/** Who asked, and Allow and Don't allow. */
export function JoinRequestChoice({
  request,
  onAnswered,
}: {
  readonly request: JoinRequest;
  readonly onAnswered: (answered: Answered) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = request.nickname === '' ? t.someone : request.nickname;

  async function answer(allow: boolean) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const done = await answerJoin(request.invite, allow);
    setBusy(false);
    if (!done.ok) {
      const kind = done.problem.kind;
      if (kind === 'ran-out' || kind === 'has-a-plan' || kind === 'not-waiting') {
        answeredHere(request.invite);
        onAnswered({
          allowed: false,
          words:
            kind === 'ran-out'
              ? t.answerRanOut
              : kind === 'has-a-plan'
                ? t.answerHasAPlan(name)
                : t.answerGone,
        });
        return;
      }
      setProblem(kind === 'offline' ? t.offline : t.problem);
      return;
    }
    answeredHere(request.invite);
    // The plan's members have changed: bring down the new list now.
    void syncNow();
    // Someone with a plan of their own joins once their phone brings it (D426).
    const bringing = (done.value as { state?: unknown } | null)?.state === 'allowed';
    onAnswered({
      allowed: allow,
      words: !allow ? t.notAllowed(name) : bringing ? t.allowedBringing(name) : t.allowed(name),
    });
  }

  return (
    <div className={formStyles.actions} data-testid="join-request">
      <p className={formStyles.lede} data-testid="join-request-email">
        {t.requestEmail(request.email)}
      </p>
      <p className={formStyles.lede}>{t.requestAsked(momentWords(request.askedAt))}</p>
      <p className={formStyles.lede}>
        {request.role === 'viewer' ? t.requestCanView : t.requestCanEdit}
      </p>
      <p className={formStyles.lede} role="status">
        {busy ? t.answering : ''}
      </p>
      <Problem text={problem} />
      <button
        type="button"
        className={formStyles.main}
        aria-disabled={busy}
        onClick={() => void answer(true)}
      >
        {t.allow}
      </button>
      <button
        type="button"
        className={formStyles.outlined}
        aria-disabled={busy}
        onClick={() => void answer(false)}
      >
        {t.dontAllow}
      </button>
    </div>
  );
}

/** Requests whose sheet was closed without an answer: they wait on Share with my partner instead. */
const closedUnanswered = new Set<string>();

/** The sheet on every screen of the app: it opens by itself for the first request, once no other sheet is open. */
export function JoinRequestSheet() {
  const requests = useJoinRequests();
  const { loaded } = usePlanActions();
  const request = requests.find((one) => !closedUnanswered.has(one.invite));
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<JoinRequest | null>(null);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const onExample = loaded?.plan.isExample === true;

  useEffect(() => {
    if (request === undefined || open || onExample) return;
    const tryToOpen = () => {
      if (document.querySelector('dialog[open]') === null) {
        setShown(request);
        setAnswered(null);
        setOpen(true);
      }
    };
    tryToOpen();
    const onSheetClosed = () => setTimeout(tryToOpen, 0);
    document.addEventListener('close', onSheetClosed, true);
    return () => document.removeEventListener('close', onSheetClosed, true);
  }, [request, open, onExample]);

  if (shown === null) return null;
  const name = shown.nickname === '' ? t.someone : shown.nickname;
  return (
    <Sheet
      open={open}
      title={t.requestTitle(name)}
      intro={t.requestIntro}
      onClose={() => {
        setOpen(false);
        // Closed without answering: it waits on Share with my partner, rather than opening again.
        if (answered === null) closedUnanswered.add(shown.invite);
      }}
    >
      {answered === null ? (
        <JoinRequestChoice request={shown} onAnswered={setAnswered} />
      ) : (
        <div className={formStyles.actions}>
          <p className={formStyles.lede} role="status" data-testid="join-answered">
            {answered.words}
          </p>
          <button type="button" className={formStyles.main} onClick={() => setOpen(false)}>
            {t.gotIt}
          </button>
        </div>
      )}
    </Sheet>
  );
}
