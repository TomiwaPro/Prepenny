// "Test version: don't use real details." at the top of every page of a
// pull request's preview (step 3e-2, D407), which uses the preview Supabase
// project, never the real one. Written into the page when it's built, so it
// shows before anything else loads, and never in the live app.

import { isPreview } from '../lib/preview.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './PreviewLine.module.css';

export function PreviewLine() {
  if (!isPreview()) return null;
  return (
    <p className={styles.line} data-testid="preview-line">
      {strings.preview.line}
    </p>
  );
}
