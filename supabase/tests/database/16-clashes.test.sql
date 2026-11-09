-- Step 3d: offline changes and clashes (D59, ARCHITECTURE.md 3.5, PLAN.md item 32).
-- 1. save_edit and plan_changes answer with the server's own time, and a
--    time "made at" later than it is saved as the server's time, so a phone
--    with a fast clock can't win clashes it shouldn't.
-- 2. plan_changes says which edit last saved each record, when that edit
--    was made and by whom, and each person's nickname. A partner never gets
--    one of someone else's private edits that way.
-- 3. A change that replaces someone else's after a clash leaves them a
--    notice naming only the records it replaced. An edit it didn't replace,
--    an edit made after it, a change refused as changed since, and the same
--    change sent twice leave none. Nobody can leave one outside save_edit.
-- 4. Each person reads and marks only their own notices, and plan_changes
--    gives them their own not read yet.

begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

select tests.make_jess_and_tom('editor');

create function tests.rent_write(amount bigint, version integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('table', 'series', 'id', tests.id('rent'), 'version', version,
    'row', jsonb_build_object('amount', amount)))
$$;
create function tests.rent_version() returns integer language sql as $$
  select version from public.series where id = tests.id('rent')
$$;
create function tests.save_at(edit text, made text, writes jsonb, overrides text[] default '{}') returns jsonb
language sql as $$
  select public.save_edit(tests.id('plan'), tests.id(edit), made, 'just-this-one', writes,
    (select coalesce(array_agg(tests.id(o)), '{}'::uuid[]) from unnest(overrides) o))
$$;
create function tests.server_time_in(later interval) returns text language sql as $$
  select to_char((clock_timestamp() + later) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
-- One record in what plan_changes gives the person asking.
create function tests.brought_down(t text, id text) returns jsonb language sql as $$
  select r from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
  where r ->> 'table' = t and r -> 'row' ->> 'id' = tests.id(id)::text
$$;
create function tests.notices_for(person text) returns bigint language sql as $$
  select count(*) from public.notices where for_person = tests.id(person)
$$;
grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- 1. The server's time.

select tests.as_person('jess');
select ok(abs(extract(epoch from (
    (tests.save_at('jess-rent', '2026-11-08T09:00:00Z', tests.rent_write(112000, 1)) ->> 'now')::timestamptz
    - clock_timestamp()))) < 5,
  'save_edit answers with the server''s own time');
select ok((tests.save_at('jess-rent', '2026-11-08T09:00:00Z', tests.rent_write(1, 1)) ->> 'now') is not null,
  'and so it does when the same change is sent again');
select ok(abs(extract(epoch from ((public.plan_changes(tests.id('plan'), 0, 0) ->> 'now')::timestamptz
    - clock_timestamp()))) < 5,
  'and so does plan_changes');
select is((select made_at::text from public.edits where id = tests.id('jess-rent')), '2026-11-08T09:00:00Z',
  'A change made earlier keeps the time it was made, as the phone said');

select tests.save_at('jess-joint-name', tests.server_time_in('1 hour'), jsonb_build_array(jsonb_build_object(
  'table', 'accounts', 'id', tests.id('joint'), 'version', 1, 'row', jsonb_build_object('name', 'Joint bills'))));
select ok((select made_at::timestamptz from public.edits where id = tests.id('jess-joint-name')) <= clock_timestamp(),
  'A time later than the server''s own, from a phone an hour fast, is saved as the server''s time');

-- Jess changes her private account in an edit of its own.
select tests.save_at('jess-private', '2026-11-08T09:05:00Z', jsonb_build_array(jsonb_build_object(
  'table', 'accounts', 'id', tests.id('jess-current'), 'version', 1,
  'row', jsonb_build_object('name', 'Jess everyday'))));

-- ---------------------------------------------------------------------------
-- 2. Which edit last saved each record.

select tests.as_person('tom');
select is(tests.brought_down('series', 'rent') -> 'row' ->> 'edit_id', tests.id('jess-rent')::text,
  'Tom''s phone hears which edit last saved the shared rent');
select is(tests.brought_down('series', 'rent') ->> 'edit_by', tests.id('jess')::text, 'who made it');
select is(tests.brought_down('series', 'rent') ->> 'edit_made_at', '2026-11-08T09:00:00Z', 'and when it was made');
select is(tests.brought_down('accounts', 'jess-current'), null::jsonb,
  'Jess''s private account isn''t brought down to Tom at all');
select is_empty($$
    select 1 from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r -> 'row' ->> 'edit_id' = tests.id('jess-private')::text $$,
  'Nothing Tom''s phone gets names Jess''s private edit');
select is((select r ->> 'nickname' from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'members') r
    where r ->> 'person' = tests.id('jess')::text), 'Jess',
  'Tom''s phone gets the nickname of each person in the plan, for "Jess changed Rent"');

select tests.as_person('jess');
select is(tests.brought_down('accounts', 'jess-current') -> 'row' ->> 'edit_id', tests.id('jess-private')::text,
  'Jess''s own phone hears which of her edits saved her private account');

-- The plan's bank holidays clash like any other record.
select tests.save_at('jess-nation', '2026-11-08T09:10:00Z', jsonb_build_array(jsonb_build_object(
  'table', 'plans', 'id', tests.id('plan'), 'version', (select version from public.plans where id = tests.id('plan')),
  'row', '{"nation":"scotland"}'::jsonb)));
select tests.as_person('tom');
select is(public.plan_changes(tests.id('plan'), 0, 0) -> 'plan' ->> 'edit_id', tests.id('jess-nation')::text,
  'The plan''s own row says which edit last changed its bank holidays');
select is(public.plan_changes(tests.id('plan'), 0, 0) -> 'plan' ->> 'edit_made_at', '2026-11-08T09:10:00Z',
  'and when it was made');
select tests.as_person('jess');

-- ---------------------------------------------------------------------------
-- 3. A newer change replaces Jess's: she is told.

-- Tom's change, made after Jess's (9:30 against 9:00), replaces hers on the
-- rent. It also changes the joint account, which Jess's rent change didn't touch.
select tests.as_person('tom');
select is(tests.save_at('tom-rent', '2026-11-08T09:30:00Z', tests.rent_write(115000, 2)
    || jsonb_build_array(jsonb_build_object('table', 'accounts', 'id', tests.id('joint'), 'version', 2,
      'row', jsonb_build_object('name', 'Joint account'))),
    array['jess-rent']) ->> 'saved', 'new',
  'Tom''s newer change replaces Jess''s rent change');
select is(tests.notices_for('tom'), 0::bigint, 'Tom isn''t told anything: his change is kept');

select tests.as_test();
select is(tests.notices_for('jess'), 1::bigint, 'Jess is left one notice');
select is((select kind from public.notices where for_person = tests.id('jess')), 'clash', 'about a clash');
select is((select edit_id from public.notices where for_person = tests.id('jess')), tests.id('tom-rent'),
  'naming the change that replaced hers');
select is((select data from public.notices where for_person = tests.id('jess')),
  jsonb_build_object('lost', tests.id('jess-rent'), 'by', tests.id('tom'), 'made_at', '2026-11-08T09:30:00Z',
    'rows', jsonb_build_array(jsonb_build_object('table', 'series', 'id', tests.id('rent'))),
    -- Since step 3e, the device her change was made on, so another phone of
    -- hers can say which (PLAN.md item 39): the test's session describes no browser.
    'from', jsonb_build_object('session', tests.id('jess-session'), 'browser', '', 'device', '')),
  'with her change it replaced, who replaced it and when, the device hers was made on, and only the rent: no amount, name or note');

-- An edit it didn't replace, or one made after it, leaves no notice.
select tests.as_person('tom');
select tests.save_at('tom-rent-2', '2026-11-08T09:40:00Z', tests.rent_write(116000, tests.rent_version()),
  array['jess-joint-name']);
select tests.as_test();
select is(tests.notices_for('jess'), 1::bigint,
  'Naming an edit that didn''t save the records replaced leaves no notice');
select is(tests.notices_for('tom'), 0::bigint,
  'and Tom isn''t told about his own earlier change, which he didn''t name');
select tests.as_person('jess');
select tests.save_at('jess-rent-late', '2026-11-08T10:00:00Z', tests.rent_write(117000, tests.rent_version()));
select tests.as_person('tom');
select tests.save_at('tom-rent-early', '2026-11-08T09:45:00Z', tests.rent_write(118000, tests.rent_version()),
  array['jess-rent-late']);
select tests.as_test();
select is(tests.notices_for('jess'), 1::bigint,
  'Nor does naming an edit made after this one: only an older change is replaced by a newer one (D59)');

-- A change refused as changed since leaves none: nothing of it is saved.
select tests.as_person('jess');
select tests.save_at('jess-rent-again', '2026-11-08T11:00:00Z', tests.rent_write(119000, tests.rent_version()));
select tests.as_person('tom');
select throws_ok($$ select tests.save_at('tom-stale', '2026-11-08T11:30:00Z',
    tests.rent_write(120000, tests.rent_version() - 1), array['jess-rent-again']) $$,
  'P0001', 'changed-since', 'A change made on an older version is refused as before');
select tests.as_test();
select is(tests.notices_for('jess'), 1::bigint, 'and leaves no notice');

-- The same change sent twice tells nobody twice.
select tests.as_person('tom');
select tests.save_at('tom-rent-3', '2026-11-08T11:40:00Z', tests.rent_write(121000, tests.rent_version()),
  array['jess-rent-again']);
select tests.as_test();
select is(tests.notices_for('jess'), 2::bigint, 'A second clash leaves a second notice');
select tests.as_person('tom');
select is(tests.save_at('tom-rent-3', '2026-11-08T11:40:00Z', tests.rent_write(121000, 1),
    array['jess-rent-again']) ->> 'saved', 'already', 'Sent again after a dropped signal, it''s already saved');
select tests.as_test();
select is(tests.notices_for('jess'), 2::bigint, 'and Jess isn''t told again');

-- Jess's own two phones: her newer change replaces her older one, so the
-- phone that made the older one is told.
select tests.as_person('jess');
select tests.save_at('jess-phone-1', '2026-11-08T12:00:00Z', tests.rent_write(122000, tests.rent_version()));
select tests.save_at('jess-phone-2', '2026-11-08T12:05:00Z', tests.rent_write(123000, tests.rent_version()),
  array['jess-phone-1']);
select tests.as_test();
select is((select data ->> 'by' from public.notices where data ->> 'lost' = tests.id('jess-phone-1')::text),
  tests.id('jess')::text, 'A change from her other phone replacing hers is a notice for her too');

-- Tom can't replace anything of Jess's private, so no notice can name it.
select tests.as_person('tom');
select throws_ok($$ select tests.save_at('tom-private', '2026-11-08T13:00:00Z', jsonb_build_array(jsonb_build_object(
    'table', 'accounts', 'id', tests.id('jess-current'), 'version', 2,
    'row', jsonb_build_object('name', 'Tom''s name for it'))), array['jess-private']) $$,
  '42501', 'not-found', 'Tom can''t replace Jess''s private change, as before (D290)');
select tests.as_test();
select is((select count(*) from public.notices where data ->> 'lost' = tests.id('jess-private')::text), 0::bigint,
  'so no notice names it');

-- Nobody can leave a notice outside save_edit.
select tests.as_person('tom');
select throws_ok($$ select app.tell_clashes(tests.id('plan'), tests.id('tom-rent'),
    jsonb_build_array(jsonb_build_object('edit', tests.id('jess-rent'), 'table', 'series', 'id', tests.id('rent')))) $$,
  '42501', 'not-found', 'Tom can''t leave Jess a notice himself');
select tests.as_test();
select is(tests.notices_for('jess'), 3::bigint, 'and none is added');

-- ---------------------------------------------------------------------------
-- 4. Each person's own notices.

select tests.as_person('tom');
select is((select count(*) from public.notices), 0::bigint, 'Tom reads none of Jess''s notices');
select is(jsonb_array_length(public.plan_changes(tests.id('plan'), 0, 0) -> 'notices'), 0,
  'and plan_changes gives him none');
select is(tests.rows_changed($$ update public.notices set read_at = now() $$), 0::bigint,
  'nor can he mark hers as read');

select tests.as_person('jess');
select is(jsonb_array_length(public.plan_changes(tests.id('plan'), 0, 0) -> 'notices'), 3,
  'plan_changes gives Jess her three notices not read yet');
select ok(exists (select 1 from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'notices') n
    where n -> 'data' ->> 'lost' = tests.id('jess-rent')::text),
  'the first about her rent change among them');
select is(tests.rows_changed($$ update public.notices set read_at = now()
    where id = (select id from public.notices where data ->> 'lost' = tests.id('jess-rent')::text) $$), 1::bigint,
  'Jess marks one as read');
select is(jsonb_array_length(public.plan_changes(tests.id('plan'), 0, 0) -> 'notices'), 2,
  'and it isn''t given to her again');

select * from finish();
rollback;
