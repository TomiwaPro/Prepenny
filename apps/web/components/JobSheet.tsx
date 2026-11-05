'use client';

// Changing Your job's details (step 2h, brief 4.15, D154): the tax code and
// how it's worked out, the workplace pension, student loans and other
// deductions, the last payslip's figures, the overtime rate and the last day
// of work the next payday pays for. The tax boxes are the pay calculator's
// own, so both ask the same way. Only what was changed is sent (D153), as
// one change with one Undo. Before saving, the engine makes the change on a
// copy, so the undo bar can say which paydays still to come change because
// their overtime is worked out again (D154, D162).

import { useId, useState } from 'react';
import { formatDay } from '../lib/dates.ts';
import { type JobErrors, type JobForm, jobFormOf, readJob } from '../lib/job-form.ts';
import type { JobCard } from '../lib/job-view.ts';
import { paydayChangeWords } from '../lib/job-words.ts';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import { askInBackground } from '../worker/client.ts';
import { DateField, describedBy, Field, MoneyInput, Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { SoFarBoxes, TaxBoxes } from './PayCalculator.tsx';
import { usePlanActions } from './PlanProvider.tsx';
import screenStyles from './Screens.module.css';
import { Sheet } from './Sheet.tsx';
import { focusFirst } from './setup/focus.ts';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.job;

export function JobSheet({
  open,
  job,
  today,
  onClose,
}: {
  readonly open: boolean;
  readonly job: JobCard | null;
  readonly today: string;
  readonly onClose: () => void;
}) {
  const opened = useOpenCount(open);
  return (
    <Sheet open={open} title={t.sheetTitle} intro={t.sheetIntro} onClose={onClose}>
      {opened === 0 || job === null ? null : (
        <JobDetailsForm key={opened} job={job} today={today} onDone={onClose} />
      )}
    </Sheet>
  );
}

function JobDetailsForm({
  job,
  today,
  onDone,
}: {
  readonly job: JobCard;
  readonly today: string;
  readonly onDone: () => void;
}) {
  const { loaded, makeChange } = usePlanActions();
  const id = useId();
  const [initial] = useState<JobForm>(() => jobFormOf(job, today));
  const [form, setForm] = useState<JobForm>(initial);
  const [errors, setErrors] = useState<JobErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (part: Partial<JobForm>) => {
    setForm((now) => ({ ...now, ...part }));
    setProblem(null);
  };
  const mistake = (field: 'overtimeRate' | 'coveredTo') => {
    const found = errors[field];
    return found === undefined ? undefined : t.mistakes[found];
  };
  return (
    <form
      className={formStyles.form}
      noValidate
      aria-label={t.sheetTitle}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || loaded === null) return;
        const read = readJob(form, initial, job);
        if (!read.ok) {
          setErrors(read.errors);
          // The next payday has no tax year file, so there's no box to point at (D128).
          if (read.errors.payDate !== undefined) setProblem(t.noTaxYear);
          focusFirst(
            [
              'taxCode',
              'pensionPercent',
              'pensionLower',
              'pensionUpper',
              ...form.deductions.flatMap((one) => [
                `deductionName-${one.key}`,
                `deduction-${one.key}`,
              ]),
              'soFarPeriod',
              'grossSoFar',
              'taxSoFar',
              'overtimeRate',
              'coveredTo',
            ]
              .filter((field) => (read.errors as Record<string, unknown>)[field] !== undefined)
              .map((field) => `${id}-${field}`),
          );
          return;
        }
        setErrors({});
        if (Object.keys(read.edits).length === 0) {
          setProblem(t.nothingChanged);
          return;
        }
        setBusy(true);
        const command = {
          kind: 'change-pay-profile' as const,
          payProfileId: job.id,
          edits: read.edits,
        };
        let message: string = t.saved;
        try {
          const preview = await askInBackground({
            kind: 'job-preview',
            records: loaded.records,
            today: loaded.today,
            profileId: job.id,
            commands: [command],
          });
          if (!preview.ok) {
            setBusy(false);
            setProblem(refusalMessage(preview.code));
            return;
          }
          message = `${t.saved}${paydayChangeWords(preview.changes, today)}`;
        } catch {
          // The words about paydays are only a help; the change itself still checks everything.
        }
        const outcome = await makeChange(command, message);
        setBusy(false);
        if (outcome.ok) onDone();
        else setProblem(refusalMessage(outcome.code));
      }}
    >
      <h3 className={formStyles.subheading}>{strings.pay.taxHeading}</h3>
      <TaxBoxes id={id} form={form} errors={errors} today={today} set={set} />
      <div className={formStyles.group}>
        <h3 className={formStyles.subheading}>{strings.pay.soFarHeading}</h3>
        <p className={screenStyles.second}>{t.soFarIntro}</p>
        <SoFarBoxes id={id} form={form} errors={errors} today={today} set={set} />
      </div>
      <div className={formStyles.group}>
        <h3 className={formStyles.subheading}>{t.overtimeHeading}</h3>
        <Field
          id={`${id}-overtimeRate`}
          label={strings.setup.pay.overtimeRate}
          error={mistake('overtimeRate')}
          hint={t.overtimeHint}
        >
          <MoneyInput
            id={`${id}-overtimeRate`}
            value={form.overtimeRate}
            onChange={(overtimeRate) => set({ overtimeRate })}
            invalid={mistake('overtimeRate') !== undefined}
            describedBy={describedBy(`${id}-overtimeRate`, mistake('overtimeRate'), [
              `${id}-overtimeRate-hint`,
            ])}
          />
        </Field>
        {job.next === null ? null : (
          <DateField
            id={`${id}-coveredTo`}
            label={strings.setup.pay.coveredTo(formatDay(job.next.date, today))}
            value={form.coveredTo}
            today={today}
            max={job.next.date}
            onChange={(coveredTo) => set({ coveredTo })}
            error={mistake('coveredTo')}
            extraHint={{ id: `${id}-coveredTo-hint`, text: t.coveredHint }}
          />
        )}
      </div>
      {job.shiftsAhead === 0 ? null : <p className={formStyles.hint}>{t.reworkHint}</p>}
      <button type="submit" className={formStyles.main} aria-disabled={busy}>
        {t.save}
      </button>
      <Problem text={problem} />
    </form>
  );
}
