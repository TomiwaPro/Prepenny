// The lint rules that keep the engine pure (CLAUDE.md, ARCHITECTURE.md "For
// future sessions: the engine"): no Date at all, no Math.random, no network,
// no storage and no imports from outside the package. These tests prove the
// rules catch each one, so a change to biome.json can't switch them off
// without a test failing.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const biome = join(repoRoot, 'node_modules', '.bin', 'biome');
const purityScript = join(repoRoot, 'scripts', 'check-engine-purity.ts');
const sandbox = mkdtempSync(join(tmpdir(), 'prepenny-purity-'));

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

// A copy of the real lint settings, in a folder of its own.
const config = JSON.parse(readFileSync(join(repoRoot, 'biome.json'), 'utf8'));
delete config.$schema;
delete config.vcs; // the sandbox isn't a git repository
write(join(sandbox, 'biome.json'), JSON.stringify(config));
cpSync(join(repoRoot, 'packages/engine/lint'), join(sandbox, 'packages/engine/lint'), {
  recursive: true,
});
write(join(sandbox, 'packages/engine/package.json'), '{ "name": "@prepenny/engine" }');

const badCode = `import { readFileSync } from 'node:fs';
import { thing } from 'some-package';

export const a: Date | null = null;
export const b = Date.now();
export const c = Math.random();
export const d = fetch('https://example.com');
export const e = localStorage.getItem('x');
export const f = indexedDB.open('x');
export const g = performance.now();
export const h = globalThis.crypto.randomUUID();
export const i = import('https://example.com/x.js');
console.log(readFileSync, thing);
`;

function lint(relativePath: string, code: string): { failed: boolean; output: string } {
  write(join(sandbox, relativePath), code);
  const run = spawnSync(biome, ['lint', '--max-diagnostics=100', relativePath], {
    cwd: sandbox,
    encoding: 'utf8',
  });
  return { failed: run.status !== 0, output: `${run.stdout}\n${run.stderr}` };
}

describe('Biome keeps the engine pure', () => {
  const { failed, output } = lint('packages/engine/src/bad.ts', badCode);

  it('fails on the bad file', () => {
    expect(failed).toBe(true);
  });

  it.each([
    ['Date, even as a type', 'bad.ts:4:', 'global variable Date'],
    ['Date.now', 'bad.ts:5:', 'global variable Date'],
    ['Math.random', 'bad.ts:6:', 'no Math.random'],
    ['fetch', 'bad.ts:7:', 'global variable fetch'],
    ['localStorage', 'bad.ts:8:', 'global variable localStorage'],
    ['indexedDB', 'bad.ts:9:', 'global variable indexedDB'],
    ['performance', 'bad.ts:10:', 'global variable performance'],
    ['globalThis', 'bad.ts:11:', 'global variable globalThis'],
    ['import()', 'bad.ts:12:', 'no import()'],
    ['console', 'bad.ts:13:', "Don't use console"],
    ['Node modules', 'bad.ts:1:', 'noNodejsModules'],
    ['outside packages', 'bad.ts:2:', 'noUndeclaredDependencies'],
  ])('catches %s', (_what, where, message) => {
    // Biome reports each problem as a header line ("…/bad.ts:5:18 lint/… ━━━")
    // followed by its message.
    const lines = output.split('\n');
    const problems = lines.flatMap((line, index) =>
      line.includes('━') ? [lines.slice(index, index + 4).join('\n')] : [],
    );
    const here = problems.filter((problem) => problem.includes(where));
    expect(
      here.some((problem) => problem.includes(message)),
      `${where} ${message}`,
    ).toBe(true);
  });

  it('leaves tests alone, which may use the clock and Node', () => {
    const tests = lint('packages/engine/test/fine.test.ts', 'export const now = Date.now();\n');
    expect(tests.output).not.toContain('global variable Date');
  });
});

describe('the purity script keeps imports inside the engine', () => {
  const runScript = (folder: string) =>
    spawnSync(process.execPath, [purityScript, folder], { encoding: 'utf8' });

  it('refuses an import that climbs out of the package', () => {
    const folder = join(sandbox, 'climb/src');
    write(join(folder, 'money/ok.ts'), "export { x } from '../dates/x.ts';\n");
    write(join(folder, 'dates/x.ts'), 'export const x = 1;\n');
    write(
      join(folder, 'bad.ts'),
      "import { y } from '../../../apps/web/lib/y.ts';\nexport { y };\n",
    );
    const run = runScript(folder);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('../../../apps/web/lib/y.ts');
    expect(run.stderr).not.toContain('ok.ts');
  });

  it('refuses a package import', () => {
    const folder = join(sandbox, 'package/src');
    write(join(folder, 'a.ts'), "import x from 'left-pad';\nexport default x;\n");
    const run = runScript(folder);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('"left-pad"');
  });

  it("passes the engine's own code", () => {
    const run = spawnSync(process.execPath, [purityScript], { encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('every import stays inside packages/engine/src');
  });
});
