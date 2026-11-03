// Checks every word people read against docs/VOICE.md, and that the app keeps
// its words in the strings file. Run with `pnpm lint`.
//
// - The strings file (apps/web/strings/en-GB.ts) and the example plan's names
//   (apps/web/data/example-plan.ts) must have no banned word from VOICE.md,
//   no long dash (— or –), no exclamation mark and no emoji. The home-screen
//   app's details (apps/web/app/manifest.ts) take their words from the strings file.
// - The banned words are read from VOICE.md itself, so the list here can never
//   fall behind it.
// - Screens and parts (apps/web/app and apps/web/components) must have no
//   words of their own: no text between tags and no words in aria-label,
//   title, alt or placeholder. Every word comes from the strings file.
//
// Only text people read is checked: the words inside strings, never code
// comments or names inside the code (VOICE.md).
//
// Usage: node scripts/check-voice.ts

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

export interface VoiceRule {
  /** As VOICE.md writes it, for the message. */
  readonly words: string;
  readonly pattern: RegExp;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A rule from one item of VOICE.md's list. "..." stands for any words. */
function ruleFor(item: string): VoiceRule {
  const words = item.trim();
  const parts = words.split(/\s*\.\.\.\s*/);
  const pattern = parts
    .map((part) => escapeRegExp(part).replace(/'/g, "['’]").replace(/ /g, '\\s+'))
    .join('.+?');
  // A single word also catches its other forms: unlocked, journeys, empowering.
  const single = /^[a-z-]+$/i.test(words);
  return {
    words,
    pattern: new RegExp(single ? `\\b${pattern}[a-z]*\\b` : `\\b${pattern}`, 'iu'),
  };
}

/** Splits a list on commas that aren't inside quotes. */
function splitList(text: string): string[] {
  const items: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current);
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

/** The words for one item: the quoted part when there is one, as in `"smart" as praise`. */
function wordsOf(item: string): string {
  const quoted = /^"([^"]+)"/.exec(item);
  if (quoted?.[1] !== undefined) return quoted[1].trim();
  return item.replace(/\.$/, '').trim();
}

function listAfter(markdown: string, label: string): string[] {
  const start = markdown.indexOf(label);
  if (start < 0) {
    throw new Error(`VOICE.md has no "${label}". Update scripts/check-voice.ts to match it.`);
  }
  // The list is the next line with words on it.
  const rest = markdown.slice(start + label.length).replace(/^\s+/, '');
  const line = (rest.split('\n')[0] ?? '').trim();
  return splitList(line.replace(/\.$/, '')).map(wordsOf);
}

/** Every banned word and phrase in VOICE.md, as rules. */
export function rulesFromVoice(markdown: string): VoiceRule[] {
  const never = listAfter(markdown, 'Never use in the app:');
  const banned = listAfter(markdown, 'Banned in the app, website, emails and store listings:');
  return [...never, ...banned].map(ruleFor);
}

/** Long dashes, exclamation marks and emoji (VOICE.md). */
const marks: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'a long dash (—)', pattern: /—/u },
  { name: 'a long dash (–)', pattern: /–/u },
  { name: 'an exclamation mark', pattern: /!/u },
  { name: 'an emoji', pattern: /\p{Extended_Pictographic}/u },
];

/** What's wrong with one piece of text people read, if anything. */
export function voiceProblems(text: string, rules: readonly VoiceRule[]): string[] {
  const problems: string[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(text)) problems.push(`the banned "${rule.words}"`);
  }
  for (const mark of marks) {
    if (mark.pattern.test(text)) problems.push(mark.name);
  }
  return problems;
}

export interface Found {
  readonly text: string;
  readonly line: number;
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

/** The words inside every string in a TypeScript file: quotes and template text. */
export function stringsIn(code: string, fileName = 'file.ts'): Found[] {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
  const found: Found[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      found.push({ text: node.text, line: lineOf(source, node) });
    } else if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
      found.push({ text: parts.join('…'), line: lineOf(source, node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Attributes whose words people read or hear, including the parts' own, such as heading. */
const wordAttributes =
  /^(aria-label|aria-description|title|alt|placeholder|label|heading|message|detail|context|empty|figure|line|text|checked|account|balance|amount)$/;

/** Words written straight into a screen instead of coming from the strings file. */
export function wordsInScreens(code: string, fileName = 'file.tsx'): Found[] {
  const source = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: Found[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && /\p{L}/u.test(node.text)) {
      found.push({ text: node.text.trim(), line: lineOf(source, node) });
    } else if (
      ts.isJsxAttribute(node) &&
      wordAttributes.test(node.name.getText(source)) &&
      node.initializer !== undefined &&
      ts.isStringLiteral(node.initializer) &&
      /\p{L}/u.test(node.initializer.text)
    ) {
      found.push({ text: node.initializer.text, line: lineOf(source, node) });
    } else if (
      ts.isJsxExpression(node) &&
      node.expression !== undefined &&
      (ts.isStringLiteral(node.expression) ||
        ts.isNoSubstitutionTemplateLiteral(node.expression)) &&
      /\p{L}/u.test(node.expression.text) &&
      !ts.isJsxAttribute(node.parent)
    ) {
      found.push({ text: node.expression.text, line: lineOf(source, node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function filesIn(folder: string, pattern: RegExp): string[] {
  const files: string[] = [];
  for (const name of readdirSync(folder).sort()) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) files.push(...filesIn(path, pattern));
    else if (pattern.test(name)) files.push(path);
  }
  return files;
}

function main(): void {
  const root = resolve(import.meta.dirname, '..');
  const web = join(root, 'apps', 'web');
  const rules = rulesFromVoice(readFileSync(join(root, 'docs', 'VOICE.md'), 'utf8'));
  const problems: string[] = [];
  const where = (file: string, line: number) => `${relative(root, file)}:${line}`;

  const readFiles = [join(web, 'strings', 'en-GB.ts'), join(web, 'data', 'example-plan.ts')];
  let checked = 0;
  for (const file of readFiles) {
    for (const found of stringsIn(readFileSync(file, 'utf8'), file)) {
      checked += 1;
      for (const problem of voiceProblems(found.text, rules)) {
        problems.push(`${where(file, found.line)} has ${problem}: "${found.text}"`);
      }
    }
  }

  const screens = [
    ...filesIn(join(web, 'app'), /\.tsx$/),
    ...filesIn(join(web, 'components'), /\.tsx$/),
  ];
  for (const file of screens) {
    for (const found of wordsInScreens(readFileSync(file, 'utf8'), file)) {
      problems.push(
        `${where(file, found.line)} has its own words, "${found.text}". Put them in apps/web/strings/en-GB.ts.`,
      );
    }
  }

  if (problems.length > 0) {
    console.error(
      `Voice check failed (docs/VOICE.md):\n${problems.map((p) => `  ${p}`).join('\n')}`,
    );
    process.exit(1);
  }
  console.log(
    `Voice check: ${checked} pieces of text against ${rules.length} banned words and phrases, and ${screens.length} screens with no words of their own.`,
  );
}

if (import.meta.main) {
  main();
}
