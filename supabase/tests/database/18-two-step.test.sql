-- Step 3e: two-step sign-in with an authenticator app (brief 4.13).
-- - Once someone has turned it on, a sign-in that hasn't passed the second
--   step gets no plan data at all, and can save nothing: the database
--   refuses, not just the screen.
-- - The second step counts only when both Supabase's record of the session
--   and its token say so.
-- - Signing out everywhere needs the second step in the last 5 minutes, and
--   so do turning it off and changing the email address, whatever asks.
-- - Someone without it, such as their partner, carries on as before.

begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

select tests.make_jess_and_tom('editor');
select tests.turn_on_two_step('jess');

-- Jess signs in again with an email code only: the first step.
select tests.as_person('jess');
select is(public.hello() ->> 'sign_in', 'second-step', 'Her phone''s look says the second step is needed');
select is_empty($$ select * from tests.readable_rows() $$,
  'Without the second step, Jess reads nothing in any table, her own plan included');
select is(tests.change_rows(tests.all_ids()), 0::bigint, 'and changes nothing');
select throws_ok($$ select public.plan_changes(tests.id('plan'), 0, 0) $$, '42501', 'not-found',
  'can''t bring her plan down');
select throws_ok($$ select public.save_edit(tests.id('plan'), gen_random_uuid(), '2026-11-07T10:00:00Z', 'tick',
    jsonb_build_array(jsonb_build_object('table', 'ticks', 'id', gen_random_uuid(), 'version', null,
      'row', jsonb_build_object('series_id', tests.id('rent'), 'original_date', '2026-12-01',
        'payment_number', 1, 'paid_on', '2026-12-01', 'ticked_at', '2026-12-01T09:00:00Z', 'list_order', 0)))) $$,
  '42501', 'not-found', 'can''t save a change');
select throws_ok($$ select public.my_devices() $$, '42501', 'not-allowed', 'and can''t see her devices');
select throws_ok($$ select public.end_device(tests.id('tom-session')) $$, '42501', 'not-allowed',
  'or end one');

-- A token that says "aal2" on a session Supabase hasn't marked counts for nothing.
select tests.as_person_with_second_step('jess');
select is_empty($$ select * from tests.readable_rows() $$,
  'A token claiming the second step, on a session that hasn''t passed it, reads nothing');

-- Nor does a session marked, with a token that doesn't say so.
select tests.as_test();
update auth.sessions set aal = 'aal2' where id = tests.id('jess-session');
select tests.as_person('jess');
select is_empty($$ select * from tests.readable_rows() $$,
  'A token from before the second step reads nothing, even once the session has passed it');

-- Both: the second step is passed.
select tests.as_person_with_second_step('jess');
select is(public.hello() ->> 'sign_in', 'ok', 'Once the second step is passed, her sign-in stands');
select isnt_empty($$ select * from tests.readable_rows() $$, 'and Jess reads her plan');

-- Tom has no two-step sign-in, and carries on.
select tests.as_person('tom');
select isnt_empty($$ select * from tests.readable_rows() $$, 'Tom, without two-step sign-in, reads the shared plan');
select is((public.end_every_device() ->> 'ended')::integer, 1,
  'and can sign out everywhere without a second step he doesn''t have');

-- Signing out everywhere needs the second step in the last 5 minutes.
select tests.as_person_with_second_step('jess');
select throws_ok($$ select public.end_every_device() $$, '42501', 'second-step-needed',
  'Jess can''t sign out everywhere without typing a code from her authenticator app just now');
select tests.as_test();
insert into auth.mfa_amr_claims (id, session_id, created_at, updated_at, authentication_method)
values (gen_random_uuid(), tests.id('jess-session'), now() - interval '6 minutes', now() - interval '6 minutes', 'totp');
select tests.as_person_with_second_step('jess');
select throws_ok($$ select public.end_every_device() $$, '42501', 'second-step-needed',
  'A code typed 6 minutes ago is too long ago');

-- Turning it off and changing the email address, as Supabase's sign-in
-- service does them, need a code in the last 5 minutes too.
select tests.as_test();
select throws_ok($$ delete from auth.mfa_factors where id = tests.id('jess-factor') $$, '42501', 'second-step-needed',
  'Two-step sign-in can''t be turned off without a code typed just now');
select throws_ok($$ update auth.users set email_change = 'someone@example.test' where id = tests.id('jess') $$,
  '42501', 'second-step-needed', 'and the email address can''t start changing');
update auth.users set raw_user_meta_data = '{}'::jsonb where id = tests.id('jess');
select pass('Nothing else about the account is held up');

update auth.mfa_amr_claims set updated_at = now() where session_id = tests.id('jess-session');
select lives_ok($$ update auth.users set email_change = 'someone@example.test' where id = tests.id('jess') $$,
  'With a code typed just now, the email address can start changing');
-- A second authenticator app of hers, so turning one off leaves two-step sign-in on.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values (tests.id('jess-factor-2'), tests.id('jess'), 'Second', 'totp', 'verified', now(), now(), 'TEST');
select lives_ok($$ delete from auth.mfa_factors where id = tests.id('jess-factor-2') $$,
  'and an authenticator app can be turned off');
select tests.as_person_with_second_step('jess');
select is((public.end_every_device() ->> 'ended')::integer, 1, 'and Jess can sign out everywhere');

-- Removing a whole account is never held up by it.
select tests.as_test();
select tests.turn_on_two_step('alex');
select lives_ok($$ delete from auth.users where id = tests.id('alex') $$,
  'An account with two-step sign-in can still be removed whole');

select * from finish();
rollback;
