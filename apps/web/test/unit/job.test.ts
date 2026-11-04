// Your job (step 2h): what the screen shows of Sam's warehouse job, reading
// its boxes into a change that sends only what the person changed, and
// overtime saved for paydays still to come worked out again when the job's
// details change (D154, D162).

import type { EditCommand } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import { runEdit, runEdits } from '../../lib/edit.ts';
import { jobFormOf, readJob } from '../../lib/job-form.ts';
import { previewJobChange, workOutJobView } from '../../lib/job-view.ts';
import {
  coveredWords,
  pensionWords,
  soFarWords,
  taxCodeWords,
  weekForWords,
} from '../../lib/job-words.ts';
import { workOutPayView } from '../../lib/pay-view.ts';

const SUNDAY = '2026-10-25';

const overtime: EditCommand = {
  kind: 'overtime',
  id: 'ot',
  seriesId: 'pay',
  workedOn: '2026-10-26',
  hours: '11.5',
};

function samJob(records = examplePlan) {
  const job = workOutJobView(records, SUNDAY).jobs[0];
  if (job === undefined) throw new Error('Sam has a job.');
  return job;
}

function fridaySixth(records: typeof examplePlan) {
  return workOutPayView(records, SUNDAY).paydays.find((one) => one.date === '2026-11-06');
}

describe("Your job on Sam's example", () => {
  it('shows the warehouse job with every detail from his week 29 payslip', () => {
    const job = samJob();
    expect(job).toMatchObject({
      id: 'warehouse',
      name: 'Warehouse job',
      frequency: 'weekly',
      pays: ['Pay'],
      next: { date: '2026-10-30', originalDate: '2026-10-30' },
      coveredUpTo: '2026-10-25',
      steps: 4,
      shiftsAhead: 0,
    });
    expect(taxCodeWords(job.profile)).toBe('1257L, worked out the usual way');
    expect(pensionWords(job.profile)).toBe(
      '4% of your pay from £120.00 to £967.00 a week, before tax',
    );
    expect(soFarWords(job.profile)).toBe(
      'Tax week 29 of 2026 to 2027: gross for tax so far £10,732.73, tax paid so far £743.40',
    );
    expect(coveredWords(job, SUNDAY)).toBe(
      'Fri\u00a030\u00a0Oct pays for work up to Sun\u00a025\u00a0Oct',
    );
    expect(job.weeks.map((one) => [one.name, weekForWords(one.steps, job.steps)])).toEqual([
      ['Rota week 1, 3 shifts', 'Week 1 of 4 in your pay pattern'],
      ['Rota week 2, 4 shifts', 'Week 2 of 4 in your pay pattern'],
      ['Rota week 3, 3 shifts', 'Week 3 of 4 in your pay pattern'],
      ['Rota week 4, 4 shifts', 'Week 4 of 4 in your pay pattern'],
    ]);
  });

  it('sends nothing when nothing is changed, and only the part changed', () => {
    const job = samJob();
    const initial = jobFormOf(job, SUNDAY);
    expect(readJob(initial, initial, job)).toEqual({ ok: true, edits: {} });
    expect(readJob({ ...initial, taxCode: 'br' }, initial, job)).toEqual({
      ok: true,
      edits: { taxCode: 'BR' },
    });
    expect(readJob({ ...initial, overtimeRate: '20.50' }, initial, job)).toEqual({
      ok: true,
      edits: { overtimeRate: '20.50' },
    });
    // Each payday covers work up to the day before it now: 0 days before.
    expect(readJob({ ...initial, coveredTo: '2026-10-30' }, initial, job)).toEqual({
      ok: true,
      edits: { coveredTo: { kind: 'days-before', days: 0 } },
    });
    expect(readJob({ ...initial, pension: false }, initial, job)).toEqual({
      ok: true,
      edits: { pension: null },
    });
  });

  it('says which box needs a change, in its own words', () => {
    const job = samJob();
    const initial = jobFormOf(job, SUNDAY);
    const read = readJob(
      { ...initial, taxCode: 'XYZ', overtimeRate: 'lots', coveredTo: '2026-11-02', grossSoFar: '' },
      initial,
      job,
    );
    expect(read).toEqual({
      ok: false,
      errors: {
        taxCode: 'taxCodeError',
        overtimeRate: 'rateError',
        coveredTo: 'coveredToTooFar',
        grossSoFar: 'soFarBoth',
      },
    });
  });

  it('works out overtime saved for Fri 6 Nov again on a new tax code, as if it was added after (D154)', () => {
    const withOvertime = runEdit(examplePlan, SUNDAY, overtime).records;
    expect(fridaySixth(withOvertime)?.amount).toBe(77358);
    expect(samJob(withOvertime).shiftsAhead).toBe(1);

    const change: EditCommand = {
      kind: 'change-pay-profile',
      payProfileId: 'warehouse',
      edits: { taxCode: 'BR' },
    };
    const changedAfter = runEdit(withOvertime, SUNDAY, change).records;
    const addedAfter = runEdits(examplePlan, SUNDAY, [change, overtime]).records;
    const friday = fridaySixth(changedAfter);
    expect(friday?.amount).toBe(fridaySixth(addedAfter)?.amount);
    expect(friday?.amount).not.toBe(77358);

    // The preview names the payday and what it becomes, without saving anything.
    const preview = previewJobChange(withOvertime, SUNDAY, 'warehouse', [change]);
    expect(preview).toEqual({
      ok: true,
      changes: [{ date: '2026-11-06', before: 77358, after: friday?.amount }],
    });
    expect(fridaySixth(withOvertime)?.amount).toBe(77358);
  });

  it('refuses a new last day covered that would move a saved shift to another payday (D154)', () => {
    const withOvertime = runEdit(examplePlan, SUNDAY, overtime).records;
    // Covering work up to 12 days before payday puts Mon 26 Oct on Fri 13 Nov.
    expect(
      previewJobChange(withOvertime, SUNDAY, 'warehouse', [
        {
          kind: 'change-pay-profile',
          payProfileId: 'warehouse',
          edits: { coveredTo: { kind: 'days-before', days: 12 } },
        },
      ]),
    ).toEqual({ ok: false, code: 'shifts-saved' });
  });

  it('shows nothing when no job is saved', () => {
    expect(workOutJobView({ ...examplePlan, payProfiles: [] }, SUNDAY).jobs).toEqual([]);
  });
});
