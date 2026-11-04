'use client';

// Where you live, for bank holidays (brief 4.3, 5.7, D155): England and
// Wales, Scotland or Northern Ireland. Payments that move on a bank holiday
// follow that part of the UK's list. One change with one Undo.

import { NATIONS, type Nation } from '@prepenny/engine';
import { useId, useState } from 'react';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.nation;
const names = strings.setup.account.nations;

export function NationSheet({
  open,
  nation,
  onClose,
}: {
  readonly open: boolean;
  readonly nation: Nation;
  readonly onClose: () => void;
}) {
  const opened = useOpenCount(open);
  return (
    <Sheet open={open} title={t.title} intro={t.intro} onClose={onClose}>
      {opened === 0 ? null : <NationForm key={opened} nation={nation} onDone={onClose} />}
    </Sheet>
  );
}

function NationForm({ nation, onDone }: { readonly nation: Nation; readonly onDone: () => void }) {
  const { makeChange } = usePlanActions();
  const id = useId();
  const [chosen, setChosen] = useState<Nation>(nation);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className={styles.form}
      noValidate
      aria-label={t.title}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        if (chosen === nation) {
          onDone();
          return;
        }
        setBusy(true);
        setProblem(null);
        const outcome = await makeChange(
          { kind: 'set-nation', nation: chosen },
          t.saved(names[chosen]),
        );
        setBusy(false);
        if (outcome.ok) onDone();
        else setProblem(refusalMessage(outcome.code));
      }}
    >
      <ChoiceList<Nation>
        legend={strings.setup.account.nation}
        name={`${id}-nation`}
        value={chosen}
        options={NATIONS.map((value) => ({ value, label: names[value] }))}
        onChange={setChosen}
      />
      <button type="submit" className={styles.main} aria-disabled={busy}>
        {t.save}
      </button>
      <Problem text={problem} />
    </form>
  );
}
