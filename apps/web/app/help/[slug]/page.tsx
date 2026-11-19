// One help article on the website, at /help/<its name>/ (step 4g, D587),
// built from its Markdown in content/help.

import type { Metadata } from 'next';
import { HelpArticle } from '../../../components/HelpArticle.tsx';
import { HelpSite } from '../../../components/HelpSite.tsx';
import { helpArticle, helpArticles } from '../../../lib/help-articles.ts';

export const dynamicParams = false;

export function generateStaticParams() {
  return helpArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  const article = helpArticle((await params).slug);
  return { title: article.title, description: article.summary };
}

export default async function HelpArticlePage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  return (
    <HelpSite>
      <HelpArticle article={helpArticle((await params).slug)} place="site" />
    </HelpSite>
  );
}
