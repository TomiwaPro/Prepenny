// Makes the list of every building block PrePenny uses, from pnpm-lock.yaml,
// in the form GitHub's dependency submission API takes (step 4b, D528). The
// "Dependabot's list" workflow sends it after every change to main, so
// Dependabot alerts cover PrePenny's packages.
//
// Why it's needed: pnpm 12 writes pnpm-lock.yaml as two YAML documents when
// a project pins its pnpm version, as PrePenny does (D77), and GitHub's own
// reading of lockfiles doesn't see the packages in that form. GitHub's
// documentation, read on 14 Nov 2026 ("Dependabot supported ecosystems and
// repositories", pnpm): "Dependabot alerts and Dependabot security updates
// are not created for those dependencies". And ("REST API endpoints for
// dependency submission"): "Submitted dependencies will receive Dependabot
// alerts and Dependabot security updates for any known vulnerabilities."
//
// Each package is named the standard way (a package URL, such as
// pkg:npm/%40supabase/supabase-js@2.118.0), and says whether PrePenny asks
// for it directly, and whether the app itself uses it ("runtime") or only
// the tools that build and test it ("development").
//
// Usage: node scripts/building-blocks-list.ts > list.json
// On GitHub, from GITHUB_SHA, GITHUB_REF, GITHUB_RUN_ID, GITHUB_WORKFLOW,
// GITHUB_JOB, GITHUB_SERVER_URL and GITHUB_REPOSITORY.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Scope = 'runtime' | 'development';

/** Everything the list needs from pnpm-lock.yaml. */
export interface Lockfile {
  /** Every package, as "name@version", with the packages it needs. */
  readonly packages: ReadonlyMap<string, readonly string[]>;
  /** The packages PrePenny's own package.json files ask for, and whether for the app or the tools. */
  readonly direct: ReadonlyMap<string, Scope>;
  /**
   * The names each package lets the package using it choose ("peers"),
   * such as Next.js's test tool: pnpm lists them with what it needs, but
   * they're there only when something else asks for them.
   */
  readonly peers: ReadonlyMap<string, ReadonlySet<string>>;
}

/** A key or a value without the quotes YAML may put round it. */
function unquote(text: string): string {
  const trimmed = text.trim();
  return /^'.*'$/.test(trimmed) || /^".*"$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

/** "next@16.4.3(react@19.3.1)" as "next@16.4.3": what goes in brackets is how pnpm told copies apart. */
function withoutPeers(text: string): string {
  const bracket = text.indexOf('(');
  return bracket === -1 ? text : text.slice(0, bracket);
}

/**
 * The package a name and its version in pnpm-lock.yaml stand for. A package
 * asked for under another name ("old-minimist": "npm:minimist@1.2.0") has
 * the real package as its version ("minimist@1.2.0").
 */
export function keyFor(name: string, version: string): string {
  const plain = withoutPeers(version);
  return /^@?[^@]+@/.test(plain) ? plain : `${name}@${plain}`;
}

/** "@supabase/supabase-js@2.118.0" as its name and version. */
export function nameAndVersion(key: string): { readonly name: string; readonly version: string } {
  const at = key.lastIndexOf('@');
  if (at <= 0) throw new Error(`"${key}" in pnpm-lock.yaml has no version.`);
  return { name: key.slice(0, at), version: key.slice(at + 1) };
}

/** The standard name of an npm package (purl-spec, "npm"). */
export function packageUrl(key: string): string {
  const { name, version } = nameAndVersion(key);
  const parts = name.split('/').map((part) => encodeURIComponent(part));
  return `pkg:npm/${parts.join('/')}@${encodeURIComponent(version)}`;
}

/** Each section of the importers that asks for packages, and what for. */
const SECTIONS: Readonly<Record<string, Scope>> = {
  dependencies: 'runtime',
  optionalDependencies: 'runtime',
  devDependencies: 'development',
  // pnpm itself, in the lockfile's first document.
  packageManagerDependencies: 'development',
};

/** Reads pnpm-lock.yaml: both documents, as pnpm 12 writes them. */
export function readLockfile(text: string): Lockfile {
  const packages = new Map<string, string[]>();
  const direct = new Map<string, Scope>();
  const peers = new Map<string, Set<string>>();
  let packageKey = '';
  let peerSection = false;
  /** Where each line is: the top-level part, and the names above it. */
  let part = '';
  let importerSection: Scope | null = null;
  let importerName = '';
  let snapshot = '';
  let snapshotSection = false;
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (line === '---') {
      part = '';
      continue;
    }
    const indent = line.length - line.trimStart().length;
    const [rawKey = '', ...rest] = line.trim().split(/:(?: |$)/);
    const key = unquote(rawKey);
    const value = unquote(rest.join(': '));
    if (indent === 0) {
      part = key;
      continue;
    }
    if (part === 'importers') {
      if (indent === 4) importerSection = SECTIONS[key] ?? null;
      else if (indent === 6) importerName = key;
      else if (indent === 8 && key === 'version' && importerSection !== null) {
        // A package of PrePenny's own, such as the engine, is a link, not a building block.
        if (value.startsWith('link:')) continue;
        const found = keyFor(importerName, value);
        if (direct.get(found) !== 'runtime') direct.set(found, importerSection);
      }
    } else if (part === 'packages') {
      if (indent === 2) {
        packageKey = key;
        if (!packages.has(key)) packages.set(key, []);
      } else if (indent === 4) {
        peerSection = key === 'peerDependencies';
      } else if (indent === 6 && peerSection) {
        const names = peers.get(packageKey) ?? new Set<string>();
        names.add(key);
        peers.set(packageKey, names);
      }
    } else if (part === 'snapshots') {
      if (indent === 2) {
        snapshot = withoutPeers(key);
        if (!packages.has(snapshot)) packages.set(snapshot, []);
      } else if (indent === 4) {
        snapshotSection = key === 'dependencies' || key === 'optionalDependencies';
      } else if (indent === 6 && snapshotSection && !value.startsWith('link:')) {
        const child = keyFor(key, value);
        const children = packages.get(snapshot) ?? [];
        if (!children.includes(child)) children.push(child);
        packages.set(snapshot, children);
      }
    }
  }
  if (packages.size === 0) throw new Error('pnpm-lock.yaml lists no packages.');
  for (const key of direct.keys()) {
    if (!packages.has(key))
      throw new Error(`${key} is asked for but not in pnpm-lock.yaml's packages.`);
  }
  return { packages, direct, peers };
}

/** Whether the app itself uses each package, or only the tools that build and test it. */
export function scopes(lock: Lockfile): Map<string, Scope> {
  const runtime = new Set<string>();
  const waiting = [...lock.direct].filter(([, scope]) => scope === 'runtime').map(([key]) => key);
  while (waiting.length > 0) {
    const key = waiting.pop() as string;
    if (runtime.has(key)) continue;
    runtime.add(key);
    const chosenByOthers = lock.peers.get(key) ?? new Set();
    waiting.push(
      ...(lock.packages.get(key) ?? []).filter(
        (child) => !chosenByOthers.has(nameAndVersion(child).name),
      ),
    );
  }
  return new Map(
    [...lock.packages.keys()].map((key) => [key, runtime.has(key) ? 'runtime' : 'development']),
  );
}

export interface Run {
  readonly sha: string;
  readonly ref: string;
  readonly runId: string;
  readonly correlator: string;
  readonly repositoryUrl: string;
  readonly scanned: string;
}

/** The snapshot GitHub's dependency submission API takes, for pnpm-lock.yaml. */
export function snapshot(lock: Lockfile, run: Run) {
  const scope = scopes(lock);
  const resolved: Record<string, unknown> = {};
  for (const [key, children] of [...lock.packages].sort(([a], [b]) => a.localeCompare(b))) {
    const url = packageUrl(key);
    resolved[url] = {
      package_url: url,
      relationship: lock.direct.has(key) ? 'direct' : 'indirect',
      scope: scope.get(key),
      dependencies: children.map(packageUrl),
    };
  }
  return {
    version: 0,
    sha: run.sha,
    ref: run.ref,
    job: { correlator: run.correlator, id: run.runId },
    detector: {
      name: 'prepenny-building-blocks',
      version: '1',
      url: `${run.repositoryUrl}/blob/main/scripts/building-blocks-list.ts`,
    },
    scanned: run.scanned,
    manifests: {
      'pnpm-lock.yaml': {
        name: 'pnpm-lock.yaml',
        file: { source_location: 'pnpm-lock.yaml' },
        resolved,
      },
    },
  };
}

function main() {
  const need = (name: string) => {
    const value = process.env[name];
    if (value === undefined || value === '')
      throw new Error(`${name} isn't set: run this on GitHub.`);
    return value;
  };
  const lock = readLockfile(
    readFileSync(join(import.meta.dirname, '..', 'pnpm-lock.yaml'), 'utf8'),
  );
  const body = snapshot(lock, {
    sha: need('GITHUB_SHA'),
    ref: need('GITHUB_REF'),
    runId: need('GITHUB_RUN_ID'),
    correlator: `${need('GITHUB_WORKFLOW')} ${need('GITHUB_JOB')}`,
    repositoryUrl: `${need('GITHUB_SERVER_URL')}/${need('GITHUB_REPOSITORY')}`,
    scanned: new Date().toISOString(),
  });
  process.stdout.write(`${JSON.stringify(body)}\n`);
  const counts = scopes(lock);
  const forApp = [...counts.values()].filter((scope) => scope === 'runtime').length;
  console.error(
    `${lock.packages.size} building blocks: ${forApp} the app uses, ${lock.packages.size - forApp} only the tools that build and test it.`,
  );
}

if (import.meta.main) main();
