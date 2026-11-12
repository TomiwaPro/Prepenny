-- Step 3i, from the outside review of everything Phase 3 added: each hole
-- the review showed, with the case that showed it (D488, D492, D493). The
-- others, on a plan brought into another, are in 32-phase-3-review-joining.
--
-- 1. Nothing Tom types can stop Jess deleting her account: forgetting her
--    takes her id off the records, never out of the words in them (D488).
-- 2. A change can't be made to look older than it is: Activity, History and
--    "Changed by" go by when it reached the account (D492).
-- 3. A name is checked wherever it's saved (D493).

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

select tests.make_jess_and_tom('editor');

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

-- One change to one record, through save_edit, as a phone sends it.
create function pg_temp.save(plan uuid, made text, t text, id uuid, row_value jsonb) returns text
language plpgsql as $$
declare
  version integer;
begin
  execute format('select version from public.%I where id = $1', t) into version using id;
  return public.save_edit(plan, gen_random_uuid(), made, 'edit',
    jsonb_build_array(jsonb_build_object('table', t, 'id', id, 'version', version, 'row', row_value))) ->> 'saved';
end;
$$;
grant execute on function pg_temp.save(uuid, text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A change made to look older than it is (D492). First, so the plan is
-- still as the fixture made it.

select tests.as_person('tom');
select tests.through_the_data_api();
select pg_temp.save(tests.id('plan'), '2001-01-01T00:00:00Z', 'series', tests.id('rent'),
  jsonb_build_object('amount', 1));
select tests.as_person('jess');
select tests.through_the_data_api();
select ok(
  (select (r ->> 'edit_saved_at')::timestamptz > now() - interval '1 minute'
     and r ->> 'edit_made_at' = '2001-01-01T00:00:00Z'
   from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
   where r ->> 'table' = 'series' and (r -> 'row' ->> 'id')::uuid = tests.id('rent')),
  'Tom says he changed Rent in 2001: Jess''s phone is told it reached the account just now, for "Changed by", and when he said, for clashes only');
select is(
  (public.plan_activity(tests.id('plan')) -> 'edits' -> 0 ->> 'by')::uuid, tests.id('tom'),
  'and it''s at the top of her Activity, the newest change to reach the plan');
select ok(
  (public.plan_activity(tests.id('plan')) -> 'edits' -> 0 ->> 'saved_at')::timestamptz > now() - interval '1 minute',
  'with the time it reached the account, which no phone can set');
select ok(
  (public.payment_history(tests.id('plan'), tests.id('rent'), '2026-11-01') -> 'edits' -> 0 ->> 'saved_at')::timestamptz
    > now() - interval '1 minute',
  'Rent''s History says the same');

-- ---------------------------------------------------------------------------
-- 1. Text in a name that looks like Jess's id (D488). Tom puts it in Rent's
-- name, in a note, and in a name that is exactly her id, then even renames
-- Rent back: a copy of each stays in the history.

select tests.as_person('tom');
select tests.through_the_data_api();
select pg_temp.save(tests.id('plan'), '2026-11-12T10:00:00Z', 'series', tests.id('rent'),
  jsonb_build_object('name', 'Rent"' || tests.id('jess')::text));
select pg_temp.save(tests.id('plan'), '2026-11-12T10:01:00Z', 'series', tests.id('rent'),
  jsonb_build_object('name', 'Rent', 'note', '"' || tests.id('jess')::text || '"'));
select pg_temp.save(tests.id('plan'), '2026-11-12T10:02:00Z', 'series', tests.id('rent'),
  jsonb_build_object('name', tests.id('jess')::text));
select pg_temp.save(tests.id('plan'), '2026-11-12T10:03:00Z', 'series', tests.id('rent'),
  jsonb_build_object('name', 'Rent'));

select tests.as_test();
update auth.sessions set created_at = now() where user_id = tests.id('jess');
select tests.as_person('jess');
select tests.through_the_data_api();
select is(public.delete_my_account('delete') ->> 'deleted', 'true',
  'Jess can still delete her account, whatever Tom typed');
select tests.as_test();
select is((select count(*) from auth.users where id = tests.id('jess')), 0::bigint, 'and it''s gone');
select is((select note from public.series where id = tests.id('rent')), '"' || tests.id('jess')::text || '"',
  'What Tom typed is his, and stays exactly as he typed it');
select is(
  (select count(*) from app.edit_records r where r.record_id = tests.id('rent')
     and r.after ->> 'name' = tests.id('jess')::text),
  1::bigint, 'in the history too');
select is(
  (select count(*) from public.series s where s.plan_id = tests.id('plan')
     and tests.id('jess') in (s.created_by, s.changed_by, s.paid_to, s.locked_to)),
  0::bigint, 'and no payment in it names Jess');

-- With "Can view only", on his own pay in the joint account, the same.
select tests.as_test();
select tests.make_person('sam');
select tests.make_person('kit');
select tests.writing_as('sam');
insert into public.plans (id, name) values (tests.id('sam-plan'), '');
insert into public.accounts (id, plan_id, name, kind, warning_level)
values (tests.id('sam-joint'), tests.id('sam-plan'), 'Bills', 'joint', 0);
insert into public.plan_members (plan_id, person_id, role)
values (tests.id('sam-plan'), tests.id('kit'), 'viewer');
select tests.as_person('kit');
select is(pg_temp.save(tests.id('sam-plan'), '2026-11-12T10:00:00Z', 'series', tests.id('kit-pay'),
    jsonb_build_object('account_id', tests.id('sam-joint'), 'name', 'Wages"' || tests.id('sam')::text,
      'direction', 'in', 'type', 'pay', 'amount', 100, 'start_date', '2026-11-01',
      'schedule', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}'::jsonb,
      'end_rule', '{"kind":"never"}'::jsonb, 'holiday_rule', 'keep', 'family_id', tests.id('kit-pay'),
      'family_created_at', '2026-11-12T10:00:00Z', 'paid_to', tests.id('kit'))),
  'new', 'Kit, who can only view Sam''s plan, adds his own pay with Sam''s id in its name');
select tests.as_test();
update auth.sessions set created_at = now() where user_id = tests.id('sam');
select tests.as_person('sam');
select tests.through_the_data_api();
select is(public.delete_my_account('delete') ->> 'deleted', 'true', 'and Sam can still delete his account');

-- ---------------------------------------------------------------------------
-- 3. A name is checked wherever it's saved (D493).

select tests.as_person('tom');
select tests.through_the_data_api();
select is(pg_temp.refusal(format($$ update public.people set nickname = %L where id = %L $$,
    repeat('A', 100), tests.id('tom'))),
  'permission denied for table people',
  'Tom can''t set his name straight through the Data API, past its checks');
select tests.as_test();
select is(pg_temp.refusal($$ update public.people set nickname = 'Tom' || chr(8238) || 'gnp' where id = tests.id('tom') $$),
  'needs-name', 'A name that changes which way words run is refused wherever it''s saved');
select is(pg_temp.refusal($$ update public.people set nickname = repeat('A', 31) where id = tests.id('tom') $$),
  'needs-name', 'and so is one longer than 30 characters');
select is(pg_temp.refusal($$ select app.nickname('Tom' || chr(8203)) $$),
  'needs-name', 'and one with a letter you can''t see, when he asks to join');
select is((select nickname from public.people where id = tests.id('tom')), 'Tom', 'His name is as it was');

select * from finish();
rollback;
