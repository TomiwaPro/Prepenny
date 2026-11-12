-- Step 3g, from its outside review (D467): each hole the review showed,
-- closed, with the case that showed it.
--
-- 1. A phone can't send a change as one of the server's own kinds, so no
--    change can hide from Activity or "Changed by". A first copy only while
--    nobody else is in the plan.
-- 2. Making a debt private never takes over, or is blocked by, the other
--    person's own link that happens to have the same id: it's refused.
-- 3. Making an account private is refused while the other person has a
--    private link of their own on a payment in it.
-- 4. What Jess removed from an account goes private with it, so nothing of
--    it stays where Tom reads it; what Tom added and removed stays his.
-- 5. A time that isn't one is refused with a short code.

begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

select tests.make_jess_alone();

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
  ids text;
begin
  execute statement;
  return 'no refusal';
exception when others then
  get stacked diagnostics code = message_text, ids = pg_exception_detail;
  return code || coalesce(' ' || nullif(ids, ''), '');
end;
$$;
grant execute on function pg_temp.refusal(text) to authenticated;

create temporary table kept (name text primary key, value text);
grant all on kept to authenticated;

-- A change of a person's, in an edit, as save_edit makes it.
create function pg_temp.change(person text, statement text) returns void language plpgsql as $$
begin
  perform tests.in_an_edit(person);
  execute statement;
  perform tests.as_test();
end;
$$;

-- Tom joins with "Can edit", and Jess shares the joint account.
select tests.as_person('jess');
insert into kept select 'link', public.make_invite(tests.id('plan'), 'editor', 'Jess', null) ->> 'token';
select tests.as_person('tom');
select public.ask_to_join((select value from kept where name = 'link'), 'Tom');
select tests.as_person('jess');
select public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), true);
select public.share_accounts(tests.id('plan'), array[tests.id('joint')], gen_random_uuid(), '2026-11-07T11:00:00Z');
select tests.as_test();

-- A change to Rent's amount, as Tom's phone would send it, under a kind of its choosing.
create function pg_temp.rent_as(kind text) returns text language sql as $$
  select pg_temp.refusal(format($q$ select public.save_edit(tests.id('plan'), gen_random_uuid(),
    '2026-11-07T12:00:00Z', %L, jsonb_build_array(jsonb_build_object('table', 'series', 'id', tests.id('rent'),
      'version', (select version from public.series where id = tests.id('rent')), 'row', '{"amount": 1}'::jsonb))) $q$, kind))
$$;
grant execute on function pg_temp.rent_as(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. The server's own kinds.

select tests.as_person('tom');
select is(pg_temp.rent_as('first-copy'), 'bad-edit',
  'Tom can''t send a change as a first copy, which keeps no history, in a plan with Jess in it');
select is(pg_temp.rent_as('share-accounts'), 'bad-edit', 'nor as sharing an account');
select is(pg_temp.rent_as('make-private'), 'bad-edit', 'nor as making something private');
select is(pg_temp.rent_as('change-role'), 'bad-edit', 'nor as changing a role');
select is(pg_temp.rent_as('join-with-plan'), 'bad-edit', 'nor as joining with a plan');
select tests.as_person('jess');
select is(pg_temp.rent_as('first-copy'), 'bad-edit', 'Nor can Jess, with Tom in her plan');
select tests.as_test();
select is((select amount::bigint from public.series where id = tests.id('rent')), 110000::bigint, 'Rent is unchanged');

-- Alex, alone in a plan of his own, sends its first copy as before.
select tests.as_person('alex');
select public.start_plan(tests.id('alex-plan'), 'england-and-wales');
select is(public.save_edit(tests.id('alex-plan'), gen_random_uuid(), '2026-11-07T12:00:00Z', 'first-copy',
    jsonb_build_array(jsonb_build_object('table', 'accounts', 'id', tests.id('alex-current'), 'version', null,
      'row', jsonb_build_object('name', 'Current account', 'kind', 'current', 'overdraft_limit', 0,
        'warning_level', 2000, 'private_to', tests.id('alex'), 'belongs_to', tests.id('alex'))))) ->> 'saved',
  'new', 'A first copy alone in a plan is saved as before');
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 2 and 3. The other person's own private links.

-- Tom's own loan, and his link from shared Rent to it (D291), which has the
-- id worked out from Rent's family.
insert into kept values ('tom-link', app.derived_id(tests.id('plan'), 'family-debt', tests.id('rent')::text)::text);
select pg_temp.change('tom', $$
  insert into public.debts (id, plan_id, private_to, belongs_to, name, kind, balance, balance_on, balance_at, starting_balance)
  values (tests.id('tom-loan'), tests.id('plan'), tests.id('tom'), tests.id('tom'), 'Tom loan', 'loan',
    50000, '2026-11-01', '2026-11-01T09:00:00Z', 50000);
  insert into public.private_links (id, plan_id, family_id, debt_id)
  values ((select value::uuid from kept where name = 'tom-link'), tests.id('plan'),
    tests.id('rent'), tests.id('tom-loan')) $$);

-- Jess shares her card, and Rent goes towards it too.
select tests.as_person('jess');
select public.share_record(tests.id('plan'), 'debt', tests.id('jess-card'), gen_random_uuid(), '2026-11-07T13:00:00Z');
select pg_temp.change('jess', $$ update public.series set debt_id = tests.id('jess-card') where id = tests.id('rent') $$);

select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.make_private(tests.id('plan'), 'debt', tests.id('jess-card'),
    gen_random_uuid(), '2026-11-07T13:10:00Z') $$), 'partner-things []',
  'Making her card private is refused while its link would need the id of Tom''s own link');
select tests.as_test();
select is((select debt_id from public.private_links
    where id = app.derived_id(tests.id('plan'), 'family-debt', tests.id('rent')::text)), tests.id('tom-loan'),
  'and Tom''s link still names his own loan');
select is((select changed_by from public.private_links
    where id = app.derived_id(tests.id('plan'), 'family-debt', tests.id('rent')::text)), tests.id('tom'),
  'and nobody else has changed it');

select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.make_private(tests.id('plan'), 'account', tests.id('joint'),
    gen_random_uuid(), '2026-11-07T13:20:00Z') $$), 'partner-things []',
  'Making the joint account private is refused while Tom has his own link on a payment in it, which isn''t named');

-- ---------------------------------------------------------------------------
-- 4. Removed records go private with the account.

select pg_temp.change('tom', $$
  update public.private_links set deleted = true
    where id = (select value::uuid from kept where name = 'tom-link') $$);
select pg_temp.change('jess', $$
  insert into public.series (id, plan_id, account_id, name, note, direction, type, amount, start_date, schedule,
    end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('ring'), tests.id('plan'), tests.id('joint'), 'Ring deposit', 'A surprise', 'out', 'other', 75000,
    '2026-12-01', '{"kind":"once","date":"2026-12-01"}', '{"kind":"never"}', 'keep', tests.id('ring'),
    '2026-11-07T14:00:00Z') $$);
select pg_temp.change('jess', $$ update public.series set deleted = true where id = tests.id('ring') $$);
select pg_temp.change('tom', $$
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule,
    end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('gym'), tests.id('plan'), tests.id('joint'), 'Gym', 'out', 'bills', 2500,
    '2026-12-02', '{"kind":"once","date":"2026-12-02"}', '{"kind":"never"}', 'keep', tests.id('gym'),
    '2026-11-07T14:05:00Z') $$);
select pg_temp.change('tom', $$ update public.series set deleted = true where id = tests.id('gym') $$);

select tests.as_person('tom');
select is((select count(*) from tests.rows_naming(array[tests.id('ring')::text])) > 0, true,
  'While the account is shared, Tom reads what Jess removed from it, as before');
select tests.as_person('jess');
select is(public.make_private(tests.id('plan'), 'account', tests.id('joint'), gen_random_uuid(),
    '2026-11-07T14:10:00Z') ->> 'saved', 'new', 'With his link gone, Jess makes it private');

select tests.as_person('tom');
select is_empty($$ select * from tests.rows_naming(array[tests.id('ring')::text]) $$,
  'Then nothing Tom can read is or names the payment she removed');
select is(position('Ring deposit' in public.plan_changes(tests.id('plan'), 0, 0)::text), 0,
  'bringing the plan down gives him nothing of it');
select is(position('Ring deposit' in public.plan_activity(tests.id('plan'))::text), 0,
  'and his Activity has nothing of it');
select is((select count(*) from public.series where id = tests.id('gym')), 1::bigint,
  'The payment Tom added and removed himself stays his to see');

-- ---------------------------------------------------------------------------
-- 5. Times that aren't times.

select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.plan_activity(tests.id('plan'), '2026-13-45T99:99:99Z') $$), 'bad-edit',
  'A time that isn''t one is refused with a short code, in Activity');
select is(pg_temp.refusal($$ select public.share_record(tests.id('plan'), 'goal', tests.id('jess-goal'),
    gen_random_uuid(), 'yesterday') $$), 'bad-edit', 'and in the server''s own steps');

select * from finish();
rollback;
