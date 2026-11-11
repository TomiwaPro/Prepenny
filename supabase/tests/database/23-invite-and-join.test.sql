-- Step 3f: invites and joining (brief 4.14, D51, D412 to D417).
--
-- Proves, as the owner asked:
-- - an invite can't be used twice, after 7 days, or after "Don't allow";
-- - someone with a forwarded link gets nothing until allowed;
-- - "Can view only" can't change shared records, apart from their own pay (D311);
-- - nobody can invite themselves into someone else's plan;
-- - refusals hold no email address, only short codes.
-- Every invite step is tried as the wrong person too.

begin;
create extension if not exists pgtap with schema extensions;

select plan(78);

select tests.make_jess_alone();
select tests.make_person('sam');
select tests.make_person('priya');

-- A table for the secrets the steps give back, kept between steps.
create temporary table kept (name text primary key, value text);
grant all on kept to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Making an invite: the owner only.

select tests.as_person('tom');
select throws_ok($$ select public.make_invite(tests.id('plan'), 'editor', 'Tom', null) $$, '42501', 'not-found',
  'Tom, who isn''t in the plan, can''t make an invite to Jess''s plan');
select tests.as_person('alex');
select throws_ok($$ select public.make_invite(tests.id('plan'), 'editor', 'Alex', null) $$, '42501', 'not-found',
  'nor can Alex');
select tests.as_nobody();
select throws_ok($$ select public.make_invite(tests.id('plan'), 'editor', 'Nobody', null) $$, '42501', null,
  'and someone who isn''t signed in can''t use any invite step');
select throws_ok($$ select public.look_at_invite('anything-at-all-anything') $$, '42501', null,
  'not even to look at one');

select tests.as_person('jess');
select throws_ok($$ select public.make_invite(tests.id('plan'), 'owner', 'Jess', null) $$, 'P0001', 'bad-invite',
  'An invite gives "Can edit" or "Can view only", never the plan itself');
select throws_ok($$ select public.make_invite(tests.id('plan'), 'editor', '   ', null) $$, 'P0001', 'needs-name',
  'It needs the name the partner will see');
select throws_ok($$ select public.make_invite(tests.id('plan'), 'editor', repeat('J', 31), null) $$, 'P0001',
  'needs-name', 'of 30 characters at most');

insert into kept select 'link', public.make_invite(tests.id('plan'), 'editor', ' Jess ', null) ->> 'token';
select ok((select length(value) >= 40 from kept where name = 'link'),
  'Jess makes an invite link, with a secret that can''t be guessed');
select tests.as_test();
select is((select count(*) from public.invites where token_hash = (select value from kept where name = 'link')),
  0::bigint, 'Only a scrambled copy of the secret is kept');
select is((select expires_at - created_at from public.invites where plan_id = tests.id('plan') and cancelled_at is null),
  interval '7 days', 'It lasts 7 days');
select is((select nickname from public.people where id = tests.id('jess')), 'Jess',
  'Her name is kept as typed, without the spaces');

-- ---------------------------------------------------------------------------
-- The person it's for: they look, and ask. Asking lets nobody in.

select tests.as_person('tom');
select is(public.look_at_invite((select value from kept where name = 'link')) - 'expires_at' - 'now',
  '{"state": "open", "role": "editor", "inviter": "Jess"}'::jsonb,
  'Tom opens the link: Jess''s invite, "Can edit", open');
select is(public.look_at_invite('not-a-real-secret-at-all-not-real') ->> 'state', 'not-found',
  'A made-up link is no invite');
select throws_ok($$ select public.ask_to_join((select value from kept where name = 'link'), '') $$, 'P0001',
  'needs-name', 'Asking needs his name too');
select is(public.ask_to_join((select value from kept where name = 'link'), 'Tom') ->> 'state', 'waiting',
  'Tom asks to join, and waits for Jess');
select is(public.ask_to_join((select value from kept where name = 'link'), 'Tom') ->> 'state', 'waiting',
  'asking again changes nothing');

-- Until Jess allows it, Tom gets nothing of her plan.
select is_empty($$ select * from tests.readable_rows() where split_part(readable_rows, ':', 1) <> 'people' $$,
  'Tom, waiting, reads nothing of Jess''s plan, in any table');
select is_empty($$ select * from tests.rows_naming(array[tests.id('plan')::text]) $$,
  'not even a row that names it');
select throws_ok($$ select public.plan_changes(tests.id('plan'), 0, 0) $$, '42501', 'not-found',
  'and can''t bring it down');
select throws_ok($$ select public.save_edit(tests.id('plan'), gen_random_uuid(), '2026-11-07T10:00:00Z', 'test',
    '[]'::jsonb) $$, '42501', 'not-found', 'or save anything in it');
select ok(not app.may_hear('plan:' || tests.id('plan')), 'or hear its nudges');
select throws_ok($$ select public.sharing(tests.id('plan')) $$, '42501', 'not-found',
  'or see who''s in it');
select throws_ok($$ select public.answer_join((select id from public.invites limit 1), true) $$, '42501', null,
  'He can''t read the invite, let alone allow himself');
select tests.as_test();
insert into kept select 'tom-invite', id::text from public.invites where asked_by = tests.id('tom');
select tests.as_person('tom');
select throws_ok($$ select public.answer_join((select value::uuid from kept where name = 'tom-invite'), true) $$,
  '42501', 'not-found', 'Knowing the invite''s id, he still can''t allow himself in');
select is(public.hello() -> 'join_requests', '[]'::jsonb, 'and nobody asks him about it');

-- The forwarded link: someone else gets nothing, as it's used up.
select tests.as_person('alex');
select is(public.look_at_invite((select value from kept where name = 'link')) - 'expires_at' - 'now',
  '{"state": "used", "role": "editor", "inviter": null}'::jsonb,
  'Alex, with the forwarded link, finds it used, and isn''t told whose it is');
select throws_ok($$ select public.ask_to_join((select value from kept where name = 'link'), 'Tom') $$, 'P0001',
  'used', 'and can''t ask with it, even with Tom''s name');
select is_empty($$ select * from tests.readable_rows() where split_part(readable_rows, ':', 1) <> 'people' $$,
  'Alex reads nothing of the plan either');

-- ---------------------------------------------------------------------------
-- The owner answers.

select tests.as_person('jess');
select is((public.hello() -> 'join_requests' -> 0) - 'invite' - 'asked_at',
  jsonb_build_object('plan', tests.id('plan'), 'role', 'editor', 'nickname', 'Tom', 'email', 'tom@example.test'),
  'Jess is asked about Tom: his name, and the email address he signed in with');
select is(jsonb_array_length(public.sharing(tests.id('plan')) -> 'requests'), 1,
  'and "Share with my partner" shows it too');
select tests.as_test();
-- The owner's phones are nudged when someone asks.
select tests.as_person('jess');
select is(public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), true) ->> 'state',
  'joined', 'Jess allows it');
select tests.as_test();
select is((select role from public.plan_members where plan_id = tests.id('plan') and person_id = tests.id('tom')),
  'editor', 'and Tom is in her plan, with "Can edit"');

-- Used once, for good.
select tests.as_person('jess');
select throws_ok($$ select public.answer_join((select id from public.invites where accepted_at is not null), false) $$,
  'P0001', 'not-waiting', 'The answer can''t be changed afterwards');
select is(public.hello() -> 'join_requests', '[]'::jsonb, 'and nothing waits for Jess any more');
select tests.as_person('tom');
select is(public.look_at_invite((select value from kept where name = 'link')) ->> 'state', 'joined',
  'Tom, opening the link again, is told he has joined');
select tests.as_person('alex');
select throws_ok($$ select public.ask_to_join((select value from kept where name = 'link'), 'Alex') $$, 'P0001',
  'used', 'and nobody else can use it');
select tests.as_person('jess');
select is(public.look_at_invite((select value from kept where name = 'link')) ->> 'state', 'yours',
  'Jess, opening her own link, is told it''s hers');
select throws_ok($$ select public.make_invite(tests.id('plan'), 'editor', 'Jess', null) $$, 'P0001', 'full',
  'With two people in the plan, there''s no room for another invite');

-- Tom, with "Can edit", can't invite anyone: only the owner does.
select tests.as_person('tom');
select throws_ok($$ select public.make_invite(tests.id('plan'), 'editor', 'Tom', null) $$, '42501', 'not-found',
  'Tom, who can edit, can''t make an invite to Jess''s plan');

-- Nobody writes membership or invites straight through the Data API.
select throws_ok($$ insert into public.plan_members (plan_id, person_id, role)
    values (tests.id('plan'), tests.id('alex'), 'editor') $$, '42501', null,
  'Nobody can add someone to a plan by writing it');
select tests.as_person('alex');
select throws_ok($$ insert into public.plan_members (plan_id, person_id, role)
    values (tests.id('plan'), tests.id('alex'), 'editor') $$, '42501', null,
  'not even themselves');
select throws_ok($$ insert into public.invites (plan_id, role, token_hash)
    values (tests.id('plan'), 'editor', 'made-up') $$, '42501', null,
  'and nobody can write an invite');
select throws_ok($$ update public.invites set accepted_at = now() $$, '42501', null,
  'or answer one by writing it');

-- ---------------------------------------------------------------------------
-- "Don't allow", 7 days, cancelling, and a plan of one's own. Alex has a
-- plan of his own and invites Sam.

select tests.as_person('alex');
select public.start_plan(tests.id('alex-plan'), null);
insert into kept select 'alex-1', public.make_invite(tests.id('alex-plan'), 'viewer', 'Alex', null) ->> 'token';
select tests.as_person('sam');
select is(public.look_at_invite((select value from kept where name = 'alex-1')) ->> 'role', 'viewer',
  'Sam opens Alex''s invite, which says "Can view only"');
select is(public.ask_to_join((select value from kept where name = 'alex-1'), 'Sam') ->> 'state', 'waiting',
  'and asks to join');
select tests.as_person('alex');
select is(public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), false) ->> 'state',
  'not-allowed', 'Alex doesn''t allow it');
select tests.as_person('sam');
select is(public.look_at_invite((select value from kept where name = 'alex-1')) ->> 'state', 'not-allowed',
  'Sam is told he wasn''t allowed');
select throws_ok($$ select public.ask_to_join((select value from kept where name = 'alex-1'), 'Sam') $$, 'P0001',
  'not-allowed', 'and can''t ask again with it');
select throws_ok($$ select public.plan_changes(tests.id('alex-plan'), 0, 0) $$, '42501', 'not-found',
  'and gets nothing of Alex''s plan');
select tests.as_person('priya');
select throws_ok($$ select public.ask_to_join((select value from kept where name = 'alex-1'), 'Priya') $$, 'P0001',
  'used', 'Nobody else can use it after "Don''t allow"');
select tests.as_person('alex');
select throws_ok($$ select public.answer_join((select id from public.invites where refused_at is not null), true) $$,
  'P0001', 'not-waiting', 'and Alex can''t change his answer to let Sam in');
select tests.as_test();
select is((select count(*) from public.plan_members where plan_id = tests.id('alex-plan')), 1::bigint,
  'Alex is still alone in his plan');

-- After 7 days.
select tests.as_person('alex');
insert into kept select 'alex-2', public.make_invite(tests.id('alex-plan'), 'editor', 'Alex', null) ->> 'token';
select tests.as_test();
update public.invites set expires_at = now() - interval '1 second', created_at = now() - interval '7 days'
  where plan_id = tests.id('alex-plan') and cancelled_at is null and refused_at is null;
select tests.as_person('sam');
select is(public.look_at_invite((select value from kept where name = 'alex-2')) ->> 'state', 'ran-out',
  'An invite 7 days old has run out');
select throws_ok($$ select public.ask_to_join((select value from kept where name = 'alex-2'), 'Sam') $$, 'P0001',
  'ran-out', 'and can''t be used');

-- Asked in time, but not answered in time.
select tests.as_person('alex');
insert into kept select 'alex-3', public.make_invite(tests.id('alex-plan'), 'editor', 'Alex', null) ->> 'token';
select tests.as_person('sam');
select public.ask_to_join((select value from kept where name = 'alex-3'), 'Sam');
select tests.as_test();
update public.invites set expires_at = now() - interval '1 second'
  where plan_id = tests.id('alex-plan') and asked_by = tests.id('sam') and refused_at is null;
select tests.as_person('alex');
select is(public.hello() -> 'join_requests', '[]'::jsonb, 'Once it runs out, Alex isn''t asked any more');
select throws_ok(format($$ select public.answer_join(%L, true) $$,
    (select id from public.invites where asked_by = tests.id('sam') and refused_at is null)),
  'P0001', 'ran-out', 'and can''t let Sam in with it');

-- Cancelled, and one at a time.
select tests.as_person('alex');
insert into kept select 'alex-4', public.make_invite(tests.id('alex-plan'), 'editor', 'Alex', null) ->> 'token';
insert into kept select 'alex-5', public.make_invite(tests.id('alex-plan'), 'editor', 'Alex', null) ->> 'token';
select tests.as_person('sam');
select is(public.look_at_invite((select value from kept where name = 'alex-4')) ->> 'state', 'cancelled',
  'A new invite cancels the one before');
select tests.as_person('alex');
select is(public.cancel_invite((select (public.sharing(tests.id('alex-plan')) -> 'invite' ->> 'id')::uuid)) ->> 'state',
  'cancelled', 'and "Cancel this invite" cancels it');
select tests.as_person('sam');
select throws_ok($$ select public.ask_to_join((select value from kept where name = 'alex-5'), 'Sam') $$, 'P0001',
  'cancelled', 'so it can''t be used');
select tests.as_person('tom');
select throws_ok($$ select public.cancel_invite((select value::uuid from kept where name = 'tom-invite')) $$,
  '42501', 'not-found', 'Only the owner cancels an invite');

-- A plan of one's own comes with its person since step 3f-2 (D426,
-- replacing D416's "not joined"), and nobody is ever in two plans (D427).
-- 25-bring-your-plan.test.sql tries the move itself.
select tests.as_person('alex');
insert into kept select 'alex-6', public.make_invite(tests.id('alex-plan'), 'editor', 'Alex', null) ->> 'token';
select tests.as_person('priya');
select public.start_plan(tests.id('priya-plan'), null);
select is(public.look_at_invite((select value from kept where name = 'alex-6')) - 'expires_at' - 'now',
  jsonb_build_object('state', 'open', 'role', 'editor', 'inviter', 'Alex', 'brings', true),
  'Priya, who has a plan of her own with nobody else in it, can ask, and is told it comes with her, but nothing about Alex''s plan until he lets her in (D439)');
select tests.as_person('tom');
select is(public.look_at_invite((select value from kept where name = 'alex-6')) ->> 'state', 'has-a-plan',
  'Tom, who is in Jess''s plan, is told he can''t join another');
select throws_ok($$ select public.ask_to_join((select value from kept where name = 'alex-6'), 'Tom') $$, 'P0001',
  'has-a-plan', 'and can''t ask to');
select tests.as_person('sam');
select public.ask_to_join((select value from kept where name = 'alex-6'), 'Sam');
select public.start_plan(tests.id('sam-plan'), null);
select tests.as_person('alex');
select is(public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite'))::uuid, true) ->> 'state',
  'allowed', 'Someone who made a plan of their own while waiting is let in, to bring it with them');

-- ---------------------------------------------------------------------------
-- By email: the email holds the link, and nothing about money.

select tests.as_person('alex');
select public.remove_plan(tests.id('alex-plan'));
select public.start_plan(tests.id('alex-plan-2'), null);
select throws_ok($$ select public.make_invite(tests.id('alex-plan-2'), 'editor', 'Alex', 'not an address') $$,
  'P0001', 'bad-email', 'An email that isn''t an address is refused, by code only');
select tests.as_test();
create temporary table emails_before as select count(*) as n from net.http_request_queue;
select tests.as_person('alex');
select is(public.make_invite(tests.id('alex-plan-2'), 'viewer', 'Alex', 'Partner@Example.test') ->> 'token', null,
  'An invite by email gives the phone no secret: the email has the link');
select tests.as_test();
select is((select count(*) from net.http_request_queue) - (select n from emails_before), 1::bigint,
  'and one email is sent');
select ok((select convert_from(q.body, 'utf8')::jsonb ->> 'Text' like '%Alex has invited you to share their plan%'
    and convert_from(q.body, 'utf8')::jsonb ->> 'Text' like '%http://127.0.0.1:4173/join/#%'
    and convert_from(q.body, 'utf8')::jsonb ->> 'Text' like '%lasts 7 days%'
    and convert_from(q.body, 'utf8')::jsonb ->> 'Text' not like '%£%'
    from net.http_request_queue q order by q.id desc limit 1),
  'to the address typed, with the link, saying it lasts 7 days, and no amount');
select is((select email from public.invites where plan_id = tests.id('alex-plan-2') and cancelled_at is null),
  'partner@example.test', 'The address is kept for Alex to see, in small letters');
select tests.as_person('alex');
select public.make_invite(tests.id('alex-plan-2'), 'viewer', 'Alex', 'partner@example.test');
select public.make_invite(tests.id('alex-plan-2'), 'viewer', 'Alex', 'partner@example.test');
select throws_ok($$ select public.make_invite(tests.id('alex-plan-2'), 'viewer', 'Alex', 'partner@example.test') $$,
  'P0001', 'too-many-emails', 'Three invite emails a day at most, so PrePenny can''t be used to send them to strangers');
select lives_ok($$ select public.make_invite(tests.id('alex-plan-2'), 'viewer', 'Alex', null) $$,
  'while a link still works');
select tests.as_person('tom');
select is((select count(*) from public.invites), 0::bigint, 'Only the owner reads invites, which can hold an address');

-- ---------------------------------------------------------------------------
-- "Can view only", joined through an invite: nothing shared changes, apart
-- from their own pay (D51, D311).

select tests.as_test();
delete from public.plan_members where person_id = tests.id('sam');
delete from public.plans where owner = tests.id('sam');
select tests.as_person('alex');
insert into kept select 'alex-view', public.make_invite(tests.id('alex-plan-2'), 'viewer', 'Alex', null) ->> 'token';
select tests.in_an_edit('alex', 'alex-plan-2');
insert into public.accounts (id, plan_id, name, kind, warning_level)
  values (tests.id('alex-joint'), tests.id('alex-plan-2'), 'Joint', 'joint', 0);
insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
  holiday_rule, family_id, family_created_at)
values (tests.id('alex-rent'), tests.id('alex-plan-2'), tests.id('alex-joint'), 'Rent', 'out', 'rent', 50000,
  date '2026-11-01', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}', '{"kind":"never"}', 'keep',
  tests.id('alex-rent'), '2026-10-25T08:31:00Z');
select tests.as_person('sam');
select public.ask_to_join((select value from kept where name = 'alex-view'), 'Sam');
select tests.as_person('alex');
select public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), true);
select tests.as_test();
select is((select role from public.plan_members where plan_id = tests.id('alex-plan-2') and person_id = tests.id('sam')),
  'viewer', 'Sam joins Alex''s plan with "Can view only"');
select tests.in_an_edit('sam', 'alex-plan-2');
select is(tests.readable('series'), 1::bigint, 'He sees the shared rent');
select is(tests.change_rows(array[tests.id('alex-rent')::text, tests.id('alex-joint')::text]), 0::bigint,
  'but can''t change it or the account');
select throws_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
    values (gen_random_uuid(), tests.id('alex-plan-2'), tests.id('alex-rent'), '2026-11-01', 0, '2026-11-01',
      '2026-11-01T09:00:00Z') $$, '42501', null, 'or tick it (D51)');
select lives_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, paid_to)
  values (tests.id('sam-pay'), tests.id('alex-plan-2'), tests.id('alex-joint'), 'Pay', 'in', 'pay', 180000,
    date '2026-11-27', '{"kind":"monthly","every":1,"on":{"kind":"day","day":27}}', '{"kind":"never"}', 'keep',
    tests.id('sam-pay'), '2026-10-25T08:31:00Z', tests.id('sam')) $$,
  'He can still add his own pay to the shared account (D311)');
select is(tests.change_rows(array[tests.id('sam-pay')::text]), 1::bigint, 'and change it');

select * from finish();
rollback;
