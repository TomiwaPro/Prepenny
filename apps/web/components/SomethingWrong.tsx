'use client';

// "Something looks wrong" (step 4i, brief 4.16, D602, D603): at the end of
// every screen, after everything else, beside "Help", in the same place on
// every screen (WCAG 3.2.6), so it never pushes Home's lowest point down
// (D442). It opens a sheet where the person says what looks wrong and can
// add a screenshot or a copy of their plan, only after the consent message.
//
// The picture is chosen from the phone's photos (the person takes a
// screenshot with the phone's own buttons first), and its hidden details
// are taken out on the phone before it's sent (lib/picture.ts). A plan copy
// is the backup file from Download my data, chosen the same way.

import { type ChangeEvent, useId, useMemo, useRef, useState } from 'react';
import {
  type Picture,
  type PlanCopy,
  preparePicture,
  preparePlanCopy,
  sizeWords,
} from '../lib/picture.ts';
import { screenName } from '../lib/support.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import formStyles from './Form.module.css';
import { Sheet } from './Sheet.tsx';
import styles from './Support.module.css';
import { type AttachmentState, SupportForm, type SupportFormProps } from './SupportForm.tsx';

const t = strings.support.problem;

type Choice = 'none' | 'picture' | 'plan';

/** The "Add a picture or your plan?" part of Something looks wrong. */
export function useAttachment(): NonNullable<SupportFormProps['attachment']> {
  const id = useId();
  const [choice, setChoice] = useState<Choice>('none');
  const [picture, setPicture] = useState<Picture | null>(null);
  const [plan, setPlan] = useState<PlanCopy | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [reading, setReading] = useState(false);
  const pictureInput = useRef<HTMLInputElement>(null);
  const planInput = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const choiceArea = useRef<HTMLDivElement>(null);
  // Each file chosen, or reset, counts up: an answer for an earlier one is ignored.
  const latest = useRef(0);

  const missing =
    choice === 'picture' && picture === null
      ? t.pictureMissing
      : choice === 'plan' && plan === null
        ? t.planMissing
        : null;
  const state: AttachmentState = {
    file: choice === 'picture' ? picture : choice === 'plan' ? plan : null,
    missing,
  };

  async function pictureChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // So choosing the same picture again still counts as a choice.
    event.target.value = '';
    if (file === undefined) return;
    const mine = ++latest.current;
    setError(undefined);
    setReading(true);
    let ready: Awaited<ReturnType<typeof preparePicture>>;
    try {
      ready = await preparePicture(file);
    } finally {
      if (mine === latest.current) setReading(false);
    }
    if (mine !== latest.current) return;
    if (ready.ok) {
      setPicture(ready.file);
      return;
    }
    setPicture(null);
    setError(
      ready.problem === 'not-a-picture'
        ? t.notAPicture
        : ready.problem === 'too-big'
          ? t.pictureTooBig
          : t.unreadable,
    );
    chooseButton.current?.focus();
  }

  async function planChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    const mine = ++latest.current;
    setError(undefined);
    const ready = await preparePlanCopy(file);
    if (mine !== latest.current) return;
    if (ready.ok) {
      setPlan(ready.file);
      return;
    }
    setPlan(null);
    setError(ready.problem === 'too-big' ? t.planTooBig : t.notAPlan);
    chooseButton.current?.focus();
  }

  const errorId = `${id}-file-error`;
  const node = (
    <div ref={choiceArea} className={formStyles.form}>
      <ChoiceList<Choice>
        legend={t.attachLegend}
        name={`${id}-attach`}
        value={choice}
        hintsUnder
        options={[
          { value: 'none', label: t.none },
          { value: 'picture', label: t.picture, hint: t.pictureHint },
          { value: 'plan', label: t.plan, hint: t.planHint },
        ]}
        onChange={(next) => {
          setChoice(next);
          setError(undefined);
        }}
      />
      {choice === 'none' ? null : (
        // The consent message comes first: the button that chooses a file is
        // only here, under it (D602).
        <div className={styles.consent} data-testid={`${choice}-consent`}>
          <p className={styles.consentWords}>
            {choice === 'picture' ? t.pictureConsent : t.planConsent}
          </p>
          <p className={styles.consentHow}>{choice === 'picture' ? t.pictureHow : t.planHow}</p>
          {choice === 'picture' ? (
            <input
              ref={pictureInput}
              type="file"
              accept="image/png,image/jpeg"
              hidden
              data-testid="picture-input"
              onChange={(event) => void pictureChosen(event)}
            />
          ) : (
            <input
              ref={planInput}
              type="file"
              accept=".json,application/json"
              hidden
              data-testid="plan-input"
              onChange={(event) => void planChosen(event)}
            />
          )}
          <button
            ref={chooseButton}
            type="button"
            className={formStyles.outlined}
            aria-describedby={error === undefined ? undefined : errorId}
            aria-disabled={reading}
            onClick={() => {
              if (reading) return;
              (choice === 'picture' ? pictureInput : planInput).current?.click();
            }}
          >
            {choice === 'picture'
              ? picture === null
                ? t.choosePicture
                : t.chooseAnotherPicture
              : plan === null
                ? t.choosePlan
                : t.chooseAnotherPlan}
          </button>
          <p className={styles.chosen} role="status" data-testid="file-chosen">
            {reading
              ? t.reading
              : choice === 'picture' && picture !== null
                ? t.pictureChosen(picture.width, picture.height, sizeWords(picture.bytes.length))
                : choice === 'plan' && plan !== null
                  ? t.planChosen(sizeWords(plan.bytes.length))
                  : ''}
          </p>
          {error === undefined ? null : (
            <p id={errorId} className={formStyles.error}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );

  return {
    state,
    node,
    focus: () => {
      setError(missing ?? undefined);
      chooseButton.current?.focus();
    },
    reset: () => {
      latest.current += 1;
      setReading(false);
      setChoice('none');
      setPicture(null);
      setPlan(null);
      setError(undefined);
    },
  };
}

/**
 * The line at the end of every screen: "Help" and "Something looks wrong",
 * with its sheet. `helpHref` is the app's help centre, or the website's
 * where the app's isn't reached (setup). `screen` names the screen when its
 * address doesn't say enough, as on setup's steps.
 */
export function SupportFooter({
  helpHref,
  screen,
}: {
  readonly helpHref: string;
  readonly screen?: string;
}) {
  const [open, setOpen] = useState(false);
  // The form is made the first time it opens, then kept while PrePenny is
  // open, so a screen nobody reports on has no form in it.
  const [opened, setOpened] = useState(false);
  const [round, setRound] = useState(0);
  const [sent, setSent] = useState(false);
  const attachment = useAttachment();
  const nameNow = useMemo(
    () => () => screen ?? screenName(typeof location === 'undefined' ? '/' : location.pathname),
    [screen],
  );

  function close() {
    setOpen(false);
    // Once it's sent, the next time it opens it's a fresh form. Until then,
    // nothing typed is lost by closing it, as to take a screenshot.
    if (sent) {
      setSent(false);
      setRound((one) => one + 1);
      attachment.reset();
    }
  }

  return (
    <footer className={styles.footer} data-support-footer>
      {/* A plain link, so nothing is fetched ahead of a tap (D588). */}
      <a className={styles.footerLink} href={helpHref}>
        {strings.support.help}
      </a>
      <button
        type="button"
        className={styles.footerLink}
        aria-haspopup="dialog"
        onClick={() => {
          setOpened(true);
          setOpen(true);
        }}
      >
        {strings.support.somethingWrong}
      </button>
      <Sheet open={open} title={t.title} intro={t.intro} onClose={close}>
        {opened ? (
          <SupportForm
            key={round}
            kind="problem"
            wordsLabel={t.wordsLabel}
            wordsHint={t.wordsHint}
            wordsMissing={t.wordsMissing}
            screen={nameNow}
            attachment={attachment}
            onSent={() => setSent(true)}
          />
        ) : null}
      </Sheet>
    </footer>
  );
}
