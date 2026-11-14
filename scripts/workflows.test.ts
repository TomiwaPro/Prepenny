// The GitHub workflows never write a secret into the text of a database
// query (step 3i, D494). A query that fails can be written to Supabase's
// database logs, and the key with it. A key goes as one of the query's
// parameters instead, as `select app.use_resend($1)` with `parameters`.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const folder = join(import.meta.dirname, '..', '.github', 'workflows');
const workflows = readdirSync(folder).filter((name) => name.endsWith('.yml'));

/** Every secret a workflow hands to a step, by the name the step reads it as. */
function secretsIn(text: string): string[] {
  return [...text.matchAll(/^\s*([A-Z0-9_]+):\s*\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/gm)].map(
    (found) => found[1] as string,
  );
}

test('the workflows hand secrets to their steps, so there is something to check', () => {
  const all = workflows.flatMap((name) => secretsIn(readFileSync(join(folder, name), 'utf8')));
  assert.ok(all.includes('RESEND_API_KEY'), 'RESEND_API_KEY is one of them');
});

for (const name of workflows) {
  test(`${name} writes no secret into a query's text`, () => {
    const text = readFileSync(join(folder, name), 'utf8');
    for (const secret of secretsIn(text)) {
      const inQuery = text.split('\n').filter((line) => {
        // The text of a query: `--arg query "..."`, `query="..."` or `{query: ...}`.
        const start = line.search(/--arg query |\bquery=|\bquery: /);
        return start >= 0 && line.slice(start).includes(`$${secret}`);
      });
      assert.deepEqual(inQuery, [], `${secret} is written into a query in ${name}`);
    }
  });
}

// Every workflow that starts the local Supabase first keeps its ports, 54320
// to 54329, out of the range the machine hands out to other connections, so
// none can be taken just as it starts (step 3i, D503).
for (const name of workflows) {
  test(`${name} keeps the local Supabase's ports clear before starting it`, () => {
    const text = readFileSync(join(folder, name), 'utf8');
    const starts = text.indexOf('supabase start');
    if (starts < 0) return;
    const range = /ip_local_port_range="(\d+) (\d+)"/.exec(text.slice(0, starts));
    assert.ok(range !== null, `${name} sets the range before \`supabase start\``);
    const [low, high] = [Number(range[1]), Number(range[2])];
    assert.ok(low > 54329 || high < 54320, `${name}'s range leaves 54320 to 54329 out`);
  });
}

// Every workflow that starts the local Supabase in the background waits for
// it before its first end-to-end test, so no test shares the machine with
// Supabase being downloaded and started (step 3i, D506).
for (const name of workflows) {
  test(`${name} waits for the local Supabase before any end-to-end test`, () => {
    const text = readFileSync(join(folder, name), 'utf8');
    const started = text.indexOf("nohup bash -c 'supabase start");
    const firstTest = text.indexOf('playwright test');
    if (started < 0 || firstTest < 0) return;
    const waited = text.indexOf('until [ -f "$RUNNER_TEMP/supabase-start.exit" ]');
    assert.ok(waited > started, `${name} waits for the local Supabase it started`);
    assert.ok(waited < firstTest, `${name} waits for it before \`playwright test\``);
  });
}

// GraphQL stays off (step 4a, D509): the Database workflow, and the preview
// database's job, look on every run, after the database changes, with the
// database's own step, which switches it off again if it's on.
for (const [name, job] of [
  ['database.yml', 'Change the real database'],
  ['deploy.yml', "Give the preview database this pull request's database changes"],
] as const) {
  test(`${name} checks GraphQL is still off on every run, after the database changes`, () => {
    const text = readFileSync(join(folder, name), 'utf8');
    const changes = text.indexOf(`- name: ${job}`);
    const check = text.indexOf('- name: Check GraphQL is still off');
    assert.ok(changes >= 0, `${name} changes the database`);
    assert.ok(check > changes, `${name} checks GraphQL after the database changes`);
    const step = text.slice(check, text.indexOf('\n      - name:', check + 1));
    assert.match(step, /select app\.keep_graphql_off\(\)/);
    assert.match(step, /if: steps\.supabase\.outputs\.ready == 'true'\n/);
    assert.match(step, /switched-off\)/);
    assert.match(step, /exit 1/);
  });
}
