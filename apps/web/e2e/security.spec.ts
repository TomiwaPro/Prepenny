// Brief 8.7 test 2, in full (step 3i): Jess's private records, with their
// real ids, against every request Tom could make. Against the local
// Supabase, with Jess and Tom on two phones as in brief 8.7 (README.md,
// "Checks"). Run once, at 360px: it's about the server, not the screen.
//
// Jess makes a plan on her phone, shares her current account and invites Tom
// with "Can edit". On her own private account she has a payment (ticked in
// an Update balance), a debt and a savings goal, and her history has a
// payment she added and took away before she shared anything. Then each of
// these tries every way in:
//
// - Tom, who can edit the shared plan;
// - Alex, who has signed in but is in no plan;
// - someone who isn't signed in;
// - Tom again, once Jess has made him "Can view only".
//
// Every way in, with each of Jess's real ids:
// 1. every table, through the Data API (read, change, remove, add), and the
//    parts of the database it doesn't show;
// 2. every table through GraphQL (read, change, remove), turned on for this
//    test as it can be on Supabase's own projects;
// 3. every database step anyone signed in, or not, can call;
// 4. every live-update channel: Jess's own, the plan's, and her records' ids,
//    private and public, listening and sending;
// 5. the get-back-in function, with Jess's address, and Supabase's own
//    administrator routes.
//
// Each must give nothing of Jess's private records and change nothing of
// them, nor of her account. Alex and someone signed out get nothing of the
// plan at all, and "Can view only" changes nothing shared. Each kind of
// request is first seen to work on something the person may see, so no check
// can pass by testing nothing.

import { type Page, test } from '@playwright/test';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { LOCAL_SUPABASE } from '../lib/sign-in-config.ts';
import { expect } from './fixtures.ts';
import { addAccount, allSentOn, jessAndTom, planOf } from './jess-and-tom.ts';
import { addPayment, updateBalance } from './journeys.ts';
import { radio } from './setup.ts';
import { newEmail } from './sign-in-helpers.ts';
import { personOn, quoted, secondPhone, signIn, sql } from './two-phones.ts';

/** One of Jess's records, as the database has it. */
interface Kept {
  readonly table: string;
  readonly id: string;
  readonly version: number | null;
  readonly name: string | null;
}

/** Someone trying their way in: their sign-in token, or none. */
interface Who {
  readonly name: string;
  readonly token: string | null;
}

/** What a request gave back. */
interface Answer {
  readonly status: number;
  readonly text: string;
}

/** The sign-in token kept on a phone. */
async function tokenOn(page: Page): Promise<string> {
  return page.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem('prepenny-sign-in') ?? 'null') as {
      access_token: string;
    };
    return kept.access_token;
  });
}

const tablesOfRecords = () =>
  sql("select string_agg(t, ',') from unnest(app.record_tables()) t").split(',');

/** Every public table the Data API could show. */
const everyTable = () =>
  sql(
    "select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname = 'public'",
  ).split(',');

/** Every record in the plan: Jess's private ones, or the shared ones. */
function recordsIn(plan: string, privateTo: string | null): Kept[] {
  const found: Kept[] = [];
  for (const table of tablesOfRecords()) {
    const rows = sql(`select coalesce(json_agg(json_build_object('id', r.id, 'version', r.version,
        'name', to_jsonb(r) ->> 'name')), '[]') from public.${table} r
      where r.plan_id = ${quoted(plan)} and r.private_to ${privateTo === null ? 'is null' : `= ${quoted(privateTo)}`}`);
    for (const row of JSON.parse(rows) as {
      id: string;
      version: number | null;
      name: string | null;
    }[]) {
      found.push({ table, ...row });
    }
  }
  return found;
}

/** The changes in the plan's history only Jess can see. */
const privateEdits = (plan: string, jess: string): Kept[] =>
  sql(`select coalesce(string_agg(id::text, ','), '') from public.edits
    where plan_id = ${quoted(plan)} and private_to = ${quoted(jess)}`)
    .split(',')
    .filter((id) => id !== '')
    .map((id) => ({ table: 'edits', id, version: null, name: null }));

/**
 * Everything of Jess's that must not change: her private records, her
 * private history and the copies in it, her account, her sign-in sessions,
 * the plan's members and its own row; and with `shared`, every shared record
 * and the rest of the history too.
 */
function fingerprint(plan: string, jess: string, shared: boolean): string {
  const parts: string[] = [];
  for (const table of tablesOfRecords()) {
    parts.push(
      sql(`select coalesce(md5(string_agg(to_jsonb(r)::text, '|' order by r.id)), '') from public.${table} r
        where r.plan_id = ${quoted(plan)}
          and (r.private_to = ${quoted(jess)} ${shared ? 'or r.private_to is null' : ''})`),
    );
  }
  parts.push(
    sql(`select coalesce(md5(string_agg(to_jsonb(e)::text, '|' order by e.id)), '') from public.edits e
      where e.plan_id = ${quoted(plan)} and (e.private_to = ${quoted(jess)} ${shared ? 'or true' : ''})`),
    sql(`select coalesce(md5(string_agg(to_jsonb(r)::text, '|' order by r.edit_id, r.record_table, r.record_id)), '')
      from app.edit_records r where r.plan_id = ${quoted(plan)}
        and (${quoted(jess)} in (r.before_private, r.after_private) ${shared ? 'or true' : ''})`),
    sql(`select md5(to_jsonb(p)::text) from public.plans p where p.id = ${quoted(plan)}`),
    sql(`select md5(string_agg(to_jsonb(m)::text, '|' order by m.person_id)) from public.plan_members m
      where m.plan_id = ${quoted(plan)}`),
    sql(`select md5(json_build_array(u.email, u.encrypted_password, u.email_confirmed_at, u.phone,
        u.raw_app_meta_data, u.raw_user_meta_data, u.banned_until, u.deleted_at)::text)
      from auth.users u where u.id = ${quoted(jess)}`),
    sql(`select count(*) || ':' || coalesce(md5(string_agg(s.id::text, ',' order by s.id)), '')
      from auth.sessions s where s.user_id = ${quoted(jess)}`),
    sql(`select coalesce(md5(string_agg(to_jsonb(b)::text, '|')), '') from app.backup_emails b
      where b.person_id = ${quoted(jess)}`),
    sql(`select coalesce(md5(string_agg(to_jsonb(g)::text, '|')), '') from app.get_back_in g
      where g.person_id = ${quoted(jess)}`),
    sql(`select md5(to_jsonb(p)::text) from public.people p where p.id = ${quoted(jess)}`),
  );
  return parts.join('/');
}

const VERSION = () => sql('select app.database_version()');

function headers(who: Who, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: LOCAL_SUPABASE.key,
    'Content-Type': 'application/json',
    'x-prepenny-version': VERSION(),
    ...(who.token === null ? {} : { Authorization: `Bearer ${who.token}` }),
    ...extra,
  };
}

async function send(
  who: Who,
  method: string,
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<Answer> {
  const response = await fetch(`${LOCAL_SUPABASE.url}${path}`, {
    method,
    headers: headers(who, extra),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, text: await response.text() };
}

/** Fails, naming the request, if an answer holds any of these. */
function givesNothing(answer: Answer, secrets: readonly string[], what: string) {
  const found = secrets.filter((secret) => answer.text.includes(secret));
  expect(found, `${what} gave back ${found.join(', ')} (status ${answer.status})`).toEqual([]);
}

/** The table a "what" in make_private and share_record means. */
const WHAT: Record<string, string> = { accounts: 'account', debts: 'debt', goals: 'goal' };

/** Every database step the person could call, with the types of what it takes. */
function stepsFor(who: Who): { name: string; args: { name: string; type: string }[] }[] {
  const role = who.token === null ? 'anon' : 'authenticated';
  const rows = sql(`select coalesce(json_agg(json_build_object('name', p.proname, 'args', (
      select coalesce(json_agg(json_build_object('name', a.name, 'type', format_type(a.type, null)) order by a.n), '[]')
      from unnest(p.proargnames[1:p.pronargs], p.proargtypes::oid[]) with ordinality as a(name, type, n)))
      order by p.proname), '[]')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege(${quoted(role)}, p.oid, 'execute')`);
  return JSON.parse(rows) as { name: string; args: { name: string; type: string }[] }[];
}

/**
 * What a step is given: each id is the one being tried, or with `plan`, the
 * shared plan where a step names a plan. Words that would act on Tom's own
 * account alone are ones that do nothing ("delete" is never typed).
 */
function argsFor(
  step: { name: string; args: { name: string; type: string }[] },
  target: Kept,
  plan: string | null,
  jessAddress: string,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const args: Record<string, unknown> = {};
  for (const { name, type } of step.args) {
    if (type === 'uuid') {
      args[name] = plan !== null && (name === 'plan' || name === 'old_plan') ? plan : target.id;
    } else if (type === 'uuid[]') {
      args[name] = [target.id];
    } else if (type === 'boolean') {
      args[name] = true;
    } else if (type === 'bigint' || type === 'integer') {
      args[name] = 0;
    } else if (type === 'date') {
      args[name] = '2026-11-01';
    } else if (type === 'jsonb') {
      args[name] = [
        { table: target.table, id: target.id, version: target.version, row: { deleted: true } },
        {
          table: target.table,
          id: target.id,
          version: target.version,
          row: { name: 'Tom was here' },
        },
        {
          table: 'series',
          id: crypto.randomUUID(),
          version: null,
          row: {
            name: 'Tom was here',
            account_id: target.id,
            debt_id: target.table === 'debts' ? target.id : null,
            goal_id: target.table === 'goals' ? target.id : null,
            direction: 'out',
            type: 'other',
            amount: 100,
            start_date: '2026-11-01',
            schedule: { kind: 'once' },
            end_rule: { kind: 'never' },
            holiday_rule: 'keep',
          },
        },
      ];
    } else {
      args[name] =
        name === 'made_at' || name === 'older_than'
          ? now
          : name === 'nation'
            ? 'england-and-wales'
            : name === 'role'
              ? 'editor'
              : name === 'what'
                ? (WHAT[target.table] ?? 'account')
                : name === 'kind'
                  ? 'edit'
                  : name === 'nickname'
                    ? 'Tom'
                    : name === 'email'
                      ? jessAddress
                      : name === 'confirm'
                        ? target.id
                        : target.id;
    }
  }
  return args;
}

/** Joins a live-update channel and says how it went: "SUBSCRIBED", "CHANNEL_ERROR" or "TIMED_OUT". */
function join(channel: RealtimeChannel): Promise<string> {
  return new Promise((resolve) => {
    const giveUp = setTimeout(() => resolve('TIMED_OUT'), 40_000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(giveUp);
        resolve(status);
      }
    });
  });
}

function liveClient(who: Who): SupabaseClient {
  const client = createClient(LOCAL_SUPABASE.url, LOCAL_SUPABASE.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-prepenny-version': VERSION() } },
  });
  if (who.token !== null) void client.realtime.setAuth(who.token);
  return client;
}

/**
 * Who tries, one test each (D495): four people's worth of requests took 7.7
 * minutes in one test on its own, and ran out of its 15 minutes three at a
 * time on the building computer, so each person has a test of their own.
 */
const PEOPLE = ['Tom', 'Alex', 'someone signed out', 'Tom, who can view only'] as const;

for (const person of PEOPLE) {
  test(`brief 8.7 test 2: no request ${person} can make gives or changes anything of Jess's private records`, async ({
    page,
    browser,
  }, info) => {
    test.skip(
      info.project.name !== 'sign-in-360',
      'About the server, not the screen: run once, at 360px.',
    );
    test.setTimeout(600_000);

    // ---------------------------------------------------------------------
    // Jess and Tom, as in brief 8.7, and Jess's private records.
    const tom = await jessAndTom(page, browser, info, 'light');
    await addAccount(page, 'Jess savings', '400');
    await addPayment(page, {
      name: 'Birthday present',
      amount: '45',
      date: '2026-10-25',
      account: 'Jess savings',
    });
    await updateBalance(page, {
      account: 'Jess savings',
      balance: '355',
      expected: '£355.00',
      difference: 'They match.',
      toTick: 1,
    });
    await page.goto('/app/debts/');
    await page.getByRole('button', { name: 'Add a debt' }).click();
    const debtSheet = page.getByRole('dialog', { name: 'Add a debt' });
    await debtSheet.getByLabel('Name', { exact: true }).fill('Jess store card');
    await debtSheet.getByRole('radio', { name: 'Loan', exact: true }).check();
    await debtSheet.getByLabel('What you owe now', { exact: true }).fill('730');
    await debtSheet
      .getByRole('checkbox', { name: "I don't have payments planned for it yet" })
      .check();
    await debtSheet.getByRole('button', { name: 'Add this debt' }).click();
    await expect(debtSheet).toBeHidden();
    await page.goto('/app/goals/');
    await page.getByRole('button', { name: 'Add a savings goal' }).click();
    const goalSheet = page.getByRole('dialog', { name: 'Add a savings goal' });
    await goalSheet.getByLabel('What are you saving for?').fill('Jess course fees');
    await goalSheet.getByLabel('Target').fill('900');
    await radio(goalSheet.getByRole('group', { name: 'Kept in' }), 'Jess savings').check();
    await goalSheet.getByRole('button', { name: 'Add goal' }).click();
    await expect(goalSheet).toBeHidden();
    await allSentOn(page);

    const plan = await planOf(page);
    const jess = await personOn(page);
    const jessAddress = sql(`select email from auth.users where id = ${quoted(jess)}`);
    const mine = recordsIn(plan, jess);
    const shared = recordsIn(plan, null);
    const hers = [...mine, ...privateEdits(plan, jess)];
    // Every kind of private record the test means to try is there, so nothing passes by trying nothing.
    for (const table of [
      'accounts',
      'balance_updates',
      'series',
      'ticks',
      'debts',
      'goals',
      'settings',
    ]) {
      expect(
        mine.some((one) => one.table === table),
        `Jess has a private record in ${table}`,
      ).toBe(true);
    }
    expect(
      hers.some((one) => one.table === 'edits'),
      'and private changes in her history',
    ).toBe(true);
    const rent = shared.find((one) => one.table === 'series' && one.name === 'Rent');
    expect(rent, 'Rent is shared').toBeDefined();
    const sharedNames = new Set(shared.map((one) => one.name));
    /** What gives Jess's private records away: their ids, and their names that nothing shared has. */
    const privateSecrets = [
      ...hers.map((one) => one.id),
      ...mine
        .map((one) => one.name)
        .filter(
          (name): name is string => name !== null && name.length >= 4 && !sharedNames.has(name),
        ),
    ];
    /** And for someone outside the plan: anything of it at all. */
    const planSecrets = [...privateSecrets, plan, ...shared.map((one) => one.id)];

    // GraphQL, as it can be on Supabase's own projects. Off in the local
    // database until now; Supabase's own event trigger lets everyone use it.
    sql('create extension if not exists pg_graphql');

    const tryEverything = async (
      who: Who,
      secrets: readonly string[],
      mayChangeShared: boolean,
      member: boolean,
    ) => {
      const before = fingerprint(plan, jess, !mayChangeShared);
      const targets = mayChangeShared ? hers : [...hers, ...shared];

      // 1. Every table through the Data API.
      for (const table of everyTable()) {
        const all = await send(who, 'GET', `/rest/v1/${table}?select=*`);
        givesNothing(all, secrets, `${who.name}: GET ${table}`);
      }
      // Seen to work: Tom reads shared Rent this way; nobody else reads it.
      const rentRead = await send(who, 'GET', `/rest/v1/series?select=id,name&id=eq.${rent?.id}`);
      if (member) expect(rentRead.text, `${who.name} reads shared Rent`).toContain(rent?.id ?? '');
      else givesNothing(rentRead, [rent?.id ?? ''], `${who.name}: GET Rent`);
      for (const target of targets) {
        if (target.table === 'edits') continue;
        const one = `/rest/v1/${target.table}?id=eq.${target.id}`;
        givesNothing(
          await send(who, 'GET', `${one}&select=*`),
          secrets,
          `${who.name}: GET one of ${target.table}`,
        );
        givesNothing(
          await send(
            who,
            'PATCH',
            one,
            { name: 'Tom was here', deleted: true },
            { Prefer: 'return=representation' },
          ),
          secrets,
          `${who.name}: PATCH ${target.table}`,
        );
        givesNothing(
          await send(who, 'DELETE', one, undefined, { Prefer: 'return=representation' }),
          secrets,
          `${who.name}: DELETE ${target.table}`,
        );
        givesNothing(
          await send(
            who,
            'POST',
            `/rest/v1/${target.table}`,
            { id: target.id, plan_id: plan, name: 'Tom was here' },
            { Prefer: 'return=representation,resolution=merge-duplicates' },
          ),
          secrets,
          `${who.name}: POST over ${target.table}`,
        );
      }
      // The database's own parts aren't shown at all.
      for (const [schema, table] of [
        ['app', 'edit_records'],
        ['app', 'backup_emails'],
        ['auth', 'users'],
        ['auth', 'sessions'],
        ['realtime', 'messages'],
      ] as const) {
        const answer = await send(who, 'GET', `/rest/v1/${table}?select=*`, undefined, {
          'Accept-Profile': schema,
        });
        expect(answer.status, `${who.name}: ${schema}.${table} isn't shown`).toBeGreaterThanOrEqual(
          400,
        );
        givesNothing(answer, secrets, `${who.name}: ${schema}.${table}`);
      }

      // 2. Every table through GraphQL.
      for (const table of everyTable()) {
        const columns = sql(`select string_agg(column_name, ' ' order by ordinal_position)
        from information_schema.columns where table_schema = 'public' and table_name = ${quoted(table)}
          and data_type <> 'ARRAY'`);
        const read = await send(who, 'POST', '/graphql/v1', {
          query: `{ ${table}Collection(first: 1000) { edges { node { ${columns} } } } }`,
        });
        givesNothing(read, secrets, `${who.name}: GraphQL ${table}`);
        if (member && table === 'series') {
          expect(read.text, `${who.name} reads shared Rent through GraphQL`).toContain(
            rent?.id ?? '',
          );
        }
      }
      for (const target of targets) {
        if (target.table === 'edits') continue;
        for (const query of [
          `mutation { update${target.table}Collection(set: { deleted: true }, filter: { id: { eq: "${target.id}" } }, atMost: 1) { affectedCount records { id } } }`,
          `mutation { deleteFrom${target.table}Collection(filter: { id: { eq: "${target.id}" } }, atMost: 1) { affectedCount records { id } } }`,
        ]) {
          const answer = await send(who, 'POST', '/graphql/v1', { query });
          givesNothing(answer, secrets, `${who.name}: GraphQL change to ${target.table}`);
          expect(
            answer.text,
            `${who.name}: GraphQL changes nothing in ${target.table}`,
          ).not.toMatch(/"affectedCount":\s*[1-9]/);
        }
      }

      // 3. Every database step, with each of Jess's ids, and again with the
      // shared plan where a step names a plan. Leaving the plan, deleting
      // one's own account and starting a plan of one's own act on the person
      // asking alone: they're tried with her ids only (and "delete" is never
      // typed), and step 3g's and 3h's own database checks cover them.
      const own = new Set([
        'leave_plan',
        'delete_my_account',
        'start_plan',
        'replace_plan',
        'remove_plan',
      ]);
      const kinds = new Map<string, Kept>();
      for (const target of targets) if (!kinds.has(target.table)) kinds.set(target.table, target);
      for (const step of stepsFor(who)) {
        for (const target of targets) {
          for (const withPlan of own.has(step.name) ? [null] : [null, plan]) {
            // With the shared plan, one of each kind of record is enough.
            if (withPlan !== null && kinds.get(target.table) !== target) continue;
            const answer = await send(
              who,
              'POST',
              `/rest/v1/rpc/${step.name}`,
              argsFor(step, target, withPlan, jessAddress),
            );
            givesNothing(
              answer,
              secrets,
              `${who.name}: ${step.name} with ${target.table} ${withPlan ? 'and the plan' : ''}`,
            );
          }
        }
      }
      // Seen to work: Tom's own view of the plan has shared Rent, and nothing of hers.
      const changes = await send(who, 'POST', '/rest/v1/rpc/plan_changes', {
        plan,
        shared_after: 0,
        mine_after: 0,
      });
      if (member)
        expect(changes.text, `${who.name} brings the plan down`).toContain(rent?.id ?? '');
      givesNothing(changes, secrets, `${who.name}: plan_changes`);

      // 5. The get-back-in function with Jess's address, and Supabase's own
      // administrator routes.
      for (const code of ['000000', '123456']) {
        const answer = await send(who, 'POST', '/functions/v1/get-back-in', {
          email: jessAddress,
          code,
        });
        givesNothing(answer, [...secrets, jess], `${who.name}: get-back-in`);
        expect(answer.text).not.toContain('"in":true');
      }
      for (const path of ['/auth/v1/admin/users', `/auth/v1/admin/users/${jess}`]) {
        const answer = await send(who, 'GET', path);
        expect(answer.status, `${who.name}: ${path} is refused`).toBeGreaterThanOrEqual(400);
        givesNothing(answer, [...secrets, jessAddress], `${who.name}: ${path}`);
      }

      // Nothing of hers changed.
      expect(fingerprint(plan, jess, !mayChangeShared), `${who.name} changed nothing`).toBe(before);
    };

    // 4. Live updates: every channel, listening and sending, while Jess changes
    // a private record and a shared one on her phone. A channel that refuses
    // is taken away at once, as the phone would, or it keeps asking again.
    const tryListening = async (who: Who, secrets: readonly string[], member: boolean) => {
      const client = liveClient(who);
      const heard: string[] = [];
      const listen = (channel: RealtimeChannel, topic: string) =>
        channel.on('broadcast', { event: '*' }, (message) =>
          heard.push(`${topic} ${JSON.stringify(message)}`),
        );
      const ids = [...new Set(hers.filter((one) => one.table !== 'edits').map((one) => one.id))];
      const topics = [
        `plan:${plan}`,
        `plan:${plan}:${jess}`,
        `plan:${ids[0]}`,
        `plan:${plan}:${ids[1]}`,
      ];
      const channels: RealtimeChannel[] = [];
      for (const topic of topics) {
        const privately = listen(client.channel(topic, { config: { private: true } }), topic);
        const status = await join(privately);
        const allowed = member && topic === `plan:${plan}`;
        expect(status, `${who.name} ${allowed ? 'may' : "can't"} join private ${topic}`).toBe(
          allowed ? 'SUBSCRIBED' : 'CHANNEL_ERROR',
        );
        if (allowed) {
          channels.push(privately);
          continue;
        }
        await client.removeChannel(privately);
        // Anyone can listen on a public channel of any name; the server's
        // nudges only ever go to private ones.
        const openly = listen(client.channel(topic, { config: { private: false } }), topic);
        expect(await join(openly), `${who.name} listens openly on ${topic}`).toBe('SUBSCRIBED');
        channels.push(openly);
      }
      const tables = client
        .channel(`tables-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public' }, (message) =>
          heard.push(`postgres ${JSON.stringify(message)}`),
        );
      await join(tables);
      channels.push(tables);

      // Sending, on Jess's own channel and the plan's, as if from her phone.
      const jessClient = liveClient({ name: 'Jess', token: await tokenOn(page) });
      const jessHeard: string[] = [];
      for (const topic of [`plan:${plan}:${jess}`, `plan:${plan}`]) {
        const hers = jessClient
          .channel(topic, { config: { private: true } })
          .on('broadcast', { event: '*' }, (message) => jessHeard.push(JSON.stringify(message)));
        expect(await join(hers), `Jess joins ${topic}`).toBe('SUBSCRIBED');
      }
      for (const topic of [`plan:${plan}:${jess}`, `plan:${plan}`]) {
        const sending = client.channel(`${topic}`, { config: { private: true } });
        await sending.send({ type: 'broadcast', event: 'changed', payload: { from: who.name } });
      }

      // Jess changes her private payment, then the shared account, on her phone.
      const nudges = () =>
        sql(`select count(*) from realtime.messages where topic like ${quoted(`plan:${plan}%`)}`);
      const nudged = nudges();
      await addPayment(page, {
        name: 'Jess dentist',
        amount: '60',
        date: '2026-11-04',
        account: 'Jess savings',
      });
      await addPayment(page, { name: 'Window cleaner', amount: '12', date: '2026-11-03' });
      await allSentOn(page);
      await expect.poll(nudges, { message: 'the server nudged the phones' }).not.toBe(nudged);
      await page.waitForTimeout(3_000);
      // What anyone heard was only ever "something changed", on the plan's own channel.
      for (const message of heard) {
        expect(message, `${who.name} heard only the plan's own nudge`).toMatch(
          new RegExp(`^plan:${plan} `),
        );
        // Nothing but the nudge's own id, which Supabase's realtime.send adds to every message.
        const payload = JSON.parse(message.slice(message.indexOf(' ') + 1)).payload as {
          id?: string;
        };
        expect(
          Object.keys(payload).filter((key) => key !== 'id'),
          'which holds nothing',
        ).toEqual([]);
        expect(
          sql(`select count(*) from realtime.messages where id = ${quoted(payload.id ?? '')}
          and topic = ${quoted(`plan:${plan}`)} and payload = jsonb_build_object('id', id)`),
          'its id is the nudge itself',
        ).toBe('1');
        for (const secret of secrets) expect(message).not.toContain(secret);
      }
      if (member) expect(heard.length, `${who.name} heard the shared change`).toBeGreaterThan(0);
      else expect(heard, `${who.name} heard nothing`).toEqual([]);
      expect(
        jessHeard.filter((message) => message.includes(who.name)),
        `${who.name} couldn't send to Jess's phones`,
      ).toEqual([]);
      await client.removeAllChannels();
      await jessClient.removeAllChannels();
    };

    // The person trying: Tom; Alex, signed in on a phone of his own, in no
    // plan; someone who isn't signed in; or Tom once Jess has made him "Can
    // view only", on her phone's account.
    let alex: Awaited<ReturnType<typeof secondPhone>> | null = null;
    let who: Who;
    if (person === 'Tom') {
      who = { name: person, token: await tokenOn(tom.page) };
    } else if (person === 'Alex') {
      alex = await secondPhone(browser, info, 'light');
      await signIn(alex.page, newEmail('alex'));
      await expect(alex.page).toHaveURL(/\/setup\/$/);
      who = { name: person, token: await tokenOn(alex.page) };
    } else if (person === 'someone signed out') {
      who = { name: person, token: null };
    } else {
      const changed = await send(
        { name: 'Jess', token: await tokenOn(page) },
        'POST',
        '/rest/v1/rpc/change_role',
        {
          plan,
          person: await personOn(tom.page),
          role: 'viewer',
        },
      );
      expect(changed.status, changed.text).toBeLessThan(300);
      who = { name: person, token: await tokenOn(tom.page) };
    }
    const member = person === 'Tom' || person === 'Tom, who can view only';
    // Alex and someone signed out get nothing of the plan at all; "Can view only" changes nothing shared.
    await tryEverything(who, member ? privateSecrets : planSecrets, person === 'Tom', member);
    await tryListening(who, member ? privateSecrets : planSecrets, member);

    await alex?.context.close();
    await tom.context.close();
  });
}
