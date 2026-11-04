'use client';

// The welcome (brief 4.1, Part 6, step 2e): the name, the tagline, one
// sentence on what PrePenny does, then "Make my plan" and "Look at an example
// plan". Someone part-way through setup carries on from it; someone with a
// plan goes to it.

import { useRouter } from 'next/navigation';
import { strings } from '../../strings/en-GB.ts';
import formStyles from '../Form.module.css';
import styles from './Setup.module.css';
import { useSetup } from './SetupProvider.tsx';

export function Welcome({ inSetup }: { readonly inSetup: boolean }) {
  const { state, start, show } = useSetup();
  const router = useRouter();
  const ready = state.status === 'ready';
  const progress = ready ? state.progress : null;
  const own = ready ? state.plan : null;
  const done = progress?.step === 'done';
  const make =
    own === null
      ? strings.welcome.makeMyPlan
      : done
        ? strings.welcome.goToMyPlan
        : strings.welcome.carryOn;
  return (
    <main className={`${styles.page} ${styles.welcome}`}>
      <h1 className={styles.name}>{strings.app.name}</h1>
      <p className={styles.tagline}>{strings.app.tagline}</p>
      <p className={styles.description}>{strings.app.description}</p>
      <button
        type="button"
        className={formStyles.main}
        aria-disabled={!ready}
        onClick={async () => {
          if (!ready) return;
          if (done) {
            await show('own');
            router.push('/app/');
            return;
          }
          await start();
          if (!inSetup) router.push('/setup/');
        }}
      >
        {make}
      </button>
      <button
        type="button"
        className={formStyles.outlined}
        aria-disabled={!ready}
        onClick={async () => {
          if (!ready) return;
          // Looking at the example never touches the person's own plan.
          await show('example');
          router.push('/app/');
        }}
      >
        {strings.welcome.lookAtExample}
      </button>
    </main>
  );
}
