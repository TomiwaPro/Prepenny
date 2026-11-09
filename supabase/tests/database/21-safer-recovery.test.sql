-- Step 3e hardening: safer recovery (the owner's instructions, 9 Nov 2026).
-- What the owner asked these tests to prove:
-- 1. Nothing changes on an account during the 24 hours.
-- 2. A cancel stops it, from the stop link or a signed-in device.
-- 3. The stop link works once, and can do nothing else.
-- 4. The caps hold: 3 codes a day for an address, and a 24-hour lock after
--    10 wrong tries in a day, for "get back in" and "add a backup email".
-- 5. A locked address, or one that isn't a backup, gets the same answers as
--    any other.
-- 6. Nobody can use recovery on someone else's account.
-- Typing a code goes through the get-back-in function with Supabase's admin
-- key, played here by tests.as_supabase_admin(). The admin route's change of
-- address itself is Supabase's, tried end to end in apps/web/e2e/recovery.spec.ts.

begin;
create extension if not exists pgtap with schema extensions;

select plan(99);

select tests.make_jess_and_tom('editor');
update auth.users set email_confirmed_at = now() where id in (tests.id('jess'), tests.id('tom'), tests.id('alex'));
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values (tests.id('jess')::text, tests.id('jess'),
  jsonb_build_object('sub', tests.id('jess')::text, 'email', 'jess@example.test', 'email_verified', true),
  'email', now(), now());
-- Jess is signed in on a phone and a laptop, each able to renew its sign-in.
insert into auth.sessions (id, user_id) values (tests.id('jess-laptop-session'), tests.id('jess'));
insert into auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at)
values ('jess-phone-refresh', tests.id('jess')::text, tests.id('jess-session'), false, now(), now()),
  ('jess-laptop-refresh', tests.id('jess')::text, tests.id('jess-laptop-session'), false, now(), now()),
  ('tom-phone-refresh', tests.id('tom')::text, tests.id('tom-session'), false, now(), now());
insert into app.devices (session_id, person_id) values (tests.id('jess-session'), tests.id('jess')),
  (tests.id('jess-laptop-session'), tests.id('jess'));
-- Each has added a backup email.
insert into app.backup_emails (person_id, email) values (tests.id('jess'), 'jess.backup@example.test'),
  (tests.id('tom'), 'tom.backup@example.test'), (tests.id('alex'), 'alex.backup@example.test');

-- The emails queued to an address, their subjects, and what's in the newest.
create function tests.emails_to(address text) returns bigint language sql security definer as $$
  select count(*) from net.http_request_queue q
  where convert_from(q.body, 'utf8')::jsonb -> 'To' -> 0 ->> 'Email' = address
$$;
create function tests.newest_subject_to(address text) returns text language sql security definer as $$
  select convert_from(q.body, 'utf8')::jsonb ->> 'Subject' from net.http_request_queue q
  where convert_from(q.body, 'utf8')::jsonb -> 'To' -> 0 ->> 'Email' = address
  order by q.id desc limit 1
$$;
create function tests.code_sent_to(address text) returns text language sql security definer as $$
  select substring(convert_from(q.body, 'utf8')::jsonb ->> 'Text' from '\n\n([0-9]{6})\n\n')
  from net.http_request_queue q
  where convert_from(q.body, 'utf8')::jsonb -> 'To' -> 0 ->> 'Email' = address
  order by q.id desc limit 1
$$;
create function tests.wrong_code(address text) returns text language sql as $$
  select lpad(((coalesce(tests.code_sent_to(address), '0')::integer + 1) % 1000000)::text, 6, '0')
$$;
create function tests.stop_token_sent_to(address text) returns text language sql security definer as $$
  select substring(convert_from(q.body, 'utf8')::jsonb ->> 'Text' from '/stop-get-back-in/#([A-Za-z0-9_-]{43})')
  from net.http_request_queue q
  where convert_from(q.body, 'utf8')::jsonb -> 'To' -> 0 ->> 'Email' = address
    and convert_from(q.body, 'utf8')::jsonb ->> 'Text' like '%/stop-get-back-in/#%'
  order by q.id desc limit 1
$$;
-- Lets the next code be asked for straight away, as if a minute had passed.
create function tests.a_minute_later() returns void language sql security definer as $$
  update app.email_codes set sent_at = sent_at - interval '61 seconds';
  update app.code_asks set asked_at = asked_at - interval '61 seconds';
$$;
-- Time passing, for the database: every time it keeps moves back by `span`.
create function tests.time_passes(span interval) returns void language sql security definer as $$
  update app.get_back_in set started_at = started_at - span, stopped_at = stopped_at - span,
    finishing_at = finishing_at - span, done_at = done_at - span;
  update app.email_codes set sent_at = sent_at - span, used_at = used_at - span;
  update app.code_tries set tried_at = tried_at - span;
  update app.code_locks set locked_until = locked_until - span;
  update app.code_asks set asked_at = asked_at - span;
$$;
-- Everything about a person's account that getting back in could change:
-- their sign-in address, email sign-in, sessions and refresh tokens,
-- authenticator apps, backup email, devices and plans.
create function tests.account_of(name text) returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'user', (select to_jsonb(u) from auth.users u where u.id = tests.id(name)),
    'identities', (select jsonb_agg(to_jsonb(i) order by i.id) from auth.identities i where i.user_id = tests.id(name)),
    'sessions', (select jsonb_agg(to_jsonb(s) order by s.id) from auth.sessions s where s.user_id = tests.id(name)),
    'refresh_tokens', (select jsonb_agg(r.token order by r.token) from auth.refresh_tokens r
      where r.user_id = tests.id(name)::text and not r.revoked),
    'factors', (select jsonb_agg(f.id order by f.id) from auth.mfa_factors f where f.user_id = tests.id(name)),
    'backup', (select to_jsonb(b) from app.backup_emails b where b.person_id = tests.id(name)),
    'devices', (select jsonb_agg(d.session_id order by d.session_id) from app.devices d where d.person_id = tests.id(name)),
    'plans', (select jsonb_agg(m.plan_id order by m.plan_id) from public.plan_members m
      where m.person_id = tests.id(name) and m.left_at is null))
$$;
-- A person's newest request to get back in, stopped or not, by name.
create function tests.newest_request_of(who text) returns uuid language sql security definer as $$
  select r.id from app.get_back_in r where r.person_id = tests.id($1) order by r.started_at desc limit 1
$$;
-- A person's open request to get back in, or the one finished, by name.
create function tests.request_of(who text) returns uuid language sql security definer as $$
  select r.id from app.get_back_in r where r.person_id = tests.id($1) and r.stopped_at is null
  order by r.started_at desc limit 1
$$;
create table tests.kept (name text primary key, account jsonb);
create function tests.keep(who text) returns void language sql security definer as $$
  insert into tests.kept values ($1, tests.account_of($1))
  on conflict (name) do update set account = excluded.account
$$;
create function tests.as_kept(who text) returns boolean language sql security definer as $$
  select tests.account_of($1) = (select k.account from tests.kept k where k.name = $1)
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Nothing changes on an account during the 24 hours.

select tests.keep('jess');
select tests.as_nobody();
select is(public.send_get_in_code('jess.backup@example.test'), '{"sent": true}'::jsonb,
  'Someone asks for a code at Jess''s backup email');
select tests.as_test();
select is(tests.newest_subject_to('jess.backup@example.test'), 'Your PrePenny code to get back in',
  'A code is sent to it, to ask to get back in');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('jess.backup@example.test', tests.code_sent_to('jess.backup@example.test')) ->> 'state',
  'waiting', 'The right code starts the 24-hour wait');
select tests.as_test();
select ok(tests.as_kept('jess'),
  'and nothing on Jess''s account has changed: her address, email sign-in, devices, refresh tokens, backup and plan');
select is(tests.newest_subject_to('jess@example.test'), 'Someone asked to get into your PrePenny account',
  'Her sign-in address is told straight away');
select ok(tests.stop_token_sent_to('jess@example.test') is not null, 'with a link to stop it');
select is((select count(*) from app.get_back_in where person_id = tests.id('jess') and stop_hash is not null), 1::bigint,
  'whose token is kept only scrambled');
select ok(not exists (select 1 from app.get_back_in where stop_hash like '%' || tests.stop_token_sent_to('jess@example.test') || '%'),
  'never as it is in the link');

-- Every one of her signed-in devices hears of it, with when it can be finished.
select tests.as_person('jess');
select ok(public.hello() -> 'get_back_in' ->> 'ready_at' is not null, 'Jess''s phone is told, to show the notice');
select is((public.hello() -> 'get_back_in' ->> 'ready_at')::timestamptz - (public.hello() -> 'get_back_in' ->> 'started_at')::timestamptz,
  interval '24 hours', 'with the time it can be finished, 24 hours on');
select set_config('request.jwt.claims', json_build_object('sub', tests.id('jess'),
  'session_id', tests.id('jess-laptop-session'), 'role', 'authenticated')::text, true);
select ok(public.hello() -> 'get_back_in' is not null, 'and so is her laptop');
select tests.as_person('tom');
select ok(public.hello() -> 'get_back_in' = 'null'::jsonb, 'Tom''s phone isn''t, though he shares her plan');

-- 23 hours 59 minutes on, it still can't be finished.
select tests.as_test();
select tests.time_passes(interval '23 hours 59 minutes');
select tests.as_nobody();
select public.send_get_in_code('jess.backup@example.test');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('jess.backup@example.test', tests.code_sent_to('jess.backup@example.test')) ->> 'state',
  'waiting', '23 hours 59 minutes on, the right code still says to wait');
select tests.as_test();
select ok(tests.as_kept('jess'), 'and still nothing has changed');
select tests.a_minute_later();
select tests.as_nobody();
select public.send_get_in_code('jess.backup@example.test');
-- 24 hours have passed, but the code was sent before then.
select tests.as_test();
select tests.time_passes(interval '2 minutes');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('jess.backup@example.test', tests.code_sent_to('jess.backup@example.test')) ->> 'state',
  'new-code', 'After 24 hours, a code sent before then can''t finish it: it needs a fresh one');
select tests.as_test();
select ok(tests.as_kept('jess'), 'and nothing has changed');

-- ---------------------------------------------------------------------------
-- 2 and 3. A cancel stops it, and the stop link works once and can do
-- nothing else. Tom's request, alongside Jess's.

select tests.keep('tom');
select tests.as_nobody();
select public.send_get_in_code('tom.backup@example.test');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('tom.backup@example.test', tests.code_sent_to('tom.backup@example.test')) ->> 'state',
  'waiting', 'Someone with Tom''s backup email starts getting in');

select tests.as_nobody();
select is(public.stop_get_back_in_with_link('not a token'), '{"stopped": false}'::jsonb,
  'Something that isn''t a stop link stops nothing');
select is(public.stop_get_back_in_with_link(rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=')),
  '{"stopped": false}'::jsonb, 'nor does a made-up one of the right shape');
select is(public.stop_get_back_in_with_link(tests.stop_token_sent_to('tom@example.test')), '{"stopped": true}'::jsonb,
  'The link sent to Tom''s sign-in address stops it');
select is(public.stop_get_back_in_with_link(tests.stop_token_sent_to('tom@example.test')), '{"stopped": false}'::jsonb,
  'It works once');
select tests.as_test();
select ok(tests.as_kept('tom'), 'It did nothing else to Tom''s account: nobody signed in or out, nothing changed');
select ok(exists (select 1 from app.get_back_in where person_id = tests.id('jess') and stopped_at is null and done_at is null),
  'and nothing to Jess''s request');
select is(tests.newest_subject_to('tom.backup@example.test'), 'Getting back into PrePenny was stopped',
  'The backup email is told it was stopped');
select tests.as_person('tom');
select ok(public.hello() -> 'get_back_in' = 'null'::jsonb, 'and Tom''s phone no longer shows the notice');

-- 24 hours on, the stopped request can't be finished: a code starts afresh.
select tests.as_test();
select tests.time_passes(interval '24 hours 1 minute');
select tests.as_nobody();
select public.send_get_in_code('tom.backup@example.test');
select tests.as_test();
select is(tests.newest_subject_to('tom.backup@example.test'), 'Your PrePenny code to get back in',
  'A day after it was stopped, the backup is sent a code to ask again, not to finish');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('tom.backup@example.test', tests.code_sent_to('tom.backup@example.test')) ->> 'state',
  'waiting', 'and typing it starts a new 24-hour wait');
select tests.as_test();
select ok(tests.as_kept('tom'), 'Tom''s account is still as it was');
select is(tests.newest_subject_to('tom@example.test'), 'Someone asked to get into your PrePenny account',
  'and his sign-in address is told again');

-- Stopped from a signed-in device: only the person's own request.
select tests.as_person('alex');
select is(public.stop_get_back_in() ->> 'stopped', 'false',
  'Alex, signed in, can''t stop Tom''s request: "Stop it" stops only your own');
select tests.as_test();
select ok(exists (select 1 from app.get_back_in where person_id = tests.id('tom') and stopped_at is null and done_at is null),
  'Tom''s request is still open');
select tests.as_person('tom');
select is(public.stop_get_back_in() ->> 'stopped', 'true', 'Tom stops it on his phone');
select ok(public.hello() -> 'get_back_in' = 'null'::jsonb, 'and the notice goes');
select tests.as_test();
select is(tests.newest_subject_to('tom.backup@example.test'), 'Getting back into PrePenny was stopped',
  'His backup email is told');
select is(public.stop_get_back_in_with_link(tests.stop_token_sent_to('tom@example.test')), '{"stopped": false}'::jsonb,
  'and the link for it no longer works');
select ok(tests.as_kept('tom'), 'Tom''s account is as it was');

-- ---------------------------------------------------------------------------
-- 6. Nobody can use recovery on someone else's account.

select tests.as_person('tom');
select throws_ok($$ select public.get_back_in_with_code('jess.backup@example.test', '123456') $$, '42501', null,
  'Tom, signed in, can''t type a code himself: only the get-back-in function can');
select throws_ok($$ select public.get_back_in_finished(tests.request_of('jess')) $$,
  '42501', null, 'or finish anyone''s request');
select tests.as_nobody();
select throws_ok($$ select public.get_back_in_with_code('jess.backup@example.test', '123456') $$, '42501', null,
  'and nor can someone who isn''t signed in');
select tests.as_test();
select tests.a_minute_later();
select tests.as_nobody();
select public.send_get_in_code('tom.backup@example.test');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('jess.backup@example.test', tests.code_sent_to('tom.backup@example.test')),
  '{"in": false}'::jsonb, 'A code from Tom''s backup does nothing for Jess''s');
select tests.as_test();
select ok(tests.as_kept('jess'), 'and Jess''s account is as it was');

-- ---------------------------------------------------------------------------
-- Finishing Jess's, with a fresh code after the 24 hours.

select tests.as_nobody();
select public.send_get_in_code('jess.backup@example.test');
select tests.as_test();
select is(tests.newest_subject_to('jess.backup@example.test'), 'Your PrePenny code to finish getting back in',
  'After 24 hours, the backup is sent a code to finish');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('jess.backup@example.test', tests.code_sent_to('jess.backup@example.test')) ->> 'state',
  'finish', 'which finishes it, through Supabase''s admin route');
select tests.as_nobody();
select is(public.stop_get_back_in_with_link(tests.stop_token_sent_to('jess@example.test')), '{"stopped": false}'::jsonb,
  'Once it''s finishing, the stop link does nothing');
select tests.as_supabase_admin();
select is(public.get_back_in_finished(tests.request_of('jess')) ->> 'done',
  'false', 'Until Supabase''s admin route has changed the address, nothing is signed out');
select tests.as_test();
select ok(tests.as_kept('jess'), 'and still nothing on her account has changed');
-- Supabase's admin route changes the address, as the get-back-in function asks.
update auth.users set email = 'jess.backup@example.test' where id = tests.id('jess');
select tests.as_supabase_admin();
select is(public.get_back_in_finished(tests.request_of('jess')) ->> 'done',
  'true', 'Then it''s finished');
select tests.as_test();
select is((select count(*) from auth.sessions where user_id = tests.id('jess')), 0::bigint, 'Every device of Jess''s is signed out');
select is((select count(*) from auth.refresh_tokens where user_id = tests.id('jess')::text), 0::bigint,
  'and none can renew its sign-in');
select ok(not exists (select 1 from app.backup_emails where person_id = tests.id('jess')), 'Her backup is used up');
select is(tests.newest_subject_to('jess@example.test'), 'Your PrePenny sign-in email has changed', 'Her old address is told');
select ok(exists (select 1 from auth.sessions where user_id = tests.id('tom')), 'Tom is still signed in');
select ok(exists (select 1 from auth.refresh_tokens where token = 'tom-phone-refresh'), 'with his refresh token');
select tests.as_supabase_admin();
select is(public.get_back_in_finished(tests.request_of('jess')) ->> 'done',
  'false', 'Finishing twice does nothing more');

-- ---------------------------------------------------------------------------
-- 4 and 5. The caps hold, and a locked address, or one that isn't a backup,
-- gets the same answers as any other.

-- 3 codes a day for an address: Tom's backup has had 2 since the day passed.
select tests.as_test();
select tests.a_minute_later();
select tests.as_nobody();
select public.send_get_in_code('tom.backup@example.test');
select tests.as_test();
select tests.a_minute_later();
select tests.as_nobody();
select is(public.send_get_in_code('tom.backup@example.test'), '{"sent": true}'::jsonb,
  'A 4th code in a day for Tom''s backup gets the same answer');
select tests.as_test();
select is((select count(*) from app.email_codes where email = 'tom.backup@example.test' and purpose = 'get-in'
    and sent_at > now() - interval '24 hours'), 3::bigint, 'but no 4th code is sent');

-- 10 wrong tries in a day lock an address for 24 hours, even for the right code.
select tests.as_nobody();
select public.send_get_in_code('alex.backup@example.test');
select tests.as_supabase_admin();
select public.get_back_in_with_code('alex.backup@example.test', tests.wrong_code('alex.backup@example.test'))
  from generate_series(1, 4);
select tests.as_test();
select tests.a_minute_later();
select tests.as_nobody();
select public.send_get_in_code('alex.backup@example.test');
select tests.as_supabase_admin();
select public.get_back_in_with_code('alex.backup@example.test', tests.wrong_code('alex.backup@example.test'))
  from generate_series(1, 4);
select tests.as_test();
select tests.a_minute_later();
select tests.as_nobody();
select public.send_get_in_code('alex.backup@example.test');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('alex.backup@example.test', tests.wrong_code('alex.backup@example.test')),
  '{"in": false}'::jsonb, 'The 9th wrong try');
select tests.as_test();
select is((select tries from app.email_codes where email = 'alex.backup@example.test' and used_at is null), 1::smallint,
  'is only the newest code''s first, so it would still take the right one');
select tests.keep('alex');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('alex.backup@example.test', tests.wrong_code('alex.backup@example.test')),
  '{"in": false}'::jsonb, 'The 10th');
select is(public.get_back_in_with_code('alex.backup@example.test', tests.code_sent_to('alex.backup@example.test')),
  '{"in": false}'::jsonb, 'locks it: the right code gets the same answer as a wrong one');
select tests.as_test();
select ok(tests.as_kept('alex') and not exists (select 1 from app.get_back_in where person_id = tests.id('alex')),
  'and nothing starts');

-- A day later, the lock and the day's codes have gone. 10 wrong tries with
-- no code sent lock it again, and no code is sent while it's locked.
select tests.as_test();
select tests.time_passes(interval '1 day 1 minute');
select tests.as_supabase_admin();
select public.get_back_in_with_code('alex.backup@example.test', '123456') from generate_series(1, 10);

-- Locked, a backup or not: the same answers.
select tests.as_nobody();
select is(public.send_get_in_code('alex.backup@example.test'), public.send_get_in_code('nobody.at.all@example.test'),
  'Asking for a code: a locked backup gets the same answer as an address that isn''t one');
select is(public.send_get_in_code('alex.backup@example.test'), public.send_get_in_code('tom.backup@example.test'),
  'and as a backup that isn''t locked');
select tests.as_test();
select is(tests.emails_to('alex.backup@example.test'), 3::bigint, 'The locked one is sent nothing more');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('alex.backup@example.test', '123456'),
  public.get_back_in_with_code('nobody.at.all@example.test', '123456'),
  'Trying a code: a locked backup gets the same answer as an address that isn''t one');
select is(public.get_back_in_with_code('tom.backup@example.test', tests.wrong_code('tom.backup@example.test')),
  public.get_back_in_with_code('alex.backup@example.test', '123456'), 'and as a wrong code for one that isn''t locked');

-- 24 hours after it was locked, it works again.
select tests.as_test();
select tests.time_passes(interval '1 day 1 minute');
select tests.as_nobody();
select public.send_get_in_code('alex.backup@example.test');
select tests.as_test();
select is(tests.emails_to('alex.backup@example.test'), 4::bigint, '24 hours after it was locked, a code is sent again');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('alex.backup@example.test', tests.code_sent_to('alex.backup@example.test')) ->> 'state',
  'waiting', 'and the right code works');

-- If Supabase's admin route can't make the change, the request is as it was,
-- and the stop link still stops it.
select tests.as_test();
select tests.keep('alex');
select tests.time_passes(interval '1 day 1 minute');
select tests.as_nobody();
select public.send_get_in_code('alex.backup@example.test');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('alex.backup@example.test', tests.code_sent_to('alex.backup@example.test')) ->> 'state',
  'finish', 'A day later, a new code starts finishing Alex''s');
select tests.as_nobody();
select is(public.stop_get_back_in_with_link(tests.stop_token_sent_to('alex@example.test')), '{"stopped": false}'::jsonb,
  'While it finishes, the stop link does nothing');
select tests.as_supabase_admin();
select is(public.get_back_in_not_finished(tests.request_of('alex')) ->> 'done', 'false',
  'Supabase''s admin route couldn''t make the change, so it''s opened again');
select tests.as_nobody();
select is(public.stop_get_back_in_with_link(tests.stop_token_sent_to('alex@example.test')), '{"stopped": true}'::jsonb,
  'and the same stop link stops it');
select tests.as_test();
select ok(tests.as_kept('alex'), 'Alex''s account is as it was');

-- The same caps for "add a backup email" codes.
select tests.as_test();
select tests.time_passes(interval '1 day 1 minute');
select tests.as_person('tom');
select public.add_backup_email('tom.new@example.test');
select tests.as_test();
select tests.a_minute_later();
select tests.as_person('tom');
select public.add_backup_email('tom.new@example.test');
select tests.as_test();
select tests.a_minute_later();
select tests.as_person('tom');
select public.add_backup_email('tom.new@example.test');
select tests.as_test();
select tests.a_minute_later();
select tests.as_person('tom');
select is(public.add_backup_email('tom.new@example.test'), '{"sent": true}'::jsonb,
  'A 4th code in a day to add a backup gets the same answer');
select tests.as_test();
select is(tests.emails_to('tom.new@example.test'), 3::bigint, 'but isn''t sent');

-- Tom asks for a code to add tom.locked; Alex types 10 wrong codes for the
-- same address, which locks it, whoever types them.
select tests.as_test();
select tests.a_minute_later();
select tests.as_person('tom');
select public.add_backup_email('tom.locked@example.test');
select tests.as_person('alex');
select public.confirm_backup_email('tom.locked@example.test', '000000') from generate_series(1, 10);
select tests.as_test();
select is((select tries from app.email_codes where email = 'tom.locked@example.test' and used_at is null), 0::smallint,
  'None of those tries was at Tom''s code');
select tests.as_person('tom');
select is(public.confirm_backup_email('tom.locked@example.test', tests.code_sent_to('tom.locked@example.test')) ->> 'problem',
  'wrong', 'but the address is locked: Tom''s right code says the same as a wrong one');
select is(public.backup_email() ->> 'email', 'tom.backup@example.test', 'and it isn''t added');
select tests.as_test();
select tests.a_minute_later();
select tests.as_person('tom');
select is(public.add_backup_email('tom.locked@example.test'), '{"sent": true}'::jsonb,
  'Asking for another code for it gets the usual answer');
select tests.as_test();
select is(tests.emails_to('tom.locked@example.test'), 1::bigint, 'but none is sent');

-- A backup changed while a request waits stops it.
select tests.as_test();
select tests.time_passes(interval '1 day 1 minute');
select tests.as_nobody();
select public.send_get_in_code('tom.backup@example.test');
select tests.as_supabase_admin();
select public.get_back_in_with_code('tom.backup@example.test', tests.code_sent_to('tom.backup@example.test'));
select tests.as_person('tom');
select ok(public.hello() -> 'get_back_in' <> 'null'::jsonb, 'Someone starts getting into Tom''s account again');
select public.remove_backup_email();
select ok(public.hello() -> 'get_back_in' = 'null'::jsonb, 'Removing his backup email stops it');
select tests.as_supabase_admin();
select is(public.get_back_in_finished(tests.newest_request_of('tom')) ->> 'done', 'false',
  'and a stopped request can''t be finished');

-- "Add a backup email": asking again within a minute says to wait, whether
-- or not a code went, so it doesn't show an address is locked.
select tests.as_test();
select tests.time_passes(interval '1 day 1 minute');
select tests.as_person('alex');
select public.confirm_backup_email('locked.again@example.test', '000000') from generate_series(1, 10);
select tests.as_person('tom');
select is(public.add_backup_email('locked.again@example.test'), '{"sent": true}'::jsonb,
  'Tom asks for a code for an address that''s locked: the usual answer');
select is(public.add_backup_email('tom.other@example.test') ->> 'sent', 'false',
  'and asking for another address straight away says to wait');
select tests.as_test();
select tests.a_minute_later();
select tests.as_person('tom');
select is(public.add_backup_email('tom.unlocked@example.test'), '{"sent": true}'::jsonb,
  'An address that isn''t locked: the same answer');
select is(public.add_backup_email('tom.other@example.test') ->> 'sent', 'false',
  'and the same wait after it');

-- 7 days after it could be finished, a request runs out. (Alex's phone has
-- said hello, which notes when it was last used, before his account is kept.)
select tests.as_test();
select tests.time_passes(interval '1 day 1 minute');
select tests.as_person('alex');
select public.hello();
select tests.as_test();
select tests.keep('alex');
select tests.as_nobody();
select public.send_get_in_code('alex.backup@example.test');
select tests.as_supabase_admin();
select public.get_back_in_with_code('alex.backup@example.test', tests.code_sent_to('alex.backup@example.test'));
select tests.as_test();
select tests.time_passes(interval '8 days 1 minute');
select tests.as_person('alex');
select ok(public.hello() -> 'get_back_in' = 'null'::jsonb, '8 days on, nobody finished it, and it has run out');
select tests.as_test();
select is((select stopped_how from app.get_back_in where id = tests.newest_request_of('alex')), 'ran-out',
  'marked as run out');
select tests.as_nobody();
select is(public.stop_get_back_in_with_link(tests.stop_token_sent_to('alex@example.test')), '{"stopped": false}'::jsonb,
  'and its stop link does nothing');
select public.send_get_in_code('alex.backup@example.test');
select tests.as_test();
select is((select stage from app.email_codes where email = 'alex.backup@example.test' and used_at is null), 'start',
  'A code now asks afresh, rather than finishing');
select ok(tests.as_kept('alex'), 'and Alex''s account is as it was');

-- A finish that stops part-way is settled within minutes: opened again if
-- the address didn't change, finished if it did. Never left half done.
select tests.as_supabase_admin();
select public.get_back_in_with_code('alex.backup@example.test', tests.code_sent_to('alex.backup@example.test'));
select tests.as_test();
select tests.time_passes(interval '1 day 1 minute');
select tests.as_nobody();
select public.send_get_in_code('alex.backup@example.test');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('alex.backup@example.test', tests.code_sent_to('alex.backup@example.test')) ->> 'state',
  'finish', 'Alex''s next request starts finishing, and the function stops there');
select tests.as_person('alex');
select ok(public.hello() -> 'get_back_in' = 'null'::jsonb, 'While it''s finishing, the notice isn''t shown');
select tests.as_test();
select tests.time_passes(interval '6 minutes');
select tests.as_person('alex');
select ok(public.hello() -> 'get_back_in' <> 'null'::jsonb,
  '6 minutes on, with the address unchanged, it''s open again, and the notice shows');
select tests.as_test();
select ok(tests.as_kept('alex'), 'with nothing on the account changed');
select tests.a_minute_later();
select tests.as_nobody();
select public.send_get_in_code('alex.backup@example.test');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('alex.backup@example.test', tests.code_sent_to('alex.backup@example.test')) ->> 'state',
  'finish', 'A new code starts finishing again');
-- This time Supabase's admin route makes the change, and the function stops before telling the database.
select tests.as_test();
update auth.users set email = 'alex.backup@example.test' where id = tests.id('alex');
select tests.time_passes(interval '6 minutes');
select app.open_get_back_in(tests.id('alex'));
select is((select count(*) from auth.sessions where user_id = tests.id('alex')), 0::bigint,
  '6 minutes on, with the address changed, it''s finished: every device of Alex''s is signed out');
select is(tests.newest_subject_to('alex@example.test'), 'Your PrePenny sign-in email has changed',
  'and the old address is told');

select * from finish();
rollback;
