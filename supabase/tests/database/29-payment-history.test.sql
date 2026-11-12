-- Step 3g: a payment's History, in its sheet (D469), kept for as long as the
-- plan exists, with Activity's rule: nobody ever sees history of anything
-- they couldn't see at the time and can't see now.
--
-- - Tom gets the changes to a shared payment from while it was shared, and
--   none from while it was Jess's alone;
-- - not the history of a payment only Jess sees, nor of one made private again;
-- - each payment's History holds only its own changes: not another payment's
--   tick in the same change, nor another payment's change on the same day;
-- - a change older than 12 months is still there (D469 replaces D50's 12 months).

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

select tests.make_jess_alone();

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
grant execute on function pg_temp.refusal(text) to authenticated;

create temporary table kept (name text primary key, value text);
grant all on kept to authenticated;

create function pg_temp.change(person text, label text, made text, statement text) returns void
language plpgsql as $$
declare
  edit uuid := gen_random_uuid();
begin
  perform tests.as_person(person);
  perform app.begin_edit(tests.id('plan'), edit, made, 'test');
  perform set_config('prepenny.edit', edit::text, true);
  execute statement;
  insert into kept values (label, edit::text);
  perform tests.as_test();
end;
$$;

-- The changes in a payment's History, for the person acting now, by label.
create function pg_temp.history_of(family text, day date) returns text[] language sql as $$
  select coalesce(array_agg(k.name order by k.name), '{}')
  from jsonb_array_elements(public.payment_history(tests.id('plan'), tests.id(family), day) -> 'edits') e
  join kept k on k.value = e ->> 'id'
$$;
grant execute on function pg_temp.history_of(text, date) to authenticated;

-- Before Tom joins: Jess changes Rent while it's hers alone, and long ago.
select pg_temp.change('jess', 'jess-alone', '2025-06-01T10:00:00Z',
  $$ update public.series set amount = 105000 where id = tests.id('rent') $$);

-- Tom joins with "Can edit", and Jess shares the joint account.
select tests.as_person('jess');
insert into kept select 'link', public.make_invite(tests.id('plan'), 'editor', 'Jess', null) ->> 'token';
select tests.as_person('tom');
select public.ask_to_join((select value from kept where name = 'link'), 'Tom');
select tests.as_person('jess');
select public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), true);
select public.share_accounts(tests.id('plan'), array[tests.id('joint')], gen_random_uuid(), '2026-11-07T11:00:00Z');
select tests.as_test();

-- Then: Tom changes December's Rent, and in the same change ticks another
-- payment in the joint account due the same day. Jess changes all of Rent.
select pg_temp.change('jess', 'gym-added', '2026-11-07T11:30:00Z', $$
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule,
    end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('gym'), tests.id('plan'), tests.id('joint'), 'Gym', 'out', 'bills', 2500,
    '2026-11-01', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}', '{"kind":"never"}', 'keep',
    tests.id('gym'), '2026-11-07T11:30:00Z') $$);
insert into kept values ('rent-change-id', app.derived_id(tests.id('plan'), 'payment_changes',
    tests.id('rent')::text, '2026-12-01', '')),
  ('gym-tick-id', app.derived_id(tests.id('plan'), 'ticks', tests.id('gym')::text, '2026-12-01', ''));
select pg_temp.change('tom', 'tom-december', '2026-11-08T09:00:00Z', $$
  insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, amount)
  values ((select value::uuid from kept where name = 'rent-change-id'), tests.id('plan'), tests.id('rent'),
    '2026-12-01', 1, 112000);
  insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values ((select value::uuid from kept where name = 'gym-tick-id'), tests.id('plan'), tests.id('gym'),
    '2026-12-01', 1, '2026-12-01', '2026-12-01T09:00:00Z') $$);
select pg_temp.change('jess', 'jess-shared', '2026-11-09T09:00:00Z',
  $$ update public.series set amount = 111000 where id = tests.id('rent') $$);
-- A one-off change to Rent in January, which isn't December's.
select pg_temp.change('jess', 'jess-january', '2026-11-09T10:00:00Z', $$
  insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, amount)
  values (gen_random_uuid(), tests.id('plan'), tests.id('rent'), '2027-01-01', 2, 99000) $$);

-- ---------------------------------------------------------------------------

select tests.as_person('tom');
select is(pg_temp.history_of('rent', '2026-12-01'), array['jess-shared', 'tom-december'],
  'Tom sees the changes to December''s Rent made while it was shared, his and Jess''s');
select is((select count(*) from jsonb_array_elements(public.payment_history(tests.id('plan'), tests.id('rent'),
    '2026-12-01') -> 'edits') e
    where e ->> 'kind' = 'share-accounts' and e -> 'records' -> 0 -> 'before' <> 'null'::jsonb), 0::bigint,
  'and of the change that shared it, only how it was once shared');
select is((select count(*) from jsonb_array_elements(public.payment_history(tests.id('plan'), tests.id('rent'),
    '2026-12-01') -> 'edits') e, jsonb_array_elements(e -> 'records') r
    where r ->> 'table' = 'ticks'), 0::bigint,
  'December''s Rent has nothing of the Gym tick made in the same change');
select is(pg_temp.history_of('gym', '2026-12-01'), array['gym-added', 'tom-december'],
  'which is in Gym''s History instead');
select is((select count(*) from jsonb_array_elements(public.payment_history(tests.id('plan'), tests.id('gym'),
    '2026-12-01') -> 'edits') e, jsonb_array_elements(e -> 'records') r
    where r ->> 'table' = 'payment_changes'), 0::bigint, 'without Rent''s one-off change');
select is(array(select r ->> 'id' from jsonb_array_elements(public.payment_history(tests.id('plan'), tests.id('rent'),
    '2026-12-01') -> 'edits') e, jsonb_array_elements(e -> 'records') r
    where r ->> 'table' = 'payment_changes'), array[(select value from kept where name = 'rent-change-id')],
  'and December''s one-off change only, not January''s');
select is(pg_temp.refusal($$ select public.payment_history(tests.id('plan'), tests.id('jess-card-payment'),
    '2026-12-01') $$), 'not-found', 'Tom gets no History of a payment only Jess sees');

select tests.as_person('jess');
select is(pg_temp.history_of('rent', '2026-12-01'), array['jess-alone', 'jess-shared', 'tom-december'],
  'Jess sees every change to it, from while it was hers alone too');
select is((select e ->> 'made_at' from jsonb_array_elements(public.payment_history(tests.id('plan'), tests.id('rent'),
    '2026-12-01') -> 'edits') e where e ->> 'id' = (select value from kept where name = 'jess-alone')),
  '2025-06-01T10:00:00Z', 'including one made more than 12 months ago');
select is(public.payment_history(tests.id('plan'), tests.id('rent'), '2026-12-01') -> 'people' ->> tests.id('tom')::text,
  'Tom', 'with the name of each person who made one');

-- Tom has nothing of his own in the joint account, so Jess makes it private again.
select public.make_private(tests.id('plan'), 'account', tests.id('joint'), gen_random_uuid(), '2026-11-10T09:00:00Z');
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.payment_history(tests.id('plan'), tests.id('rent'), '2026-12-01') $$),
  'not-found', 'Once it''s private again, Tom gets none of its History');
select tests.as_person('alex');
select is(pg_temp.refusal($$ select public.payment_history(tests.id('plan'), tests.id('gym'), '2026-12-01') $$),
  'not-found', 'and someone outside the plan never does');

select * from finish();
rollback;
