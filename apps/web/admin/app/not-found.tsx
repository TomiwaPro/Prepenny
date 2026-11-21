import screens from '../../components/Screens.module.css';
import { supportStrings } from '../../strings/support-en-GB.ts';
import styles from './dashboard.module.css';

const t = supportStrings.supportDashboard;

export default function NotFound() {
  return (
    <main className={styles.page}>
      <header className={screens.header}>
        <h1 className={screens.heading}>{t.notFound}</h1>
        <p className={screens.purpose}>{t.notFoundPurpose}</p>
      </header>
      <a className={screens.back} href="/">
        {t.toDashboard}
      </a>
    </main>
  );
}
