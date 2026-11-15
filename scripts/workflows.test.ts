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

// Step 4b (D527): every building block is checked for known security
// problems on every pull request and on main, and the live app and the
// database are updated only once that check has passed.
test('check.yml checks every building block on pull requests and on main, even when another check failed', () => {
  const text = readFileSync(join(folder, 'check.yml'), 'utf8');
  assert.match(text, /^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n/m);
  const step = text.slice(
    text.indexOf('- name: Check every building block for known security problems'),
  );
  assert.ok(step.length < text.length, 'the step is in check.yml');
  const until = step.indexOf('\n      - name:', 1);
  const body = until === -1 ? step : step.slice(0, until);
  assert.match(
    body,
    /BEFORE: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/,
  );
  assert.match(
    body,
    /node scripts\/check-building-blocks\.ts --before "\$RUNNER_TEMP\/pnpm-lock-before\.yaml"\n/,
  );
  assert.match(body, /else\n {12}node scripts\/check-building-blocks\.ts\n {10}fi\n/);
  assert.match(body, /if: \$\{\{ !cancelled\(\) && steps\.install\.outcome == 'success' \}\}/);
  assert.doesNotMatch(body, /continue-on-error/);
  assert.match(text, /- name: Install\n {8}id: install\n/);
});

for (const name of ['deploy.yml', 'database.yml']) {
  test(`${name} updates the live site only after the Check workflow passed on main`, () => {
    const text = readFileSync(join(folder, name), 'utf8');
    assert.match(
      text,
      /workflow_run:\n {4}workflows: \[Check\]\n {4}types: \[completed\]\n {4}branches: \[main\]/,
    );
    assert.match(text, /github\.event\.workflow_run\.conclusion == 'success'/);
  });
}

// Step 4b (D528): Dependabot's list is sent from main only, and only its
// one job may write, never the whole workflow.
test("building-blocks.yml sends main's list only, with write permission for its one job", () => {
  const text = readFileSync(join(folder, 'building-blocks.yml'), 'utf8');
  assert.match(text, /^on:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n/m);
  assert.match(text, /^permissions:\n {2}contents: read\n/m);
  assert.match(text, /if: github\.ref == 'refs\/heads\/main'/);
  assert.equal([...text.matchAll(/contents: write/g)].length, 1);
  assert.match(text, /\n {4}permissions:\n(?: {6}#.*\n)* {6}contents: write\n/);
  assert.match(
    text,
    /run: node scripts\/building-blocks-list\.ts > "\$RUNNER_TEMP\/building-blocks\.json"/,
  );
  assert.match(text, /dependency-graph\/snapshots/);
});

// Step 4b (D530): straight after the live app goes online, its pages are
// checked against the build just put online, and never on a preview.
test('deploy.yml checks the live pages straight after the live app goes online', () => {
  const text = readFileSync(join(folder, 'deploy.yml'), 'utf8');
  const online = text.indexOf('- name: Put the live app online');
  const check = text.indexOf("- name: Check the live pages are PrePenny's own");
  const preview = text.indexOf('- name: Upload a preview of this pull request');
  assert.ok(online > 0 && check > online && preview > check, 'in order: online, check, preview');
  const step = text.slice(check, preview);
  assert.match(
    step,
    /if: steps\.cloudflare\.outputs\.ready == 'true' && github\.event_name != 'pull_request'/,
  );
  assert.match(
    step,
    /working-directory: apps\/web\n {8}run: node scripts\/check-live-site\.ts https:\/\/prepenny\.co\.uk\n/,
  );
  assert.doesNotMatch(step, /continue-on-error/);
});

// Found in step 4b (D535): an edit to the building-block step once cut off
// the rest of check.yml, and with it the end-to-end tests on every push.
test('check.yml runs the end-to-end tests on main and on a ready pull request, after its first job', () => {
  const text = readFileSync(join(folder, 'check.yml'), 'utf8');
  const job = text.slice(text.indexOf('\n  end-to-end:\n'));
  assert.ok(job.length < text.length, 'check.yml has its end-to-end job');
  assert.match(
    job,
    /\n {4}if: github\.event_name == 'push' \|\| github\.event\.pull_request\.draft == false\n/,
  );
  assert.match(job, /\n {4}uses: \.\/\.github\/workflows\/end-to-end\.yml\n/);
  assert.ok(
    text.indexOf('- name: Check every building block for known security problems') <
      text.indexOf('\n  end-to-end:\n'),
    'the building-block check is a step of the first job',
  );
});
