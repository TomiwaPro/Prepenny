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
