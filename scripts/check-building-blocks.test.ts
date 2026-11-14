// Tests for scripts/check-building-blocks.ts (step 4b, D527). Run with `pnpm test` (node --test).
//
// npm's answers below are pnpm 12's own (`pnpm audit --json`), recorded on
// 14 Nov 2026, cut to the parts the check reads. The last test asks npm's
// real list about a known-bad version, in a folder of its own outside the
// repository: it's never written into a file here, so GitHub's Dependabot
// alerts don't list it as PrePenny's.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe as group, it } from 'node:test';
import { promisify } from 'node:util';
import {
  acceptedIds,
  broughtIn,
  NotChecked,
  type Problem,
  readAudit,
  report,
} from './check-building-blocks.ts';

const run = promisify(execFile);
const SCRIPT = join(import.meta.dirname, 'check-building-blocks.ts');

/** minimist 1.2.5, critical, in the app's own building blocks, by two ways. */
const CRITICAL = {
  advisories: {
    '1097678': {
      findings: [
        {
          version: '1.2.5',
          paths: ['apps__web>minimist', 'apps__web>mkdirp>minimist'],
          dev: false,
        },
      ],
      id: 1097678,
      title: 'Prototype Pollution in minimist',
      module_name: 'minimist',
      vulnerable_versions: '>=1.0.0 <1.2.6',
      patched_versions: '>=1.2.6',
      severity: 'critical',
      github_advisory_id: 'GHSA-xvch-5gv4-984h',
      url: 'https://github.com/advisories/GHSA-xvch-5gv4-984h',
    },
  },
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 1 },
    totalDependencies: 332,
  },
};

/** lodash 4.17.20, high, only through a tool that builds the app. */
const HIGH_IN_TOOLS = {
  advisories: {
    '1106913': {
      findings: [{ version: '4.17.20', paths: ['apps__web>@serwist/cli>lodash'], dev: true }],
      title: 'Command Injection in lodash',
      module_name: 'lodash',
      patched_versions: '>=4.17.21',
      severity: 'high',
      url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
    },
  },
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 },
    totalDependencies: 332,
  },
};

/** Two less serious ones: moderate and low. */
const LESSER = {
  advisories: {
    '1': {
      findings: [{ version: '4.17.20', paths: ['.>lodash'], dev: true }],
      title: 'Regular Expression Denial of Service (ReDoS) in lodash',
      module_name: 'lodash',
      patched_versions: '>=4.17.21',
      severity: 'moderate',
      url: 'https://github.com/advisories/GHSA-29mw-wpgm-hmr9',
    },
    '2': {
      findings: [{ version: '1.0.0', paths: ['packages__engine>tiny'], dev: true }],
      title: 'A small one',
      module_name: 'tiny',
      patched_versions: '<0.0.0',
      severity: 'low',
      url: '',
    },
  },
  metadata: {
    vulnerabilities: { info: 0, low: 1, moderate: 1, high: 0, critical: 0 },
    totalDependencies: 332,
  },
};

const NONE = {
  advisories: {},
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    totalDependencies: 332,
  },
};

/** The critical minimist problem, as the check reads it. */
function minimist(): Problem {
  const [problem] = readAudit(JSON.stringify(CRITICAL)).problems;
  if (problem === undefined) throw new Error('No problem read.');
  return problem;
}

group('reading npm’s answer', () => {
  it('a critical problem the change brings in fails the check, naming the building block, its version, the fix and where it comes in', () => {
    const { passed, lines } = report(readAudit(JSON.stringify(CRITICAL)));
    assert.equal(passed, false);
    assert.equal(lines.length, 2);
    assert.equal(
      lines[0],
      "::error title=Serious known security problem::minimist 1.2.5 has a critical known security problem: Prototype Pollution in minimist. Fixed in 1.2.6 or later. It comes in through the app's own building blocks (apps/web > minimist; apps/web > mkdirp > minimist). Details: https://github.com/advisories/GHSA-xvch-5gv4-984h This change brings it in.",
    );
    assert.match(
      lines[1] ?? '',
      /^::error title=Building blocks::This change brings in 1 serious known security problem/,
    );
    assert.match(lines[1] ?? '', /It can't go live until it is fixed/);
  });

  it('a high one fails it too, even when it comes in only through the tools that build PrePenny', () => {
    const { passed, lines } = report(readAudit(JSON.stringify(HIGH_IN_TOOLS)));
    assert.equal(passed, false);
    assert.match(lines[0] ?? '', /lodash 4\.17\.20 has a high known security problem/);
    assert.match(
      lines[0] ?? '',
      /comes in only through the tools that build and test PrePenny, not the app people use \(apps\/web > @serwist\/cli > lodash\)/,
    );
  });

  it('a serious problem already in PrePenny before the change is a warning, and the change passes', () => {
    const before = new Set(['minimist@1.2.5', 'next@16.4.3']);
    const { passed, lines } = report(readAudit(JSON.stringify(CRITICAL)), { before });
    assert.equal(passed, true);
    assert.match(
      lines[0] ?? '',
      /^::warning title=Serious known security problem, already in PrePenny::minimist 1\.2\.5 has a critical known security problem.* It was there before this change, so it doesn't stop it, and Dependabot alerts list it: ask Claude Code to update it soon\.$/,
    );
    assert.equal(
      lines[1],
      'Building blocks: 332 checked against the list of known security problems, and this change brings in no serious one. 1 serious one was already in PrePenny before it, listed above: ask Claude Code to update it soon.',
    );
  });

  it('a new version of the package with the problem counts as brought in, even when an older one was there', () => {
    const before = new Set(['minimist@1.2.0']);
    assert.equal(report(readAudit(JSON.stringify(CRITICAL)), { before }).passed, false);
    assert.equal(broughtIn({ ...minimist(), versions: ['1.2.0', '1.2.5'] }, before), true);
    assert.equal(broughtIn(minimist(), undefined), true);
  });

  it('moderate and low ones are warnings, and pass', () => {
    const { passed, lines } = report(readAudit(JSON.stringify(LESSER)));
    assert.equal(passed, true);
    assert.match(lines[0] ?? '', /^::warning title=Known security problem, not serious::lodash/);
    assert.match(
      lines[1] ?? '',
      /^::warning .*tiny 1\.0\.0 has a low known security problem: A small one\. No fix yet\./,
    );
    assert.equal(
      lines[2],
      "Building blocks: 332 checked against the list of known security problems, and this change brings in no serious one. 2 less serious ones are listed above as warnings, and don't stop anything.",
    );
  });

  it('none passes, and says how many were checked', () => {
    assert.deepEqual(report(readAudit(JSON.stringify(NONE))), {
      passed: true,
      lines: [
        'Building blocks: 332 checked against the list of known security problems, and this change brings in no serious one.',
      ],
    });
  });

  it('a problem accepted on purpose by its id in pnpm-workspace.yaml is said, never hidden', () => {
    // pnpm leaves it off the list and keeps it in the count, as it did for
    // GHSA-xvch-5gv4-984h in auditConfig.ignoreGhsas on 14 Nov 2026.
    const accepted = {
      ...NONE,
      metadata: { ...NONE.metadata, vulnerabilities: { ...CRITICAL.metadata.vulnerabilities } },
    };
    const { passed, lines } = report(readAudit(JSON.stringify(accepted)), { acceptedById: 1 });
    assert.equal(passed, true);
    assert.match(
      lines[0] ?? '',
      /1 known problem is accepted on purpose in pnpm-workspace\.yaml \(auditConfig\), each with its decision\.$/,
    );
  });

  it('a problem pnpm leaves out for any other reason fails the check', () => {
    // As with auditLevel: critical in pnpm-workspace.yaml, found by the outside review.
    const left = {
      ...NONE,
      metadata: {
        ...NONE.metadata,
        vulnerabilities: { ...HIGH_IN_TOOLS.metadata.vulnerabilities },
      },
    };
    const { passed, lines } = report(readAudit(JSON.stringify(left)));
    assert.equal(passed, false);
    assert.match(
      lines[0] ?? '',
      /^::error title=Building blocks::pnpm left out 1 known security problem that isn't accepted on purpose by its id/,
    );
  });

  it('counts the ids pnpm-workspace.yaml accepts on purpose, as a list or on one line', () => {
    assert.equal(acceptedIds('packages:\n  - apps/*\n'), 0);
    assert.equal(
      acceptedIds(
        'auditConfig:\n  ignoreGhsas:\n    - GHSA-xvch-5gv4-984h\n    # why: D600\n    - GHSA-35jh-r3h4-6jhm\n  ignoreCves: [CVE-2021-44906]\noverrides:\n  - not-this\n',
      ),
      3,
    );
  });

  it("a problem's words can't start a new line in GitHub's log", () => {
    const sneaky = structuredClone(CRITICAL);
    sneaky.advisories['1097678'].title = 'Bad\n::warning::looks fine 100%';
    const { lines } = report(readAudit(JSON.stringify(sneaky)));
    assert.equal(
      lines.every((line) => !line.includes('\n')),
      true,
    );
    assert.match(lines[0] ?? '', /Bad%0A::warning::looks fine 100%25/);
  });

  it("an answer that isn't npm's list means nothing was checked", () => {
    for (const printed of [
      '',
      'ERR_PNPM_AUDIT_BAD_RESPONSE',
      '{"error":"down"}',
      '[]',
      '{"advisories":{}}',
      '{"advisories":{},"metadata":{"totalDependencies":0}}',
    ]) {
      assert.throws(() => readAudit(printed), NotChecked, printed);
    }
    assert.throws(
      () => readAudit(JSON.stringify({ advisories: { '1': { severity: 'awful' } }, metadata: {} })),
      NotChecked,
    );
  });
});

/** minimist 1.2.5 in pnpm-lock.yaml, as pnpm 12 writes it. */
const KNOWN_BAD_LOCKFILE = [
  "lockfileVersion: '9.0'",
  '',
  'settings:',
  '  autoInstallPeers: true',
  '  excludeLinksFromLockfile: false',
  '',
  'importers:',
  '',
  '  .:',
  '    dependencies:',
  '      minimist:',
  '        specifier: 1.2.5',
  '        version: 1.2.5',
  '',
  'packages:',
  '',
  '  minimist@1.2.5:',
  '    resolution: {integrity: sha512-FM9nNUYrRBAELZQT3xeZQ7fmMOBg6nWNmJKTcgsJeaLstP/UODVpGsr5OhXhhXg6f+qtJ8uiZ+PUxkDWcgIXLw==}',
  '',
  'snapshots:',
  '',
  '  minimist@1.2.5: {}',
  '',
].join('\n');

/** A folder of its own, outside the repository, with the known-bad version and, if given, pnpm-workspace.yaml. */
async function knownBadFolder(workspace?: string): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'prepenny-known-bad-'));
  const own = JSON.parse(
    await readFile(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
  ) as {
    packageManager: string;
  };
  await writeFile(
    join(folder, 'package.json'),
    JSON.stringify({
      name: 'known-bad',
      private: true,
      packageManager: own.packageManager,
      dependencies: { minimist: '1.2.5' },
    }),
  );
  await writeFile(join(folder, 'pnpm-lock.yaml'), KNOWN_BAD_LOCKFILE);
  if (workspace !== undefined) await writeFile(join(folder, 'pnpm-workspace.yaml'), workspace);
  return folder;
}

/** Runs the check as GitHub does, and gives back how it ended and what it printed. */
function check(...args: string[]): Promise<{ code: number; stdout: string }> {
  return run(process.execPath, [SCRIPT, ...args]).then(
    ({ stdout }) => ({ code: 0, stdout }),
    (error: { code: number; stdout: string }) => error,
  );
}

group("npm's real list", () => {
  it('a known-bad version fails the check: minimist 1.2.5, critical (GHSA-xvch-5gv4-984h)', async () => {
    const folder = await knownBadFolder();
    try {
      const ran = await check(folder);
      assert.equal(ran.code, 1, ran.stdout);
      assert.match(
        ran.stdout,
        /^::error title=Serious known security problem::minimist 1\.2\.5 has a critical known security problem: Prototype Pollution in minimist\. Fixed in 1\.2\.6 or later\./m,
      );
      assert.match(ran.stdout, /GHSA-xvch-5gv4-984h/);
      assert.doesNotMatch(ran.stdout, /couldn't be read/);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('the same version already there before the change is a warning, and the change passes', async () => {
    const folder = await knownBadFolder();
    try {
      const before = join(folder, 'before-lock.yaml');
      await writeFile(before, KNOWN_BAD_LOCKFILE);
      const ran = await check(folder, '--before', before);
      assert.equal(ran.code, 0, ran.stdout);
      assert.match(
        ran.stdout,
        /^::warning title=Serious known security problem, already in PrePenny::minimist 1\.2\.5/m,
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it("a pnpm setting can't hide it: auditLevel critical, or ignoring every problem without a fix", async () => {
    for (const workspace of ['auditLevel: critical\n', 'auditConfig:\n  ignoreUnfixable: true\n']) {
      const folder = await knownBadFolder(workspace);
      try {
        const ran = await check(folder);
        assert.equal(ran.code, 1, `${workspace}: ${ran.stdout}`);
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    }
  });
});
