'use client';

// The help centre's first page (step 4g, brief 4.16, D587, D588): what it's
// for, a search box, then every article, or the ones the words searched for
// are in, each a whole row with a line under its title. The search runs on
// the phone over the articles' words built into this page, so it works with
// no signal. Nothing is sent or kept: the words aren't put in the address,
// the browser isn't asked to remember them, and the box isn't a form that
// goes anywhere. Links to articles are plain links (D588).

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { HELP_ROUTES, type HelpPlace } from '../lib/help-routes.ts';
import { hasSearchWords, type SearchEntry, searchHelp } from '../lib/help-search.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import styles from './Help.module.css';
import screens from './Screens.module.css';

const t = strings.help;

export function HelpCentre({
  entries,
  place,
}: {
  readonly entries: readonly SearchEntry[];
  readonly place: HelpPlace;
}) {
  const boxId = useId();
  const hintId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const words = query.trim();
  const results = useMemo(() => searchHelp(entries, words), [entries, words]);
  const searching = hasSearchWords(words);
  const shown = searching
    ? results
    : entries.map((entry) => ({ slug: entry.slug, title: entry.title, line: entry.summary }));
  return (
    <>
      <header className={screens.header}>
        {place === 'app' ? (
          <Link className={screens.back} href="/app/more/">
            {t.backToMore}
          </Link>
        ) : null}
        <h1 className={screens.heading}>{t.heading}</h1>
        <p className={screens.purpose}>{t.purpose}</p>
      </header>
      <section className={screens.card} aria-labelledby={listId}>
        <div className={styles.search}>
          <label className={formStyles.label} htmlFor={boxId}>
            {t.search}
          </label>
          <div className={styles.searchRow}>
            <input
              id={boxId}
              className={formStyles.input}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={hintId}
              aria-controls={listId}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              data-testid="help-search"
            />
            {query === '' ? null : (
              <button type="button" className={styles.clear} onClick={() => setQuery('')}>
                {t.clear}
              </button>
            )}
          </div>
          <p id={hintId} className={screens.second}>
            {t.searchHint}
          </p>
        </div>
        <p className={styles.status} role="status" data-testid="help-found">
          {searching ? (results.length === 0 ? t.none(words) : t.found(results.length, words)) : ''}
        </p>
        <h2 id={listId} className={searching ? 'visually-hidden' : screens.cardTitle}>
          {t.all}
        </h2>
        {shown.length === 0 ? null : (
          <ul className={screens.list} data-testid="help-list">
            {shown.map((one) => (
              <li key={one.slug}>
                <a className={screens.rowLink} href={HELP_ROUTES[place].article(one.slug)}>
                  <span className={screens.rowBody}>
                    <span className={screens.rowName}>{one.title}</span>
                    <span className={screens.second}>{one.line}</span>
                  </span>
                  <span className={screens.arrow} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
