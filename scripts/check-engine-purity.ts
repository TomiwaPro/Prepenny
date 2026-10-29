// Checks that every import in the engine stays inside the engine's own src folder.
// Biome's rules in biome.json block the clock, randomness, network, storage and outside
// packages; this script adds the one thing Biome can't see: a relative import such as
// '../../../apps/web/x.ts' that climbs out of the package.
//
// Usage: node scripts/check-engine-purity.ts [folder]
// The folder defaults to packages/engine/src.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const repoRoot = resolve(import.meta.dirname, '..');
const folder = resolve(process.argv[2] ?? join(repoRoot, 'packages', 'engine', 'src'));

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

function lineOf(text: string, position: number): number {
  return text.slice(0, position).split('\n').length;
}

const problems: string[] = [];
const files = sourceFiles(folder);

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const info = ts.preProcessFile(text, true, true);
  const where = (position: number) => `${relative(repoRoot, file)}:${lineOf(text, position)}`;

  for (const ref of info.importedFiles) {
    const specifier = ref.fileName;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
      problems.push(
        `${where(ref.pos)} imports "${specifier}". The engine imports only its own files.`,
      );
      continue;
    }
    const target = resolve(dirname(file), specifier);
    if (target !== folder && !target.startsWith(folder + sep)) {
      problems.push(
        `${where(ref.pos)} imports "${specifier}", which is outside ${relative(repoRoot, folder)}.`,
      );
    }
  }

  const references = [
    ...info.referencedFiles,
    ...info.typeReferenceDirectives,
    ...info.libReferenceDirectives,
  ];
  for (const ref of references) {
    problems.push(`${where(ref.pos)} has a /// reference to "${ref.fileName}". Remove it.`);
  }
}

if (problems.length > 0) {
  console.error(`Engine purity check failed:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `Engine purity check: ${files.length} files, every import stays inside ${relative(repoRoot, folder)}.`,
);
