// Checks every building block PrePenny uses for known security problems
// (step 4b, brief 7.2, PLAN.md item 10, D527). Run by GitHub's Check
// workflow on every pull request and on main: a serious one, high or
// critical, fails the check, so the change can't be merged with a green
// tick, and on main the live app isn't updated until it's fixed (D175, D297).
//
// "Every building block" is every package in pnpm-lock.yaml: the engine's,
// the app's, and the tools that build and test them. pnpm asks npm's list of
// known problems, which is GitHub's own list, the one Dependabot alerts use
// (D527). Less serious ones (moderate or low) are listed as warnings and
// don't fail the check. A problem accepted on purpose, by its GitHub id in
// pnpm-workspace.yaml's `auditConfig`, is counted and said, never hidden.
//
// Usage: node scripts/check-building-blocks.ts [folder]
// The folder holds pnpm-lock.yaml; the repository's own by default.

import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

/** npm's levels, lowest first. */
const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'] as const;
export type Level = (typeof LEVELS)[number];

/** High or critical: these stop a change (D527). */
export const SERIOUS: readonly Level[] = ['high', 'critical'];

/** How long npm has to answer, before the check says so and fails. */
const TIME_LIMIT_MS = 180_000;

/** One known problem in one building block. */
export interface Problem {
  readonly name: string;
  readonly versions: readonly string[];
  readonly level: Level;
  readonly title: string;
  readonly fixedIn: string;
  readonly link: string;
  /** Where it comes in, as "apps/web > @serwist/cli > glob". */
  readonly paths: readonly string[];
  /** True when it comes in only through the tools that build and test PrePenny. */
  readonly toolsOnly: boolean;
}

export interface Checked {
  readonly problems: readonly Problem[];
  /** How many building blocks npm was asked about. */
  readonly count: number;
  /** Problems npm found that pnpm-workspace.yaml accepts on purpose. */
  readonly accepted: number;
}

/** Thrown when npm's answer can't be read, so nothing was checked. */
export class NotChecked extends Error {}

function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

/** "apps__web>@serwist/cli>glob" as "apps/web > @serwist/cli > glob"; "." is the repository itself. */
function readablePath(path: string): string {
  return path
    .split('>')
    .map((part) => (part === '.' ? 'the repository' : part.replaceAll('__', '/')))
    .join(' > ');
}

/** Reads what `pnpm audit --json` printed. */
export function readAudit(printed: string): Checked {
  let answer: unknown;
  try {
    answer = JSON.parse(printed);
  } catch {
    throw new NotChecked("pnpm's answer wasn't the list it should be.");
  }
  if (typeof answer !== 'object' || answer === null) {
    throw new NotChecked("pnpm's answer wasn't the list it should be.");
  }
  const { advisories, metadata } = answer as { advisories?: unknown; metadata?: unknown };
  if (typeof advisories !== 'object' || advisories === null) {
    throw new NotChecked("pnpm's answer had no list of known problems.");
  }
  const counts =
    typeof metadata === 'object' && metadata !== null
      ? (metadata as { vulnerabilities?: Record<string, unknown>; totalDependencies?: unknown })
      : {};
  const problems: Problem[] = [];
  for (const one of Object.values(advisories)) {
    const advisory = one as {
      module_name?: unknown;
      severity?: unknown;
      title?: unknown;
      patched_versions?: unknown;
      url?: unknown;
      findings?: unknown;
    };
    if (typeof advisory.module_name !== 'string' || !isLevel(advisory.severity)) {
      throw new NotChecked('pnpm listed a known problem without its name or how serious it is.');
    }
    const findings = Array.isArray(advisory.findings)
      ? (advisory.findings as { version?: unknown; paths?: unknown; dev?: unknown }[])
      : [];
    problems.push({
      name: advisory.module_name,
      versions: [...new Set(findings.map((finding) => String(finding.version)))],
      level: advisory.severity,
      title: typeof advisory.title === 'string' ? advisory.title : 'No title given',
      fixedIn: typeof advisory.patched_versions === 'string' ? advisory.patched_versions : '',
      link: typeof advisory.url === 'string' ? advisory.url : '',
      paths: findings.flatMap((finding) =>
        Array.isArray(finding.paths) ? finding.paths.map((path) => readablePath(String(path))) : [],
      ),
      toolsOnly: findings.length > 0 && findings.every((finding) => finding.dev === true),
    });
  }
  const found = LEVELS.reduce((sum, level) => {
    const count = counts.vulnerabilities?.[level];
    return sum + (typeof count === 'number' ? count : 0);
  }, 0);
  // npm counts each known problem once, however many ways it comes in.
  const listed = problems.length;
  const count = typeof counts.totalDependencies === 'number' ? counts.totalDependencies : 0;
  return { problems, count, accepted: Math.max(0, found - listed) };
}

/** A message for GitHub's log, on one line (GitHub's own escaping). */
function oneLine(text: string): string {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

/** What one problem is, in words. */
export function describe(problem: Problem): string {
  const versions = problem.versions.join(' and ');
  const where = problem.toolsOnly
    ? "It's only in the tools that build and test PrePenny, not in the app people use"
    : "It's in a building block the app itself uses";
  const from = /^>=\s*(\S+)$/.exec(problem.fixedIn)?.[1];
  const fix =
    problem.fixedIn === '' || problem.fixedIn === '<0.0.0'
      ? 'No fix yet.'
      : `Fixed in ${from === undefined ? `versions ${problem.fixedIn}` : `${from} or later`}.`;
  const path = problem.paths.length > 0 ? ` (${problem.paths.slice(0, 3).join('; ')})` : '';
  const link = problem.link === '' ? '' : ` Details: ${problem.link}`;
  return `${problem.name} ${versions} has a ${problem.level} known security problem: ${problem.title}. ${fix} ${where}${path}.${link}`;
}

/** The lines the check prints, and whether it passed. */
export function report(checked: Checked): { readonly passed: boolean; readonly lines: string[] } {
  const serious = checked.problems.filter((problem) => SERIOUS.includes(problem.level));
  const lesser = checked.problems.filter(
    (problem) => !SERIOUS.includes(problem.level) && problem.level !== 'info',
  );
  const lines = [
    ...serious.map(
      (problem) => `::error title=Serious known security problem::${oneLine(describe(problem))}`,
    ),
    ...lesser.map(
      (problem) =>
        `::warning title=Known security problem, not serious::${oneLine(describe(problem))}`,
    ),
  ];
  const accepted =
    checked.accepted === 0
      ? ''
      : ` ${checked.accepted} known ${checked.accepted === 1 ? 'problem is' : 'problems are'} accepted on purpose in pnpm-workspace.yaml (auditConfig), each with its decision.`;
  if (serious.length > 0) {
    const them = serious.length === 1 ? 'it is' : 'they are';
    lines.push(
      `::error title=Building blocks::${serious.length} serious known security ${serious.length === 1 ? 'problem' : 'problems'} (high or critical) in PrePenny's building blocks, listed above. This change can't go live until ${them} fixed: README.md, "Checks", says what to do.${accepted}`,
    );
    return { passed: false, lines };
  }
  const less =
    lesser.length === 0
      ? ''
      : ` ${lesser.length} less serious ${lesser.length === 1 ? 'one is' : 'ones are'} listed above as ${lesser.length === 1 ? 'a warning' : 'warnings'}, and ${lesser.length === 1 ? "doesn't" : "don't"} stop anything.`;
  lines.push(
    `Building blocks: ${checked.count} checked against GitHub's list of known security problems, and none has a serious one.${less}${accepted}`,
  );
  return { passed: true, lines };
}

/** Asks npm's list about every building block in the folder's pnpm-lock.yaml. */
export function runAudit(folder: string): Promise<string> {
  return new Promise((done, failed) => {
    execFile(
      'pnpm',
      ['audit', '--json'],
      { cwd: folder, timeout: TIME_LIMIT_MS, maxBuffer: 64 * 1024 * 1024 },
      (error, printed, problems) => {
        // pnpm stops with 1 when it lists a problem; the list is still printed.
        if (printed.trim().startsWith('{')) {
          done(printed);
          return;
        }
        const why =
          error?.killed === true
            ? `npm didn't answer within ${TIME_LIMIT_MS / 60_000} minutes.`
            : '';
        failed(
          new NotChecked(
            `${why} pnpm said: ${`${problems}\n${printed}`.trim().split('\n').slice(0, 10).join(' | ')}`.trim(),
          ),
        );
      },
    );
  });
}

async function main() {
  const folder = resolve(process.argv[2] ?? resolve(import.meta.dirname, '..'));
  let checked: Checked;
  try {
    checked = readAudit(await runAudit(folder));
  } catch (error) {
    if (!(error instanceof NotChecked)) throw error;
    console.log(
      `::error title=Building blocks not checked::npm's list of known security problems couldn't be read, so nothing was checked. Run the check again in a few minutes. ${oneLine(error.message)}`,
    );
    process.exit(1);
  }
  const { passed, lines } = report(checked);
  for (const line of lines) console.log(line);
  if (!passed) process.exit(1);
}

if (import.meta.main) await main();
