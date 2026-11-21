// "Help" on More (the More sketch in ARCHITECTURE.md 4.6, step 4g): the help
// centre, Help when money is tight, and since step 4h the tour of Home
// (D597), each a whole row that opens it,
// with a line saying what's there (D213). Plain links, as every link into
// and between help pages is, so only the pages are kept on the phone, not
// Next.js's data for moving between them (D588).
import { HELP_ROUTES, MONEY_TIGHT_SLUG, TOUR_ROUTE } from '../lib/help-routes.ts';
import { statusPageUrl } from '../lib/status-page.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Screens.module.css';

const t = strings.help;

const links = [
  { href: HELP_ROUTES.app.index, label: t.centre, line: t.centreLine },
  {
    href: HELP_ROUTES.app.article(MONEY_TIGHT_SLUG),
    label: t.moneyTight,
    line: t.moneyTightLine,
  },
  // The tour of Home, any time (step 4h, D597): Home starts it from the address.
  { href: TOUR_ROUTE, label: strings.tour.moreLabel, line: strings.tour.moreLine },
  // Step 4i (D601): writing to support, and ideas.
  {
    href: '/app/contact/',
    label: strings.support.contact.heading,
    line: strings.support.contact.moreLine,
  },
  {
    href: '/app/suggest/',
    label: strings.support.idea.heading,
    line: strings.support.idea.moreLine,
  },
] as const;

export function HelpMoreCard() {
  // PrePenny's status page, at UptimeRobot (step 4k, D643), when there's one.
  const status = statusPageUrl();
  return (
    <nav className={styles.card} aria-labelledby="help-on-more">
      <h2 id="help-on-more" className={styles.cardTitle}>
        {t.moreHeading}
      </h2>
      <ul className={styles.list}>
        {links.map((one) => (
          <li key={one.href}>
            <a className={styles.rowLink} href={one.href}>
              <span className={styles.rowBody}>
                <span className={styles.rowName}>{one.label}</span>
                <span className={styles.second}>{one.line}</span>
              </span>
              <span className={styles.arrow} aria-hidden="true" />
            </a>
          </li>
        ))}
        {status === null ? null : (
          <li>
            {/* Another website's page, so it opens on its own, as help's links to other websites do (step 4g). */}
            <a
              className={styles.rowLink}
              href={status}
              target="_blank"
              rel="noreferrer noopener"
              data-status-link=""
            >
              <span className={styles.rowBody}>
                <span className={styles.rowName}>{strings.statusPage.link}</span>
                <span className={styles.second}>{strings.statusPage.moreLine}</span>
                {/* Screen readers hear where it goes, after what they see (WCAG 2.5.3). */}
                <span className="visually-hidden">{`, ${strings.statusPage.opensPage}`}</span>
              </span>
              <span className={styles.arrow} aria-hidden="true" />
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}
