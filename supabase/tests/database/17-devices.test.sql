-- Step 3e: signed-in devices (brief 4.13, D21).
-- - Each person sees only their own devices, named by kind of browser and
--   device, never by IP address or place, with when each was last used.
-- - "Sign out of this device" ends one of the person's own devices only:
--   nobody can see or end anyone else's.
-- - "Sign out of all other devices" ends every device of the person's but
--   the one asking, and nobody else's (step 3e hardening), and each one's
--   refresh tokens go with it, as with Supabase's own sign-out.
-- - An ended device gets nothing at all from its very next request, and its
--   look at its sign-in (hello) says it has ended, so the phone removes the
--   plan within a minute; the person's phones are nudged to look at once.

begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

select tests.make_jess_and_tom('editor');

-- Tom is signed in on an Android phone and a laptop; Jess on an iPhone.
update auth.sessions set user_agent =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  ip = '203.0.113.7', created_at = now() - interval '3 days'
  where id = tests.id('tom-session');
insert into auth.sessions (id, user_id, user_agent, ip, created_at, refreshed_at)
values (tests.id('tom-laptop-session'), tests.id('tom'),
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  '198.51.100.20', now() - interval '10 days', (now() - interval '2 days') at time zone 'utc');
update auth.sessions set user_agent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
  where id = tests.id('jess-session');

-- What a phone's description of itself is called.
select is(app.browser_of('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36')
  || ' ' || app.device_of('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'),
  'chrome android-phone', 'Chrome on an Android phone');
select is(app.browser_of('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
  || ' ' || app.device_of('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
  'safari iphone', 'Safari on an iPhone');
select is(app.browser_of('Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36'),
  'samsung', 'Samsung Internet, not Chrome');
select is(app.browser_of('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0')
  || ' ' || app.device_of('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'),
  'edge windows', 'Edge on a Windows computer');
select is(app.browser_of('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'),
  '', 'An app on an iPhone''s home screen names no browser');

-- Tom's list.
select tests.as_person('tom');
select is(jsonb_array_length(public.my_devices() -> 'devices'), 2, 'Tom sees his two devices');
select is((public.my_devices() -> 'devices' -> 0 ->> 'id')::uuid, tests.id('tom-session'),
  'This device first');
select is((public.my_devices() -> 'devices' -> 0 ->> 'this')::boolean, true, 'marked as this device');
select is((public.my_devices() -> 'devices' -> 0 ->> 'browser') || ' ' || (public.my_devices() -> 'devices' -> 0 ->> 'device'),
  'chrome android-phone', 'with its kind of browser and device');
select is((public.my_devices() -> 'devices' -> 1 ->> 'browser') || ' ' || (public.my_devices() -> 'devices' -> 1 ->> 'device'),
  'safari mac', 'and the laptop: Safari on a Mac');
select ok((public.my_devices() -> 'devices' -> 1 ->> 'last_used_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$',
  'each with when it was last used');
select is_empty($$ select key from jsonb_array_elements(public.my_devices() -> 'devices') d, jsonb_object_keys(d) key
    where key not in ('id', 'browser', 'device', 'this', 'last_used_at') $$,
  'and nothing else: no IP address, no place, no description of the browser');
select unalike(public.my_devices()::text, '%203.0.113%', 'No IP address anywhere in the answer');
select ok(not exists (select 1 from jsonb_array_elements(public.my_devices() -> 'devices') d
    where (d ->> 'id')::uuid = tests.id('jess-session')),
  'Jess''s device is never in Tom''s list, though they share a plan');

-- hello, when the phone looks at its sign-in, notes when it was last used.
select is(public.hello() ->> 'sign_in', 'ok', 'Tom''s phone''s sign-in stands');
select tests.as_test();
select ok((select last_used_at > now() - interval '1 minute' from app.devices where session_id = tests.id('tom-session')),
  'and its look notes it was used just now');

-- Nudges, caught here instead of sent, for this test only (13-save-edit-roles does the same).
create table tests.nudges (topic text);
grant insert, select on tests.nudges to authenticated;
create or replace function app.send_nudge(topic text) returns void
language sql security definer set search_path = '' as $$
  insert into tests.nudges (topic) values (topic)
$$;

-- Tom can't end Jess's device.
select tests.as_person('tom');
select throws_ok($$ select public.end_device(tests.id('jess-session')) $$, '42501', 'not-found',
  'Tom can''t end Jess''s device: refused as one that doesn''t exist');
select tests.as_test();
select ok(exists (select 1 from auth.sessions where id = tests.id('jess-session')), 'Jess is still signed in');

-- "Sign out of this device" for his laptop.
select tests.as_person('tom');
select is((public.end_device(tests.id('tom-laptop-session')) ->> 'ended')::integer, 1, 'Tom ends his laptop');
select tests.as_test();
select ok(not exists (select 1 from auth.sessions where id = tests.id('tom-laptop-session')), 'The laptop is signed out');
select ok(exists (select 1 from auth.sessions where id = tests.id('tom-session')), 'and only the laptop: his phone isn''t');
select is((select count(*) from tests.nudges where topic = 'plan:' || tests.id('plan') || ':' || tests.id('tom')),
  1::bigint, 'His phones are nudged on his own private channel, to look straight away');

-- The laptop's token gets nothing from its next request.
select set_config('request.jwt.claims', json_build_object('sub', tests.id('tom'),
  'session_id', tests.id('tom-laptop-session'), 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(public.hello() ->> 'sign_in', 'ended', 'The laptop''s look says its sign-in has ended');
select is_empty($$ select * from tests.readable_rows() $$, 'and it reads nothing in any table');
select throws_ok($$ select public.plan_changes(tests.id('plan'), 0, 0) $$, '42501', 'not-found',
  'can''t bring the plan down');
select throws_ok($$ select public.my_devices() $$, '42501', 'not-allowed', 'or see the devices');

-- "Sign out of all other devices" (step 3e hardening). Tom has signed in on
-- a tablet too, which can renew its sign-in with its refresh token.
select tests.as_test();
insert into auth.sessions (id, user_id, user_agent, created_at)
values (tests.id('tom-tablet-session'), tests.id('tom'),
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', now());
insert into auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at)
values ('tom-tablet-refresh', tests.id('tom')::text, tests.id('tom-tablet-session'), false, now(), now());
select tests.as_person('tom');
select is((public.end_other_devices() ->> 'ended')::integer, 1, 'Tom signs out of all his other devices');
select tests.as_test();
select results_eq($$ select id from auth.sessions where user_id = tests.id('tom') $$,
  $$ values (tests.id('tom-session')) $$, 'Only the device he did it on is still signed in');
select ok(not exists (select 1 from auth.refresh_tokens where token = 'tom-tablet-refresh'),
  'and the tablet''s refresh token went with its sign-in, so it can''t renew it');
select ok(exists (select 1 from auth.sessions where id = tests.id('jess-session')), 'and Jess still isn''t signed out');

select * from finish();
rollback;
