// A link to PrePenny's status page (step 4k, D643): on More, Contact us, the
// website's help pages and the note when PrePenny's server isn't answering.
// The page is at UptimeRobot, so it keeps working when PrePenny doesn't: it
// opens on its own, as every link to another website does (step 4g), and
// screen readers hear where it goes. With no status page set, it isn't there.

import { statusPageUrl } from '../lib/status-page.ts';
import { strings } from '../strings/en-GB.ts';

export function StatusLink({
  className,
  label = strings.statusPage.link,
}: {
  readonly className?: string | undefined;
  readonly label?: string;
}) {
  const href = statusPageUrl();
  if (href === null) return null;
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${label}, ${strings.statusPage.opensPage}`}
      data-status-link=""
    >
      {label}
    </a>
  );
}
