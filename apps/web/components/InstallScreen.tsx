'use client';

// "Add to home screen", under More (step 4d, D548): the steps for Android
// and iPhone, always findable here, whether or not the suggestion was
// answered (D546), with the browser's own install where it offers one.

import { useAccount } from '../lib/account.ts';
import { strings } from '../strings/en-GB.ts';
import { InstallSteps } from './InstallSteps.tsx';
import { usePlan } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';

const t = strings.homeScreen;

export function InstallScreen() {
  const state = usePlan();
  const account = useAccount();
  const own = state.plan !== null && !state.plan.isExample;
  return (
    <>
      <ScreenHeader
        heading={t.heading}
        purpose={t.purpose}
        back={{ label: t.back, href: '/app/more/' }}
      />
      <section className={styles.card} data-testid="home-screen-steps">
        <InstallSteps level={2} signUpFirst={own && account.status === 'signed-out'} />
      </section>
    </>
  );
}
