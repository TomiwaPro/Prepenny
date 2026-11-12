-- Step 3g: leaving a shared plan (brief 4.14, 8.7 test 5, D53, D468 to D472).
--
-- Proves what the owner asked:
-- - after leaving, Tom gets nothing more from the plan: he can't read,
--   bring down, save, see Activity or a payment's history, or hear about it;
-- - Jess keeps nothing of Tom's private records: not a record, not a link,
--   not a notice, and not a copy in the history of changes;
-- and the rest of option A: his private things go with him into a plan of
-- his own, with their history; the shared accounts stay with Jess as they
-- are; he chooses whether to take a copy of them, which is his alone; Jess's
-- Activity keeps his shared changes with his name. And: the person who
-- stays becomes the owner when the owner leaves; someone with "Can view
-- only" can leave; nobody leaves a plan they're alone in; a goal of his own
-- that saves into a shared account brings a copy of that account.

begin;
create extension if not exists pgtap with schema extensions;

select plan(63);

select tests.make_jess_alone();
select tests.make_person('sam');

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

create temporary table kept (name text primary key, value text);
grant all on kept to authenticated;

-- A change of a person's, in an edit, as save_edit makes it.
create function pg_temp.change(person text, label text, statement text, plan text default 'plan')
returns void language plpgsql as $$
begin
  perform tests.in_an_edit(person, plan);
  execute statement;
  insert into kept values (label, current_setting('prepenny.edit'))
    on conflict (name) do update set value = excluded.value;
  perform tests.as_test();
end;
$$;

-- How many rows of a plan the person acting now can read, in every table.
create function pg_temp.readable_in(plan uuid) returns bigint language plpgsql as $$
declare
  t text;
  n bigint;
  total bigint := 0;
begin
  for t in select unnest(tests.record_tables() || array['edits', 'notices', 'plan_members', 'invites']) loop
    execute format('select count(*) from public.%I where plan_id = $1', t) into n using plan;
    total := total + n;
  end loop;
  return total + (select count(*) from public.plans where id = plan);
end;
$$;
grant execute on function pg_temp.readable_in(uuid) to authenticated;

-- Everything of a plan, read past the privacy rules, as text: every record,
-- every change and every copy in the history of changes.
create function pg_temp.all_of(plan uuid) returns text language plpgsql security definer as $$
declare
  t text;
  got text;
  everything text := '';
begin
  for t in select unnest(app.record_tables() || array['edits', 'notices']) loop
    execute format('select coalesce(string_agg(to_jsonb(r)::text, '' ''), '''') from public.%I r where r.plan_id = $1', t)
      into got using plan;
    everything := everything || got;
  end loop;
  select everything || coalesce(string_agg(to_jsonb(r)::text, ' '), '') into everything
    from app.edit_records r where r.plan_id = plan;
  return everything;
end;
$$;

-- Every record id in a plan, read past the privacy rules.
create function pg_temp.ids_in(plan uuid) returns text[] language plpgsql security definer as $$
declare
  t text;
  found_ids text[];
  ids text[] := '{}'::text[];
begin
  for t in select unnest(app.record_tables()) loop
    execute format('select array_agg(id::text) from public.%I where plan_id = $1', t) into found_ids using plan;
    ids := ids || coalesce(found_ids, '{}');
  end loop;
  return ids;
end;
$$;

-- A copy's id in the leaver's new plan, as the server works it out.
create function pg_temp.copy_of(plan text, t text, record text) returns uuid language sql security definer as $$
  select app.derived_id(tests.id(plan), 'copy', t, tests.id(record)::text)
$$;
grant execute on function pg_temp.copy_of(text, text, text) to authenticated;

-- Tom joins Jess's plan with "Can edit", and Jess shares the joint account.
select tests.as_person('jess');
insert into kept select 'link', public.make_invite(tests.id('plan'), 'editor', 'Jess', null) ->> 'token';
select tests.as_person('tom');
select public.ask_to_join((select value from kept where name = 'link'), 'Tom');
select tests.as_person('jess');
select public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), true);
select public.share_accounts(tests.id('plan'), array[tests.id('joint')], gen_random_uuid(), '2026-11-07T11:00:00Z');
select tests.as_test();

-- The ids his phone works out from the plan (lib/sync-ids.ts).
insert into kept values
  ('phone-change', app.derived_id(tests.id('plan'), 'payment_changes', tests.id('tom-phone')::text, '2026-11-15', '')),
  ('phone-tick', app.derived_id(tests.id('plan'), 'ticks', tests.id('tom-phone')::text, '2026-11-15', '')),
  ('tom-settings', app.derived_id(tests.id('plan'), 'settings', tests.id('tom')::text)),
  ('rent-link', app.derived_id(tests.id('plan'), 'family-debt', tests.id('rent')::text)),
  ('pay-link', app.derived_id(tests.id('plan'), 'pay-job', tests.id('tom-pay')::text)),
  ('overtime-details', app.derived_id(tests.id('plan'), 'pay-adjustment-details', tests.id('tom-overtime')::text));
create function pg_temp.kept(label text) returns uuid language sql as $$
  select value::uuid from kept where name = label
$$;
grant execute on function pg_temp.kept(text) to authenticated;

-- Tom's own things: his account with a payment, a one-off change and a tick;
-- his loan, which shared Rent goes towards for him (D291); his job; a goal
-- in his account, and one of his own that saves into the joint account; and
-- his settings.
select pg_temp.change('tom', 'tom-own', $$
  insert into public.accounts (id, plan_id, private_to, name, kind, warning_level, belongs_to)
  values (tests.id('tom-current'), tests.id('plan'), tests.id('tom'), 'Tom current', 'current', 0, tests.id('tom'));
  insert into public.balance_updates (id, plan_id, account_id, balance, checked_on, checked_at)
  values (tests.id('tom-balance'), tests.id('plan'), tests.id('tom-current'), 30000, '2026-11-07', '2026-11-07T09:00:00Z');
  insert into public.debts (id, plan_id, private_to, belongs_to, name, kind, balance, balance_on, balance_at, starting_balance)
  values (tests.id('tom-loan'), tests.id('plan'), tests.id('tom'), tests.id('tom'), 'Tom loan', 'loan',
    50000, '2026-11-01', '2026-11-01T09:00:00Z', 50000);
  insert into public.pay_profiles (id, plan_id, private_to, belongs_to, name, frequency, tax_code, basis)
  values (tests.id('tom-job'), tests.id('plan'), tests.id('tom'), tests.id('tom'), 'Garage job', 'monthly', '1257L', 'cumulative');
  insert into public.pay_weeks (id, plan_id, pay_profile_id, name, lines)
  values (tests.id('tom-week'), tests.id('plan'), tests.id('tom-job'), 'Usual week',
    '[{"name":"Basic","kind":"basic","hours":"40","rate":"13.10"}]');
  insert into public.goals (id, plan_id, private_to, name, target, account_id, belongs_to)
  values (tests.id('tom-goal'), tests.id('plan'), tests.id('tom'), 'Tom bike', 60000, tests.id('tom-current'), tests.id('tom')),
    (tests.id('tom-gift'), tests.id('plan'), tests.id('tom'), 'Ring', 90000, tests.id('joint'), tests.id('tom'));
  insert into public.series (id, plan_id, account_id, name, note, direction, type, amount, start_date, schedule,
    end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('tom-phone'), tests.id('plan'), tests.id('tom-current'), 'Tom phone', 'Contract ends in May', 'out',
    'bills', 3000, '2026-11-15', '{"kind":"monthly","every":1,"on":{"kind":"day","day":15}}', '{"kind":"never"}', 'keep',
    tests.id('tom-phone'), '2026-11-07T09:00:00Z');
  insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, amount)
  values (pg_temp.kept('phone-change'), tests.id('plan'), tests.id('tom-phone'), '2026-11-15', 0, 3200);
  insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (pg_temp.kept('phone-tick'), tests.id('plan'), tests.id('tom-phone'), '2026-11-15', 0, '2026-11-15', '2026-11-15T09:00:00Z');
  insert into public.settings (id, plan_id, main_pay_family_id)
  values (pg_temp.kept('tom-settings'), tests.id('plan'), null) $$);
select pg_temp.change('tom', 'tom-rent-link', $$
  insert into public.private_links (id, plan_id, family_id, debt_id)
  values (pg_temp.kept('rent-link'), tests.id('plan'),
    tests.id('rent'), tests.id('tom-loan')) $$);

-- His pay into the joint account, linked to his job for him, with overtime
-- whose details are his alone.
select pg_temp.change('tom', 'tom-pay', $$
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
    holiday_rule, family_id, family_created_at, paid_to)
  values (tests.id('tom-pay'), tests.id('plan'), tests.id('joint'), 'Tom''s pay', 'in', 'pay', 190000,
    '2026-11-28', '{"kind":"monthly","every":1,"on":{"kind":"day","day":28}}', '{"kind":"never"}', 'keep',
    tests.id('tom-pay'), '2026-11-07T10:06:00Z', tests.id('tom'));
  insert into public.private_links (id, plan_id, series_id, pay_profile_id, cycle_pay_weeks)
  values (pg_temp.kept('pay-link'), tests.id('plan'), tests.id('tom-pay'),
    tests.id('tom-job'), array[tests.id('tom-week')]);
  insert into public.pay_adjustments (id, plan_id, family_id, payment_number, change)
  values (tests.id('tom-overtime'), tests.id('plan'), tests.id('tom-pay'), 0, 5200);
  insert into public.pay_adjustment_details (id, plan_id, adjustment_id, kind, worked_on, hours, rate, tax_year)
  values (pg_temp.kept('overtime-details'), tests.id('plan'),
    tests.id('tom-overtime'), 'overtime', '2026-11-20', '4', '19.65', '2026-27') $$);

-- "From Tom": money from his own account into the joint one (D16).
select pg_temp.change('tom', 'from-tom', $$
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
    holiday_rule, family_id, family_created_at, locked_to)
  values (tests.id('from-tom'), tests.id('plan'), tests.id('joint'), 'From Tom', 'in', 'savings', 40000,
    '2026-11-28', '{"kind":"monthly","every":1,"on":{"kind":"day","day":28}}', '{"kind":"never"}', 'keep',
    tests.id('from-tom'), '2026-11-07T10:10:00Z', tests.id('tom'));
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
    holiday_rule, family_id, family_created_at, mirrored_by)
  values (tests.id('to-joint'), tests.id('plan'), tests.id('tom-current'), 'To joint', 'out', 'savings', 40000,
    '2026-11-28', '{"kind":"monthly","every":1,"on":{"kind":"day","day":28}}', '{"kind":"never"}', 'keep',
    tests.id('to-joint'), '2026-11-07T10:10:00Z', tests.id('from-tom')) $$);

-- One change of Tom's to shared Rent alone, and one to Rent and his loan together.
select pg_temp.change('tom', 'tom-rent', $$ update public.series set amount = 112000 where id = tests.id('rent') $$);
select pg_temp.change('tom', 'tom-mixed', $$
  update public.series set amount = 113000 where id = tests.id('rent');
  update public.debts set balance = 48000 where id = tests.id('tom-loan') $$);
-- His card, his own until he shares it, so the history has a copy of it from
-- when it was his alone.
select pg_temp.change('tom', 'tom-card', $$
  insert into public.debts (id, plan_id, private_to, belongs_to, name, kind, balance, balance_on, balance_at, starting_balance)
  values (tests.id('tom-card'), tests.id('plan'), tests.id('tom'), tests.id('tom'), 'Tom card', 'credit-card',
    20000, '2026-11-01', '2026-11-01T09:00:00Z', 20000) $$);
select tests.as_person('tom');
select public.share_record(tests.id('plan'), 'debt', tests.id('tom-card'), gen_random_uuid(), '2026-11-07T12:30:00Z');
select tests.as_test();
select is((select count(*) from app.edit_records where record_id = tests.id('tom-card')
    and before_private = tests.id('tom') and before is not null), 1::bigint,
  'The history has a copy of his card from when it was his alone');

-- And a notice for him (a clash he lost, say).
insert into public.notices (plan_id, for_person, kind, data)
values (tests.id('plan'), tests.id('tom'), 'clash', jsonb_build_object('rows', jsonb_build_array()));

insert into kept select 'nation', nation from public.plans where id = tests.id('plan');
create function pg_temp.kept_text(label text) returns text language sql as $$
  select value from kept where name = label
$$;
grant execute on function pg_temp.kept_text(text) to authenticated;

-- Everything private to Tom now, and the shared records as they are.
create temporary table toms_own as select unnest(tests.private_ids('tom')) as id;
grant select on toms_own to authenticated;
create temporary table shared_before as
  select 'series:' || id as key, to_jsonb(s) - 'seq' - 'version' - 'changed_at' - 'changed_by' - 'edit_id'
    - 'locked_to' - 'paid_to' as row_value
  from public.series s where plan_id = tests.id('plan') and private_to is null;
select is((select count(*) from toms_own), 15::bigint, 'Tom has fifteen things of his own in the plan to take with him');

-- ---------------------------------------------------------------------------
-- 1. Who can leave.

select tests.as_person('alex');
select is(pg_temp.refusal($$ select public.leave_plan(tests.id('plan'), false, tests.id('alex-plan'),
    gen_random_uuid(), '2026-11-08T09:00:00Z') $$), 'not-found',
  'Someone not in the plan can''t leave it');
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.leave_plan(tests.id('plan'), true, tests.id('tom-plan'),
    gen_random_uuid(), 'yesterday') $$), 'bad-edit', 'A time that isn''t one is refused');
select is(pg_temp.refusal($$ select public.leave_plan(tests.id('plan'), true, tests.id('plan'),
    gen_random_uuid(), '2026-11-08T09:00:00Z') $$), 'not-found',
  'and a new plan with the id of one that exists');

-- ---------------------------------------------------------------------------
-- 2. Tom leaves, taking a copy of the shared accounts.

select is(public.leave_plan(tests.id('plan'), true, tests.id('tom-plan'), tests.id('leave-edit'),
    '2026-11-08T09:00:00Z') - 'now', jsonb_build_object('saved', 'new', 'plan', tests.id('tom-plan'), 'copied', true),
  'Tom leaves Jess''s plan, with a copy of the shared accounts');
select is(public.leave_plan(tests.id('plan'), true, tests.id('tom-plan'), tests.id('leave-edit'),
    '2026-11-08T09:00:00Z') - 'now', jsonb_build_object('saved', 'already', 'plan', tests.id('tom-plan'), 'copied', true),
  'Sent again, it changes nothing');

-- He gets nothing more from Jess's plan.
select is(pg_temp.readable_in(tests.id('plan')), 0::bigint,
  'Tom can read nothing of Jess''s plan: no record, change, notice, member or invite');
select is(pg_temp.refusal($$ select public.plan_changes(tests.id('plan'), 0, 0) $$), 'not-found',
  'Bringing it down is refused');
select is(pg_temp.refusal($$ select public.plan_activity(tests.id('plan')) $$), 'not-found',
  'and its Activity');
select is(pg_temp.refusal($$ select public.payment_history(tests.id('plan'), tests.id('rent'), '2026-12-01') $$),
  'not-found', 'and a payment''s history');
select is(pg_temp.refusal($$ select public.sharing(tests.id('plan')) $$), 'not-found', 'and who''s in it');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('plan'), gen_random_uuid(), '2026-11-08T09:05:00Z',
    'edit', jsonb_build_array(jsonb_build_object('table', 'series', 'id', tests.id('rent'), 'version',
      (select 1), 'row', '{"amount": 1}'::jsonb))) $$), 'not-found',
  'and a change from a phone of his that hasn''t heard yet');
select is(app.may_hear('plan:' || tests.id('plan')), false, 'He hears nothing more about the plan');
select is(app.may_hear('plan:' || tests.id('plan') || ':' || tests.id('tom')), false,
  'nor about his own part of it');
select is(app.may_hear('plan:' || tests.id('tom-plan') || ':' || tests.id('tom')), true,
  'only about his own new plan');
select is(array(select plan_id from public.plan_members where person_id = tests.id('tom') and left_at is null),
  array[tests.id('tom-plan')], 'His phone finds his own new plan is the one he''s in now');

-- Jess keeps nothing of Tom's private records.
select tests.as_test();
select is((select count(*) from toms_own o where o.id = any (pg_temp.ids_in(tests.id('plan')))), 0::bigint,
  'None of Tom''s own records is left in Jess''s plan');
select is_empty($$ select o.id from toms_own o
    where position(o.id in pg_temp.all_of(tests.id('plan'))) > 0 $$,
  'Nothing in Jess''s plan, its changes or its history names any of them');
select is(position('Tom loan' in pg_temp.all_of(tests.id('plan'))), 0, 'Not his loan''s name');
select is(position('Contract ends in May' in pg_temp.all_of(tests.id('plan'))), 0, 'nor a note of his');
select is(position('Garage job' in pg_temp.all_of(tests.id('plan'))), 0, 'nor his job');
select is((select count(*) from app.edit_records where record_id = tests.id('tom-card') and before is not null
    and before_private = tests.id('tom')), 0::bigint, 'nor the copy of his card from when it was his alone');
select is((select count(*) from public.notices where plan_id = tests.id('plan') and for_person = tests.id('tom')),
  0::bigint, 'nor a notice of his');
select is((select count(*) from public.edits where plan_id = tests.id('plan') and private_to = tests.id('tom')),
  0::bigint, 'nor a change of his that was only his');
select is((select count(*) from app.edit_records where plan_id = tests.id('plan')
    and (after_private = tests.id('tom') or (before_private = tests.id('tom') and before is not null))), 0::bigint,
  'nor any copy of his in the history of changes');

-- The shared accounts stay with Jess, as they are.
select is((select private_to from public.accounts where id = tests.id('joint')), null::uuid,
  'The joint account stays, shared');
select is_empty($$ select b.key from shared_before b
    left join public.series s on 'series:' || s.id = b.key
    where s.id is null or (to_jsonb(s) - 'seq' - 'version' - 'changed_at' - 'changed_by' - 'edit_id'
      - 'locked_to' - 'paid_to') <> b.row_value $$,
  'with every shared payment in it as it was');
select is((select private_to from public.debts where id = tests.id('tom-card')), null::uuid,
  'and the card he shared stays, shared');
select is((select locked_to from public.series where id = tests.id('from-tom')), null::uuid,
  '"From Tom" stays, as an amount Jess can change now');
select is((select paid_to from public.series where id = tests.id('tom-pay')), null::uuid,
  'and his pay in the joint account too');
select is((select change::bigint || ',' || coalesce(locked_to::text, 'nobody') from public.pay_adjustments
    where id = tests.id('tom-overtime')), '5200,nobody', 'and its overtime, as an amount');
select is((select owner from public.plans where id = tests.id('plan')), tests.id('jess'), 'Jess still owns her plan');

-- Jess's Activity keeps Tom's shared changes, with his name.
select tests.as_person('jess');
select is(pg_temp.readable_in(tests.id('tom-plan')), 0::bigint, 'Jess can read nothing of Tom''s new plan');
select is(pg_temp.refusal($$ select public.plan_changes(tests.id('tom-plan'), 0, 0) $$), 'not-found',
  'nor bring it down');
select is((select count(*) from jsonb_array_elements(public.plan_activity(tests.id('plan')) -> 'edits') e
    where (e ->> 'id')::uuid in (select value::uuid from kept where name in ('tom-rent', 'tom-mixed'))
      and e ->> 'by' = tests.id('tom')::text), 2::bigint,
  'Her Activity keeps both of Tom''s changes to Rent, as his');
select is(public.plan_activity(tests.id('plan')) -> 'people' ->> tests.id('tom')::text, 'Tom',
  'with his name');
select is((select e -> 'summary' from jsonb_array_elements(public.plan_activity(tests.id('plan')) -> 'edits') e
    where e ->> 'kind' = 'leave'), jsonb_build_object('person', tests.id('tom')), 'and "Tom left the plan"');
select is((select count(*) from jsonb_array_elements(public.plan_activity(tests.id('plan')) -> 'edits') e,
    jsonb_array_elements(e -> 'records') r where r ->> 'id' = tests.id('tom-loan')::text), 0::bigint,
  'and nothing of his loan from the change he made to it and Rent together');
select is((select count(*) from jsonb_array_elements(public.payment_history(tests.id('plan'), tests.id('rent'),
    '2026-12-01') -> 'edits') e where e ->> 'by' = tests.id('tom')::text), 2::bigint,
  'Rent''s history keeps his changes too');

-- ---------------------------------------------------------------------------
-- 3. What goes with Tom.

select tests.as_person('tom');
select is((select count(*) from public.plan_members where plan_id = tests.id('tom-plan')
    and person_id = tests.id('tom') and role = 'owner' and left_at is null), 1::bigint,
  'Tom has a plan of his own, which he owns');
select is((select nation from public.plans where id = tests.id('tom-plan')), pg_temp.kept_text('nation'),
  'with the same bank holidays as Jess''s');
select tests.as_test();
select is((select count(*) from toms_own o where o.id = any (pg_temp.ids_in(tests.id('tom-plan')))), 9::bigint,
  'Every one of his own records comes with him with its own id, except those whose id comes from the plan (a one-off change, a tick, overtime''s details, his settings) and his two links, which go back on the copies');
select tests.as_person('tom');
select is((select balance::bigint from public.debts where id = tests.id('tom-loan')), 48000::bigint,
  'as he left it');
select is((select amount::bigint from public.payment_changes where series_id = tests.id('tom-phone')), 3200::bigint,
  'with its one-off changes');
select is((select count(*) from public.ticks where series_id = tests.id('tom-phone')), 1::bigint, 'and ticks');
select is((select private_to from public.accounts where id = pg_temp.copy_of('tom-plan', 'accounts', 'joint')),
  tests.id('tom'), 'His copy of the joint account is his alone');
select is((select amount::bigint || ',' || debt_id from public.series
    where id = pg_temp.copy_of('tom-plan', 'series', 'rent')),
  '113000,' || tests.id('tom-loan'), 'with Rent, which still goes towards his loan for him');
select is((select paid_to || ',' || pay_profile_id || ',' || cycle_pay_weeks[1] from public.series
    where id = pg_temp.copy_of('tom-plan', 'series', 'tom-pay')),
  tests.id('tom') || ',' || tests.id('tom-job') || ',' || tests.id('tom-week'),
  'and his pay, linked to his job again');
select is((select count(*) from public.pay_adjustment_details d
    join public.pay_adjustments a on a.id = d.adjustment_id
    where a.id = pg_temp.copy_of('tom-plan', 'pay_adjustments', 'tom-overtime') and d.hours = '4'), 1::bigint,
  'and its overtime with his details');
select is((select account_id from public.goals where id = tests.id('tom-gift')),
  pg_temp.copy_of('tom-plan', 'accounts', 'joint'), 'His goal saves into his copy of the joint account');
select is((select count(*) from public.series where plan_id = tests.id('tom-plan') and private_to is null), 0::bigint,
  'Nothing in his new plan is shared');
select is((select count(*) from jsonb_array_elements(public.plan_activity(tests.id('tom-plan')) -> 'edits') e
    where (e ->> 'id')::uuid = (select value::uuid from kept where name = 'tom-own')), 1::bigint,
  'His own history comes with him');
select is((select count(*) from jsonb_array_elements(public.plan_activity(tests.id('tom-plan')) -> 'edits') e
    where e ->> 'by' <> tests.id('tom')::text), 0::bigint, 'and nobody else''s');

-- ---------------------------------------------------------------------------
-- 4. Sam joins Tom's plan with "Can view only", and leaves it.

select tests.as_person('tom');
insert into kept select 'sam-link', public.make_invite(tests.id('tom-plan'), 'viewer', 'Tom', null) ->> 'token';
select tests.as_person('sam');
select public.ask_to_join((select value from kept where name = 'sam-link'), 'Sam');
select tests.as_person('tom');
select public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), true);
select tests.as_person('sam');
select is(public.leave_plan(tests.id('tom-plan'), false, tests.id('sam-plan'), gen_random_uuid(),
    '2026-11-09T09:00:00Z') ->> 'saved', 'new', 'Someone with "Can view only" can leave');
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.leave_plan(tests.id('tom-plan'), false, tests.id('tom-plan-2'),
    gen_random_uuid(), '2026-11-09T09:05:00Z') $$), 'alone', 'Nobody leaves a plan they''re alone in');

-- ---------------------------------------------------------------------------
-- 5. The owner leaves: Alex, with "Can edit", stays and owns the plan.

insert into kept select 'alex-link', public.make_invite(tests.id('tom-plan'), 'editor', 'Tom', null) ->> 'token';
select tests.as_person('alex');
select public.ask_to_join((select value from kept where name = 'alex-link'), 'Alex');
select tests.as_person('tom');
select public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), true);
-- Tom shares his copy of the joint account; his Ring goal stays his own.
select public.share_accounts(tests.id('tom-plan'), array[pg_temp.copy_of('tom-plan', 'accounts', 'joint')],
  gen_random_uuid(), '2026-11-09T10:00:00Z');
-- And an invite of his, from before, still open.
select tests.as_test();
insert into public.invites (plan_id, role, token_hash, created_by) values (tests.id('tom-plan'), 'viewer', 'x', tests.id('tom'));
select tests.as_person('tom');

select is(public.leave_plan(tests.id('tom-plan'), false, tests.id('tom-plan-2'), gen_random_uuid(),
    '2026-11-09T11:00:00Z') ->> 'copied', 'false', 'The owner leaves, without a copy');
select tests.as_test();
select is((select owner from public.plans where id = tests.id('tom-plan')), tests.id('alex'),
  'Alex, who stays, owns the plan now');
select is((select role from public.plan_members where plan_id = tests.id('tom-plan') and person_id = tests.id('alex')),
  'owner', 'and is its owner among its members');
select is((select count(*) from public.invites where plan_id = tests.id('tom-plan')
    and cancelled_at is null and accepted_at is null and refused_at is null), 0::bigint,
  'The invite Tom left open is cancelled');
select is((select count(*) from public.accounts where plan_id = tests.id('tom-plan-2')), 2::bigint,
  'Without a copy, no shared account comes with him: only his own, and the one below');
select is((select count(*) from public.series s join public.accounts a on a.id = s.account_id
    where s.plan_id = tests.id('tom-plan-2') and a.id <> tests.id('tom-current')), 0::bigint,
  'and no shared payment');
select is((select g.account_id = a.id and a.private_to = tests.id('tom') and a.plan_id = tests.id('tom-plan-2')
    from public.goals g, public.accounts a
    where g.id = tests.id('tom-gift') and a.id = app.derived_id(tests.id('tom-plan-2'), 'copy', 'accounts',
      pg_temp.copy_of('tom-plan', 'accounts', 'joint')::text)), true,
  'except a copy of the account his own goal saves into, so the goal comes too');

select * from finish();
rollback;
