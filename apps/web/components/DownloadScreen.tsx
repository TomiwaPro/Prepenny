'use client';

// Download my data (brief 4.12, 4.13, step 3h): everything PrePenny keeps
// for the person, as a spreadsheet (CSV) and as a backup (JSON) that Import
// a backup reads back. Made on the phone and saved straight to its
// downloads: the files are never sent anywhere (data/your-data.ts).

import { useState } from 'react';
import { hasPartner, partnerOf, useSharedPlan } from '../data/shared-plan.ts';
import { backupFrom, gatherMyData, saveFile, useOwnPlanId } from '../data/your-data.ts';
import { useAccount } from '../lib/account.ts';
import { backupText } from '../lib/backup.ts';
import { spreadsheetOf } from '../lib/backup-csv.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import { todayOf, usePlanActions } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';

const t = strings.yourData;

export function DownloadScreen() {
  const account = useAccount();
  const { loaded } = usePlanActions();
  const ownId = useOwnPlanId(loaded?.version ?? 0);
  const shared = useSharedPlan(ownId ?? null, loaded?.version ?? 0);
  const partner = hasPartner(shared) ? partnerOf(shared) : null;
  const [busy, setBusy] = useState<'csv' | 'json' | null>(null);
  const [said, setSaid] = useState('');

  async function download(kind: 'csv' | 'json') {
    if (busy !== null) return;
    setBusy(kind);
    setSaid(t.preparing);
    try {
      const data = await gatherMyData(todayOf({ isExample: false, id: '' }));
      if (data === null) {
        setSaid(t.noPlan);
        return;
      }
      const day = data.today;
      const name = kind === 'csv' ? `prepenny-${day}.csv` : `prepenny-backup-${day}.json`;
      if (kind === 'csv') {
        saveFile(name, spreadsheetOf(data), 'text/csv;charset=utf-8');
      } else {
        saveFile(name, backupText(backupFrom(data)), 'application/json');
      }
      setSaid(data.planOnly ? `${t.saved(name)} ${t.planOnly}` : t.saved(name));
    } finally {
      setBusy(null);
    }
  }

  const header = (
    <ScreenHeader
      heading={t.download}
      purpose={t.downloadPurpose}
      back={{ label: t.backToMore, href: '/app/more/' }}
    />
  );
  if (ownId === null) {
    return (
      <>
        {header}
        <section className={styles.card}>
          <p className={styles.line}>{t.noPlan}</p>
        </section>
      </>
    );
  }
  return (
    <>
      {header}
      <p className={styles.line} role="status" data-testid="download-said">
        {said}
      </p>
      <section className={styles.card} aria-labelledby="spreadsheet-heading">
        <h2 id="spreadsheet-heading" className={styles.cardTitle}>
          {t.spreadsheetHeading}
        </h2>
        <p className={styles.line}>{t.spreadsheetLine}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={formStyles.main}
            aria-disabled={busy !== null}
            onClick={() => void download('csv')}
          >
            {t.downloadSpreadsheet}
          </button>
        </div>
      </section>
      <section className={styles.card} aria-labelledby="backup-heading">
        <h2 id="backup-heading" className={styles.cardTitle}>
          {t.backupHeading}
        </h2>
        <p className={styles.line}>{t.backupLine}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={formStyles.outlined}
            aria-disabled={busy !== null}
            onClick={() => void download('json')}
          >
            {t.downloadBackup}
          </button>
        </div>
      </section>
      <section className={styles.card} aria-labelledby="whats-in-heading">
        <h2 id="whats-in-heading" className={styles.cardTitle}>
          {t.whatsInHeading}
        </h2>
        <p className={styles.line}>{t.whatsInPlan}</p>
        <p className={styles.line}>
          {account.status === 'signed-in' ? t.whatsInAccount : t.whatsInHere}
        </p>
        {partner === null ? null : (
          <p className={styles.line}>{t.whatsInShared(partner.name ?? strings.share.someone)}</p>
        )}
        <p className={styles.line}>{t.keepSafe}</p>
      </section>
    </>
  );
}
