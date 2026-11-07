-- Step 3c: who can save what through save_edit, and who hears the nudges.
-- - "Can view only" can't save shared changes, apart from their own pay
--   (D311, D319). save_edit runs as the person, so the privacy rules of
--   steps 3a and 3b decide, exactly as for any other request.
-- - A sign-in that has ended saves and reads nothing (D21).
-- - The live nudges (D295): each person hears only their own plans, and
--   their own private nudges; nobody can send one but save_edit; and a nudge
--   says nothing.

begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

select tests.make_jess_and_tom('viewer');

create function tests.save_as(edit text, writes jsonb) returns jsonb language sql as $$
  select public.save_edit(tests.id('plan'), tests.id(edit), '2026-11-07T10:00:00Z', 'just-this-one', writes)
$$;
create function tests.pay_row(account text, amount bigint) returns jsonb language sql as $$
  select jsonb_build_object('account_id', tests.id(account), 'name', 'Tom pay', 'direction', 'in', 'type', 'pay',
    'amount', amount, 'start_date', '2026-11-27',
    'schedule', '{"kind":"monthly","every":1,"on":{"kind":"day","day":27}}'::jsonb,
    'end_rule', '{"kind":"never"}'::jsonb, 'holiday_rule', 'working-day-before',
    'family_id', tests.id('tom-joint-pay'), 'family_created_at', '2026-10-26T09:00:00Z',
    'is_estimate', true, 'paid_to', tests.id('tom'), 'list_order', 0)
$$;
grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- "Can view only".

select tests.as_person('tom');
select throws_ok($$ select tests.save_as('tom-rent', jsonb_build_array(jsonb_build_object('table', 'series',
    'id', tests.id('rent'), 'version', 1, 'row', jsonb_build_object('name', 'Rent', 'amount', 1, 'list_order', 0)))) $$,
  '42501', null, 'Tom, who can only view, can''t change the shared rent through save_edit');
select throws_ok($$ select tests.save_as('tom-tick', jsonb_build_array(jsonb_build_object('table', 'ticks',
    'id', tests.id('tom-rent-tick'), 'version', null, 'row', jsonb_build_object('series_id', tests.id('rent'),
    'original_date', '2026-12-01', 'payment_number', 1, 'paid_on', '2026-12-01',
    'ticked_at', '2026-12-01T09:00:00Z', 'list_order', 0)))) $$,
  '42501', null, 'nor tick it (D51)');
select throws_ok($$ select tests.save_as('tom-budget', jsonb_build_array(jsonb_build_object('table', 'budgets',
    'id', tests.id('tom-new-budget'), 'version', null, 'row', jsonb_build_object('account_id', tests.id('joint'),
    'name', 'Takeaways', 'amount', 2000, 'every', 'week', 'leaves', 'at-start', 'starts_on', '2026-11-01',
    'made_at', '2026-11-07T10:00:00Z', 'list_order', 0)))) $$,
  '42501', null, 'nor add a budget to the joint account');
select throws_ok($$ select tests.save_as('tom-remove', jsonb_build_array(jsonb_build_object('table', 'accounts',
    'id', tests.id('joint'), 'version', 1, 'row', null))) $$,
  '42501', null, 'nor remove the joint account');
select throws_ok($$ select tests.save_as('tom-nation', jsonb_build_array(jsonb_build_object('table', 'plans',
    'id', tests.id('plan'), 'version', (select version from public.plans where id = tests.id('plan')),
    'row', '{"nation":"scotland"}'::jsonb))) $$,
  '42501', null, 'nor change the plan''s bank holidays');
select is((select count(*) from public.edits where person_id = tests.id('tom')), 0::bigint,
  'and none of those refused edits is in the history');

-- His own pay, which he may look after (D311, D319).
select is(tests.save_as('tom-own-pay', jsonb_build_array(jsonb_build_object('table', 'series',
    'id', tests.id('tom-joint-pay'), 'version', null, 'row', tests.pay_row('joint', 180000)))) ->> 'saved', 'new',
  'He adds his own pay into the joint account');
select is(tests.save_as('tom-own-pay-real', jsonb_build_array(jsonb_build_object('table', 'payment_changes',
    'id', tests.id('tom-real'), 'version', null, 'row', jsonb_build_object('series_id', tests.id('tom-joint-pay'),
    'original_date', '2026-11-27', 'payment_number', 0, 'amount', 181234, 'list_order', 0)))) ->> 'saved', 'new',
  'types its real amount');
select is(tests.save_as('tom-own-pay-arrived', jsonb_build_array(jsonb_build_object('table', 'ticks',
    'id', tests.id('tom-arrived'), 'version', null, 'row', jsonb_build_object('series_id', tests.id('tom-joint-pay'),
    'original_date', '2026-11-27', 'payment_number', 0, 'paid_on', '2026-11-27',
    'ticked_at', '2026-11-27T09:00:00Z', 'list_order', 0)))) ->> 'saved', 'new',
  'and marks it as arrived (D319)');
select is(tests.save_as('tom-overtime', jsonb_build_array(
    jsonb_build_object('table', 'pay_adjustments', 'id', tests.id('tom-ot'), 'version', null,
      'row', jsonb_build_object('family_id', tests.id('tom-joint-pay'), 'payment_number', 1, 'change', 4500,
        'list_order', 0)),
    jsonb_build_object('table', 'pay_adjustment_details', 'id', tests.id('tom-ot-details'), 'version', null,
      'row', jsonb_build_object('adjustment_id', tests.id('tom-ot'), 'kind', 'overtime', 'worked_on', '2026-11-20',
        'hours', '3', 'rate', '15', 'tax_year', '2026-27', 'list_order', 0)))) ->> 'saved', 'new',
  'and adds overtime to it, with its details, in one edit');
select is((select locked_to from public.pay_adjustments where id = tests.id('tom-ot')), tests.id('tom'),
  'The overtime''s change is locked to him, filled in by the database (D303)');
select throws_ok($$ select tests.save_as('tom-jess-pay', jsonb_build_array(jsonb_build_object('table', 'payment_changes',
    'id', tests.id('tom-on-jess'), 'version', null, 'row', jsonb_build_object('series_id', tests.id('jess-cafe-pay'),
    'original_date', '2026-12-01', 'payment_number', 1, 'amount', 1, 'list_order', 0)))) $$,
  '42501', null, 'He still can''t touch Jess''s pay in the joint account');
select throws_ok($$ select tests.save_as('tom-mixed', jsonb_build_array(
    jsonb_build_object('table', 'payment_changes', 'id', tests.id('tom-real-2'), 'version', null,
      'row', jsonb_build_object('series_id', tests.id('tom-joint-pay'), 'original_date', '2026-12-27',
        'payment_number', 1, 'amount', 1, 'list_order', 0)),
    jsonb_build_object('table', 'ticks', 'id', tests.id('tom-rent-tick-2'), 'version', null,
      'row', jsonb_build_object('series_id', tests.id('rent'), 'original_date', '2026-12-01', 'payment_number', 1,
        'paid_on', '2026-12-01', 'ticked_at', '2026-12-01T09:00:00Z', 'list_order', 0)))) $$,
  '42501', null, 'and an edit with his own pay and the rent together is refused whole');
select is((select count(*) from public.payment_changes where id = tests.id('tom-real-2')), 0::bigint,
  'so his own part of it isn''t saved either');
select is(tests.save_as('tom-own-account', jsonb_build_array(jsonb_build_object('table', 'accounts',
    'id', tests.id('tom-current'), 'version', 1, 'row', jsonb_build_object('name', 'Tom current', 'kind', 'current',
    'warning_level', 1000, 'private_to', tests.id('tom'), 'belongs_to', tests.id('tom'), 'list_order', 0))))
    ->> 'saved', 'new',
  'He can change his own private account, as before (D302)');

-- ---------------------------------------------------------------------------
-- A sign-in that has ended (D21).

select tests.as_test();
delete from auth.sessions where id = tests.id('tom-session');
select tests.as_person('tom');
select throws_ok($$ select tests.save_as('tom-after', jsonb_build_array(jsonb_build_object('table', 'accounts',
    'id', tests.id('tom-current'), 'version', 2, 'row', jsonb_build_object('name', 'Tom current', 'kind', 'current',
    'warning_level', 900, 'private_to', tests.id('tom'), 'belongs_to', tests.id('tom'), 'list_order', 0)))) $$,
  '42501', null, 'Once Tom''s sign-in has ended, he can''t save even his own records');
select throws_ok($$ select public.plan_changes(tests.id('plan'), 0, 0) $$, '42501', null,
  'nor bring the plan down');
select throws_ok($$ select public.start_plan(tests.id('tom-new-plan'), null) $$, '42501', null,
  'nor make a plan');
select is(app.may_hear('plan:' || tests.id('plan')), false, 'nor hear the plan''s nudges');

-- ---------------------------------------------------------------------------
-- The live nudges.

select tests.as_person('jess');
select is(app.may_hear('plan:' || tests.id('plan')), true, 'Jess hears her plan''s nudges');
select is(app.may_hear('plan:' || tests.id('plan') || ':' || tests.id('tom')), false,
  'but not Tom''s private ones');
select tests.as_test();
select is((select count(*) from realtime.messages where topic = 'plan:' || tests.id('plan')
    and payload = '{}'::jsonb and event = 'changed'), 4::bigint,
  'Each of Tom''s four edits of shared records nudged the plan once, with nothing in the nudge');
select is((select count(*) from realtime.messages where topic = 'plan:' || tests.id('plan') || ':' || tests.id('tom')),
  2::bigint, 'and the edits with something private to him (the overtime''s details, his own account) nudged only him');

-- What Realtime asks before it passes a nudge on: Tom, signed in again, reads
-- his plan's nudges and his own; Alex, in no plan, reads none.
insert into auth.sessions (id, user_id) values (tests.id('tom-session'), tests.id('tom'));
select tests.as_person('alex');
select set_config('realtime.topic', 'plan:' || tests.id('plan'), true);
select is((select count(*) from realtime.messages), 0::bigint, 'Alex, who isn''t in the plan, hears none of its nudges');

select * from finish();
rollback;
