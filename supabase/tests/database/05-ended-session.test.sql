-- Test 5 (D21): once a sign-in session is ended, a request with that
-- session's token reads nothing, even though the token hasn't run out yet.
-- So "Sign out of this device" and "Sign out everywhere" refuse an old
-- phone's very next request, and a phone still signed in carries on.

begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

select tests.make_jess_and_tom('editor');

-- Tom is signed in on two phones: his first session, and a second one.
insert into auth.sessions (id, user_id) values (tests.id('tom-second-session'), tests.id('tom'));

create function pg_temp.as_toms_second_phone() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', tests.id('tom'),
    'session_id', tests.id('tom-second-session'), 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
grant execute on function pg_temp.as_toms_second_phone() to authenticated;

select tests.as_person('tom');
select isnt_empty($$ select * from tests.readable_rows() $$, 'On his first phone, Tom reads the shared plan');
select pg_temp.as_toms_second_phone();
select isnt_empty($$ select * from tests.readable_rows() $$, 'On his second phone, too');

-- Tom signs out of his first phone: that session is ended.
select tests.as_test();
delete from auth.sessions where id = tests.id('tom-session');
select tests.as_person('tom');

select is_empty($$ select * from tests.readable_rows() $$,
  'With the ended session''s token, Tom reads nothing in any table, though his other phone is still signed in');
select is(tests.change_rows(tests.all_ids()), 0::bigint, 'And changes nothing');
select throws_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('rent'), '2026-12-01', 1, '2026-12-01', '2026-12-01T09:00:00Z') $$,
  '42501', null, 'And can''t tick anything');
select throws_ok($$ insert into public.plans (id, name) values (gen_random_uuid(), 'New') $$,
  '42501', null, 'And can''t make a plan');

select pg_temp.as_toms_second_phone();
select isnt_empty($$ select * from tests.readable_rows() $$, 'His second phone still reads the shared plan');

-- "Sign out everywhere": every session ended.
select tests.as_test();
delete from auth.sessions where user_id = tests.id('tom');
select pg_temp.as_toms_second_phone();
select is_empty($$ select * from tests.readable_rows() $$, 'After signing out everywhere, no phone of Tom''s reads anything');

-- A session past its end reads nothing either.
select tests.as_test();
update auth.sessions set not_after = now() - interval '1 minute' where id = tests.id('jess-session');
select tests.as_person('jess');
select is_empty($$ select * from tests.readable_rows() $$, 'A session past its end reads nothing');

-- A token with no session in it, or someone else's session, reads nothing.
select tests.as_test();
insert into auth.sessions (id, user_id) values (tests.id('alex-second-session'), tests.id('alex'));
select set_config('request.jwt.claims', json_build_object('sub', tests.id('alex'), 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty($$ select * from tests.readable_rows() $$,
  'A token with no session in it reads nothing, even for someone with sessions on other phones');
select set_config('request.jwt.claims', json_build_object('sub', tests.id('jess'),
  'session_id', tests.id('alex-second-session'), 'role', 'authenticated')::text, true);
select is_empty($$ select * from tests.readable_rows() $$, 'A token with someone else''s session in it reads nothing');

select * from finish();
rollback;
