-- Step 4k, fix 3 (D648): if support's authenticator app is lost, the owner
-- turns off two-step sign-in for support's account in Supabase's SQL Editor
-- with `select app.turn_off_support_two_step();` (README.md, "If support's
-- authenticator app is lost"). No address is typed: the database knows who
-- support is. It touches support's account only, and only the database's
-- administrator can run it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- As on a fresh database, whatever the end-to-end tests left on this one.
delete from app.support_person;
delete from app.two_step_waits;

-- Sue is support, with two-step sign-in on. Pat is anyone else, with it on too.
select tests.make_person('sue');
select tests.make_person('pat');
update auth.users set email_confirmed_at = now() where id in (tests.id('sue'), tests.id('pat'));
select is(app.set_support('sue@example.test'), 'set', 'Sue''s account is PrePenny support''s');
select tests.turn_on_two_step('sue');
select tests.turn_on_two_step('pat');

-- A refusal's code, or "no refusal".
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'no refusal';
exception when others then
  return sqlerrm;
end;
$$;
grant execute on function pg_temp.refusal(text) to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 1. Why a step of its own: removing an authenticator app without a code
-- typed in the last 5 minutes is refused, even in the SQL Editor (D382).

select is(pg_temp.refusal($$ delete from auth.mfa_factors where user_id = tests.id('sue') $$),
  'second-step-needed', 'Removing support''s authenticator app by hand is refused, as for anyone');

-- ---------------------------------------------------------------------------
-- 2. Nobody but the database's administrator can run the step.

select tests.as_person('pat');
select is(pg_temp.refusal('select app.turn_off_support_two_step()'),
  'permission denied for function turn_off_support_two_step', 'Someone signed in can''t run it');
select tests.as_person_with_second_step('sue');
select is(pg_temp.refusal('select app.turn_off_support_two_step()'),
  'permission denied for function turn_off_support_two_step', 'nor can support itself, signed in');
select tests.as_nobody();
select ok(pg_temp.refusal('select app.turn_off_support_two_step()') like 'permission denied for %',
  'nor someone signed out');
select tests.as_supabase_admin();
select ok(pg_temp.refusal('select app.turn_off_support_two_step()') like 'permission denied for %',
  'nor Supabase''s own key');
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 3. The owner runs it in the SQL Editor.

select is(app.turn_off_support_two_step(),
  'Two-step sign-in is off for PrePenny support''s account, and it has been signed out everywhere. '
    || 'Sign in to the support dashboard again, and set up two-step sign-in with your new phone.',
  'Run in the SQL Editor, it says what it did, and what to do next');
select is_empty($$ select 1 from auth.mfa_factors where user_id = tests.id('sue') $$,
  'Support''s authenticator app is removed');
select ok(not app.two_step_on(tests.id('sue')), 'so two-step sign-in is off for support''s account');
select is_empty($$ select 1 from auth.sessions where user_id = tests.id('sue') $$,
  'and every sign-in of support''s has ended');
select isnt_empty($$ select 1 from auth.mfa_factors where user_id = tests.id('pat') $$,
  'Nobody else''s authenticator app is touched');
select isnt_empty($$ select 1 from auth.sessions where user_id = tests.id('pat') $$,
  'nor anyone else''s sign-in');
select is(pg_temp.refusal($$ delete from auth.mfa_factors where user_id = tests.id('pat') $$),
  'second-step-needed', 'and once it has run, removing anyone''s app by hand is still refused');

-- Run again: nothing left to remove.
select is(app.turn_off_support_two_step(),
  'Two-step sign-in was already off for PrePenny support''s account. '
    || 'It has been signed out everywhere. Sign in to the support dashboard again to set it up.',
  'Run again, it says two-step sign-in was already off');

-- ---------------------------------------------------------------------------
-- 4. With nobody as support, it changes nothing.

select app.set_support('');
select is(app.turn_off_support_two_step(),
  'Nobody is PrePenny support in this database yet. Check the GitHub secret SUPPORT_EMAIL, '
    || 'then run the Database workflow again. Nothing was changed.',
  'With nobody as support, it says so');
select isnt_empty($$ select 1 from auth.mfa_factors where user_id = tests.id('pat') $$,
  'and changes nothing');

select * from finish();
rollback;
