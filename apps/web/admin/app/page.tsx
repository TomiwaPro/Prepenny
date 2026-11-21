import { SupportDashboard } from '../../components/SupportDashboard.tsx';
import styles from './dashboard.module.css';

export default function Page() {
  return (
    <main className={styles.page}>
      <SupportDashboard />
    </main>
  );
}
