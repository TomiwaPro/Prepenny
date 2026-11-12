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
-- it's done; someone who is or has been in a shared plan waits for the
-- owner's choice of what the other person's history says (PLAN.md item 66).

begin;
create extension if not exists pgtap with schema extensions;

select plan(62);

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
    values ('plan:' || tests.id('alex-plan') || ':' || tests.id('alex'), 'broadcast', '{}', 'changed', true);
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

-- Jess and Tom signed in just now, as Supabase notes on each sign-in.
select tests.as_test();
update auth.sessions set created_at = now() where user_id in (tests.id('jess'), tests.id('tom'));
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.delete_my_account('delete') $$), 'shared-plan',
  'Tom, in a shared plan, waits for the owner''s choice of what Jess''s history says');
select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.delete_my_account('delete') $$), 'shared-plan', 'and so does Jess');
select tests.as_test();
select is((select count(*) from auth.users where id in (tests.id('alex'), tests.id('jess'), tests.id('tom'))),
  3::bigint, 'Nobody was deleted by a refusal');

-- ---------------------------------------------------------------------------
-- 4. Alex deletes his account.

select tests.as_person_with_second_step('alex');
select is(public.delete_my_account('  Delete ') ->> 'deleted', 'true',
  'Alex deletes his account, with "Delete" typed as it comes');
select tests.as_test();

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
-- 5. Someone who left a shared plan, and the plan they left, wait for the
-- owner's choice too: their name is in the other person's history.

update auth.sessions set created_at = now() where user_id in (tests.id('jess'), tests.id('tom'));
select tests.as_person('tom');
select public.leave_plan(tests.id('plan'), false, tests.id('tom-plan'), gen_random_uuid(), '2026-11-12T10:00:00Z');
select is(pg_temp.refusal($$ select public.delete_my_account('delete') $$), 'shared-plan',
  'Tom, who left Jess''s plan, waits for the owner''s choice');
select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.delete_my_account('delete') $$), 'shared-plan',
  'and so does Jess, alone in it now');
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 6. A backup from before put back: the deletion is made again.

insert into auth.users (id, email) values (tests.id('alex'), 'alex@example.test');
insert into public.people (id, nickname) values (tests.id('alex'), 'Alex');
select is(app.delete_again_after_restore(), 1, 'After a backup is put back, Alex''s account is deleted again');
select is((select count(*) from auth.users where id = tests.id('alex')), 0::bigint, 'and is gone');
select ok(not has_function_privilege('authenticated', 'app.delete_again_after_restore()', 'execute'),
  'Only the database''s own roles can do that');

select * from finish();
rollback;
