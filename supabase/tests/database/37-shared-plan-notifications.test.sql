-- Step 4f: notifications in a shared plan (D575 to D581).
--
-- Proves, as the owner asked (D575): a notification never mentions anything
-- private to the other person, including a change that was private then
-- shared, or shared then made private; nobody can trigger a notification to
-- someone else's phone; turning it off, leaving the plan or signing out
-- stops them straight away. And the rest of the step: off until each person
-- turns it on; never about one's own changes; a group taken once only, and
-- let go when no phone took it; nothing in quiet hours; and only changes
-- from when it was turned on, or the first phone was added.
--
-- One transaction keeps one clock, so each change's time is set here, on a
-- day of its own (Wed 25 Nov 2026, GMT), and the function's moment is the
-- test clock's (supabase/seed.sql).

begin;
create extension if not exists pgtap with schema extensions;

select plan(75);

select tests.make_jess_alone();

-- A refusal's message, as the phone or the function gets it.
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
grant execute on function pg_temp.refusal(text) to anon, authenticated, service_role;

-- The scheduled job's tick, which only the database knows.
create function pg_temp.tick() returns text language sql security definer as $$
  select tick from app.reminder_server
$$;
grant execute on function pg_temp.tick() to anon, authenticated, service_role;

-- A moment on Wed 25 Nov 2026: 10am GMT and so many minutes after.
create function pg_temp.at(minutes numeric) returns timestamptz language sql as $$
  select timestamptz '2026-11-25 10:00:00+00' + minutes * interval '1 minute'
$$;
create function pg_temp.exact(minutes numeric) returns text language sql as $$
  select to_char(pg_temp.at(minutes) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;
grant execute on function pg_temp.at(numeric), pg_temp.exact(numeric) to authenticated, service_role;

-- A change of a person's, in one edit, saved at a moment of the test's.
create temporary table kept (name text primary key, value text);
grant all on kept to authenticated, service_role;
create function pg_temp.change(person text, label text, minutes numeric, statement text) returns void
language plpgsql as $$
begin
  perform tests.in_an_edit(person);
  execute statement;
  insert into kept values (label, current_setting('prepenny.edit'))
    on conflict (name) do update set value = excluded.value;
  perform tests.as_test();
  update public.edits set saved_at = pg_temp.at(minutes) where id = (select value::uuid from kept where name = label);
end;
$$;
create function pg_temp.edit(label text) returns uuid language sql as $$
  select value::uuid from kept where name = label
$$;
grant execute on function pg_temp.edit(text) to authenticated, service_role;

-- Whether any copy of a record in what the function reads has this amount.
create function pg_temp.has_amount(found jsonb, amount integer) returns boolean language sql as $$
  select jsonb_path_exists(coalesce(found, '{}'::jsonb), '$.**.amount ? (@ == $a)', jsonb_build_object('a', amount))
$$;
grant execute on function pg_temp.has_amount(jsonb, integer) to service_role;

-- What the function reads of a person's Activity, as text to look inside.
create function pg_temp.activity(person text) returns jsonb language sql as $$
  select public.partner_activity(pg_temp.tick(), tests.id(person), tests.id(person || '-session'))
$$;
create function pg_temp.waiting(person text) returns boolean language sql security definer as $$
  select app.partner_changes_waiting(tests.id(person))
$$;
create function pg_temp.mark() returns text language sql security definer as $$
  select app.plan_edits_mark(tests.id('plan'))
$$;
create function pg_temp.since(person text) returns text language sql security definer as $$
  select to_char(app.partner_since(tests.id(person)) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;
grant execute on function pg_temp.activity(text), pg_temp.waiting(text), pg_temp.mark(),
  pg_temp.since(text) to service_role;

-- Takes a group for a person, up to a moment, with the plan's mark now.
create function pg_temp.claim(person text, through numeric, at_minutes numeric,
  hide boolean default false, mark text default null) returns jsonb language sql as $$
  select public.claim_partner_changes(pg_temp.tick(), tests.id(person), tests.id('plan'),
    pg_temp.since(person), pg_temp.exact(through), hide, coalesce(mark, pg_temp.mark()),
    pg_temp.at(at_minutes))
$$;
grant execute on function pg_temp.claim(text, numeric, numeric, boolean, text) to service_role;

-- The people the function is told may be due something, at a moment.
create function pg_temp.due(at_minutes numeric) returns text[] language sql as $$
  select coalesce(array_agg(p ->> 'person' order by p ->> 'person'), '{}')
  from jsonb_array_elements(public.reminder_work(pg_temp.tick(), pg_temp.at(at_minutes)) -> 'people') p
$$;
grant execute on function pg_temp.due(numeric) to service_role;

-- A pot of Jess's own, private, with nothing moving in or out of it.
select tests.writing_as('jess');
insert into public.accounts (id, plan_id, private_to, name, kind, warning_level, belongs_to)
values (tests.id('jess-pot'), tests.id('plan'), tests.id('jess'), 'Jess pot', 'savings', 0, tests.id('jess'));
select tests.as_test();

-- Tom joins Jess's plan through an invite, with "Can edit", and she shares
-- the joint account.
select tests.as_person('jess');
insert into kept select 'link', public.make_invite(tests.id('plan'), 'editor', 'Jess', null) ->> 'token';
select tests.as_person('tom');
select public.ask_to_join((select value from kept where name = 'link'), 'Tom');
select tests.as_person('jess');
select public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), true);
select public.share_accounts(tests.id('plan'), array[tests.id('joint')], gen_random_uuid(), '2026-11-07T11:00:00Z');
select tests.as_test();
update public.edits set saved_at = pg_temp.at(-120) where plan_id = tests.id('plan');
-- Both joined well before the test's day, whatever day it runs.
update public.plan_members set joined_at = pg_temp.at(-180) where plan_id = tests.id('plan');

-- ---------------------------------------------------------------------------
-- 1. Nobody but the reminders function, with the tick, uses the server's steps.

select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('partner_activity', 'claim_partner_changes', 'unclaim_partner_changes', 'partner_seen')
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute')
         or not has_function_privilege('service_role', p.oid, 'execute')
         or position('app.check_tick(tick)' in p.prosrc) = 0) $$,
  'The new server steps are for the reminders function alone, with Supabase''s key, and each checks the tick');
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app'
       and p.proname in ('plan_now', 'partner_since', 'partner_changes_waiting', 'partner_settled_to',
         'plan_edits_mark', 'moment_of', 'due_for_reminders', 'activity_as')
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('service_role', p.oid, 'execute')) $$,
  'and the database''s own parts are for nobody but its own steps');

select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.partner_activity(pg_temp.tick(), tests.id('jess'), tests.id('jess-session')) $$),
  'permission denied for function partner_activity', 'Tom can''t read Jess''s Activity as the server does');
select is(pg_temp.refusal($$ select public.claim_partner_changes(pg_temp.tick(), tests.id('jess'), tests.id('plan'),
    '2026-11-25T09:00:00Z', '2026-11-25T10:00:00Z', false, 'x') $$),
  'permission denied for function claim_partner_changes', 'nor send her a notification of his changes');
select is(pg_temp.refusal($$ select public.partner_seen(pg_temp.tick(), tests.id('jess'), tests.id('plan'),
    '2026-11-25T09:00:00Z', '2026-11-25T10:00:00Z') $$),
  'permission denied for function partner_seen', 'nor mark her as told');
select tests.as_nobody();
select is(pg_temp.refusal($$ select public.unclaim_partner_changes('x', tests.id('jess'), tests.id('plan'), 'a', 'b') $$),
  'permission denied for function unclaim_partner_changes', 'Someone signed out can''t either');
select tests.as_supabase_admin();
select is(pg_temp.refusal($$ select public.claim_partner_changes('not the tick', tests.id('jess'), tests.id('plan'),
    '2026-11-25T09:00:00Z', '2026-11-25T10:00:00Z', false, 'x') $$),
  'not-allowed', 'Even with Supabase''s key, sending needs the scheduled job''s tick');
select is(pg_temp.refusal($$ select public.partner_activity('', tests.id('jess'), tests.id('jess-session')) $$),
  'not-allowed', 'and so does reading Activity');

-- ---------------------------------------------------------------------------
-- 2. Off until each person turns it on (D575).

select tests.as_person('jess');
select is(public.my_reminders() ->> 'partner', 'false', 'The partner choice is off until Jess turns it on');
select is(public.choose_reminders(false, false, false, false, false, true) ->> 'partner', 'true',
  'Jess turns it on');
select tests.as_test();
select ok((select told_plan = tests.id('plan') and told_to = now() from app.reminder_choices
    where person_id = tests.id('jess')),
  'and is told only about changes from that moment, in her plan');
select tests.as_person('jess');
select is(public.choose_reminders(false, false, false, false, true) ->> 'partner', 'true',
  'A phone from before step 4f, which sends no partner choice, leaves it as it is');
select is(public.add_push_address('https://fcm.googleapis.com/fcm/send/jess', 'B' || repeat('A', 86),
    repeat('S', 22)) ->> 'partner', 'true', 'With only the partner choice on, her phone is kept to get it');
select is(public.choose_reminders(false, false, false, false, false, true) ->> 'hide_amounts', 'false',
  'Amounts shown again');
select tests.as_person('tom');
select is(public.my_reminders() ->> 'partner', 'false', 'Tom''s choice is his own, still off');
select is(public.choose_reminders(false, false, false, false, false, true) ->> 'partner', 'true',
  'until he turns it on');
select ok(public.add_push_address('https://fcm.googleapis.com/fcm/send/tom', 'B' || repeat('B', 86),
    repeat('T', 22)) is not null, 'and his phone gets it');
select tests.as_test();
-- Told up to long before she joined the plan she's in, as when she left it
-- and joined it again: only changes from when she joined count (D583).
update app.reminder_choices set told_to = pg_temp.at(-500), told_plan = tests.id('plan')
  where person_id = tests.id('jess');
select tests.as_supabase_admin();
select is(pg_temp.since('jess'), pg_temp.exact(-180),
  'Someone who joined a plan again is told nothing from before they joined it');
select tests.as_test();
-- Both told up to an hour before the day's first change.
update app.reminder_choices set told_to = pg_temp.at(-60), told_plan = tests.id('plan')
  where person_id in (tests.id('jess'), tests.id('tom'));

-- ---------------------------------------------------------------------------
-- 3. Never about one's own changes, and only what they both see.

-- Tom changes the shared rent at 10am.
select pg_temp.change('tom', 'tom-rent', 0,
  $$ update public.series set amount = 116000 where id = tests.id('rent') $$);
-- Jess changes her own private current account at 10:01.
select pg_temp.change('jess', 'jess-own', 1,
  $$ update public.accounts set warning_level = 4444 where id = tests.id('jess-current') $$);

select tests.as_supabase_admin();
select ok(pg_temp.waiting('jess'), 'Tom''s change to the shared rent is waiting for Jess');
select ok(not pg_temp.waiting('tom'), 'but Jess''s change to her own account is nothing to tell Tom');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.activity('jess') -> 'edits') e
    where e ->> 'id' = pg_temp.edit('tom-rent')::text and e ->> 'mine' = 'false'), 1,
  'Jess''s Activity, read as hers, has Tom''s change, as his');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.activity('tom') -> 'edits') e
    where e ->> 'id' = pg_temp.edit('jess-own')::text), 0,
  'Tom''s has nothing of her change to her own account');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.activity('tom') -> 'edits') e
    where e ->> 'id' = pg_temp.edit('tom-rent')::text and e ->> 'mine' = 'true'), 1,
  'and his own change is marked as his, which is never told to him');
select ok((pg_temp.activity('jess') ->> 'plan')::uuid = tests.id('plan')
    and pg_temp.activity('jess') ->> 'mark' = pg_temp.mark(),
  'It says which plan, with its mark, to check against when sending');

select tests.as_test();
update app.reminder_choices set looked_at = pg_temp.at(1), looked_mark = app.plan_mark(person_id)
  where person_id in (tests.id('jess'), tests.id('tom'));
select tests.as_supabase_admin();
select is(pg_temp.due(1.5), array[tests.id('jess')::text],
  'Looked at since 9am and with nothing new in their plans, Jess is looked at again for Tom''s change, and Tom isn''t');
select is((select p -> 'partner' ->> 'since' from jsonb_array_elements(
    public.reminder_work(pg_temp.tick(), pg_temp.at(3)) -> 'people') p
    where p ->> 'person' = tests.id('jess')::text), pg_temp.exact(-60),
  'with Jess told up to before Tom''s change');
select is((select p -> 'partner' ->> 'settledTo' from jsonb_array_elements(
    public.reminder_work(pg_temp.tick(), pg_temp.at(3)) -> 'people') p
    where p ->> 'person' = tests.id('jess')::text), pg_temp.exact(0),
  'and the newest change of someone else''s saved a minute ago or more');
select is((select p -> 'partner' ->> 'settledTo' from jsonb_array_elements(
    public.reminder_work(pg_temp.tick(), pg_temp.at(0.5)) -> 'people') p
    where p ->> 'person' = tests.id('jess')::text), null,
  'never one saved less than a minute ago');

-- ---------------------------------------------------------------------------
-- 4. Taken once only, checked again at that moment (D577).

select is(pg_temp.claim('jess', 0, 3, false, 'not the mark now') ->> 'why', 'changed',
  'Anything changed in the plan since Activity was read: nothing is sent');
select is(pg_temp.claim('jess', 0, 3, true) ->> 'why', 'changed',
  'nor when amounts are hidden or shown since the words were worked out');
select is(pg_temp.claim('jess', 0, 21.5 * 60 - 600) ->> 'why', 'quiet',
  'nor in quiet hours');
select is(pg_temp.claim('jess', 0, 3) -> 'phones' -> 0 ->> 'endpoint',
  'https://fcm.googleapis.com/fcm/send/jess', 'Taken, for Jess''s phone only');
select is(pg_temp.since('jess'), pg_temp.exact(0), 'Jess is told up to Tom''s change now');
select ok(not pg_temp.waiting('jess'), 'so nothing is waiting');
select is(public.claim_partner_changes(pg_temp.tick(), tests.id('jess'), tests.id('plan'), pg_temp.exact(-60),
    pg_temp.exact(0), false, pg_temp.mark(), pg_temp.at(3)) ->> 'why', 'sent', 'and it''s never taken twice');
select public.unclaim_partner_changes(pg_temp.tick(), tests.id('jess'), tests.id('plan'), pg_temp.exact(-60),
  pg_temp.exact(0));
select is(pg_temp.since('jess'), pg_temp.exact(-60), 'No phone took it: let go');
select ok(pg_temp.waiting('jess'), 'and waiting again for the next run');
select is(pg_temp.refusal($$ select public.claim_partner_changes(pg_temp.tick(), tests.id('jess'), tests.id('plan'),
    'yesterday', pg_temp.exact(0), false, pg_temp.mark()) $$), 'bad-claim', 'A time that isn''t one is refused');

-- Passed over: only up to a moment, only if nothing moved since it was read.
select tests.as_supabase_admin();
select public.partner_seen(pg_temp.tick(), tests.id('tom'), tests.id('plan'), pg_temp.exact(-30), pg_temp.exact(1));
select is(pg_temp.since('tom'), pg_temp.exact(-60),
  'Passing over needs the moment it was read from, so a group another run has just taken is never undone');
select public.partner_seen(pg_temp.tick(), tests.id('tom'), tests.id('plan'), pg_temp.exact(-60), pg_temp.exact(1));
select is(pg_temp.since('tom'), pg_temp.exact(1), 'and then moves on past what he can''t see');

-- ---------------------------------------------------------------------------
-- 5. Private then shared: nothing from before (D458).

-- Jess's pot, private: she adds "Surprise for Tom" at £43.21, then calls it
-- "Gift" at £99.99.
select pg_temp.change('jess', 'secret-add', 5,
  $$ select tests.add_series('secret-gift', 'jess-pot', 'out', 'other', 4321);
     update public.series set name = 'Surprise for Tom' where id = tests.id('secret-gift') $$);
select pg_temp.change('jess', 'secret-change', 6,
  $$ update public.series set name = 'Gift', amount = 9999 where id = tests.id('secret-gift') $$);
select tests.as_supabase_admin();
select ok(not pg_temp.waiting('tom'), 'While her pot is private, none of it waits for Tom');
-- Then she shares it.
select tests.as_person('jess');
insert into kept values ('share-pot', gen_random_uuid()::text);
select public.share_accounts(tests.id('plan'), array[tests.id('jess-pot')], pg_temp.edit('share-pot'),
  '2026-11-25T10:07:00Z');
select tests.as_test();
update public.edits set saved_at = pg_temp.at(7) where id = pg_temp.edit('share-pot');
select tests.as_supabase_admin();
select ok(pg_temp.waiting('tom'), 'Sharing it is something to tell Tom');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.activity('tom') -> 'edits') e
    where e ->> 'id' in (pg_temp.edit('secret-add')::text, pg_temp.edit('secret-change')::text)), 0,
  'but not the changes she made while it was private');
select ok(position('Surprise' in pg_temp.activity('tom')::text) = 0
    and not pg_temp.has_amount(pg_temp.activity('tom'), 4321),
  'and nothing of how the payment was then, "Surprise for Tom" at £43.21, anywhere in what the function reads for him');
select ok(position('Gift' in pg_temp.activity('tom')::text) > 0
    and pg_temp.has_amount(pg_temp.activity('tom'), 9999),
  'only how it is now that it''s shared');

-- ---------------------------------------------------------------------------
-- 6. Shared then made private: nothing of it (D458).

select pg_temp.change('jess', 'holiday-add', 8,
  $$ select tests.add_series('holiday-fund', 'jess-pot', 'out', 'savings', 7777) $$);
select tests.as_supabase_admin();
select ok(position('Holiday Fund' in pg_temp.activity('tom')::text) > 0,
  'A payment Jess adds to her shared savings is in what the function reads for Tom');
-- The words are worked out now, with the mark now; then she makes the savings private.
insert into kept select 'mark-before', pg_temp.mark();
insert into kept select 'tom-since', pg_temp.since('tom');
select tests.as_person('jess');
select public.make_private(tests.id('plan'), 'account', tests.id('jess-pot'), gen_random_uuid(),
  '2026-11-25T10:09:00Z');
select tests.as_test();
update public.edits set saved_at = pg_temp.at(9) where kind = 'make-private' and plan_id = tests.id('plan');
select tests.as_supabase_admin();
select is(public.claim_partner_changes(pg_temp.tick(), tests.id('tom'), tests.id('plan'),
    (select value from kept where name = 'tom-since'), pg_temp.exact(8), false,
    (select value from kept where name = 'mark-before'), pg_temp.at(12)) ->> 'why', 'changed',
  'Words worked out before she made them private are never sent');
select ok(position('Holiday Fund' in pg_temp.activity('tom')::text) = 0
    and not pg_temp.has_amount(pg_temp.activity('tom'), 7777)
    and position(tests.id('holiday-fund')::text in pg_temp.activity('tom')::text) = 0,
  'and nothing of the payment is left in what the function reads for Tom');
select ok(position(tests.id('secret-gift')::text in pg_temp.activity('tom')::text) = 0
    and position('Gift' in pg_temp.activity('tom')::text) = 0
    and not pg_temp.has_amount(pg_temp.activity('tom'), 9999),
  'nor of anything else in the account she made private');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.activity('tom') -> 'edits') e
    where e ->> 'kind' = 'make-private' and jsonb_array_length(e -> 'records') = 0), 1,
  'only that a shared account was made private, naming nothing');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.activity('tom') -> 'edits') e,
    jsonb_array_elements(e -> 'records') r
    where r ->> 'id' = any (tests.private_ids('jess'))), 0,
  'No record private to Jess is anywhere in Tom''s Activity');

-- ---------------------------------------------------------------------------
-- 7. Turning it off, leaving the plan and signing out stop them at once.

-- Tom changes the rent again at 10:20.
select pg_temp.change('tom', 'tom-rent-2', 20,
  $$ update public.series set amount = 117000 where id = tests.id('rent') $$);
select tests.as_supabase_admin();
insert into kept select 'jess-since', pg_temp.since('jess');
insert into kept select 'mark-2', pg_temp.mark();
select tests.as_person('jess');
select public.choose_reminders(false, false, false, false, false, false);
select tests.as_supabase_admin();
select is(public.claim_partner_changes(pg_temp.tick(), tests.id('jess'), tests.id('plan'),
    (select value from kept where name = 'jess-since'), pg_temp.exact(20), false,
    (select value from kept where name = 'mark-2'), pg_temp.at(23)) ->> 'why', 'changed',
  'Turned off after the words were worked out: nothing is sent');
select is(pg_temp.activity('jess'), null, 'and her Activity isn''t read for it any more');
select ok(not (tests.id('jess')::text = any (pg_temp.due(23))), 'and she isn''t looked at');
select tests.as_test();
select is((select count(*)::integer from app.push_addresses where person_id = tests.id('jess')), 0,
  'With nothing on, her phone is forgotten');

-- On again, with her phone: only from now.
select tests.as_person('jess');
select public.choose_reminders(false, false, false, false, false, true);
select public.add_push_address('https://fcm.googleapis.com/fcm/send/jess', 'B' || repeat('A', 86), repeat('S', 22));
select tests.as_test();
select ok((select told_to = now() from app.reminder_choices where person_id = tests.id('jess')),
  'Turned on again, nothing from while it was off comes');
update app.reminder_choices set told_to = pg_temp.at(15) where person_id = tests.id('jess');

-- Signing out: the session ends, and its phone with it.
select tests.as_supabase_admin();
insert into kept select 'jess-since-2', pg_temp.since('jess');
select tests.as_person('jess');
select public.remove_push_address();
select tests.as_supabase_admin();
select is(public.claim_partner_changes(pg_temp.tick(), tests.id('jess'), tests.id('plan'),
    (select value from kept where name = 'jess-since-2'), pg_temp.exact(20), false, pg_temp.mark(),
    pg_temp.at(23)) ->> 'why', 'no-phone', 'Signed out: nothing is sent');
select ok(not (tests.id('jess')::text = any (pg_temp.due(23))), 'and she isn''t looked at');

-- A second phone of hers, while one already gets them, keeps what's waiting.
select tests.as_person('jess');
select public.add_push_address('https://fcm.googleapis.com/fcm/send/jess', 'B' || repeat('A', 86), repeat('S', 22));
select tests.as_test();
select ok((select told_to = now() from app.reminder_choices where person_id = tests.id('jess')),
  'Her first phone again: only changes from now');
update app.reminder_choices set told_to = pg_temp.at(15) where person_id = tests.id('jess');
insert into auth.sessions (id, user_id) values (tests.id('jess-laptop'), tests.id('jess'));
select tests.writing_as('jess');
select set_config('request.jwt.claims', json_build_object('sub', tests.id('jess'),
  'session_id', tests.id('jess-laptop'), 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.add_push_address('https://updates.push.services.mozilla.com/wpush/v2/jess', 'B' || repeat('C', 86),
  repeat('U', 22));
select tests.as_test();
select is((select told_to from app.reminder_choices where person_id = tests.id('jess')), pg_temp.at(15),
  'A second phone keeps what''s waiting');
select tests.as_supabase_admin();
select is(jsonb_array_length(pg_temp.claim('jess', 20, 23) -> 'phones'), 2, 'and both her phones get it');

-- Leaving: Tom changes the rent at 10:30, then Jess leaves before it's sent.
select pg_temp.change('tom', 'tom-rent-3', 30,
  $$ update public.series set amount = 118000 where id = tests.id('rent') $$);
select tests.as_supabase_admin();
insert into kept select 'jess-since-3', pg_temp.since('jess');
insert into kept select 'mark-3', pg_temp.mark();
select tests.as_person('jess');
select public.leave_plan(tests.id('plan'), false, tests.id('jess-new-plan'), gen_random_uuid(),
  '2026-11-25T10:31:00Z');
select tests.as_supabase_admin();
select is(public.claim_partner_changes(pg_temp.tick(), tests.id('jess'), tests.id('plan'),
    (select value from kept where name = 'jess-since-3'), pg_temp.exact(30), false,
    (select value from kept where name = 'mark-3'), pg_temp.at(33)) ->> 'why', 'changed',
  'Left the plan: nothing more of it is sent');
select is(public.claim_partner_changes(pg_temp.tick(), tests.id('jess'), tests.id('plan'),
    (select value from kept where name = 'jess-since-3'), pg_temp.exact(30), false,
    pg_temp.mark(), pg_temp.at(33)) ->> 'why', 'changed',
  'not even with the plan''s mark as it is now, since she isn''t in it');
select is(public.partner_activity(pg_temp.tick(), tests.id('jess'), tests.id('jess-session')) ->> 'plan',
  tests.id('jess-new-plan')::text, 'and her Activity is read only in her own new plan');
select ok(not pg_temp.waiting('jess'), 'where nothing of the plan she left waits');
select is(pg_temp.since('jess') >= to_char((select joined_at from public.plan_members
    where person_id = tests.id('jess') and plan_id = tests.id('jess-new-plan')) at time zone 'utc',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), true, 'In a new plan, only changes from when she joined it count');

-- ---------------------------------------------------------------------------
-- 8. Tom, left alone in the plan, and nobody else in any plan.

select tests.as_test();
update app.reminder_choices set told_to = pg_temp.at(-60) where person_id = tests.id('tom');
select tests.as_supabase_admin();
select ok(pg_temp.waiting('tom'), 'Tom has Jess''s earlier shared changes, and her leaving, to be told');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.activity('tom') -> 'edits') e
    where e ->> 'kind' = 'leave'), 1, 'her leaving among them, as Activity says it');
select ok(not jsonb_path_exists(pg_temp.activity('tom'), '$.**.warning_level ? (@ == 4444)'),
  'and still nothing private to her: her own account''s warning level');
select tests.as_person('alex');
select is(public.choose_reminders(false, false, false, false, false, true) ->> 'partner', 'true',
  'Alex, in no plan, can turn it on');
select tests.as_supabase_admin();
select ok(not pg_temp.waiting('alex'), 'and is told about nobody''s changes');
select is(public.partner_activity(pg_temp.tick(), tests.id('alex'), tests.id('alex-session')), null,
  'with no Activity read for him');

-- ---------------------------------------------------------------------------
-- 9. The time a change was saved, and the moments sent back, are checked.

select is(pg_temp.refusal($$ select public.claim_partner_changes(pg_temp.tick(), tests.id('tom'), tests.id('plan'),
    pg_temp.exact(5), pg_temp.exact(5), false, pg_temp.mark()) $$), 'bad-claim',
  'A group up to the very moment it starts from is refused');
select is(pg_temp.refusal($$ select public.claim_partner_changes(pg_temp.tick(), tests.id('tom'), tests.id('plan'),
    pg_temp.exact(5), pg_temp.exact(4), false, pg_temp.mark()) $$), 'bad-claim',
  'Up to a moment before the one it starts from is refused');
select is(pg_temp.refusal($$ select public.partner_seen(pg_temp.tick(), tests.id('tom'), tests.id('plan'),
    'soon', pg_temp.exact(4)) $$), 'bad-claim', 'and so is passing over from a time that isn''t one');

select * from finish();
rollback;
