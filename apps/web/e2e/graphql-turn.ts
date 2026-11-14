// GraphQL is switched off on the live database (step 4a, D509). The security
// tests switch it on in the local database to try every table through it,
// then off again, as the Database workflow does, to see it gives nothing
// once it's off. They take turns, so one test switching it off never meets
// another trying it on: a turn is a folder only one test can make at a time
// on this computer. A turn left by a test that was stopped part-way is taken
// back after 10 minutes, longer than any turn lasts.

import { mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TURN = join(tmpdir(), 'prepenny-graphql-turn');
const LONGEST = 10 * 60_000;

export async function inGraphQLTurn<T>(work: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      mkdirSync(TURN);
      break;
    } catch {
      try {
        if (Date.now() - statSync(TURN).mtimeMs > LONGEST) rmSync(TURN, { recursive: true });
      } catch {
        // Just taken back by another test: try again.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  try {
    return await work();
  } finally {
    rmSync(TURN, { recursive: true, force: true });
  }
}
