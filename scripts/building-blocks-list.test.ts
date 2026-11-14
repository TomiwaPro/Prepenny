// Tests for scripts/building-blocks-list.ts (step 4b, D528). Run with `pnpm test` (node --test).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { packageUrl, readLockfile, scopes, snapshot } from './building-blocks-list.ts';

/** A lockfile as pnpm 12 writes it with a pinned pnpm: pnpm itself first, then the project. */
const TWO_DOCUMENTS = `---
lockfileVersion: '9.0'

importers:

  .:
    configDependencies: {}
    packageManagerDependencies:
      pnpm:
        specifier: 12.16.1
        version: 12.16.1

packages:

  pnpm@12.16.1:
    resolution: {integrity: sha512-x}
    hasBin: true

snapshots:

  pnpm@12.16.1: {}

---
lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      typescript:
        specifier: 6.0.3
        version: 6.0.3

  apps/web:
    dependencies:
      '@prepenny/engine':
        specifier: workspace:*
        version: link:../../packages/engine
      next:
        specifier: 16.4.3
        version: 16.4.3(@playwright/test@1.64.1)(react@19.3.1)
      react:
        specifier: 19.3.1
        version: 19.3.1
    devDependencies:
      '@playwright/test':
        specifier: 1.64.1
        version: 1.64.1

packages:

  '@playwright/test@1.64.1':
    resolution: {integrity: sha512-a}

  next@16.4.3:
    resolution: {integrity: sha512-b}
    peerDependencies:
      '@playwright/test': ^1.51.1
      react: ^19.0.0
    peerDependenciesMeta:
      '@playwright/test':
        optional: true

  react@19.3.1:
    resolution: {integrity: sha512-c}

  styled-jsx@5.1.6:
    resolution: {integrity: sha512-d}

  typescript@6.0.3:
    resolution: {integrity: sha512-e}

snapshots:

  '@playwright/test@1.64.1': {}

  next@16.4.3(@playwright/test@1.64.1)(react@19.3.1):
    dependencies:
      '@playwright/test': 1.64.1
      react: 19.3.1
      styled-jsx: 5.1.6(react@19.3.1)
    optionalDependencies:
      typescript: 6.0.3

  react@19.3.1: {}

  styled-jsx@5.1.6(react@19.3.1):
    dependencies:
      react: 19.3.1

  typescript@6.0.3: {}
`;

const RUN = {
  sha: 'ce587453ced02b1526dfb4cb910479d431683101',
  ref: 'refs/heads/main',
  runId: '42',
  correlator: "Dependabot's list Send GitHub the list",
  repositoryUrl: 'https://github.com/TomiwaPro/Prepenny',
  scanned: '2026-11-14T21:00:00.000Z',
};

describe('reading pnpm-lock.yaml', () => {
  it('reads both documents: pnpm itself, and every package of the project', () => {
    const lock = readLockfile(TWO_DOCUMENTS);
    assert.deepEqual([...lock.packages.keys()].sort(), [
      '@playwright/test@1.64.1',
      'next@16.4.3',
      'pnpm@12.16.1',
      'react@19.3.1',
      'styled-jsx@5.1.6',
      'typescript@6.0.3',
    ]);
    assert.deepEqual(lock.packages.get('next@16.4.3'), [
      '@playwright/test@1.64.1',
      'react@19.3.1',
      'styled-jsx@5.1.6',
      'typescript@6.0.3',
    ]);
  });

  it("knows what PrePenny's own package.json files ask for, and leaves out its own packages", () => {
    const lock = readLockfile(TWO_DOCUMENTS);
    assert.deepEqual(Object.fromEntries(lock.direct), {
      'pnpm@12.16.1': 'development',
      'typescript@6.0.3': 'development',
      'next@16.4.3': 'runtime',
      'react@19.3.1': 'runtime',
      '@playwright/test@1.64.1': 'development',
    });
  });

  it('the app uses what its own building blocks need, but not what they only let others choose', () => {
    const scope = scopes(readLockfile(TWO_DOCUMENTS));
    assert.equal(scope.get('next@16.4.3'), 'runtime');
    assert.equal(scope.get('styled-jsx@5.1.6'), 'runtime');
    assert.equal(scope.get('typescript@6.0.3'), 'runtime', "next's optional part is the app's");
    // Next.js lets whoever uses it choose a test tool; PrePenny's tests do.
    assert.equal(scope.get('@playwright/test@1.64.1'), 'development');
    assert.equal(scope.get('pnpm@12.16.1'), 'development');
  });

  it('names each package the standard way', () => {
    assert.equal(
      packageUrl('@supabase/supabase-js@2.118.0'),
      'pkg:npm/%40supabase/supabase-js@2.118.0',
    );
    assert.equal(packageUrl('next@16.4.3'), 'pkg:npm/next@16.4.3');
    assert.equal(packageUrl('thing@1.0.0-beta.1+build.2'), 'pkg:npm/thing@1.0.0-beta.1%2Bbuild.2');
  });

  it("refuses a lockfile it can't read, rather than sending an empty list", () => {
    assert.throws(() => readLockfile("lockfileVersion: '9.0'\n"), /lists no packages/);
    assert.throws(
      () =>
        readLockfile(
          'importers:\n  .:\n    dependencies:\n      left-pad:\n        specifier: 1.0.0\n        version: 1.0.0\npackages:\n  other@1.0.0:\n    resolution: {integrity: x}\n',
        ),
      /left-pad@1\.0\.0 is asked for but not in pnpm-lock\.yaml's packages/,
    );
  });
});

describe('the snapshot for GitHub', () => {
  it('has every field GitHub requires, for pnpm-lock.yaml', () => {
    const body = snapshot(readLockfile(TWO_DOCUMENTS), RUN);
    assert.equal(body.version, 0);
    assert.equal(body.sha, RUN.sha);
    assert.equal(body.ref, 'refs/heads/main');
    assert.deepEqual(body.job, { correlator: RUN.correlator, id: '42' });
    assert.deepEqual(body.detector, {
      name: 'prepenny-building-blocks',
      version: '1',
      url: 'https://github.com/TomiwaPro/Prepenny/blob/main/scripts/building-blocks-list.ts',
    });
    assert.equal(body.scanned, RUN.scanned);
    const manifest = body.manifests['pnpm-lock.yaml'];
    assert.deepEqual(manifest.file, { source_location: 'pnpm-lock.yaml' });
    assert.deepEqual(manifest.resolved['pkg:npm/next@16.4.3'], {
      package_url: 'pkg:npm/next@16.4.3',
      relationship: 'direct',
      scope: 'runtime',
      dependencies: [
        'pkg:npm/%40playwright/test@1.64.1',
        'pkg:npm/react@19.3.1',
        'pkg:npm/styled-jsx@5.1.6',
        'pkg:npm/typescript@6.0.3',
      ],
    });
    assert.deepEqual(manifest.resolved['pkg:npm/styled-jsx@5.1.6'], {
      package_url: 'pkg:npm/styled-jsx@5.1.6',
      relationship: 'indirect',
      scope: 'runtime',
      dependencies: ['pkg:npm/react@19.3.1'],
    });
  });

  it("lists every package in PrePenny's own pnpm-lock.yaml, and each one it needs", () => {
    const text = readFileSync(join(import.meta.dirname, '..', 'pnpm-lock.yaml'), 'utf8');
    const resolved = snapshot(readLockfile(text), RUN).manifests['pnpm-lock.yaml']
      .resolved as Record<string, { relationship: string; scope: string; dependencies: string[] }>;
    // Every package key in the "packages" part of both documents.
    const inPackages = [...text.matchAll(/^packages:\n([\s\S]*?)\n(?=\S)/gm)]
      .map((found) => found[1])
      .join('\n');
    const keys = [...inPackages.matchAll(/^ {2}'?((?:@[^/\s']+\/)?[^@\s'(]+@[^:'(\s]+)'?:/gm)].map(
      (found) => packageUrl(found[1] as string),
    );
    assert.ok(keys.length > 300, `${keys.length} packages`);
    assert.deepEqual(Object.keys(resolved).sort(), [...new Set(keys)].sort());
    for (const one of Object.values(resolved)) {
      for (const child of one.dependencies) assert.ok(child in resolved, child);
    }
    const scope = (url: string) => resolved[url]?.scope;
    for (const url of [
      'pkg:npm/next@16.4.3',
      'pkg:npm/react@19.3.1',
      'pkg:npm/%40supabase/supabase-js@2.118.0',
      'pkg:npm/dexie@4.4.7',
      'pkg:npm/serwist@9.5.13',
      'pkg:npm/zod@4.6.7',
    ]) {
      assert.equal(scope(url), 'runtime', url);
      assert.equal(resolved[url]?.relationship, 'direct', url);
    }
    for (const url of [
      'pkg:npm/%40playwright/test@1.64.1',
      'pkg:npm/wrangler@4.151.3',
      'pkg:npm/vitest@5.0.5',
      'pkg:npm/typescript@6.0.3',
      'pkg:npm/pnpm@12.16.1',
    ]) {
      assert.equal(scope(url), 'development', url);
    }
  });
});
