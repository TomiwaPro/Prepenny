-- Step 3e: a backup email, and getting back in with it (brief 4.13).
-- - Added only with a code sent to it, from a sign-in that has passed the
--   second step when two-step sign-in is on.
-- - Never someone else's backup, or the address someone else signs in with.
-- - Getting back in needs a code sent to the backup, which starts a 24-hour
--   wait (21-safer-recovery.test.sql has the rest, since step 3e hardening).
-- - A code is bound to its person and address, lasts 10 minutes, takes 5
--   tries at most and works once.
-- - Asking for a code, or trying one, says the same for an address that
--   isn't anyone's backup, so nobody can find out which addresses are.
-- - Nobody reads anyone's backup email but their own.

begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

select tests.make_jess_and_tom('editor');
update auth.users set email_confirmed_at = now() where id in (tests.id('jess'), tests.id('tom'), tests.id('alex'));
-- Jess signs in with email codes, as Supabase keeps it.
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values (tests.id('jess')::text, tests.id('jess'),
  jsonb_build_object('sub', tests.id('jess')::text, 'email', 'jess@example.test', 'email_verified', true),
  'email', now(), now());

-- The emails queued to an address, and the newest code in them.
create function tests.emails_to(address text) returns bigint language sql security definer as $$
  select count(*) from net.http_request_queue q
  where convert_from(q.body, 'utf8')::jsonb -> 'To' -> 0 ->> 'Email' = address
$$;
create function tests.code_sent_to(address text) returns text language sql security definer as $$
  select substring(convert_from(q.body, 'utf8')::jsonb ->> 'Text' from '\n\n([0-9]{6})\n\n')
  from net.http_request_queue q
  where convert_from(q.body, 'utf8')::jsonb -> 'To' -> 0 ->> 'Email' = address
  order by q.id desc limit 1
$$;
create function tests.wrong_code(address text) returns text language sql as $$
  select lpad(((tests.code_sent_to(address)::integer + 1) % 1000000)::text, 6, '0')
$$;
-- Lets the next code be asked for straight away, as if a minute had passed.
create function tests.a_minute_later() returns void language sql security definer as $$
  update app.email_codes set sent_at = sent_at - interval '61 seconds'
$$;
grant execute on all functions in schema tests to anon, authenticated;

-- Nobody but the database itself reads the backup emails or their codes.
select tests.as_person('jess');
select throws_ok($$ select * from app.backup_emails $$, '42501', null,
  'A signed-in person can''t read the backup emails');
select throws_ok($$ select * from app.email_codes $$, '42501', null, 'or the codes');
select tests.as_nobody();
select throws_ok($$ select public.add_backup_email('x@example.test') $$, '42501', null,
  'Someone not signed in can''t add a backup email');
select throws_ok($$ select public.backup_email() $$, '42501', null, 'or read one');

-- Jess adds a backup email.
select tests.as_person('jess');
select is(public.backup_email(), null, 'Jess has no backup email yet');
select throws_ok($$ select public.add_backup_email('not an address') $$, 'P0001', 'bad-email',
  'An address that isn''t one is refused');
select throws_ok($$ select public.add_backup_email('JESS@example.test') $$, 'P0001', 'same-as-sign-in',
  'Her sign-in address can''t be her backup too');
select is(public.add_backup_email('  Jess.Backup@Example.TEST ') ->> 'sent', 'true', 'A code is sent to her backup address');
select tests.as_test();
select is(tests.emails_to('jess.backup@example.test'), 1::bigint, 'one email, to that address as PrePenny keeps it');
select ok(tests.code_sent_to('jess.backup@example.test') ~ '^[0-9]{6}$', 'with a 6-digit code');
select ok(not exists (select 1 from app.email_codes where code_hash like '%' || tests.code_sent_to('jess.backup@example.test') || '%'),
  'kept only scrambled');
select tests.as_person('jess');
select is((public.add_backup_email('jess.backup@example.test') ->> 'sent')::boolean, false,
  'A new code can''t be asked for within a minute');
select is(public.backup_email(), null, 'Nothing is added before the code is typed');

select is(public.confirm_backup_email('jess.backup@example.test', tests.wrong_code('jess.backup@example.test')) ->> 'problem',
  'wrong', 'A wrong code doesn''t add it');
select is(public.confirm_backup_email('jess.backup@example.test', tests.code_sent_to('jess.backup@example.test')) ->> 'added',
  'true', 'The right code adds it');
select is(public.backup_email() ->> 'email', 'jess.backup@example.test', 'Jess''s backup email');
select tests.as_test();
select is(tests.emails_to('jess@example.test'), 1::bigint, 'Her sign-in address is told a backup was added');
select tests.as_person('jess');
select is(public.confirm_backup_email('jess.backup@example.test', tests.code_sent_to('jess.backup@example.test')) ->> 'problem',
  'wrong', 'A code works once');

-- Tom can't use Jess's addresses.
select tests.as_person('tom');
select is(public.backup_email(), null, 'Tom doesn''t see Jess''s backup email, though they share a plan');
select is(public.add_backup_email('jess.backup@example.test') ->> 'sent', 'true',
  'Tom can ask to add Jess''s backup address, as it says nothing about whose it is');
select throws_ok(format($$ select public.confirm_backup_email('jess.backup@example.test', %L) $$,
    tests.code_sent_to('jess.backup@example.test')), 'P0001', 'in-use',
  'but even with the code from that inbox, it''s refused: it''s someone else''s backup');
select tests.as_test();
select tests.a_minute_later();
select tests.as_person('tom');
select is(public.add_backup_email('jess@example.test') ->> 'sent', 'true', 'And Jess''s sign-in address');
select throws_ok(format($$ select public.confirm_backup_email('jess@example.test', %L) $$,
    tests.code_sent_to('jess@example.test')), 'P0001', 'in-use',
  'is refused too, even with its code');

-- Tries and time.
select tests.as_test();
select tests.a_minute_later();
select tests.as_person('tom');
select is(public.add_backup_email('tom.backup@example.test') ->> 'sent', 'true', 'Tom asks to add his own');
select is(public.confirm_backup_email('tom.backup@example.test', tests.wrong_code('tom.backup@example.test')) ->> 'problem',
  'wrong', 'Wrong once');
select public.confirm_backup_email('tom.backup@example.test', tests.wrong_code('tom.backup@example.test'))
  from generate_series(1, 4);
select is(public.confirm_backup_email('tom.backup@example.test', tests.code_sent_to('tom.backup@example.test')) ->> 'problem',
  'wrong', 'After 5 wrong tries, even the right code doesn''t work');
select tests.as_test();
select tests.a_minute_later();
select tests.as_person('tom');
select public.add_backup_email('tom.backup@example.test');
select tests.as_test();
update app.email_codes set sent_at = now() - interval '11 minutes' where email = 'tom.backup@example.test' and used_at is null;
select tests.as_person('tom');
select is(public.confirm_backup_email('tom.backup@example.test', tests.code_sent_to('tom.backup@example.test')) ->> 'problem',
  'ran-out', 'A code from 11 minutes ago has run out');

-- With two-step sign-in on, the second step is needed to change the backup.
select tests.as_test();
select tests.turn_on_two_step('tom', true);
update auth.mfa_amr_claims set updated_at = now() - interval '6 minutes' where session_id = tests.id('tom-session');
select tests.a_minute_later();
select tests.as_person_with_second_step('tom');
select throws_ok($$ select public.add_backup_email('tom.backup@example.test') $$, '42501', 'second-step-needed',
  'With two-step sign-in on, a backup can''t be added without a code from the authenticator app just now');
select tests.as_person('tom');
select throws_ok($$ select public.add_backup_email('tom.backup@example.test') $$, '42501', 'not-allowed',
  'and not at all from a sign-in that hasn''t passed the second step');

-- Getting back in, with the same answers whoever asks. Typing the code goes
-- through the get-back-in function, with Supabase's admin key, since step 3e
-- hardening; what follows the code is in 21-safer-recovery.test.sql.
select tests.as_nobody();
select is(public.send_get_in_code('nobodys.backup@example.test') ->> 'sent', 'true',
  'Asking for a code for an address that isn''t a backup says a code was sent');
select tests.as_test();
select is(tests.emails_to('nobodys.backup@example.test'), 0::bigint, 'though none is');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('nobodys.backup@example.test', '123456') ->> 'in', 'false',
  'and trying a code for it says the same as a wrong code');
select tests.as_nobody();
select is(public.send_get_in_code('Jess.Backup@example.test') ->> 'sent', 'true', 'Asking for Jess''s backup');
select tests.as_test();
select is(tests.emails_to('jess.backup@example.test'), 3::bigint, 'sends a code to it');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('jess.backup@example.test', tests.wrong_code('jess.backup@example.test')) ->> 'in',
  'false', 'A wrong code gets nobody in');
select is(public.get_back_in_with_code('tom.backup@example.test', tests.code_sent_to('jess.backup@example.test')) ->> 'in',
  'false', 'Jess''s code does nothing for another address');
select tests.as_nobody();
select is(public.send_get_in_code('jess.backup@example.test') ->> 'sent', 'true',
  'Asking again within a minute says the same');
select tests.as_test();
select is(tests.emails_to('jess.backup@example.test'), 3::bigint, 'but sends nothing more');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('jess.backup@example.test', tests.code_sent_to('jess.backup@example.test')) ->> 'state',
  'waiting', 'The right code starts the 24-hour wait');
select tests.as_test();
select is((select email from auth.users where id = tests.id('jess')), 'jess@example.test',
  'and her sign-in address is as it was');
select ok(exists (select 1 from auth.sessions where user_id = tests.id('jess')), 'and she''s still signed in');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('jess.backup@example.test', tests.code_sent_to('jess.backup@example.test')) ->> 'in',
  'false', 'The code works once');

-- With nothing to send emails, the steps that send one say so.
select tests.as_test();
delete from app.email_sender;
select tests.as_nobody();
select throws_ok($$ select public.send_get_in_code('tom.backup@example.test') $$, 'P0001', 'email-off',
  'With no way to send emails, asking for a code says so');

select * from finish();
rollback;
