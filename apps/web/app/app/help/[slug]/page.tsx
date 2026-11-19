// One help article in the app, at /app/help/<its name>/ (step 4g, D587),
// built from its Markdown in content/help.

import type { Metadata } from 'next';
import { HelpArticle } from '../../../../components/HelpArticle.tsx';
import { helpArticle, helpArticles } from '../../../../lib/help-articles.ts';

export const dynamicParams = false;

export function generateStaticParams() {
  return helpArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  return { title: helpArticle((await params).slug).title };
}

export default async function AppHelpArticlePage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  return <HelpArticle article={helpArticle((await params).slug)} place="app" />;
}
