// Checks every building block PrePenny uses for known security problems
// (step 4b, brief 7.2, PLAN.md item 10, D527). Run by GitHub's Check
// workflow on every pull request and on main.
//
// "Every building block" is every package in pnpm-lock.yaml: the engine's,
// the app's, and the tools that build and test them. pnpm asks npm's
// registry, and each known problem it answers with is one of GitHub's own
// advisories (it carries its GHSA number and a github.com/advisories link),
// the list Dependabot alerts use.
//
// A serious problem (high or critical) that a change brings in fails the
// check, so the change can't be merged with a green tick, and on main isn't
// put online (D175, D297). "Brings in" means the problem's version of the
// package wasn't in pnpm-lock.yaml before the change (--before). A serious
// problem already there before it is a warning on every run, and Dependabot
// alerts list it too: holding back an unrelated change wouldn't take it off
// the live site, and the change that updates it goes through the same check
// (D527). Less serious ones (moderate or low) are warnings. With no earlier
// lockfile to compare with, every serious problem counts as brought in.
//
// A problem accepted on purpose, by its id in pnpm-workspace.yaml's
// `auditConfig` (ignoreGhsas or ignoreCves), is counted and said, never
// hidden; any other setting that makes pnpm leave problems out fails it.
//
// Usage: node scripts/check-building-blocks.ts [folder] [--before earlier-pnpm-lock.yaml]
// The folder holds pnpm-lock.yaml; the repository's own by default.

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readLockfile } from './building-blocks-list.ts';

/** npm's levels, lowest first. */
const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'] as const;
export type Level = (typeof LEVELS)[number];

/** High or critical: these stop a change that brings one in (D527). */
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
  const count = counts.totalDependencies;
  if (typeof count !== 'number' || count <= 0) {
    throw new NotChecked("pnpm's answer didn't say how many building blocks it checked.");
  }
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
    ? 'It comes in only through the tools that build and test PrePenny, not the app people use'
    : "It comes in through the app's own building blocks";
  const from = /^>=\s*(\S+)$/.exec(problem.fixedIn)?.[1];
  const fix =
    problem.fixedIn === '' || problem.fixedIn === '<0.0.0'
      ? 'No fix yet.'
      : `Fixed in ${from === undefined ? `versions ${problem.fixedIn}` : `${from} or later`}.`;
  const path = problem.paths.length > 0 ? ` (${problem.paths.slice(0, 3).join('; ')})` : '';
  const link = problem.link === '' ? '' : ` Details: ${problem.link}`;
  return `${problem.name} ${versions} has a ${problem.level} known security problem: ${problem.title}. ${fix} ${where}${path}.${link}`;
}

/** What the check knows besides npm's answer. */
export interface Context {
  /** Every "name@version" in pnpm-lock.yaml before the change, when there's one to compare with. */
  readonly before?: ReadonlySet<string> | undefined;
  /** How many problems pnpm-workspace.yaml accepts on purpose by their id. */
  readonly acceptedById?: number;
}

/** True when the change brings the problem in: one of its versions wasn't there before. */
export function broughtIn(problem: Problem, before: ReadonlySet<string> | undefined): boolean {
  if (before === undefined) return true;
  return problem.versions.some((version) => !before.has(`${problem.name}@${version}`));
}

/** The lines the check prints, and whether it passed. */
export function report(
  checked: Checked,
  { before, acceptedById = 0 }: Context = {},
): { readonly passed: boolean; readonly lines: string[] } {
  const serious = checked.problems.filter((problem) => SERIOUS.includes(problem.level));
  const brought = serious.filter((problem) => broughtIn(problem, before));
  const alreadyThere = serious.filter((problem) => !broughtIn(problem, before));
  const lesser = checked.problems.filter(
    (problem) => !SERIOUS.includes(problem.level) && problem.level !== 'info',
  );
  const lines = [
    ...brought.map(
      (problem) =>
        `::error title=Serious known security problem::${oneLine(`${describe(problem)} This change brings it in.`)}`,
    ),
    ...alreadyThere.map(
      (problem) =>
        `::warning title=Serious known security problem, already in PrePenny::${oneLine(`${describe(problem)} It was there before this change, so it doesn't stop it, and Dependabot alerts list it: ask Claude Code to update it soon.`)}`,
    ),
    ...lesser.map(
      (problem) =>
        `::warning title=Known security problem, not serious::${oneLine(describe(problem))}`,
    ),
  ];
  const hidden = checked.accepted - acceptedById;
  if (hidden > 0) {
    lines.push(
      `::error title=Building blocks::pnpm left out ${hidden} known security ${hidden === 1 ? 'problem' : 'problems'} that ${hidden === 1 ? "isn't" : "aren't"} accepted on purpose by ${hidden === 1 ? 'its' : 'their'} id in pnpm-workspace.yaml. A setting there is hiding ${hidden === 1 ? 'it' : 'them'}, so nothing passes until it's taken out.`,
    );
  }
  const accepted =
    checked.accepted === 0 || hidden > 0
      ? ''
      : ` ${checked.accepted} known ${checked.accepted === 1 ? 'problem is' : 'problems are'} accepted on purpose in pnpm-workspace.yaml (auditConfig), each with its decision.`;
  if (brought.length > 0) {
    const them = brought.length === 1 ? 'it is' : 'they are';
    lines.push(
      `::error title=Building blocks::This change brings in ${brought.length} serious known security ${brought.length === 1 ? 'problem' : 'problems'} (high or critical), listed above. It can't go live until ${them} fixed: README.md, "Checks", says what to do.${accepted}`,
    );
    return { passed: false, lines };
  }
  if (hidden > 0) return { passed: false, lines };
  const there =
    alreadyThere.length === 0
      ? ''
      : ` ${alreadyThere.length} serious ${alreadyThere.length === 1 ? 'one was' : 'ones were'} already in PrePenny before it, listed above: ask Claude Code to update ${alreadyThere.length === 1 ? 'it' : 'them'} soon.`;
  const less =
    lesser.length === 0
      ? ''
      : ` ${lesser.length} less serious ${lesser.length === 1 ? 'one is' : 'ones are'} listed above as ${lesser.length === 1 ? 'a warning' : 'warnings'}, and ${lesser.length === 1 ? "doesn't" : "don't"} stop anything.`;
  lines.push(
    `Building blocks: ${checked.count} checked against the list of known security problems, and this change brings in no serious one.${there}${less}${accepted}`,
  );
  return { passed: true, lines };
}

/** How many problems pnpm-workspace.yaml accepts on purpose by id: auditConfig's ignoreGhsas and ignoreCves. */
export function acceptedIds(workspace: string): number {
  let inAudit = false;
  let inList = false;
  let count = 0;
  for (const line of workspace.split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      inAudit = line.startsWith('auditConfig:');
      inList = false;
      continue;
    }
    if (!inAudit) continue;
    const listKey = /^\s*(ignoreGhsas|ignoreCves):\s*(.*)$/.exec(line);
    if (listKey !== null) {
      const inline = (listKey[2] ?? '').trim();
      inList = inline === '';
      if (inline.startsWith('[')) {
        count += inline
          .slice(1, -1)
          .split(',')
          .filter((id) => id.trim() !== '').length;
      }
      continue;
    }
    if (/^\s*[A-Za-z]+:/.test(line)) {
      inList = false;
      continue;
    }
    if (inList && line.trim().startsWith('- ')) count += 1;
  }
  return count;
}

/** Asks npm's list about every building block in the folder's pnpm-lock.yaml. */
export function runAudit(folder: string): Promise<string> {
  return new Promise((done, failed) => {
    execFile(
      'pnpm',
      // Every level, whatever pnpm-workspace.yaml's auditLevel says: the check decides.
      ['audit', '--json', '--audit-level', 'info'],
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
  const args = process.argv.slice(2);
  const at = args.indexOf('--before');
  const beforeFile = at === -1 ? undefined : args[at + 1];
  const rest = at === -1 ? args : args.filter((_, index) => index !== at && index !== at + 1);
  const folder = resolve(rest[0] ?? resolve(import.meta.dirname, '..'));
  const before =
    beforeFile === undefined
      ? undefined
      : new Set(readLockfile(readFileSync(beforeFile, 'utf8')).packages.keys());
  const workspaceFile = join(folder, 'pnpm-workspace.yaml');
  const acceptedById = existsSync(workspaceFile)
    ? acceptedIds(readFileSync(workspaceFile, 'utf8'))
    : 0;
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
  if (before === undefined) {
    console.log(
      'No earlier pnpm-lock.yaml to compare with, so every serious problem counts as brought in.',
    );
  }
  const { passed, lines } = report(checked, { before, acceptedById });
  for (const line of lines) console.log(line);
  if (!passed) process.exit(1);
}

if (import.meta.main) await main();
