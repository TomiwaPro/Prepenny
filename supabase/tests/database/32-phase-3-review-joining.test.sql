-- Step 3i, from the outside review of everything Phase 3 added: a plan
-- brought into another (D426), and someone deleting their account after it.
--
-- 1. Joining with a plan brings its history: Alex's Activity still has his
--    changes, private to him, and Jess sees none of them (D489).
-- 2. Changes in it by Tom, who had left it, are by "someone who has left"
--    in Jess's plan, where Tom never was, and Tom can still delete his
--    account (D490).
-- 3. Once Jess has deleted her account, no history copy names her (D491).

begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

select tests.make_jess_alone();
update auth.sessions set created_at = now();

create temporary table kept (name text primary key, value text);
grant all on kept to authenticated;

-- One change to one record, through save_edit, as a phone sends it.
create function pg_temp.save(plan uuid, edit uuid, made text, t text, id uuid, row_value jsonb) returns text
language plpgsql as $$
declare
  version integer;
begin
  execute format('select version from public.%I where id = $1', t) into version using id;
  return public.save_edit(plan, edit, made, 'edit',
    jsonb_build_array(jsonb_build_object('table', t, 'id', id, 'version', version, 'row', row_value))) ->> 'saved';
end;
$$;
grant execute on function pg_temp.save(uuid, uuid, text, text, uuid, jsonb) to authenticated;

-- The ids of the changes in someone's Activity.
create function pg_temp.activity_of(person text, plan text) returns setof uuid language plpgsql as $$
begin
  perform tests.as_person(person);
  perform tests.through_the_data_api();
  return query select (e ->> 'id')::uuid
    from jsonb_array_elements(public.plan_activity(tests.id(plan)) -> 'edits') e;
end;
$$;
grant execute on function pg_temp.activity_of(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Alex's own plan: an account, then a new name for it.

select tests.as_person('alex');
select tests.through_the_data_api();
select public.start_plan(tests.id('alex-plan'), 'england-and-wales');
select pg_temp.save(tests.id('alex-plan'), tests.id('alex-adds'), '2026-11-12T10:00:00Z', 'accounts',
  tests.id('alex-bank'), jsonb_build_object('name', 'Alex current', 'kind', 'current', 'warning_level', 0));
select pg_temp.save(tests.id('alex-plan'), tests.id('alex-renames'), '2026-11-12T10:01:00Z', 'accounts',
  tests.id('alex-bank'), jsonb_build_object('name', 'Alex bank'));

-- Tom joins it, adds an account of the plan's, and leaves.
insert into kept select 'alex-link', public.make_invite(tests.id('alex-plan'), 'editor', 'Alex', null) ->> 'token';
select tests.as_person('tom');
select tests.through_the_data_api();
select public.ask_to_join((select value from kept where name = 'alex-link'), 'Tom');
insert into kept select 'alex-invite', public.look_at_invite((select value from kept where name = 'alex-link')) ->> 'invite';
select tests.as_person('alex');
select tests.through_the_data_api();
select public.answer_join((select value::uuid from kept where name = 'alex-invite'), true);
select tests.as_person('tom');
select tests.through_the_data_api();
select pg_temp.save(tests.id('alex-plan'), tests.id('tom-adds'), '2026-11-12T10:02:00Z', 'accounts',
  tests.id('bills-pot'), jsonb_build_object('name', 'Bills pot', 'kind', 'joint', 'warning_level', 0));
select public.leave_plan(tests.id('alex-plan'), false, tests.id('tom-own-plan'), gen_random_uuid(),
  '2026-11-12T10:03:00Z');
select set_has($$ select pg_temp.activity_of('alex', 'alex-plan') $$,
  $$ values (tests.id('alex-adds')), (tests.id('alex-renames')), (tests.id('tom-adds')) $$,
  'Before he joins Jess, Alex''s Activity has his two changes and Tom''s');

-- Jess invites Alex, and he brings his plan.
select tests.as_person('jess');
select tests.through_the_data_api();
insert into kept select 'jess-link', public.make_invite(tests.id('plan'), 'editor', 'Jess', null) ->> 'token';
select tests.as_person('alex');
select tests.through_the_data_api();
select public.ask_to_join((select value from kept where name = 'jess-link'), 'Alex');
insert into kept select 'jess-invite', public.look_at_invite((select value from kept where name = 'jess-link')) ->> 'invite';
select tests.as_person('jess');
select tests.through_the_data_api();
select public.answer_join((select value::uuid from kept where name = 'jess-invite'), true);
select tests.as_person('alex');
select tests.through_the_data_api();
select is(public.join_with_my_plan((select value::uuid from kept where name = 'jess-invite'), 'england-and-wales',
    gen_random_uuid(), '2026-11-12T10:04:00Z') ->> 'state', 'joined', 'Alex joins Jess''s plan with his own');

-- ---------------------------------------------------------------------------
-- 1. His history came with it (D489).

select set_has($$ select pg_temp.activity_of('alex', 'plan') $$,
  $$ values (tests.id('alex-adds')), (tests.id('alex-renames')) $$,
  'In Jess''s plan, Alex''s Activity still has both his changes');
select tests.as_test();
select is((select count(*) from app.edit_records r
    where r.edit_id in (tests.id('alex-adds'), tests.id('alex-renames')) and r.plan_id = tests.id('plan')),
  2::bigint, 'with what each changed');
select is((select count(*) from app.edit_records r
    where r.plan_id = tests.id('plan') and r.edit_id in (tests.id('alex-adds'), tests.id('alex-renames'), tests.id('tom-adds'))
      and (r.after_private is distinct from tests.id('alex')
        or (r.before is not null and r.before_private is distinct from tests.id('alex')))),
  0::bigint, 'every copy private to Alex, as everything he brought is');
select is_empty($$ select pg_temp.activity_of('jess', 'plan')
    intersect values (tests.id('alex-adds')), (tests.id('alex-renames')), (tests.id('tom-adds')) $$,
  'and Jess sees none of it');
-- ---------------------------------------------------------------------------
-- 2. Tom's change came as by "someone who has left" (D490).

select tests.as_test();
select is((select count(*) from public.edits e where e.plan_id = tests.id('plan') and e.person_id = tests.id('tom')),
  0::bigint, 'No change in Jess''s plan names Tom, who was never in it');
select is((select person_id from public.edits where id = tests.id('tom-adds')), null::uuid,
  'His change in Alex''s plan is by "someone who has left" now');
select is((select e ->> 'by' from jsonb_array_elements(
      (select public.plan_activity(tests.id('plan')) from (select tests.as_person('alex'), tests.through_the_data_api()) go)
      -> 'edits') e where (e ->> 'id')::uuid = tests.id('tom-adds')),
  null, 'and Alex''s Activity says so, rather than taking Jess for the one who made it');
select tests.as_person('tom');
select tests.through_the_data_api();
select is(public.delete_my_account('delete') ->> 'deleted', 'true', 'Tom can delete his account');

-- ---------------------------------------------------------------------------
-- 3. Jess shares her joint account, then deletes her account (D491).

select tests.as_person('jess');
select tests.through_the_data_api();
select public.share_accounts(tests.id('plan'), array[tests.id('joint')], gen_random_uuid(), '2026-11-12T10:05:00Z');
select tests.as_test();
select ok((select count(*) from app.edit_records r where r.plan_id = tests.id('plan')
    and r.before_private = tests.id('jess')) > 0,
  'Sharing it kept copies of how it was while it was hers alone');
select tests.as_person('jess');
select tests.through_the_data_api();
select is(public.delete_my_account('delete') ->> 'deleted', 'true', 'Jess deletes her account');
select tests.as_test();
select is((select count(*) from app.edit_records r
    where tests.id('jess') in (r.before_private, r.after_private)
      or to_jsonb(r)::text like '%' || tests.id('jess')::text || '%'),
  0::bigint, 'and no copy in the history names her any more');

select * from finish();
rollback;
