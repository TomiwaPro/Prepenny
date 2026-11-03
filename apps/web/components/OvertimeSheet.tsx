'use client';

// I did overtime and I missed a shift (brief 4.3, D5, D44, D124, D129 to
// D131, D140, D200): confirm the day and the hours, and save. The rate is
// remembered. Before saving, the sheet says which payday the shift is paid
// on and by how much that payday changes, worked out by the engine on a
// copy of the plan (lib/pay-preview.ts), so it's exactly what Save does.
// The box for extras, such as a shift premium, shows only when that
// payday's pay week has extras (D130).

import type { Pence } from '@prepenny/engine';
import { useEffect, useId, useRef, useState } from 'react';
import type { PayView } from '../lib/actions-view.ts';
import { parseAmount } from '../lib/amount.ts';
import { formatDay } from '../lib/dates.ts';
import { newId } from '../lib/ids.ts';
import { formatMoney } from '../lib/money.ts';
import type { PayCommand, PayPreview } from '../lib/pay-preview.ts';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import { previewPayInBackground } from '../worker/client.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { DateField, describedBy, Field, MoneyInput, Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Segmented } from './Segmented.tsx';
import { Sheet } from './Sheet.tsx';
import { type ShownActions, useActionsView } from './useActionsView.ts';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.overtime;

type Kind = PayCommand['kind'];

export function OvertimeSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const opened = useOpenCount(open);
  const shown = useActionsView(open);
  // Each time it opens, it starts as "I did overtime", the button's own words.
  const [kind, setKind] = useState<{ opened: number; kind: Kind }>({
    opened: 0,
    kind: 'overtime',
  });
  if (kind.opened !== opened) setKind({ opened, kind: 'overtime' });
  const now = kind.opened === opened ? kind.kind : 'overtime';
  return (
    <Sheet
      open={open}
      title={now === 'overtime' ? t.titleOvertime : t.titleMissed}
      onClose={onClose}
    >
      {opened === 0 ? null : (
        <OvertimeForm
          key={opened}
          shown={shown}
          kind={now}
          onKind={(next) => setKind({ opened, kind: next })}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

const HOURS = /^\d{1,3}(\.\d{1,2})?$/;
const RATE = /^\d{1,4}(\.\d{1,4})?$/;

/** Hours as the engine takes them, "11.5", or null when they aren't hours above zero. */
function readHours(text: string): string | null {
  const hours = text.trim();
  return HOURS.test(hours) && Number(hours) > 0 ? hours : null;
}

/** A rate as the engine takes it, "19.07", with any "£" taken off, or null. */
function readRate(text: string): string | null {
  const rate = text.trim().replace(/^£\s*/, '');
  return RATE.test(rate) ? rate : null;
}

/**
 * "This adds £155.12 to your pay on Fri 6 Nov, making it £773.58." The
 * amounts have no sign, so a line never breaks between "+" and "£".
 */
function previewSentence(
  result: Extract<PayPreview, { ok: true }>,
  day: (date: string) => string,
): string {
  const amount = formatMoney(Math.abs(result.change));
  const up = result.change >= 0;
  if (result.payday === null || result.payAfter === null) {
    return (up ? t.addsNoDay : t.takesOffNoDay)(amount);
  }
  return (up ? t.adds : t.takesOff)(amount, day(result.payday), formatMoney(result.payAfter));
}

/** "£19.07" for a rate the engine used. */
function rateWords(rate: string): string {
  const pence = parseAmount(rate);
  return pence === null ? `${strings.form.pound}${rate}` : formatMoney(pence);
}

function OvertimeForm({
  shown,
  kind,
  onKind,
  onDone,
}: {
  readonly shown: ShownActions;
  readonly kind: Kind;
  readonly onKind: (kind: Kind) => void;
  readonly onDone: () => void;
}) {
  const view = shown.view;
  if (view === null) {
    return shown.failed ? <Problem text={strings.errors.plan} /> : <p>{strings.sheet.working}</p>;
  }
  const first = view.pay[0];
  if (first === undefined) {
    return (
      <p className={styles.note} data-testid="no-pay">
        {t.noPay}
      </p>
    );
  }
  return (
    <ShiftFields pay={view.pay} today={view.today} kind={kind} onKind={onKind} onDone={onDone} />
  );
}

function ShiftFields({
  pay,
  today,
  kind,
  onKind,
  onDone,
}: {
  readonly pay: readonly PayView[];
  readonly today: string;
  readonly kind: Kind;
  readonly onKind: (kind: Kind) => void;
  readonly onDone: () => void;
}) {
  const { makeChange, loaded } = usePlanActions();
  const id = useId();
  // The new record's id, made once, so the preview and Save are the same change.
  const [adjustmentId] = useState(() => newId());
  const [familyId, setFamilyId] = useState(pay[0]?.familyId ?? '');
  const chosen = pay.find((one) => one.familyId === familyId) ?? pay[0];
  const [date, setDate] = useState(today);
  const [hoursText, setHoursText] = useState<Record<Kind, string>>({
    overtime: chosen?.lastHours.overtime ?? '',
    'missed-shift': chosen?.lastHours.missed ?? '',
  });
  const [rateText, setRateText] = useState(chosen?.overtimeRate ?? '');
  const [changingRate, setChangingRate] = useState(chosen?.overtimeRate === null);
  const [extrasText, setExtrasText] = useState('');
  const [errors, setErrors] = useState<{ hours?: string; rate?: string; extras?: string }>({});
  const [preview, setPreview] = useState<{ key: string; result: PayPreview } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const hoursRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const extrasRef = useRef<HTMLInputElement>(null);

  const hours = readHours(hoursText[kind]);
  const rate = readRate(rateText);
  const extras: Pence | null = parseAmount(extrasText);
  // Overtime uses the remembered rate, or the one typed; a missed shift the
  // pay week's own basic rate unless the person changes it (D123).
  const sendRate = kind === 'overtime' ? rate : changingRate ? rate : null;
  const command: PayCommand | null =
    hours === null || chosen === undefined || date === ''
      ? null
      : {
          kind,
          id: adjustmentId,
          seriesId: chosen.seriesId,
          workedOn: date,
          hours,
          ...(sendRate === null ? {} : { rate: sendRate }),
          ...(extras === null || extras === 0 ? {} : { extras }),
        };
  const key = command === null ? '' : JSON.stringify(command);

  // The command is rebuilt on every draw; `key` says when it has changed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: key stands for the command
  useEffect(() => {
    if (command === null || loaded === null) return;
    let current = true;
    const wait = setTimeout(() => {
      previewPayInBackground(loaded.records, loaded.today, command).then(
        (result) => {
          if (current) setPreview({ key, result });
        },
        () => {
          if (current) setPreview({ key, result: { ok: false, code: 'unexpected' } });
        },
      );
    }, 200);
    return () => {
      current = false;
      clearTimeout(wait);
    };
  }, [key, loaded]);

  const result = preview !== null && preview.key === key ? preview.result : null;

  // A payday with no extras can't take a change to them: the box goes, and so does what was typed in it.
  const noExtras = result !== null && !result.ok && result.code === 'no-extras';
  useEffect(() => {
    if (noExtras) setExtrasText('');
  }, [noExtras]);
  const day = (when: string) => formatDay(when, today);
  const hasExtras = result?.ok === true && result.hasExtras;
  const shownRate = kind === 'overtime' ? rate : result?.ok === true ? result.rate : null;

  let previewWords: string | null = null;
  if (command !== null) {
    if (result === null) previewWords = strings.sheet.working;
    else if (!result.ok) previewWords = refusalMessage(result.code);
    else previewWords = previewSentence(result, day);
  }

  async function save() {
    if (busy || loaded === null) return;
    setProblem(null);
    const found: { hours?: string; rate?: string; extras?: string } = {};
    if (hours === null) found.hours = t.hoursError;
    if ((kind === 'overtime' || changingRate) && rate === null) found.rate = t.rateError;
    if (hasExtras && extrasText.trim() !== '' && extras === null) {
      found.extras = strings.form.amountError;
    }
    setErrors(found);
    if (found.hours !== undefined) return hoursRef.current?.focus();
    if (found.rate !== undefined) return rateRef.current?.focus();
    if (found.extras !== undefined) return extrasRef.current?.focus();
    if (command === null) return;
    setBusy(true);
    // The words for the undo bar come from the same change, worked out once more.
    const sure = await previewPayInBackground(loaded.records, loaded.today, command).catch(
      (): PayPreview => ({ ok: false, code: 'unexpected' }),
    );
    if (!sure.ok) {
      setBusy(false);
      setProblem(refusalMessage(sure.code));
      return;
    }
    const what = kind === 'overtime' ? strings.undo.overtimeAdded : strings.undo.missedAdded;
    const amount = formatMoney(Math.abs(sure.change));
    const up = sure.change >= 0;
    const message =
      sure.payday === null
        ? (up ? strings.undo.payUpNoDay : strings.undo.payDownNoDay)(what, amount)
        : (up ? strings.undo.payUp : strings.undo.payDown)(what, day(sure.payday), amount);
    const outcome = await makeChange(command, message);
    setBusy(false);
    if (outcome.ok) onDone();
    else setProblem(refusalMessage(outcome.code));
  }

  return (
    <form
      className={styles.form}
      noValidate
      aria-label={kind === 'overtime' ? t.titleOvertime : t.titleMissed}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Segmented<Kind>
        legend={t.what}
        name={`${id}-kind`}
        value={kind}
        options={[
          { value: 'overtime', label: t.overtime },
          { value: 'missed-shift', label: t.missed },
        ]}
        onChange={(next) => {
          setErrors({});
          setProblem(null);
          setExtrasText('');
          onKind(next);
        }}
        testId="shift-kind"
      />
      {pay.length > 1 ? (
        <ChoiceList<string>
          legend={t.whichPay}
          name={`${id}-pay`}
          value={chosen?.familyId ?? ''}
          options={pay.map((one) => ({ value: one.familyId, label: one.name }))}
          onChange={setFamilyId}
        />
      ) : null}
      <DateField
        id={`${id}-date`}
        label={kind === 'overtime' ? t.dayOvertime : t.dayMissed}
        value={date}
        today={today}
        onChange={setDate}
      />
      <Field id={`${id}-hours`} label={t.hours} error={errors.hours}>
        <input
          ref={hoursRef}
          id={`${id}-hours`}
          className={`${styles.input} num`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={hoursText[kind]}
          aria-invalid={errors.hours !== undefined}
          aria-describedby={describedBy(`${id}-hours`, errors.hours, [
            shownRate === null || changingRate ? null : `${id}-rate-line`,
          ])}
          onChange={(event) => setHoursText({ ...hoursText, [kind]: event.target.value })}
        />
      </Field>
      {changingRate || (kind === 'overtime' && rate === null) ? (
        <Field id={`${id}-rate`} label={t.rate} error={errors.rate}>
          <MoneyInput
            id={`${id}-rate`}
            inputRef={rateRef}
            value={rateText}
            onChange={setRateText}
            invalid={errors.rate !== undefined}
            describedBy={describedBy(`${id}-rate`, errors.rate)}
          />
        </Field>
      ) : shownRate === null ? null : (
        <div className={styles.withHint}>
          <p id={`${id}-rate-line`} className={`${styles.hint} num`}>
            {t.atRate(rateWords(shownRate))}
          </p>
          <button
            type="button"
            className={styles.quiet}
            onClick={() => {
              if (kind === 'missed-shift' && result?.ok === true) setRateText(result.rate);
              setChangingRate(true);
            }}
          >
            {t.changeRate}
          </button>
        </div>
      )}
      {hasExtras ? (
        <Field
          id={`${id}-extras`}
          label={kind === 'overtime' ? t.extrasOvertime : t.extrasMissed}
          error={errors.extras}
          hint={t.extrasHint}
        >
          <MoneyInput
            id={`${id}-extras`}
            inputRef={extrasRef}
            value={extrasText}
            onChange={setExtrasText}
            invalid={errors.extras !== undefined}
            describedBy={describedBy(`${id}-extras`, errors.extras, [`${id}-extras-hint`])}
          />
        </Field>
      ) : null}
      <div aria-live="polite" data-testid="shift-preview">
        {previewWords === null ? null : <p className={`${styles.panel} num`}>{previewWords}</p>}
      </div>
      <button type="submit" className={styles.main} aria-disabled={busy}>
        {strings.sheet.save}
      </button>
      <Problem text={problem} />
    </form>
  );
}
