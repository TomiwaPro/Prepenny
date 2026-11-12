-- Step 3h: download my data, import a backup, and delete my account (brief
-- 4.12, 4.13, 7.2, PLAN.md item 66).
--
-- Proves what the owner asked:
-- - nobody can download, import into or delete someone else's account;
-- - an import can't create records owned by or private to anyone else, or
--   break the privacy rules;
-- - after deleting, nothing of the person is left, anywhere in the
--   database, apart from a scrambled id kept 30 days so a deletion can be
--   made again after a backup is put back;
-- - a deleted person's devices get nothing more.
-- And: deleting needs a sign-in in the last 10 minutes, the authenticator
-- app's code when two-step sign-in is on, and "delete" typed; an email says
-- it's done. In a shared plan (the owner's choice B, D482): the person leaves
-- first, their changes stay in the other person's Activity, History and
-- "Changed by", made by nobody ("Someone who has left" on the phone), and
-- their id, address and name appear nowhere afterwards.

begin;
create extension if not exists pgtap with schema extensions;

select plan(85);

select tests.make_jess_and_tom();

-- A refusal's code, as the phone gets it.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
begin
  execute statement;
  return 'no refusal';
exception when others then
  get stacked diagnostics code = message_text;
  return code;
end;
$$;
grant execute on function pg_temp.refusal(text) to authenticated, anon;

-- Every table in the database whose rows hold this text anywhere, read past
-- every rule, as "schema.table: rows". Partitions are read through their
-- parent table; a table the database's own role can't read says so.
create function pg_temp.naming(needle text) returns setof text language plpgsql as $$
declare
  t text;
  n bigint;
begin
  for t in
    select c.oid::regclass::text from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where c.relkind in ('r', 'p') and not c.relispartition
      and s.nspname in ('public', 'app', 'auth', 'realtime', 'storage', 'net', 'supabase_functions', 'tests')
    order by 1
  loop
    begin
      execute format('select count(*) from %s r where to_jsonb(r)::text ilike $1', t)
        into n using '%' || needle || '%';
      if n > 0 then
        return next t || ': ' || n;
      end if;
    exception when insufficient_privilege then
      return next t || ': unreadable';
    end;
  end loop;
end;
$$;

-- How many rows the shared plan has, in every table, read past every rule.
create function pg_temp.plan_rows() returns bigint language plpgsql as $$
declare
  t text;
  n bigint;
  total bigint := 0;
begin
  for t in select unnest(app.record_tables() || array['edits', 'notices', 'plan_members', 'invites']) loop
    execute format('select count(*) from public.%I where plan_id = $1', t) into n using tests.id('plan');
    total := total + n;
  end loop;
  return total;
end;
$$;

create temporary table kept (name text primary key, value text);
grant all on kept to authenticated;

-- One record of a plan's first copy, as an imported backup sends it.
create function pg_temp.account_write(id uuid, extra jsonb default '{}'::jsonb) returns jsonb
language sql as $$
  select jsonb_build_array(jsonb_build_object('table', 'accounts', 'id', id, 'version', null,
    'row', jsonb_build_object('name', 'Imported', 'kind', 'current', 'currency', 'GBP', 'overdraft_limit', 0,
      'warning_level', 2000, 'closed', false, 'list_order', 0) || extra))
$$;
grant execute on function pg_temp.account_write(uuid, jsonb) to authenticated;

-- Alex has a plan of his own, with records in it, a backup email, a device,
-- codes and tries for his addresses, a nudge and a line in Supabase's own
-- sign-in log. He asked to join Jess's plan and wasn't let in, and Jess sent
-- him an invite by email too.
select tests.as_person('alex');
select public.start_plan(tests.id('alex-plan'), 'england-and-wales');
select public.save_edit(tests.id('alex-plan'), tests.id('alex-first-copy'), '2026-11-12T10:00:00Z', 'first-copy',
  pg_temp.account_write(tests.id('alex-current'), jsonb_build_object('private_to', tests.id('alex'),
    'belongs_to', tests.id('alex')))
  || jsonb_build_array(jsonb_build_object('table', 'balance_updates', 'id', tests.id('alex-balance'), 'version', null,
    'row', jsonb_build_object('account_id', tests.id('alex-current'), 'balance', 26754, 'checked_on', '2026-11-12',
      'checked_at', '2026-11-12T10:00:00Z', 'source', 'typed', 'list_order', 0))));
select tests.as_test();
insert into app.backup_emails (person_id, email) values (tests.id('alex'), 'alex-backup@example.test');
insert into app.devices (session_id, person_id) values (tests.id('alex-session'), tests.id('alex'));
insert into app.email_codes (purpose, person_id, email, code_hash)
  values ('add-backup', tests.id('alex'), 'alex-backup@example.test', 'not-a-real-hash');
insert into app.code_tries (address_key, purpose)
  values (app.address_key('alex-backup@example.test'), 'get-in'), (app.address_key('alex@example.test'), 'get-in');
insert into auth.audit_log_entries (id, payload, created_at)
  values (gen_random_uuid(), json_build_object('actor_id', tests.id('alex'), 'actor_username', 'alex@example.test',
    'action', 'login'), now());
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (tests.id('alex')::text, tests.id('alex'),
    jsonb_build_object('sub', tests.id('alex'), 'email', 'alex@example.test'), 'email', now(), now());
insert into auth.refresh_tokens (token, user_id, session_id, revoked)
  values ('alex-refresh-token', tests.id('alex')::text, tests.id('alex-session'), false);
do $$
begin
  insert into realtime.messages (topic, extension, payload, event, private)
    values ('plan:' || tests.id('alex-plan') || ':' || tests.id('alex'), 'broadcast', '{}', 'changed', true),
      ('plan:' || tests.id('alex-plan'), 'broadcast', '{}', 'changed', true);
exception when others then
  -- No place for today's nudges while Realtime is off, as on GitHub's check.
  null;
end;
$$;
insert into public.invites (plan_id, role, email, token_hash, created_by, asked_by, asked_at)
  values (tests.id('plan'), 'editor', null, 'test-invite-asked', tests.id('jess'), tests.id('alex'), now()),
    (tests.id('plan'), 'editor', 'Alex@example.test', 'test-invite-emailed', tests.id('jess'), null, null);
insert into app.backup_emails (person_id, email) values (tests.id('jess'), 'jess-backup@example.test');
insert into kept values ('plan rows', pg_temp.plan_rows()::text);

-- ---------------------------------------------------------------------------
-- 1. Download my data: only ever the person's own account.

select throws_ok($$ select tests.as_nobody(); select public.my_account_data() $$, '42501', null,
  'Someone who isn''t signed in can''t download anything');
select tests.as_test();

select tests.as_person('jess');
select is(public.my_account_data() ->> 'email', 'jess@example.test',
  'Jess''s download has the address she signs in with');
select is(public.my_account_data() ->> 'backup_email', 'jess-backup@example.test',
  'and her backup email');
select is(public.my_account_data() ->> 'name', 'Jess', 'and the name her partner sees');
select is(jsonb_array_length(public.my_account_data() -> 'devices'), 1, 'and her own signed-in device only');
select is(public.my_account_data() -> 'plans' -> 0 ->> 'role', 'owner', 'and the plan she''s in, as its owner');

select tests.as_person('tom');
select is(position(tests.id('jess')::text in public.my_account_data()::text)
    + position('jess' in lower(public.my_account_data()::text)), 0,
  'Tom''s download names nothing of Jess''s: not her id, her address or her backup email');
select is(public.my_account_data() ->> 'email', 'tom@example.test', 'Tom''s download is his own account');

select tests.as_person('alex');
select is(position(tests.id('jess')::text in public.my_account_data()::text)
    + position(tests.id('tom')::text in public.my_account_data()::text)
    + position('jess' in lower(public.my_account_data()::text))
    + position('tom' in lower(public.my_account_data()::text)), 0,
  'Alex, outside the plan, gets nothing of Jess''s or Tom''s');
select tests.as_test();
delete from auth.sessions where id = tests.id('tom-session');
select tests.as_person('tom');
select is(pg_temp.refusal('select public.my_account_data()'), 'not-allowed',
  'A sign-in that has ended downloads nothing');
select tests.as_test();
insert into auth.sessions (id, user_id) values (tests.id('tom-session'), tests.id('tom'));

-- ---------------------------------------------------------------------------
-- 2. Import a backup: only into a plan of one's own, never a shared one,
-- and every record is the person's own.

select throws_ok($$ select tests.as_nobody(); select public.replace_plan(null, gen_random_uuid(), 'scotland') $$,
  '42501', null, 'Someone who isn''t signed in can''t import anything');
select tests.as_test();

select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.replace_plan(tests.id('plan'), gen_random_uuid(), 'scotland') $$),
  'not-found', 'Tom can''t put a backup in place of Jess''s plan');
select is(pg_temp.refusal($$ select public.replace_plan(null, gen_random_uuid(), 'scotland') $$),
  'has-a-plan', 'nor start a plan of his own beside it while he''s in hers (D427)');
select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.replace_plan(tests.id('plan'), gen_random_uuid(), 'scotland') $$),
  'shared-plan', 'Jess can''t put a backup in place of a plan she shares with Tom');
select tests.as_person('alex');
select is(pg_temp.refusal($$ select public.replace_plan(tests.id('plan'), gen_random_uuid(), 'scotland') $$),
  'not-found', 'Alex can''t put a backup in place of a plan he isn''t in');
select is(pg_temp.refusal($$ select public.replace_plan(null, gen_random_uuid(), 'scotland') $$),
  'has-a-plan', 'nor keep two plans by not naming his own');
select is(pg_temp.refusal($$ select public.replace_plan(tests.id('alex-plan'), tests.id('plan'), 'scotland') $$),
  'not-found', 'nor give the new plan the id of someone else''s');
select tests.as_test();
select is((select count(*) from public.plans where id = tests.id('alex-plan')), 1::bigint,
  'and his own plan is still there after each refusal');

select tests.as_person('alex');
select is(public.replace_plan(tests.id('alex-plan'), tests.id('alex-new-plan'), 'scotland') ->> 'plan',
  tests.id('alex-new-plan')::text, 'Alex puts a new plan in place of his own');
select tests.as_test();
select is((select count(*) from public.plans where id = tests.id('alex-plan'))
    + (select count(*) from public.accounts where plan_id = tests.id('alex-plan')), 0::bigint,
  'His old plan has gone, with everything in it');
select is((select owner::text || ' ' || nation from public.plans where id = tests.id('alex-new-plan')),
  tests.id('alex')::text || ' scotland', 'and the new one is his, with the backup''s bank holidays');

select tests.as_person('alex');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('alex-new-plan'), gen_random_uuid(),
    '2026-11-12T10:00:00Z', 'first-copy', pg_temp.account_write(gen_random_uuid(),
      jsonb_build_object('private_to', tests.id('jess')))) $$),
  'not-found', 'An imported record can''t be private to someone else');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('alex-new-plan'), gen_random_uuid(),
    '2026-11-12T10:00:00Z', 'first-copy', pg_temp.account_write(gen_random_uuid(),
      jsonb_build_object('belongs_to', tests.id('jess')))) $$),
  'not-found', 'nor belong to someone else');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('alex-new-plan'), gen_random_uuid(),
    '2026-11-12T10:00:00Z', 'first-copy', pg_temp.account_write(tests.id('jess-current'),
      jsonb_build_object('private_to', tests.id('alex'), 'belongs_to', tests.id('alex')))) $$),
  'not-found', 'nor take the id of someone else''s record');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('alex-new-plan'), gen_random_uuid(),
    '2026-11-12T10:00:00Z', 'first-copy',
    jsonb_build_array(jsonb_build_object('table', 'balance_updates', 'id', gen_random_uuid(), 'version', null,
      'row', jsonb_build_object('account_id', tests.id('jess-current'), 'balance', 100, 'checked_on', '2026-11-12',
        'checked_at', '2026-11-12T10:00:00Z', 'source', 'typed', 'list_order', 0)))) $$),
  'not-found', 'nor name a record in someone else''s plan');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('plan'), gen_random_uuid(),
    '2026-11-12T10:00:00Z', 'first-copy', pg_temp.account_write(gen_random_uuid())) $$),
  'bad-edit', 'nor go into someone else''s plan');
select public.save_edit(tests.id('alex-new-plan'), gen_random_uuid(), '2026-11-12T10:00:00Z', 'first-copy',
  pg_temp.account_write(tests.id('alex-imported'), jsonb_build_object('private_to', tests.id('alex'),
    'belongs_to', tests.id('alex'), 'created_by', tests.id('jess'), 'changed_by', tests.id('jess'),
    'plan_id', tests.id('plan'), 'version', 99, 'seq', 99, 'deleted', true)));
select tests.as_test();
select is((select plan_id::text || ' ' || created_by::text || ' ' || changed_by::text || ' '
      || private_to::text || ' ' || version || ' ' || deleted from public.accounts where id = tests.id('alex-imported')),
  tests.id('alex-new-plan')::text || ' ' || tests.id('alex')::text || ' ' || tests.id('alex')::text || ' '
    || tests.id('alex')::text || ' 1 false',
  'What a record says about its plan, who made it, its version and whether it''s removed is the database''s, never the file''s');

select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('plan'), gen_random_uuid(),
    '2026-11-12T10:00:00Z', 'first-copy', pg_temp.account_write(gen_random_uuid())) $$),
  'bad-edit', 'A backup can''t go into a shared plan as a first copy, even by someone in it');
select tests.as_test();
select is(pg_temp.plan_rows()::text, (select value from kept where name = 'plan rows'),
  'Jess and Tom''s plan is exactly as it was after every import above');

-- ---------------------------------------------------------------------------
-- 3. Delete my account: the checks first. Each refusal changes nothing.

select throws_ok($$ select tests.as_nobody(); select public.delete_my_account('delete') $$, '42501', null,
  'Someone who isn''t signed in can''t delete anything');
select tests.as_test();
select is(pg_get_function_identity_arguments('public.delete_my_account'::regproc), 'confirm text',
  'Deleting names nobody: it''s only ever the person asking');

update auth.sessions set created_at = now() - interval '11 minutes' where id = tests.id('alex-session');
select tests.as_person('alex');
select is(pg_temp.refusal($$ select public.delete_my_account('delete') $$), 'sign-in-again',
  'Deleting needs a sign-in made in the last 10 minutes');
select tests.as_test();
update auth.sessions set created_at = now() - interval '9 minutes' where id = tests.id('alex-session');

select tests.turn_on_two_step('alex');
update auth.sessions set aal = 'aal2' where id = tests.id('alex-session');
select tests.as_person_with_second_step('alex');
select is(pg_temp.refusal($$ select public.delete_my_account('delete') $$), 'second-step-needed',
  'With two-step sign-in on, it needs the authenticator app''s code in the last 5 minutes too');
select tests.as_test();
insert into auth.mfa_amr_claims (id, session_id, created_at, updated_at, authentication_method)
  values (gen_random_uuid(), tests.id('alex-session'), now(), now(), 'totp');

select tests.as_person_with_second_step('alex');
select is(pg_temp.refusal($$ select public.delete_my_account('remove') $$), 'confirm',
  'and "delete" typed');
select is(pg_temp.refusal($$ select public.delete_my_account(null) $$), 'confirm', 'not nothing');

select tests.as_test();
select is((select count(*) from auth.users where id in (tests.id('alex'), tests.id('jess'), tests.id('tom'))),
  3::bigint, 'Nobody was deleted by a refusal');

-- ---------------------------------------------------------------------------
-- 4. Alex deletes his account.

select tests.as_person_with_second_step('alex');
select is(public.delete_my_account('  Delete ') ->> 'deleted', 'true',
  'Alex deletes his account, with "Delete" typed as it comes');
select tests.as_test();

-- The email that says it's done waits in pg_net's queue until it's sent, as
-- bytes this search doesn't read: it's checked on its own below.
select is_empty($$ select pg_temp.naming(tests.id('alex')::text) $$,
  'Nothing in the database names Alex''s id any more, in any table');
select is_empty($$ select pg_temp.naming('alex@example.test') $$,
  'nor the address he signed in with');
select is_empty($$ select pg_temp.naming('alex-backup@example.test') $$, 'nor his backup email');
select is_empty($$ select pg_temp.naming(tests.id('alex-plan')::text)
    union all select pg_temp.naming(tests.id('alex-new-plan')::text) $$,
  'nor either of his plans');
select is((select count(*) from app.deletions where person_key = app.person_key(tests.id('alex'))), 1::bigint,
  'Only a scrambled id is kept, so the deletion can be made again after a backup is put back');
select is((select count(*) from net.http_request_queue
    where convert_from(body, 'utf8') like '%Your PrePenny account has been deleted%'
      and convert_from(body, 'utf8') like '%alex@example.test%'
      and convert_from(body, 'utf8') not like '%£%'), 1::bigint,
  'An email to the address he signed in with says it''s done, with no amount in it');

select is((select count(*) from public.invites
    where token_hash in ('test-invite-asked', 'test-invite-emailed')
      and asked_by is null and email is null), 2::bigint,
  'Jess''s invites keep nothing of Alex''s: not that he asked, nor his address');
select isnt((select cancelled_at from public.invites where token_hash = 'test-invite-asked'), null,
  'and the one he asked on no longer waits for an answer');
select is(pg_temp.plan_rows()::text, (select value from kept where name = 'plan rows'),
  'Jess and Tom''s plan is exactly as it was');

-- His phones, with the token they still hold until it runs out, get nothing.
select tests.as_person_with_second_step('alex');
select is(public.hello() ->> 'sign_in', 'deleted', 'His phones are told the account was deleted');
select is((select count(*) from app.my_plans()), 0::bigint, 'and are in no plan');
select is(pg_temp.refusal('select public.my_account_data()'), 'not-allowed', 'download nothing');
select is(pg_temp.refusal($$ select public.plan_changes(tests.id('alex-new-plan'), 0, 0) $$), 'not-found',
  'bring nothing down');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('alex-new-plan'), gen_random_uuid(),
    '2026-11-12T10:00:00Z', 'changes', pg_temp.account_write(gen_random_uuid())) $$), 'not-found',
  'save nothing');
select is(pg_temp.refusal($$ select public.start_plan(gen_random_uuid(), 'scotland') $$), 'not-found',
  'start nothing');
select ok(not app.may_hear('plan:' || tests.id('alex-new-plan') || ':' || tests.id('alex')),
  'and hear nothing');
select is_empty($$ select tests.readable_rows() $$, 'and read nothing, in any table');
select is(pg_temp.refusal($$ select public.delete_my_account('delete') $$), 'not-allowed',
  'Deleting again changes nothing');
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 5. Tom deletes his account while he shares Jess's plan (D482).

-- Tom has a name of his own, and makes changes in the shared plan: Rent goes
-- up, he ticks a payment and records a spend. Jess has a notice about his
-- change, with the device he made it on.
update public.people set nickname = 'Tomasz-Nick' where id = tests.id('tom');
select tests.in_an_edit('tom');
update public.series set amount = 112000 where id = tests.id('rent');
insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (tests.id('tom-rent-tick'), tests.id('plan'), tests.id('rent'), '2026-12-01', 1, '2026-12-01',
    '2026-12-01T09:00:00Z');
insert into public.spends (id, plan_id, budget_id, amount, spent_on, recorded_at)
  values (tests.id('tom-spend'), tests.id('plan'), tests.id('joint-food'), 1250, '2026-11-02', '2026-11-02T10:00:00Z');
insert into kept values ('tom edit', current_setting('prepenny.edit'));
select tests.as_test();
insert into app.edit_devices (edit_id, session_id, browser, device)
  values ((select value::uuid from kept where name = 'tom edit'), tests.id('tom-session'), 'chrome', 'android')
  on conflict (edit_id) do update set browser = 'chrome', device = 'android';
insert into public.notices (plan_id, for_person, kind, edit_id, data)
  values (tests.id('plan'), tests.id('jess'), 'clash', (select value::uuid from kept where name = 'tom edit'),
    jsonb_build_object('by', tests.id('tom'), 'made_at', '2026-11-12T10:00:00Z',
      'from', jsonb_build_object('session', tests.id('tom-session'), 'browser', 'chrome', 'device', 'android'),
      'rows', jsonb_build_array(jsonb_build_object('table', 'series', 'id', tests.id('rent')))));
insert into app.backup_emails (person_id, email) values (tests.id('tom'), 'tom-backup@example.test');
update auth.sessions set created_at = now() where user_id in (tests.id('jess'), tests.id('tom'));

select tests.as_person('tom');
select is(public.delete_my_account('delete') ->> 'deleted', 'true',
  'Tom deletes his account while he shares Jess''s plan');
select tests.as_test();

select is_empty($$ select pg_temp.naming(tests.id('tom')::text) $$,
  'Nothing in the database names Tom''s id any more, in any table');
select is_empty($$ select pg_temp.naming('tom@example.test') $$, 'nor the address he signed in with');
select is_empty($$ select pg_temp.naming('tom-backup@example.test') $$, 'nor his backup email');
select is_empty($$ select pg_temp.naming('Tomasz-Nick') $$, 'nor the name he gave');
select is_empty($$ select pg_temp.naming(tests.id('tom-current')::text) $$,
  'His own account has gone, with everything only he saw');
select is((select owner from public.plans where id = tests.id('plan')), tests.id('jess'),
  'Jess''s plan is still hers');
select is((select array_agg(person_id::text) from public.plan_members where plan_id = tests.id('plan')),
  array[tests.id('jess')::text], 'with only her in it');
select is((select amount::bigint from public.series where id = tests.id('rent')), 112000::bigint,
  'The shared accounts stay as they are: Rent keeps the amount Tom gave it');
select is((select count(*) from public.ticks where id = tests.id('tom-rent-tick') and ticked_by is null
    and not deleted), 1::bigint, 'his tick stays, ticked by nobody');
select is((select count(*) from public.spends where id = tests.id('tom-spend') and recorded_by is null
    and not deleted), 1::bigint, 'and his spend, recorded by nobody');
select is((select count(*) from public.series where id = tests.id('rent') and created_by = tests.id('jess')
    and changed_by is null), 1::bigint, 'and Rent still says Jess made it, and nobody changed it last');

select tests.as_person('jess');
select ok(exists (select 1 from jsonb_array_elements(public.plan_activity(tests.id('plan')) -> 'edits') e
    where e ->> 'by' is null and e ->> 'kind' = 'test'
      and e::text like '%112000%' and e::text like '%110000%'),
  'Jess''s Activity keeps Tom''s change from £1,100.00 to £1,120.00, made by nobody');
select ok(exists (select 1 from jsonb_array_elements(public.plan_activity(tests.id('plan')) -> 'edits') e
    where e ->> 'kind' = 'leave' and e ->> 'by' is null and e -> 'summary' ->> 'person' is null),
  'and says someone left the plan, naming nobody');
select ok(not (public.plan_activity(tests.id('plan')) -> 'people') ? tests.id('tom')::text,
  'and lists nobody of that name');
select ok(exists (select 1 from jsonb_array_elements(
      public.payment_history(tests.id('plan'), tests.id('rent'), '2026-12-01') -> 'edits') e
    where e ->> 'by' is null),
  'Rent''s History keeps his change, made by nobody');
select ok(exists (select 1 from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r ->> 'table' = 'series' and r -> 'row' ->> 'id' = tests.id('rent')::text
      and r ->> 'edit_by' is null and r ->> 'edit_made_at' is not null),
  'and "Changed by" says it was changed, by nobody');
select tests.as_test();
select is((select count(*) from public.notices where for_person = tests.id('jess')
    and edit_id = (select value::uuid from kept where name = 'tom edit')
    and data ->> 'by' is null and not data ? 'from'), 1::bigint,
  'Jess''s notice about his change stays, naming nobody and no device');
select is((select count(*) from net.http_request_queue
    where convert_from(body, 'utf8') like '%Your PrePenny account has been deleted%'
      and convert_from(body, 'utf8') like '%tom@example.test%'), 1::bigint,
  'An email to the address he signed in with says it''s done');

-- His phones, with the token they still hold, get nothing more.
select tests.as_person('tom');
select is(public.hello() ->> 'sign_in', 'deleted', 'His phones are told the account was deleted');
select is_empty($$ select tests.readable_rows() $$, 'and read nothing, in any table');
select ok(not app.may_hear('plan:' || tests.id('plan')), 'and hear nothing of Jess''s plan');
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 6. Sam was in Jess's plan, left it with a copy, and deletes his account
-- later: the same.

select tests.make_person('sam');
update public.people set nickname = 'Samwise-Nick' where id = tests.id('sam');
insert into public.plan_members (plan_id, person_id, role) values (tests.id('plan'), tests.id('sam'), 'editor');
select tests.in_an_edit('sam');
update public.series set amount = 113000 where id = tests.id('rent');
select tests.as_person('sam');
select public.leave_plan(tests.id('plan'), true, tests.id('sam-plan'), gen_random_uuid(), '2026-11-12T10:00:00Z');
select tests.as_test();
update auth.sessions set created_at = now() where user_id = tests.id('sam');
select tests.as_person('sam');
select is(public.delete_my_account('delete') ->> 'deleted', 'true',
  'Sam, who left the plan earlier, deletes his account');
select tests.as_test();
select is_empty($$ select pg_temp.naming(tests.id('sam')::text)
    union all select pg_temp.naming('sam@example.test')
    union all select pg_temp.naming('Samwise-Nick')
    union all select pg_temp.naming(tests.id('sam-plan')::text) $$,
  'Nothing names Sam, his address, his name or his own plan any more');
select is((select amount::bigint from public.series where id = tests.id('rent')), 113000::bigint,
  'and Jess''s Rent keeps his change');

-- ---------------------------------------------------------------------------
-- 7. Then Jess deletes hers: the plan goes, with everything in it.

select tests.as_person('jess');
select is(public.delete_my_account('delete') ->> 'deleted', 'true', 'Jess deletes her account too');
select tests.as_test();
select is_empty($$ select pg_temp.naming(tests.id('jess')::text)
    union all select pg_temp.naming('jess@example.test')
    union all select pg_temp.naming(tests.id('plan')::text) $$,
  'Nothing names Jess, her address or the plan any more');

-- ---------------------------------------------------------------------------
-- 8. A backup from before put back: the deletion is made again.

insert into auth.users (id, email) values (tests.id('alex'), 'alex@example.test');
insert into public.people (id, nickname) values (tests.id('alex'), 'Alex');
select is(app.delete_again_after_restore(), 1, 'After a backup is put back, Alex''s account is deleted again');
select is((select count(*) from auth.users where id = tests.id('alex')), 0::bigint, 'and is gone');
select ok(not has_function_privilege('authenticated', 'app.delete_again_after_restore()', 'execute'),
  'Only the database''s own roles can do that');

select * from finish();
rollback;
