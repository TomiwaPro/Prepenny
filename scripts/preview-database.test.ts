// Tests for scripts/preview-database.ts (step 3e-2, D405). Run with `pnpm test` (node --test).

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { decide, type Migration, migrationsIn, recordSql } from './preview-database.ts';

const main: Migration[] = [
  { version: '20261105100000', sha256: 'a'.repeat(64) },
  { version: '20261111100000', sha256: 'b'.repeat(64) },
];
const withOneMore: Migration[] = [...main, { version: '20261112100000', sha256: 'c'.repeat(64) }];
const has = (migrations: readonly Migration[], fingerprints = migrations) => ({
  applied: migrations.map((one) => one.version),
  fingerprints,
});

describe('What happens to the preview database for a pull request', () => {
  it('a new preview database gets every database change', () => {
    assert.deepEqual(decide({ applied: [], fingerprints: [] }, main), {
      action: 'add',
      why: 'The preview database has no database changes yet, so all of them are added.',
      adding: ['20261105100000', '20261111100000'],
    });
  });

  it("nothing changes when it has exactly this pull request's, so two pull requests without database changes share it", () => {
    assert.equal(decide(has(main), main).action, 'nothing');
  });

  it("only this pull request's new database change is added when it has every earlier one", () => {
    assert.deepEqual(decide(has(main), withOneMore), {
      action: 'add',
      why: 'The preview database has every earlier database change, so the new one is added: 20261112100000.',
      adding: ['20261112100000'],
    });
  });

  it("starts again when another pull request's database change is there", () => {
    const other = [...main, { version: '20261112200000', sha256: 'd'.repeat(64) }];
    assert.equal(decide(has(other), withOneMore).action, 'start-again');
    // A pull request without database changes, after one with them.
    assert.equal(decide(has(withOneMore), main).action, 'start-again');
  });

  it('starts again when a change it has was written differently, as when a later commit edits it', () => {
    const edited = [main[0] as Migration, { version: '20261111100000', sha256: 'e'.repeat(64) }];
    assert.equal(decide(has(main), edited).action, 'start-again');
  });

  it("starts again when it can't tell, as with changes but no fingerprints", () => {
    assert.equal(decide(has(main, []), main).action, 'start-again');
  });

  it("knows the repository's own database changes, oldest first, by their words", () => {
    const folder = mkdtempSync(join(tmpdir(), 'migrations-'));
    writeFileSync(join(folder, '20261111100000_later.sql'), 'select 2;');
    writeFileSync(join(folder, '20261105100000_first.sql'), 'select 1;');
    writeFileSync(join(folder, 'notes.md'), 'not a change');
    const found = migrationsIn(folder);
    assert.deepEqual(
      found.map((one) => one.version),
      ['20261105100000', '20261111100000'],
    );
    assert.match(found[0]?.sha256 ?? '', /^[0-9a-f]{64}$/);
    // Every file in supabase/migrations is one of them.
    assert(migrationsIn(join(import.meta.dirname, '..', 'supabase', 'migrations')).length >= 14);
  });

  it('notes the fingerprints and the pull request in a schema of its own, which nobody signed in can reach', () => {
    const sql = recordSql(withOneMore, 31);
    assert.match(sql, /create schema if not exists preview/);
    assert.match(sql, /revoke all on schema preview from public, anon, authenticated/);
    assert.match(sql, /\('20261112100000', 'c{64}'\)/);
    assert.match(sql, /values \(31\)/);
  });
});
