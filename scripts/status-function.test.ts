// The rules of PrePenny's status function (step 4k, D644):
// supabase/functions/status/checks.ts, which the function itself runs in Deno.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  everyPart,
  functionAnswers,
  HEADERS,
  isVersion,
  onePart,
  partAsked,
  readDatabaseAnswer,
} from '../supabase/functions/status/checks.ts';

test('each part is asked for by its name, and no name means every part', () => {
  assert.equal(partAsked('?part=sign-in'), 'sign-in');
  assert.equal(partAsked('?part=saving'), 'saving');
  assert.equal(partAsked('?part=reminders'), 'reminders');
  assert.equal(partAsked('?part=app'), 'app');
  assert.equal(partAsked(''), null);
  assert.equal(partAsked('?part='), null);
  assert.equal(partAsked('?part=everything'), undefined);
  assert.equal(partAsked('?part=SIGN-IN'), undefined);
});

test('one part answers 200 when working and 503 when not, which is all UptimeRobot reads', () => {
  assert.deepEqual(onePart('saving', true), {
    status: 200,
    body: { part: 'saving', working: true },
  });
  assert.deepEqual(onePart('saving', false), {
    status: 503,
    body: { part: 'saving', working: false },
  });
});

test('every part at once answers 200, with a word for each, for the support dashboard', () => {
  const working = { app: true, 'sign-in': false, saving: true, reminders: false };
  assert.deepEqual(everyPart(working, '2026-11-21T14:05:00.000Z'), {
    status: 200,
    body: { working, checked_at: '2026-11-21T14:05:00.000Z' },
  });
});

test("the database's answer is read with care: anything unexpected counts as no answer", () => {
  assert.deepEqual(
    readDatabaseAnswer({ saving: true, reminders_job: false, site: 'https://prepenny.co.uk' }),
    { saving: true, remindersJob: false, site: 'https://prepenny.co.uk' },
  );
  assert.deepEqual(
    readDatabaseAnswer({
      saving: true,
      reminders_job: true,
      site: 'http://host.docker.internal:4189',
    }),
    { saving: true, remindersJob: true, site: 'http://host.docker.internal:4189' },
  );
  // A site with a path, or anything that isn't a site, isn't asked.
  assert.equal(
    readDatabaseAnswer({ saving: true, reminders_job: true, site: 'https://example.com/x' })?.site,
    null,
  );
  assert.equal(readDatabaseAnswer({ saving: 'yes', reminders_job: true }), null);
  assert.equal(readDatabaseAnswer(null), null);
  assert.equal(readDatabaseAnswer('saving'), null);
});

test('the app is working when its /version.json says which version it is', () => {
  assert.equal(isVersion({ database: '20261125200000', build: '2398b8758b76' }), true);
  assert.equal(isVersion({ database: '2026112520000', build: 'x' }), false);
  assert.equal(isVersion({ database: '20261125200000', build: '' }), false);
  assert.equal(isVersion('<html>PrePenny</html>'), false);
  assert.equal(isVersion(null), false);
});

test('the reminders function answers when it gives any answer of its own, never a server error', () => {
  assert.equal(functionAnswers(405), true);
  assert.equal(functionAnswers(200), true);
  assert.equal(functionAnswers(503), false);
  assert.equal(functionAnswers(546), false);
  assert.equal(functionAnswers(null), false);
});

test('answers are never kept, and the dashboard at its own address can read them', () => {
  assert.equal(HEADERS['Cache-Control'], 'no-store');
  assert.equal(HEADERS['Access-Control-Allow-Origin'], '*');
});
