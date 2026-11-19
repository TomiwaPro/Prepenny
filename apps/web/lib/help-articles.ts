// Reads the help centre's articles from content/help when PrePenny is built
// (step 4g, D587). Only the pages that are built from them use this: what
// reaches the phone is the built pages, never the files.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARTICLE_FILE, type Article, inOrder, readArticle } from './help-markdown.ts';

/** content/help, from apps/web, where Next.js builds and the tests run. */
export const HELP_FOLDER = join(process.cwd(), '..', '..', 'content', 'help');

/** Every article, in order. A file that isn't an article, other than README.md, stops the build. */
export function helpArticles(folder = HELP_FOLDER): Article[] {
  const articles: Article[] = [];
  for (const file of readdirSync(folder).sort()) {
    if (file === 'README.md') continue;
    if (!ARTICLE_FILE.test(file)) {
      throw new Error(
        `content/help/${file} isn't named like an article, such as 04-updating-your-balance.md.`,
      );
    }
    articles.push(readArticle(file, readFileSync(join(folder, file), 'utf8')));
  }
  return inOrder(articles);
}

/** One article, by its slug. */
export function helpArticle(slug: string): Article {
  const article = helpArticles().find((one) => one.slug === slug);
  if (article === undefined) throw new Error(`There's no help article "${slug}".`);
  return article;
}
