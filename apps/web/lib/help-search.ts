// Searching the help centre (step 4g, D588). It runs on the phone, over the
// articles' words built into the page, so it works with no signal, and
// nothing is sent or kept: not the words searched for, nor which article is
// opened. The words aren't put in the page's address either, so they never
// reach PrePenny's site or the browser's history.

import { type Article, textsOf } from './help-markdown.ts';

/** One article as the search reads it. */
export interface SearchEntry {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly headings: readonly string[];
  /** Every sentence of the article, the summary included. */
  readonly sentences: readonly string[];
}

export interface SearchResult {
  readonly slug: string;
  readonly title: string;
  /** The sentence the first word searched for is in, or the summary. */
  readonly line: string;
}

/** Words too common to tell articles apart. */
const COMMON = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'be',
  'can',
  'do',
  'does',
  'for',
  'from',
  'get',
  'how',
  'i',
  'if',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'the',
  'to',
  'what',
  'when',
  'where',
  'why',
  'with',
  'you',
  'your',
]);

/**
 * Words people may use for what the articles call something else: a search
 * for one finds the other too.
 */
const ALSO: Readonly<Record<string, readonly string[]>> = {
  overdrawn: ['short', 'overdraft'],
  shortfall: ['short'],
  login: ['sign'],
  log: ['sign'],
  logout: ['sign'],
  password: ['code', 'sign'],
  email: ['email', 'sign'],
  remove: ['delete'],
  erase: ['delete'],
  wages: ['pay'],
  salary: ['pay'],
  payday: ['pay'],
  partner: ['share', 'partner'],
  couple: ['share', 'partner'],
  joint: ['share', 'joint'],
  bill: ['payment', 'bill'],
  bills: ['payment', 'bill'],
  loan: ['debt', 'loan'],
  owe: ['debt', 'owe'],
  worried: ['tight', 'help'],
  struggling: ['tight', 'help'],
  abuse: ['abuse', 'safe'],
  controlling: ['control'],
};

/** Lower case, curly apostrophes made straight, and anything but letters, digits and £ taken out. */
function wordsIn(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^a-z0-9£']+/)
    .map((word) => word.replace(/^'+|'+$/g, '').replace(/'s$/, ''))
    .filter((word) => word !== '');
}

/** A word without its usual endings: "updating", "updated" and "updates" are all "updat". */
function stem(word: string): string {
  for (const ending of ['ing', 'ies', 'ed', 'es', 's']) {
    if (word.length > ending.length + 3 && word.endsWith(ending)) {
      return word.slice(0, -ending.length);
    }
  }
  return word;
}

/** Whether a word in an article answers a word searched for: the same word, its other forms, or the start of it. */
function answers(articleWord: string, searched: string): boolean {
  if (articleWord.startsWith(searched)) return true;
  const a = stem(articleWord);
  const b = stem(searched);
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  return shorter.length >= 4 && longer.startsWith(shorter);
}

/** The words searched for that count, each with the other words that find the same thing. */
function searchedWords(query: string): (readonly string[])[] {
  return wordsIn(query)
    .filter((word) => !COMMON.has(word))
    .map((word) => [word, ...(ALSO[word] ?? [])]);
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.:])\s+(?=[A-Z0-9£"“])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');
}

/** Whether a search has any word that counts: "how do I" alone doesn't. */
export function hasSearchWords(query: string): boolean {
  return searchedWords(query).length > 0;
}

/** What the search reads of each article. */
export function searchEntries(articles: readonly Article[]): SearchEntry[] {
  return articles.map((article) => {
    const [, ...texts] = textsOf(article);
    return {
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      headings: article.blocks.flatMap((block) => (block.kind === 'heading' ? [block.text] : [])),
      sentences: texts.flatMap(sentencesOf),
    };
  });
}

function matchesAny(text: string, choices: readonly string[]): boolean {
  const words = wordsIn(text);
  return choices.some((choice) => words.some((word) => answers(word, choice)));
}

/**
 * The articles that have every word searched for, or another word for it,
 * best first: a word in the title counts most, then in a section heading,
 * then the summary, then anywhere. Empty when nothing searched for counts.
 */
export function searchHelp(entries: readonly SearchEntry[], query: string): SearchResult[] {
  const searched = searchedWords(query);
  if (searched.length === 0) return [];
  const found: { readonly result: SearchResult; readonly score: number; readonly at: number }[] =
    [];
  entries.forEach((entry, at) => {
    let score = 0;
    for (const choices of searched) {
      let best = 0;
      if (matchesAny(entry.title, choices)) best = 8;
      else if (entry.headings.some((heading) => matchesAny(heading, choices))) best = 4;
      else if (matchesAny(entry.summary, choices)) best = 2;
      else if (entry.sentences.some((sentence) => matchesAny(sentence, choices))) best = 1;
      if (best === 0) return;
      score += best;
    }
    const first = searched[0] as readonly string[];
    const line = entry.sentences.find((sentence) => matchesAny(sentence, first)) ?? entry.summary;
    found.push({ result: { slug: entry.slug, title: entry.title, line }, score, at });
  });
  return found.sort((a, b) => b.score - a.score || a.at - b.at).map((one) => one.result);
}
