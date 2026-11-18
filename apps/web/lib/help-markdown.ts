// The help centre's articles are Markdown files in content/help (brief 7.1,
// step 4g, D587), so they can change without changing code, and read well
// on GitHub too. This reads the little Markdown they use, and nothing else:
// anything it doesn't know stops the build with the line it's on, rather
// than showing people something half-read.
//
// - The first line is the title: "# Your balance is what's left after every payment".
// - The first paragraph after it is the article's summary, shown in lists and searches.
// - "## " starts a section; a blank line ends a paragraph.
// - "- " is a list, "1. " a numbered list; a line starting with two spaces carries on an item.
// - Inside text: **bold**, and [words](address) for a link. An address is
//   https://, tel: with the number's digits, mailto: with PrePenny's own
//   address, or another article's file, such as 04-updating-your-balance.md.
// - A paragraph starting "Checked:" is a note for whoever edits the article,
//   saying where and when a link or number was checked (D589). GitHub shows
//   it; PrePenny leaves it out, and out of searches.

export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'strong'; readonly text: string }
  | {
      readonly kind: 'link';
      readonly text: string;
      /** Another organisation's website, PrePenny's own page, a phone number, PrePenny's email address, or another article. */
      readonly to:
        | { readonly kind: 'web'; readonly href: string }
        | { readonly kind: 'site'; readonly path: string }
        | { readonly kind: 'phone'; readonly href: string }
        | { readonly kind: 'email'; readonly href: string }
        | { readonly kind: 'article'; readonly slug: string; readonly file: string };
    };

export type Block =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly inlines: readonly Inline[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly Inline[])[];
    };

export interface Article {
  /** Its file in content/help, such as 04-updating-your-balance.md. */
  readonly file: string;
  /** From the file's name: 04-updating-your-balance.md is "updating-your-balance". */
  readonly slug: string;
  /** Its place in lists: the file name's number. */
  readonly order: number;
  readonly title: string;
  /** The first paragraph, as plain text. */
  readonly summary: string;
  /** Everything after the title, the summary included. */
  readonly blocks: readonly Block[];
  /** The "Checked:" notes, for the tests (D589). */
  readonly checked: readonly string[];
}

/** An article's file name: two digits, a hyphen, then its slug. */
export const ARTICLE_FILE = /^(\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export class HelpFormatError extends Error {}

function fail(file: string, line: number, why: string): never {
  throw new HelpFormatError(`content/help/${file}, line ${line}: ${why}`);
}

/** The text of some inlines, as plain words. */
export function plainText(inlines: readonly Inline[]): string {
  return inlines.map((one) => one.text).join('');
}

/** PrePenny's own site: a link to it stays in the same tab, wherever PrePenny is open. */
const OWN_SITE = /^https:\/\/prepenny\.co\.uk(\/[a-z0-9/-]*)$/;

function linkTo(
  address: string,
  file: string,
  line: number,
): Extract<Inline, { kind: 'link' }>['to'] {
  const own = OWN_SITE.exec(address);
  if (own !== null) return { kind: 'site', path: own[1] as string };
  if (/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s()]*)?$/i.test(address)) {
    return { kind: 'web', href: address };
  }
  if (/^tel:\d{3,15}$/.test(address)) return { kind: 'phone', href: address };
  if (/^mailto:[a-z0-9.+-]+@prepenny\.co\.uk$/.test(address))
    return { kind: 'email', href: address };
  const article = ARTICLE_FILE.exec(address);
  if (article !== null) return { kind: 'article', slug: article[2] as string, file: address };
  return fail(
    file,
    line,
    `"${address}" isn't an address PrePenny links to: https://, tel: with digits, mailto: with PrePenny's own address, or another article's file.`,
  );
}

/** Reads **bold** and [words](address) in a line of text. */
export function readInlines(text: string, file = 'article.md', line = 1): Inline[] {
  const inlines: Inline[] = [];
  let rest = text;
  const pushText = (words: string) => {
    if (words === '') return;
    if (/[*_`<>[\]]/.test(words)) {
      fail(file, line, `"${words}" has Markdown PrePenny doesn't read (* _ \` < > [ ]).`);
    }
    const last = inlines.at(-1);
    if (last?.kind === 'text')
      inlines[inlines.length - 1] = { kind: 'text', text: last.text + words };
    else inlines.push({ kind: 'text', text: words });
  };
  while (rest !== '') {
    const strong = /^\*\*([^*]+)\*\*/.exec(rest);
    if (strong !== null) {
      inlines.push({ kind: 'strong', text: strong[1] as string });
      rest = rest.slice(strong[0].length);
      continue;
    }
    const link = /^\[([^\]]+)\]\(([^()\s]+)\)/.exec(rest);
    if (link !== null) {
      const words = link[1] as string;
      if (/[*_`<>[\]]/.test(words))
        fail(file, line, `A link's words, "${words}", have Markdown in them.`);
      inlines.push({ kind: 'link', text: words, to: linkTo(link[2] as string, file, line) });
      rest = rest.slice(link[0].length);
      continue;
    }
    const next = rest.slice(1).search(/\*\*|\[/);
    const end = next === -1 ? rest.length : next + 1;
    pushText(rest.slice(0, end));
    rest = rest.slice(end);
  }
  return inlines;
}

const LIST_ITEM = /^- (.*)$/;
const NUMBERED_ITEM = /^(\d+)\. (.*)$/;

/** Reads one article's file. */
export function readArticle(file: string, markdown: string): Article {
  const name = ARTICLE_FILE.exec(file);
  if (name === null) {
    fail(file, 1, 'An article file is named like 04-updating-your-balance.md.');
  }
  if (/\r/.test(markdown)) fail(file, 1, 'Save it with plain line endings (\\n).');
  const lines = markdown.split('\n');
  const titleLine = lines[0] ?? '';
  if (!titleLine.startsWith('# ')) fail(file, 1, 'The first line is the title, starting "# ".');
  const title = titleLine.slice(2).trim();
  if (title === '' || /[*[\]`]/.test(title)) fail(file, 1, 'The title is plain words.');

  const blocks: Block[] = [];
  const checked: string[] = [];
  let at = 1;
  const isBlank = (index: number) => (lines[index] ?? '').trim() === '';
  const startsBlock = (text: string) =>
    text.startsWith('#') || LIST_ITEM.test(text) || NUMBERED_ITEM.test(text);

  while (at < lines.length) {
    if (isBlank(at)) {
      at += 1;
      continue;
    }
    const text = lines[at] as string;
    const lineNumber = at + 1;
    if (text.startsWith('# ')) fail(file, lineNumber, 'Only the first line starts "# ".');
    if (text.startsWith('## ')) {
      const heading = text.slice(3).trim();
      if (heading === '' || /[*[\]`]/.test(heading))
        fail(file, lineNumber, 'A heading is plain words.');
      blocks.push({ kind: 'heading', text: heading });
      at += 1;
      continue;
    }
    if (text.startsWith('#')) fail(file, lineNumber, 'Use "## " for a section heading.');

    const numbered = NUMBERED_ITEM.test(text);
    if (LIST_ITEM.test(text) || numbered) {
      const items: Inline[][] = [];
      while (at < lines.length && !isBlank(at)) {
        const itemLine = lines[at] as string;
        const item = numbered ? NUMBERED_ITEM.exec(itemLine) : LIST_ITEM.exec(itemLine);
        if (item !== null) {
          if (numbered && Number(item[1]) !== items.length + 1) {
            fail(
              file,
              at + 1,
              `This step is number ${item[1]}; number the steps 1, 2, 3 in order.`,
            );
          }
          let words = (numbered ? item[2] : item[1]) as string;
          at += 1;
          while (at < lines.length && /^ {2}\S/.test(lines[at] as string)) {
            words += ` ${(lines[at] as string).trim()}`;
            at += 1;
          }
          items.push(readInlines(words.trim(), file, at));
          continue;
        }
        fail(
          file,
          at + 1,
          'A list carries on with "- " or the next number, or a line starting with two spaces.',
        );
      }
      blocks.push({ kind: 'list', ordered: numbered, items });
      continue;
    }

    const words: string[] = [];
    while (
      at < lines.length &&
      !isBlank(at) &&
      (words.length === 0 || !startsBlock(lines[at] as string))
    ) {
      words.push((lines[at] as string).trim());
      at += 1;
    }
    const paragraph = words.join(' ');
    if (paragraph.startsWith('Checked:')) {
      checked.push(paragraph.slice('Checked:'.length).trim());
      continue;
    }
    blocks.push({ kind: 'paragraph', inlines: readInlines(paragraph, file, lineNumber) });
  }

  const first = blocks[0];
  if (first?.kind !== 'paragraph') {
    fail(file, 2, 'After the title comes one paragraph saying what the article is about.');
  }
  return {
    file,
    slug: name[2] as string,
    order: Number(name[1]),
    title,
    summary: plainText(first.inlines),
    blocks,
    checked,
  };
}

/** Every piece of text people read in an article, for the voice check and searches. */
export function textsOf(article: Article): string[] {
  const texts = [article.title];
  for (const block of article.blocks) {
    if (block.kind === 'heading') texts.push(block.text);
    else if (block.kind === 'paragraph') texts.push(plainText(block.inlines));
    else for (const item of block.items) texts.push(plainText(item));
  }
  return texts;
}

/** Puts the articles in their order, and checks each slug and title is used once. */
export function inOrder(articles: readonly Article[]): Article[] {
  const sorted = [...articles].sort((a, b) => a.order - b.order);
  for (let i = 1; i < sorted.length; i += 1) {
    const before = sorted[i - 1] as Article;
    const one = sorted[i] as Article;
    if (one.order === before.order) {
      throw new HelpFormatError(`Two articles are number ${one.order}: give each its own.`);
    }
  }
  const slugs = new Set(sorted.map((one) => one.slug));
  if (slugs.size !== sorted.length) throw new HelpFormatError('Two articles have the same name.');
  const files = new Set(sorted.map((one) => one.file));
  for (const article of sorted) {
    for (const block of article.blocks) {
      const inlines =
        block.kind === 'paragraph' ? [block.inlines] : block.kind === 'list' ? block.items : [];
      for (const one of inlines.flat()) {
        if (one.kind === 'link' && one.to.kind === 'article' && !files.has(one.to.file)) {
          throw new HelpFormatError(
            `${article.file} links to "${one.to.file}", which isn't an article's file.`,
          );
        }
      }
    }
  }
  return sorted;
}
