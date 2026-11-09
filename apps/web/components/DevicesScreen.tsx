'use client';

// Signed-in devices, under More (brief 4.13, D21, step 3e): every phone and
// computer signed in to the person's account, each by a plain name such as
// "Chrome on an Android phone", "This device" for this one, and when the
// others were last used. Never an IP address or a place. Each can be signed
// out, and "Sign out everywhere" signs out every one, this one too. An ended
// device gets nothing more from the account at once, and removes the plan
// within a minute (data/sync.ts).

import { useCallback, useEffect, useState } from 'react';
import { allSent, useSync } from '../data/sync.ts';
import { signOutAndForget } from '../lib/account.ts';
import { deviceName, lastUsedWords } from '../lib/device-words.ts';
import { type Device, endDevice, endEveryDevice, myDevices, twoStep } from '../lib/security.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { SecondStepSheet } from './SecondStepSheet.tsx';
import { SignOutSheet } from './SignOutSheet.tsx';

const t = strings.devices;

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly devices: readonly Device[] };

export function DevicesScreen() {
  const { ownPlan } = usePlanActions();
  const sync = useSync();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [ending, setEnding] = useState<Device | null>(null);
  const [signingOutHere, setSigningOutHere] = useState(false);
  const [everywhere, setEverywhere] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [said, setSaid] = useState('');
  const [unsentWords, setUnsentWords] = useState<string | null>(null);

  const load = useCallback(async () => {
    const answer = await myDevices();
    setLoaded(answer.ok ? { kind: 'ready', devices: answer.value.devices } : { kind: 'failed' });
  }, []);

  useEffect(() => {
    void load();
    void twoStep().then((state) => setNeedsCode(state.ok && state.value.on));
  }, [load]);

  return (
    <>
      <ScreenHeader
        heading={t.heading}
        purpose={t.purpose}
        back={{ label: strings.security.backToMore, href: '/app/more/' }}
      />
      <p className={styles.line} role="status" data-testid="devices-said">
        {said}
      </p>
      {loaded.kind === 'loading' ? (
        <section className={styles.card}>
          <p className={styles.line}>{t.loading}</p>
        </section>
      ) : loaded.kind === 'failed' ? (
        <section className={styles.card}>
          <p className={styles.line}>{t.couldNotLoad}</p>
          <div className={styles.actions}>
            <button type="button" className={formStyles.outlined} onClick={() => void load()}>
              {t.tryAgain}
            </button>
          </div>
        </section>
      ) : (
        <ul className={styles.deviceList} data-testid="devices">
          {loaded.devices.map((device) => {
            const name = deviceName(device.browser, device.device);
            return (
              <li
                key={device.id}
                className={styles.card}
                data-testid="device"
                data-this={device.thisOne}
              >
                <h2 className={styles.cardTitle}>{name}</h2>
                <p className={styles.second}>
                  {device.thisOne ? t.thisDevice : lastUsedWords(device.lastUsedAt)}
                </p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={formStyles.outlined}
                    aria-haspopup="dialog"
                    aria-label={t.signOutOfItLabel(name)}
                    onClick={() => (device.thisOne ? setSigningOutHere(true) : setEnding(device))}
                  >
                    {t.signOutOfIt}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <section className={styles.card} aria-labelledby="everywhere-heading">
        <h2 id="everywhere-heading" className={styles.cardTitle}>
          {t.everywhere}
        </h2>
        <p className={styles.second}>{t.everywhereLine}</p>
        {unsentWords === null ? null : (
          <p className={formStyles.problem} role="alert">
            {unsentWords}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={formStyles.outlined}
            aria-haspopup="dialog"
            onClick={async () => {
              // Nothing waiting to be sent is lost by signing out everywhere (D325).
              if (!(await allSent())) {
                setUnsentWords(t.everywhereUnsent(Math.max(1, sync.unsent)));
                return;
              }
              setUnsentWords(null);
              setEverywhere(true);
            }}
          >
            {t.everywhere}
          </button>
        </div>
      </section>

      <SecondStepSheet
        open={ending !== null}
        title={ending === null ? '' : t.endTitle(deviceName(ending.browser, ending.device))}
        intro={t.endIntro}
        codeIntro={t.endIntro}
        needsCode={false}
        confirm={t.endYes}
        keep={t.endNo}
        onConfirm={async () => (ending === null ? { ok: true, value: true } : endDevice(ending.id))}
        onClose={(done) => {
          if (done && ending !== null) setSaid(t.ended(deviceName(ending.browser, ending.device)));
          setEnding(null);
          if (done) void load();
        }}
      />
      <SecondStepSheet
        open={everywhere}
        title={t.everywhereTitle}
        intro={t.everywhereIntro}
        codeIntro={t.everywhereCodeIntro}
        needsCode={needsCode}
        confirm={t.everywhereYes}
        keep={t.everywhereNo}
        onConfirm={async () => {
          const done = await endEveryDevice();
          if (!done.ok) return done;
          setSaid(t.signingOut);
          // This phone too: the plan and everything else goes, as signing out does.
          await signOutAndForget();
          window.location.replace('/?signed-out');
          return done;
        }}
        onClose={(done) => {
          if (!done) setEverywhere(false);
        }}
      />
      <SignOutSheet
        open={signingOutHere}
        ownPlan={ownPlan}
        onClose={() => setSigningOutHere(false)}
      />
    </>
  );
}
