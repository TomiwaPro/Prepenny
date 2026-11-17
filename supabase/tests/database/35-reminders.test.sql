-- Step 4e: reminders (D560 to D566).
--
-- Proves, as the owner asked (D563): nobody can send a reminder to someone
-- else, subscribe someone else's phone, or read anyone's reminder choices;
-- a partner's plan, read for their reminders, never holds the other's
-- private records; turning reminders off, or signing out, stops them at
-- once; and the times are on a UK clock, through the clock changes.

begin;
create extension if not exists pgtap with schema extensions;

select plan(90);

select tests.make_jess_and_tom();

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

-- A phone's push address, at Google's push service, with keys of the right shape.
create function pg_temp.endpoint(name text) returns text language sql as $$
  select 'https://fcm.googleapis.com/fcm/send/' || name
$$;
create function pg_temp.key() returns text language sql as $$
  select 'B' || repeat('A', 86)
$$;
create function pg_temp.secret() returns text language sql as $$
  select repeat('S', 22)
$$;
grant execute on function pg_temp.endpoint(text), pg_temp.key(), pg_temp.secret()
  to anon, authenticated, service_role;

-- The table and id of every row in a plan as returned, for comparing.
create function pg_temp.ids(plan jsonb) returns text[] language sql as $$
  select coalesce(array_agg((r ->> 'table') || ':' || (r -> 'row' ->> 'id') order by 1), '{}')
  from jsonb_array_elements(plan -> 'rows') r
$$;
grant execute on function pg_temp.ids(jsonb) to anon, authenticated, service_role;

-- What Jess's and Tom's own phones read, kept for comparing with the server's reads.
create table pg_temp.phone_reads (person text primary key, ids text[]);
grant all on pg_temp.phone_reads to authenticated, service_role;

-- What the reminders function is told about who may be due, at a moment.
create function pg_temp.people(at_time timestamptz) returns text[] language sql as $$
  select coalesce(array_agg(p ->> 'person' order by p ->> 'person'), '{}')
  from jsonb_array_elements(public.reminder_work(pg_temp.tick(), at_time) -> 'people') p
$$;
grant execute on function pg_temp.people(timestamptz) to service_role;

-- A person's plan's change counts, as the function is given them.
create function pg_temp.mark(person uuid) returns text language sql security definer as $$
  select app.plan_mark(person)
$$;
grant execute on function pg_temp.mark(uuid) to service_role;

-- Jess and Tom, in the order the function is told about people here.
create function pg_temp.both() returns text[] language sql as $$
  select array_agg(x order by x) from unnest(array[tests.id('jess')::text, tests.id('tom')::text]) x
$$;
grant execute on function pg_temp.both() to service_role;

-- 7pm on Wed 25 Nov 2026, London time (GMT), and 10pm the same evening.
create function pg_temp.evening() returns timestamptz language sql as $$ select timestamptz '2026-11-25 19:05:00+00' $$;
create function pg_temp.night() returns timestamptz language sql as $$ select timestamptz '2026-11-25 22:05:00+00' $$;
grant execute on function pg_temp.evening(), pg_temp.night() to service_role;

-- ---------------------------------------------------------------------------
-- 1. Nobody reads the tables straight, and only the function uses the server's steps.

select is_empty(
  $$ select t.table_name from information_schema.role_table_grants t
     where t.table_schema = 'app'
       and t.table_name in ('reminder_choices', 'push_addresses', 'reminders_sent', 'known_shortfalls',
         'reminder_server', 'bank_holiday_lists', 'bank_holiday_fetches', 'push_tokens')
       and t.grantee in ('anon', 'authenticated', 'service_role', 'public') $$,
  'Nobody can read or change the reminder tables straight, not even with Supabase''s own key');

select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('reminder_work', 'reminder_plan', 'claim_reminder', 'unclaim_reminder',
         'done_looking', 'forget_push_address', 'keep_signing_key', 'push_token', 'keep_push_token')
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute')
         or not has_function_privilege('service_role', p.oid, 'execute')
         or position('app.check_tick(tick)' in p.prosrc) = 0) $$,
  'The server''s steps are for the reminders function alone, with Supabase''s key, and each checks the tick');

select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.reminder_work(pg_temp.tick()) $$),
  'permission denied for function reminder_work', 'Tom can''t ask who is due a reminder');
select is(pg_temp.refusal($$ select public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'evening', '2026-11-26', false) $$),
  'permission denied for function claim_reminder', 'nor send Jess one');
select is(pg_temp.refusal($$ select public.reminder_plan(pg_temp.tick(), tests.id('jess'), tests.id('jess-session')) $$),
  'permission denied for function reminder_plan', 'nor read Jess''s plan as the server does');
select is(pg_temp.refusal($$ select * from app.reminder_choices $$),
  'permission denied for table reminder_choices', 'nor read anyone''s choices from the table');

select tests.as_nobody();
select is(pg_temp.refusal($$ select public.my_reminders() $$),
  'permission denied for function my_reminders', 'Someone signed out has no reminders to read');
select is(pg_temp.refusal($$ select public.reminder_work('x') $$),
  'permission denied for function reminder_work', 'and can''t start the server''s steps');

select tests.as_supabase_admin();
select is(pg_temp.refusal($$ select public.reminder_work('not the tick') $$),
  'not-allowed', 'Even with Supabase''s key, the server''s steps need the scheduled job''s tick');
select is(pg_temp.refusal($$ select public.claim_reminder('', tests.id('jess'), 'evening', '2026-11-26', false) $$),
  'not-allowed', 'to send anything');

-- ---------------------------------------------------------------------------
-- 2. Each person's own choices (D560, D561).

select tests.as_person('jess');
select is(public.my_reminders() - 'public_key',
  jsonb_build_object('payday', false, 'evening', false, 'shortfall', false, 'weekly', false,
    'hide_amounts', false, 'this_phone', null),
  'Every reminder is off until Jess turns it on (D560)');
select is(public.choose_reminders(true, true, true, false, false) ->> 'evening', 'true',
  'Jess turns on payday, the evening one and shortfalls');

select tests.as_person('tom');
select is(public.my_reminders() - 'public_key',
  jsonb_build_object('payday', false, 'evening', false, 'shortfall', false, 'weekly', false,
    'hide_amounts', false, 'this_phone', null),
  'Tom reads only his own choices, never Jess''s');
select tests.as_person('alex');
select is(public.my_reminders() ->> 'evening', 'false', 'and so does Alex, in no plan');

select tests.as_person('jess');
select is(public.my_reminders() ->> 'shortfall', 'true', 'Jess reads hers back');

-- ---------------------------------------------------------------------------
-- 3. This phone's push address: only a push service's, only for this sign-in.

select is(pg_temp.refusal($$ select public.add_push_address('https://evil.example/push', pg_temp.key(), pg_temp.secret()) $$),
  'bad-address', 'An address that isn''t a push service''s is refused, so the server can''t be sent anywhere else');
select is(pg_temp.refusal($$ select public.add_push_address('https://fcm.googleapis.com.evil.example/x', pg_temp.key(), pg_temp.secret()) $$),
  'bad-address', 'nor one that only starts like one');
select is(pg_temp.refusal($$ select public.add_push_address('http://fcm.googleapis.com/fcm/send/x', pg_temp.key(), pg_temp.secret()) $$),
  'bad-address', 'nor one without https');
select is(pg_temp.refusal($$ select public.add_push_address(pg_temp.endpoint('jess'), 'AAAA', pg_temp.secret()) $$),
  'bad-address', 'nor a phone key of the wrong shape');
select is(pg_temp.refusal($$ select public.add_push_address(pg_temp.endpoint('jess'), pg_temp.key(), 'short') $$),
  'bad-address', 'nor a phone secret of the wrong shape');
select is(public.add_push_address(pg_temp.endpoint('jess'), pg_temp.key(), pg_temp.secret()) ->> 'this_phone',
  pg_temp.endpoint('jess'), 'Jess''s phone gets her reminders');
select ok(public.add_push_address('https://updates.push.services.mozilla.com/wpush/v2/abc', pg_temp.key(), pg_temp.secret()) is not null,
  'Firefox''s push service is one');
select ok(public.add_push_address('https://web.push.apple.com/QGuQyavXutnMa', pg_temp.key(), pg_temp.secret()) is not null,
  'and Apple''s, for PrePenny on an iPhone''s Home Screen');
select ok(public.add_push_address('https://wns2-par02p.notify.windows.com/w/?token=abc', pg_temp.key(), pg_temp.secret()) is not null,
  'and Microsoft''s');
select is(public.add_push_address(pg_temp.endpoint('jess'), pg_temp.key(), pg_temp.secret()) ->> 'this_phone',
  pg_temp.endpoint('jess'), 'A sign-in session has one address at a time: its newest');
select tests.as_test();
select is((select count(*)::integer from app.push_addresses where person_id = tests.id('jess')), 1,
  'so Jess has one');

select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.add_push_address(pg_temp.endpoint('jess'), pg_temp.key(), pg_temp.secret()) $$),
  'in-use', 'Tom can''t take Jess''s phone''s address for his own, while her phone is signed in');
select tests.as_test();
select is((select person_id from app.push_addresses where endpoint = pg_temp.endpoint('jess')),
  tests.id('jess'), 'and it''s still hers');

-- ---------------------------------------------------------------------------
-- 4. The plan the server reads for a reminder is exactly what that person's phone reads.

select tests.as_person('tom');
select is(public.choose_reminders(false, true, false, true, false) ->> 'weekly', 'true',
  'Tom turns on the evening one and the weekly summary');
select tests.as_test();
create table pg_temp.tom_version as
  select version from app.reminder_choices where person_id = tests.id('tom');
grant select on pg_temp.tom_version to service_role;
select tests.as_person('tom');
select is(public.add_push_address(pg_temp.endpoint('tom'), pg_temp.key(), pg_temp.secret()) ->> 'this_phone',
  pg_temp.endpoint('tom'), 'on his phone');
insert into pg_temp.phone_reads values ('tom', pg_temp.ids(public.plan_changes(tests.id('plan'), 0, 0)));
select tests.as_person('jess');
insert into pg_temp.phone_reads values ('jess', pg_temp.ids(public.plan_changes(tests.id('plan'), 0, 0)));

select tests.as_supabase_admin();
select is(pg_temp.ids(public.reminder_plan(pg_temp.tick(), tests.id('tom'), tests.id('tom-session'))),
  (select ids from pg_temp.phone_reads where person = 'tom'),
  'The server reads exactly the records Tom''s own phone reads (D564)');
select is(pg_temp.ids(public.reminder_plan(pg_temp.tick(), tests.id('jess'), tests.id('jess-session'))),
  (select ids from pg_temp.phone_reads where person = 'jess'),
  'and exactly what Jess''s reads');
select is(array_length((select ids from pg_temp.phone_reads where person = 'tom'), 1) > 0, true,
  'which for Tom is the shared plan');
select is_empty(
  $$ select r from jsonb_array_elements(public.reminder_plan(pg_temp.tick(), tests.id('tom'), tests.id('tom-session')) -> 'rows') r
     where (r -> 'row' ->> 'id') = any(tests.private_ids('jess')) or r::text ilike '%' || tests.id('jess-current') || '%' $$,
  'Nothing of Jess''s private accounts is in what the server reads for Tom''s reminders');
select ok(
  (select bool_or((r -> 'row' ->> 'id') = any(tests.private_ids('jess')))
   from jsonb_array_elements(public.reminder_plan(pg_temp.tick(), tests.id('jess'), tests.id('jess-session')) -> 'rows') r),
  'while Jess''s own reminders do take in her private accounts');
select is(public.reminder_plan(pg_temp.tick(), tests.id('tom'), tests.id('jess-session')), null,
  'Tom''s plan can''t be read through Jess''s sign-in, nor hers through his');
select is(public.reminder_plan(pg_temp.tick(), tests.id('alex'), tests.id('alex-session')), null,
  'Alex, with no reminders on, isn''t read at all');

-- ---------------------------------------------------------------------------
-- 5. Who may be due, at 7pm and in quiet hours.

select is(pg_temp.people(pg_temp.evening()), pg_temp.both(),
  'At 7pm both are looked at: each has a reminder on and a phone that gets it');
select is(pg_temp.people(pg_temp.night()), '{}'::text[], 'At 10pm, quiet hours, nobody is (D560)');
select is((public.reminder_work(pg_temp.tick(), pg_temp.evening()) -> 'people' -> 0 -> 'choices') ? 'hideAmounts',
  true, 'with their choices');

select public.done_looking(pg_temp.tick(), tests.id('jess'), pg_temp.mark(tests.id('jess')),
  jsonb_build_array(jsonb_build_object('accountId', tests.id('jess-current'), 'date', '2026-12-01')),
  pg_temp.evening());
select is(pg_temp.people(pg_temp.evening() + interval '10 minutes'), array[tests.id('tom')::text],
  'Once looked at, Jess isn''t again until something changes or her next reminder''s time');
select tests.as_test();
select is((select count(*)::integer from app.known_shortfalls where person_id = tests.id('jess')), 1,
  'The shortfall she was told about is known: its account and date only');
update app.plan_counters set last_seq = last_seq + 1
  where plan_id = tests.id('plan') and counts_for = app.shared_count();
select tests.as_supabase_admin();
select is(pg_temp.people(pg_temp.evening() + interval '10 minutes'), pg_temp.both(),
  'A change to the shared plan, by anyone, and she''s looked at again: a partner''s change counts');

-- ---------------------------------------------------------------------------
-- 6. Taking a reminder: once only, checked again at that very moment.

select is(public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'evening', '2026-11-26', false, pg_temp.evening()) -> 'phones',
  jsonb_build_array(jsonb_build_object('endpoint', pg_temp.endpoint('jess'), 'p256dh', pg_temp.key(), 'auth', pg_temp.secret())),
  'Jess''s evening reminder goes to her phone, and only hers');
select is(public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'evening', '2026-11-26', false, pg_temp.evening()) ->> 'why',
  'sent', 'and never twice');
select is(public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'weekly', '2026-11-30', false, pg_temp.evening()) ->> 'why',
  'changed', 'A reminder she hasn''t turned on isn''t sent');
select is(public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'payday', '2026-11-25', true, pg_temp.evening()) ->> 'why',
  'changed', 'nor one worked out with amounts hidden when she shows them');
select is(public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'shortfall', '2026-11-25', false, pg_temp.night()) ->> 'why',
  'quiet', 'nor anything in quiet hours');
select is(public.claim_reminder(pg_temp.tick(), tests.id('tom'), 'evening', '2026-11-26', false, pg_temp.evening()) -> 'phones' -> 0 ->> 'endpoint',
  pg_temp.endpoint('tom'), 'Tom''s goes to his phone');
select public.unclaim_reminder(pg_temp.tick(), tests.id('tom'), 'evening', '2026-11-26');
select is(public.claim_reminder(pg_temp.tick(), tests.id('tom'), 'evening', '2026-11-26', false, pg_temp.evening()) ->> 'sent',
  'true', 'One no phone took can go again at the next look');

-- Turning a reminder off stops it straight away (D563).
select tests.as_person('jess');
select public.choose_reminders(true, false, true, false, false);
select tests.as_supabase_admin();
select is(public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'evening', '2026-11-27', false, pg_temp.evening()) ->> 'why',
  'changed', 'Jess turns the evening one off, and it isn''t sent, even when worked out a moment before');
select is(public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'payday', '2026-11-25', false, pg_temp.evening()) ->> 'sent',
  'true', 'while payday still is');
select tests.as_person('jess');
select public.choose_reminders(true, false, true, false, true);
select tests.as_supabase_admin();
select is(public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'shortfall', '2026-11-25', false, pg_temp.evening()) ->> 'why',
  'changed', 'Hiding amounts stops a reminder worked out with them (D561)');
select is(public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'shortfall', '2026-11-25', true, pg_temp.evening()) ->> 'sent',
  'true', 'and it goes without them');

select tests.as_person('jess');
select public.choose_reminders(false, false, false, false, true);
select tests.as_test();
select is((select count(*)::integer from app.push_addresses where person_id = tests.id('jess')), 0,
  'With every reminder off, her phones are forgotten');
select is((select count(*)::integer from app.known_shortfalls where person_id = tests.id('jess')), 0,
  'and the shortfalls she knew about');
select tests.as_supabase_admin();
select is(public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'payday', '2026-11-26', true, pg_temp.evening()) ->> 'why',
  'changed', 'and nothing more is sent');

-- Signing out stops them straight away (D563).
select tests.as_person('jess');
select public.choose_reminders(true, true, true, true, false);
select public.add_push_address(pg_temp.endpoint('jess'), pg_temp.key(), pg_temp.secret());
select tests.as_test();
delete from auth.sessions where id = tests.id('jess-session');
select tests.as_supabase_admin();
select is(public.claim_reminder(pg_temp.tick(), tests.id('jess'), 'weekly', '2026-11-30', false, pg_temp.evening()) ->> 'why',
  'no-phone', 'Once Jess signs out on her phone, nothing is sent to it, from that moment');
select is(public.reminder_plan(pg_temp.tick(), tests.id('jess'), tests.id('jess-session')), null,
  'and her plan isn''t read for it');
select ok(not (tests.id('jess')::text = any(pg_temp.people(pg_temp.evening() + interval '1 day'))),
  'and she isn''t looked at');
select tests.as_test();
select app.reminders_tick();
select is((select count(*)::integer from app.push_addresses where person_id = tests.id('jess')), 0,
  'The next scheduled run forgets the address too');

-- Signing out on the phone forgets its address first.
select tests.as_person('tom');
select public.remove_push_address();
select tests.as_supabase_admin();
select is(public.claim_reminder(pg_temp.tick(), tests.id('tom'), 'weekly', '2026-11-30', false, pg_temp.evening()) ->> 'why',
  'no-phone', 'Tom''s phone forgets its address as it signs out, and nothing more goes to it');

-- A push service says an address is gone: forgotten.
select tests.as_person('tom');
select public.add_push_address(pg_temp.endpoint('tom'), pg_temp.key(), pg_temp.secret());
select tests.as_supabase_admin();
select public.forget_push_address(pg_temp.tick(), pg_temp.endpoint('tom'));
select tests.as_test();
select is((select count(*)::integer from app.push_addresses where person_id = tests.id('tom')), 0,
  'An address its push service says is gone is forgotten');

-- Two-step sign-in: a sign-in that hasn't passed the second step gets nothing, as on the phone.
select tests.as_person('tom');
select public.add_push_address(pg_temp.endpoint('tom'), pg_temp.key(), pg_temp.secret());
select tests.as_test();
select tests.turn_on_two_step('tom');
select tests.as_supabase_admin();
select is(public.claim_reminder(pg_temp.tick(), tests.id('tom'), 'weekly', '2026-12-07', false, pg_temp.evening()) ->> 'why',
  'no-phone', 'With two-step sign-in on, a phone that hasn''t passed the second step gets no reminder');
select is(public.reminder_plan(pg_temp.tick(), tests.id('tom'), tests.id('tom-session')), null,
  'and its plan isn''t read');
select tests.as_test();
update auth.sessions set aal = 'aal2' where id = tests.id('tom-session');
select tests.as_supabase_admin();
select is(public.claim_reminder(pg_temp.tick(), tests.id('tom'), 'weekly', '2026-12-07', false, pg_temp.evening()) ->> 'sent',
  'true', 'Once it has, it does');

-- ---------------------------------------------------------------------------
-- 7. PrePenny's signing key: kept once, its private half in Supabase's Vault.

select is(public.reminder_work(pg_temp.tick(), pg_temp.evening()) -> 'key', 'null'::jsonb,
  'There''s no signing key until the function first runs');
select is(pg_temp.refusal($$ select public.keep_signing_key(pg_temp.tick(), 'B' || repeat('K', 86), '{"kty":"RSA"}') $$),
  'bad-key', 'Only a P-256 key is kept');
select is(public.keep_signing_key(pg_temp.tick(), 'B' || repeat('K', 86),
    '{"kty":"EC","crv":"P-256","d":"first","x":"x","y":"y"}') -> 'privateJwk' ->> 'd',
  'first', 'The first key is kept');
select is(public.keep_signing_key(pg_temp.tick(), 'B' || repeat('L', 86),
    '{"kty":"EC","crv":"P-256","d":"second","x":"x","y":"y"}') -> 'privateJwk' ->> 'd',
  'first', 'and a second, made at the same moment elsewhere, is given the first back');
select is(public.reminder_work(pg_temp.tick(), pg_temp.evening()) -> 'key' ->> 'publicKey',
  'B' || repeat('K', 86), 'The function is given it each time');
select tests.as_test();
select is((select count(*)::integer from vault.secrets where name = app.signing_key_name()), 1,
  'Its private half is in Supabase''s Vault, once');
select tests.as_person('alex');
select is(public.my_reminders() ->> 'public_key', 'B' || repeat('K', 86),
  'Each phone''s browser is given only the public half');

-- Its signature for each push service, kept an hour, as Apple asks (D573).
select tests.as_supabase_admin();
select is(public.push_token(pg_temp.tick(), 'https://web.push.apple.com'), null,
  'No signature is kept for a push service at first');
select is(public.keep_push_token(pg_temp.tick(), 'https://web.push.apple.com', 'first'), 'first',
  'The first is kept');
select is(public.keep_push_token(pg_temp.tick(), 'https://web.push.apple.com', 'second'), 'first',
  'and a second made at the same moment is given the first back');
select is(public.push_token(pg_temp.tick(), 'https://web.push.apple.com'), 'first', 'which is used');
select tests.as_test();
update app.push_tokens set made_at = now() - interval '10 hours 59 minutes';
select tests.as_supabase_admin();
select is(public.push_token(pg_temp.tick(), 'https://web.push.apple.com'), 'first',
  'for 11 hours, so Apple never sees a new one more than once an hour (D574)');
select tests.as_test();
update app.push_tokens set made_at = now() - interval '11 hours 1 minute';
select tests.as_supabase_admin();
select is(public.push_token(pg_temp.tick(), 'https://web.push.apple.com'), null,
  'After 11 hours it isn''t used: it lasts 12');
select is(public.keep_push_token(pg_temp.tick(), 'https://web.push.apple.com', 'third'), 'third',
  'and a new one is kept');
select is(pg_temp.refusal($$ select public.keep_push_token(pg_temp.tick(), 'http://evil.example', 'x') $$),
  'bad-token', 'Only for a push service''s https address');
select is(public.keep_push_token(pg_temp.tick(), 'http://host.docker.internal:4199', 'local'), 'local',
  'or, on a local Supabase only, the tests'' stand-in push service');

-- A look that began before a change of choices doesn't count as having seen it (D574).
select tests.as_test();
update app.reminder_choices set looked_at = null, looked_mark = null where person_id = tests.id('tom');
select tests.as_supabase_admin();
select public.done_looking(pg_temp.tick(), tests.id('tom'), 'a mark', '[]'::jsonb, pg_temp.evening(),
  (select version from pg_temp.tom_version));
select tests.as_test();
select is((select looked_at from app.reminder_choices where person_id = tests.id('tom')), null,
  'A look that began before Tom changed his choices leaves him to be looked at again');

-- ---------------------------------------------------------------------------
-- 8. UK time, through the clock changes (D560).

select tests.as_test();
select is(app.reminder_slot('2026-10-25 17:30:00+00'), timestamptz '2026-10-25 09:00:00+00',
  'Sun 25 Oct 2026, the clocks have gone back: 5:30pm GMT is before the weekly summary''s 6pm');
select is(app.reminder_slot('2026-10-25 18:00:00+00'), timestamptz '2026-10-25 18:00:00+00',
  'and it''s 6pm at 6pm UTC');
select is(app.reminder_slot('2027-03-28 17:00:00+00'), timestamptz '2027-03-28 17:00:00+00',
  'Sun 28 Mar 2027, the clocks have gone forward: 6pm BST is 5pm UTC');
select is(app.reminder_slot('2027-03-28 19:59:00+00'), timestamptz '2027-03-28 18:00:00+00',
  'and 8:59pm BST is still before quiet hours');
select is(app.reminder_slot('2027-03-28 20:00:00+00'), null,
  'while 9pm BST, 8pm UTC, is quiet hours');
select is(app.reminder_slot('2027-06-01 07:00:00+00'), timestamptz '2027-06-01 07:00:00+00',
  'In summer, 8am BST ends quiet hours at 7am UTC');
select is(app.reminder_slot('2026-12-01 07:59:00+00'), null, 'In winter, 7:59am GMT is still quiet');

select * from finish();
rollback;
