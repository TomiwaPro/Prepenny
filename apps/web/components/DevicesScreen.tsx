'use client';

// Signed-in devices, under More (brief 4.13, D21, step 3e): every phone and
// computer signed in to the person's account, each by a plain name such as
// "Chrome on an Android phone", "This device" for this one, and when the
// others were last used. Never an IP address or a place. Each can be signed
// out, and "Sign out of all other devices" signs out every one but this one,
// which stays signed in (step 3e hardening); signing out of this one is its
// own "Sign out". An ended device gets nothing more from the account at
// once, and removes the plan within a minute (data/sync.ts).

import { useCallback, useEffect, useState } from 'react';
import { deviceName, lastUsedWords } from '../lib/device-words.ts';
import { type Device, endDevice, endOtherDevices, myDevices, twoStep } from '../lib/security.ts';
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
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [ending, setEnding] = useState<Device | null>(null);
  const [signingOutHere, setSigningOutHere] = useState(false);
  const [others, setOthers] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [said, setSaid] = useState('');

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
      <section className={styles.card} aria-labelledby="others-heading">
        <h2 id="others-heading" className={styles.cardTitle}>
          {t.others}
        </h2>
        <p className={styles.second}>{t.othersLine}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={formStyles.outlined}
            aria-haspopup="dialog"
            onClick={() => setOthers(true)}
          >
            {t.others}
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
        open={others}
        title={t.othersTitle}
        intro={t.othersIntro}
        codeIntro={t.othersCodeIntro}
        needsCode={needsCode}
        confirm={t.othersYes}
        keep={t.othersNo}
        onConfirm={async () => {
          // This phone stays signed in, so nothing waiting to be sent here is at risk.
          const done = await endOtherDevices();
          if (done.ok) setSaid(t.othersDone(done.value));
          return done;
        }}
        onClose={(done) => {
          setOthers(false);
          if (done) void load();
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
