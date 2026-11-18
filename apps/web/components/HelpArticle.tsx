// One help article (step 4g, D587), from its Markdown in content/help: its
// title, then its paragraphs, sections and lists. A link to another
// article stays in the app or on the website, wherever it was opened; a
// link to an organisation's website opens it beside PrePenny and doesn't
// tell it which page it came from; a phone number can be tapped to call.
// Links between help pages are plain links (D588).

import type { Article, Block, Inline } from '../lib/help-markdown.ts';
import { HELP_ROUTES, type HelpPlace } from '../lib/help-routes.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Help.module.css';
import screens from './Screens.module.css';

function Words({
  inlines,
  place,
}: {
  readonly inlines: readonly Inline[];
  readonly place: HelpPlace;
}) {
  return inlines.map((one, at) => {
    const key = `${at} ${one.text}`;
    if (one.kind === 'text') return one.text;
    if (one.kind === 'strong') return <strong key={key}>{one.text}</strong>;
    if (one.to.kind === 'article') {
      return (
        <a key={key} href={HELP_ROUTES[place].article(one.to.slug)}>
          {one.text}
        </a>
      );
    }
    if (one.to.kind === 'phone') {
      return (
        <a key={key} className="num" href={one.to.href}>
          {one.text}
        </a>
      );
    }
    if (one.to.kind === 'site' || one.to.kind === 'email') {
      return (
        <a key={key} href={one.to.kind === 'site' ? one.to.path : one.to.href}>
          {one.text}
        </a>
      );
    }
    // Screen readers hear where it goes: "stepchange.org, Opens their website".
    return (
      <a
        key={key}
        href={one.to.href}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={`${one.text}, ${strings.help.opensSite}`}
      >
        {one.text}
      </a>
    );
  });
}

function BlockView({ block, place }: { readonly block: Block; readonly place: HelpPlace }) {
  if (block.kind === 'heading') return <h2 className={styles.section}>{block.text}</h2>;
  if (block.kind === 'paragraph') {
    return (
      <p>
        <Words inlines={block.inlines} place={place} />
      </p>
    );
  }
  const items = block.items.map((item, at) => (
    // Items don't move, so their place is their key.
    // biome-ignore lint/suspicious/noArrayIndexKey: an article's list never changes order
    <li key={at}>
      <Words inlines={item} place={place} />
    </li>
  ));
  return block.ordered ? (
    <ol className={styles.steps}>{items}</ol>
  ) : (
    <ul className={styles.points}>{items}</ul>
  );
}

export function HelpArticle({
  article,
  place,
}: {
  readonly article: Article;
  readonly place: HelpPlace;
}) {
  const [summary, ...rest] = article.blocks;
  return (
    <>
      {/* The title, then the summary as the plain sentence saying what it's for (D213). */}
      <header className={screens.header}>
        <a className={screens.back} href={HELP_ROUTES[place].index}>
          {strings.help.backToHelp}
        </a>
        <h1 className={screens.heading}>{article.title}</h1>
        {summary?.kind === 'paragraph' ? (
          <p className={screens.purpose}>
            <Words inlines={summary.inlines} place={place} />
          </p>
        ) : null}
      </header>
      <article className={styles.article} data-testid="help-article">
        {rest.map((block, at) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: an article's parts never change order
          <BlockView key={at} block={block} place={place} />
        ))}
      </article>
    </>
  );
}
