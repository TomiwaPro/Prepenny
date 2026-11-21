-- Step 4k, fix 2 (D646): "Opened PrePenny in the last 7 days" on the support
-- dashboard counts what a signed-in phone really does when someone opens
-- PrePenny.
--
-- Checked first on the local Supabase with a real phone (the step's report):
-- opening PrePenny asks `hello`, and a phone whose hour-long sign-in has run
-- out renews it first. Both are counted, as here. Two things weren't:
-- - a phone opening PrePenny on the version before the database's, as every
--   phone is the first time after an update, wasn't counted;
-- - a phone with PrePenny open in the background, asking every minute
--   whether its sign-in still stands, was counted as opening it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Kim, Lee and Max, each signed in on one phone, none of them seen for over
-- a month: their sign-ins were made and last renewed 40 days ago.
select tests.make_person('kim');
select tests.make_person('lee');
select tests.make_person('max');
update auth.users set email_confirmed_at = now() - interval '40 days'
  where id in (tests.id('kim'), tests.id('lee'), tests.id('max'));
update auth.sessions
  set created_at = now() - interval '40 days', updated_at = now() - interval '40 days',
    refreshed_at = (now() - interval '40 days') at time zone 'utc'
  where user_id in (tests.id('kim'), tests.id('lee'), tests.id('max'));

create function pg_temp.opened(person text, span interval default interval '7 days') returns boolean
language sql as $$
  select exists (select 1 from app.devices d where d.person_id = tests.id(person) and d.last_used_at > now() - span)
    or exists (select 1 from auth.sessions s where s.user_id = tests.id(person)
      and greatest(s.created_at, s.refreshed_at at time zone 'utc', s.updated_at) > now() - span)
$$;

select set_config('test.before', app.people_opened(interval '7 days')::text, true);
select set_config('test.before_30', app.people_opened(interval '30 days')::text, true);
select ok(not pg_temp.opened('kim') and not pg_temp.opened('lee') and not pg_temp.opened('max'),
  'Nobody has opened PrePenny this week yet');

-- ---------------------------------------------------------------------------
-- 1. Kim opens PrePenny on the version before the database's, as a phone
-- does the first time after every update. Her look is through the Data API,
-- naming her app's version, while it's on screen.

select tests.as_person('kim');
select tests.through_the_data_api('20261124100000');
select is(public.hello(on_screen => true) ->> 'version', 'update-needed',
  'Kim''s phone is on the version before the database''s, and is told to update');
select is(public.hello() ->> 'sign_in', 'ok', 'while her sign-in stands');
select tests.as_test();
select ok(pg_temp.opened('kim'), 'Kim opening PrePenny on the version before is counted');
select is(app.people_opened(interval '7 days'), current_setting('test.before')::bigint + 1,
  'Opened PrePenny in the last 7 days counts her');
select is(app.people_opened(interval '30 days'), current_setting('test.before_30')::bigint + 1,
  'and so does the last 30 days');

-- She still gets nothing of her plan on that version (D386).
select tests.as_person('kim');
select tests.through_the_data_api('20261124100000');
select is(public.hello() -> 'join_requests', '[]'::jsonb, 'but an old version is still given nothing of anyone''s plan');
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 2. Lee's laptop has PrePenny open in a tab nobody is looking at. It still
-- asks every minute whether its sign-in stands (D21), saying it's not on
-- screen.

select tests.as_person('lee');
select tests.through_the_data_api();
select is(public.hello(on_screen => false) ->> 'sign_in', 'ok', 'Lee''s laptop, PrePenny in the background, asks whether its sign-in stands');
select is(public.hello(on_screen => false) ->> 'version', 'ok', 'and is told all is well');
select tests.as_test();
select ok(not pg_temp.opened('lee'), 'PrePenny open in the background isn''t counted as opening it');
select is(app.people_opened(interval '7 days'), current_setting('test.before')::bigint + 1,
  'Opened PrePenny in the last 7 days is still only Kim');

-- Lee comes back to the tab: PrePenny is on screen.
select tests.as_person('lee');
select tests.through_the_data_api();
select is(public.hello(on_screen => true) ->> 'sign_in', 'ok', 'Lee comes back to the tab');
select tests.as_test();
select ok(pg_temp.opened('lee'), 'and opening it is counted');

-- ---------------------------------------------------------------------------
-- 3. Max's phone is on a version from before this step, which says nothing
-- about being on screen: it's noted as before.

select tests.as_person('max');
select tests.through_the_data_api();
select is(public.hello() ->> 'sign_in', 'ok', 'Max''s phone, from before this step, asks as it always has');
select tests.as_test();
select ok(pg_temp.opened('max'), 'and is counted as before');

-- ---------------------------------------------------------------------------
-- 4. A sign-in renewed in the last 7 days counts on its own, as a phone
-- whose hour-long sign-in ran out renews it as PrePenny opens.

select tests.make_person('nia');
update auth.sessions set created_at = now() - interval '40 days', updated_at = now(),
    refreshed_at = now() at time zone 'utc'
  where user_id = tests.id('nia');
select ok(pg_temp.opened('nia'), 'A sign-in renewed this week counts as opening PrePenny');
select is(app.people_opened(interval '7 days'), current_setting('test.before')::bigint + 4,
  'Kim, Lee, Max and Nia opened PrePenny this week');

select * from finish();
rollback;
