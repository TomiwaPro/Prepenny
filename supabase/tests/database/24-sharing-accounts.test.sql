-- Step 3f: sharing an account, and claiming pay (PLAN.md items 26 and 34,
-- D16, D303, D314, D413, D414, D418).
--
-- Proves, as the owner asked, that a partner never receives anything
-- private, before or after an account is shared: the account and every
-- record on it become shared together, in the server's own step, or nothing
-- does, and what stays private (her card, her goal, her job, the details of
-- her overtime, what she removed before sharing, her other accounts) stays
-- out of every row Tom can read. Then "This is my pay" (D418).

begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

select tests.make_jess_alone();

-- A refusal's code and the ids it names, as the phone gets them.
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

-- Every record on Jess's current account that isn't removed, with its privacy.
create function pg_temp.on_current_account() returns table (t text, private uuid) language sql as $$
  select 'balance_updates', private_to from public.balance_updates where account_id = tests.id('jess-current') and not deleted
  union all select 'budgets', private_to from public.budgets where account_id = tests.id('jess-current') and not deleted
  union all select 'series', private_to from public.series where account_id = tests.id('jess-current') and not deleted
  union all select 'payment_changes', c.private_to from public.payment_changes c
    join public.series s on s.id = c.series_id where s.account_id = tests.id('jess-current') and not c.deleted
  union all select 'ticks', k.private_to from public.ticks k
    join public.series s on s.id = k.series_id where s.account_id = tests.id('jess-current') and not k.deleted
  union all select 'spends', p.private_to from public.spends p
    join public.budgets b on b.id = p.budget_id where b.account_id = tests.id('jess-current') and not p.deleted
  union all select 'pay_adjustments', a.private_to from public.pay_adjustments a
    where a.family_id = tests.id('jess-pay') and not a.deleted
$$;

-- Tom joins Jess's plan through an invite, with "Can edit".
select tests.as_person('jess');
create temporary table kept (name text primary key, value text);
grant all on kept to authenticated;
insert into kept select 'link', public.make_invite(tests.id('plan'), 'editor', 'Jess', null) ->> 'token';
select tests.as_person('tom');
select public.ask_to_join((select value from kept where name = 'link'), 'Tom');
select tests.as_person('jess');
select public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), true);

-- ---------------------------------------------------------------------------
-- Before sharing: everything is Jess's own.

select tests.as_test();
create temporary table private_before as select unnest(tests.private_ids('jess')) as id;
grant select on private_before to authenticated;
select tests.as_person('tom');
select is_empty($$ select * from tests.readable_rows()
    where split_part(readable_rows, ':', 1) not in ('people', 'plans', 'plan_members') $$,
  'Before Jess shares anything, Tom reads none of her records');
select is_empty($$ select * from tests.rows_naming((select array_agg(id) from private_before)) $$,
  'and no row he can read names one of them');
select is((select count(*) from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows')),
  0::bigint, 'Bringing the plan down gives him nothing');

-- Only her own private accounts, and only by her.
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.share_accounts(tests.id('plan'), array[tests.id('jess-current')],
    gen_random_uuid(), '2026-11-07T10:00:00Z') $$), 'not-found',
  'Tom can''t share Jess''s account');
select tests.as_person('alex');
select is(pg_temp.refusal($$ select public.share_accounts(tests.id('plan'), array[tests.id('jess-current')],
    gen_random_uuid(), '2026-11-07T10:00:00Z') $$), 'not-found',
  'nor can Alex, who isn''t in the plan');

select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.share_accounts(tests.id('plan'), array[tests.id('jess-savings')],
    gen_random_uuid(), '2026-11-07T10:00:00Z') $$), 'share-together ["' || tests.id('jess-isa') || '"]',
  'Sharing her savings alone is refused, naming the ISA money moves to: share both, or neither');
select tests.as_test();
select is((select count(*) from public.accounts where private_to is null), 0::bigint,
  'and either way nothing was shared');
select is((select count(*) from public.edits where kind = 'share-accounts'), 0::bigint,
  'or saved');

-- ---------------------------------------------------------------------------
-- Sharing her current account.

select tests.as_person('jess');
select is(public.share_accounts(tests.id('plan'), array[tests.id('jess-current')], tests.id('share-edit'),
    '2026-11-07T10:00:00Z') ->> 'saved', 'new',
  'Jess shares her current account');
select is(public.share_accounts(tests.id('plan'), array[tests.id('jess-current')], tests.id('share-edit'),
    '2026-11-07T10:00:00Z') ->> 'saved', 'already',
  'sent twice, it changes nothing the second time');

select tests.as_test();
select is((select private_to from public.accounts where id = tests.id('jess-current')), null,
  'The account is shared');
select is_empty($$ select * from pg_temp.on_current_account() where private is not null $$,
  'and so is every record on it: balance update, budget, spend, payments, changes, ticks, overtime');
select is((select count(distinct t) from pg_temp.on_current_account()), 7::bigint,
  'every kind of record checked');
select is((select locked_to from public.pay_adjustments where id = tests.id('jess-overtime')), tests.id('jess'),
  'Her overtime is shared as an amount, locked to her (D303)');
select set_eq($$ select id, family_id, debt_id, goal_id, tick_id, in_debt_update, series_id, pay_profile_id,
      cycle_pay_weeks, private_to from public.private_links $$,
  $$ values
    (app.derived_id(tests.id('plan'), 'family-debt', tests.id('jess-card-payment')::text), tests.id('jess-card-payment'),
      tests.id('jess-card'), null::uuid, null::uuid, null::uuid, null::uuid, null::uuid, null::uuid[], tests.id('jess')),
    (app.derived_id(tests.id('plan'), 'family-goal', tests.id('jess-to-goal')::text), tests.id('jess-to-goal'),
      null, tests.id('jess-goal'), null, null, null, null, null, tests.id('jess')),
    (app.derived_id(tests.id('plan'), 'tick-debt', tests.id('jess-card-tick')::text), null, null, null,
      tests.id('jess-card-tick'), tests.id('jess-card'), null, null, null, tests.id('jess')),
    (app.derived_id(tests.id('plan'), 'series-job', tests.id('jess-pay')::text), null, null, null, null, null,
      tests.id('jess-pay'), tests.id('jess-job'), array[tests.id('jess-week')], tests.id('jess')) $$,
  'Her links to her card, her goal and her job move into her private links, with the ids her phone works out');
select is(app.derived_id('0190a3d0-0000-7000-8000-000000000001', 'family-debt', 'abc'),
  '3424324e-fea7-885a-8863-d0467a5decd3'::uuid, 'which are the phone''s own (apps/web/test/unit/sync-ids.test.ts)');
select is((select private_to from public.edits where id = tests.id('share-edit')), null,
  'The edit is shared, as its records are');
select is((select array_agg(private_to) from public.series where id = tests.id('jess-rent-later')),
  array[tests.id('jess')], 'What she removed before sharing stays private (D414)');
select is_empty($$ select id from (
    select id, private_to from public.debts union all select id, private_to from public.goals
    union all select id, private_to from public.pay_profiles union all select id, private_to from public.pay_weeks
    union all select id, private_to from public.pay_adjustment_details
    union all select id, private_to from public.private_links union all select id, private_to from public.settings
    union all select id, private_to from public.accounts where id <> tests.id('jess-current')
    union all select id, private_to from public.series where account_id <> tests.id('jess-current')) r
    where private_to is distinct from tests.id('jess') $$,
  'Her card, goal, job, usual week, overtime details, links, settings and other accounts stay private');

-- What Tom gets now.
select tests.as_person('tom');
select is((select name from public.accounts where id = tests.id('jess-current')), 'Jess current',
  'Tom now sees her current account');
select is((select count(*) from public.series where account_id = tests.id('jess-current')), 4::bigint,
  'with its four payments');
select is((select count(*) from public.series where account_id = tests.id('jess-current')
    and (pay_profile_id is not null or cycle_pay_weeks is not null or debt_id is not null or goal_id is not null)),
  0::bigint, 'none naming her job, card or goal');
select is((select change::bigint from public.pay_adjustments where id = tests.id('jess-overtime')), 4500::bigint,
  'and her overtime as an amount');
select tests.as_test();
create temporary table still_private as select unnest(tests.private_ids('jess')) as id;
grant select on still_private to authenticated;
select tests.as_person('tom');
select is_empty($$ select * from tests.rows_naming((select array_agg(id) from still_private)) $$,
  'No row Tom can read is, or names, anything still private to Jess');
select is_empty($$ select r from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r -> 'row' ->> 'private_to' is not null
      or r::text like any (select '%' || id || '%' from still_private) $$,
  'and bringing the plan down gives him none of it either');
select tests.in_an_edit('tom');
select is(tests.change_rows(array[tests.id('jess-overtime')::text]), 0::bigint,
  'Tom can''t change her overtime');
select is(tests.change_rows(array[tests.id('jess-rent')::text]), 1::bigint,
  'but with "Can edit" he can change a shared payment, though its family has a removed private one');

-- "From Jess": money from her private savings into the shared account (D16).
select tests.in_an_edit('jess');
insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
  holiday_rule, family_id, family_created_at, locked_to)
values (tests.id('from-jess'), tests.id('plan'), tests.id('jess-current'), 'From Jess', 'in', 'savings', 60000,
  date '2026-11-28', '{"kind":"monthly","every":1,"on":{"kind":"day","day":28}}', '{"kind":"never"}', 'keep',
  tests.id('from-jess'), '2026-11-07T10:00:00Z', tests.id('jess'));
insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
  holiday_rule, family_id, family_created_at, mirrored_by)
values (tests.id('to-current'), tests.id('plan'), tests.id('jess-savings'), 'Top up', 'out', 'savings', 60000,
  date '2026-11-28', '{"kind":"monthly","every":1,"on":{"kind":"day","day":28}}', '{"kind":"never"}', 'keep',
  tests.id('to-current'), '2026-11-07T10:00:00Z', tests.id('from-jess'));
select tests.as_person('tom');
select is((select name || ', ' || amount::bigint from public.series where id = tests.id('from-jess')), 'From Jess, 60000',
  'Tom sees "From Jess, £600"');
select is((select count(*) from public.series where id = tests.id('to-current')), 0::bigint,
  'and nothing of the account it comes from');
select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.share_accounts(tests.id('plan'),
    array[tests.id('jess-savings'), tests.id('jess-isa')], gen_random_uuid(), '2026-11-07T10:00:00Z') $$),
  'share-has-halves ["' || tests.id('to-current') || '"]',
  'Sharing an account with money kept as "From Jess" is refused, naming it');

-- Only someone who can edit shares an account.
select tests.as_test();
update public.plan_members set role = 'viewer' where person_id = tests.id('tom');
select tests.in_an_edit('tom');
insert into public.accounts (id, plan_id, private_to, name, kind, warning_level, belongs_to)
values (tests.id('tom-current'), tests.id('plan'), tests.id('tom'), 'Tom current', 'current', 0, tests.id('tom'));
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.share_accounts(tests.id('plan'), array[tests.id('tom-current')],
    gen_random_uuid(), '2026-11-07T10:00:00Z') $$), 'view-only',
  'Tom, with "Can view only", can''t share even his own account');
select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.share_accounts(tests.id('plan'), array[tests.id('tom-current')],
    gen_random_uuid(), '2026-11-07T10:00:00Z') $$), 'not-found',
  'and Jess can''t share it for him');

-- ---------------------------------------------------------------------------
-- "This is my pay" (D418).

select tests.as_person('jess');
select public.share_accounts(tests.id('plan'), array[tests.id('joint')], tests.id('share-joint'),
  '2026-11-07T10:05:00Z');
select tests.in_an_edit('jess');
insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
  holiday_rule, family_id, family_created_at, paid_to)
values (tests.id('toms-pay'), tests.id('plan'), tests.id('joint'), 'Tom''s pay', 'in', 'pay', 190000,
  date '2026-11-27', '{"kind":"monthly","every":1,"on":{"kind":"day","day":27}}', '{"kind":"never"}', 'keep',
  tests.id('toms-pay'), '2026-11-07T10:06:00Z', tests.id('jess'));
select tests.in_an_edit('tom');
select is(tests.change_rows(array[tests.id('toms-pay')::text]), 0::bigint,
  'Jess added Tom''s pay as hers, so Tom, with "Can view only", can''t look after it');

select tests.as_person('alex');
select is(pg_temp.refusal($$ select public.claim_pay(tests.id('plan'), tests.id('toms-pay'), gen_random_uuid(),
    '2026-11-07T10:10:00Z') $$), 'not-found', 'Alex, outside the plan, can''t claim it');
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.claim_pay(tests.id('plan'), tests.id('rent'), gen_random_uuid(),
    '2026-11-07T10:10:00Z') $$), 'not-pay', 'Rent isn''t pay, so nobody claims it');
select is(pg_temp.refusal($$ select public.claim_pay(tests.id('plan'), tests.id('from-jess'), gen_random_uuid(),
    '2026-11-07T10:10:00Z') $$), 'not-pay', 'nor "From Jess"');
select is(pg_temp.refusal($$ select public.claim_pay(tests.id('plan'), tests.id('jess-pay'), gen_random_uuid(),
    '2026-11-07T10:10:00Z') $$), 'pay-has-details',
  'Jess''s own pay has her overtime and job on it, so it can''t be claimed');
select is(pg_temp.refusal($$ select public.claim_pay(tests.id('plan'), tests.id('savings-to-isa'), gen_random_uuid(),
    '2026-11-07T10:10:00Z') $$), 'not-found', 'Something private to Jess can''t even be named');

select is(public.claim_pay(tests.id('plan'), tests.id('toms-pay'), tests.id('claim-edit'), '2026-11-07T10:10:00Z')
    ->> 'saved', 'new', 'Tom claims his pay: "This is my pay"');
select is(public.claim_pay(tests.id('plan'), tests.id('toms-pay'), tests.id('claim-edit'), '2026-11-07T10:10:00Z')
    ->> 'saved', 'already', 'sent twice, nothing more changes');
select is((select paid_to from public.series where id = tests.id('toms-pay')), tests.id('tom'),
  'It''s his pay now');
select tests.in_an_edit('tom');
select is(tests.change_rows(array[tests.id('toms-pay')::text]), 1::bigint,
  'so he can look after it with "Can view only" (D311)');
select tests.as_person('jess');
select is(public.claim_pay(tests.id('plan'), tests.id('toms-pay'), gen_random_uuid(), '2026-11-07T10:11:00Z')
    ->> 'saved', 'new', 'A claim made by mistake can be claimed back');

select * from finish();
rollback;
