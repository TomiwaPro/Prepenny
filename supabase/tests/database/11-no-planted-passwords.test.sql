-- Nobody can plant a password on someone else's account (D313). Supabase
-- lets anyone sign up with an address and a password; the database keeps no
-- password until the address is confirmed, and removes any password at the
-- moment it's confirmed. The sign-in tests prove the same with Supabase's
-- own sign-in service (apps/web/e2e/sign-in.spec.ts).

begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

-- A stranger signs up with Sam's address and a password.
insert into auth.users (id, email, encrypted_password)
values (tests.id('planted'), 'sam-planted@example.test', '$2a$10$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvwxyz0123');
select is((select encrypted_password from auth.users where id = tests.id('planted')), '',
  'An account whose address isn''t confirmed keeps no password');

update auth.users set encrypted_password = '$2a$10$another.password.hash.from.the.stranger.abcdefghijklmn'
where id = tests.id('planted');
select is((select encrypted_password from auth.users where id = tests.id('planted')), '',
  'Not even when the stranger sets one again');

-- Sam signs in with a code, which confirms the address, at the same time as a password arrives.
update auth.users set email_confirmed_at = now(),
  encrypted_password = '$2a$10$yet.another.password.hash.from.the.stranger.abcdefghijk'
where id = tests.id('planted');
select is((select encrypted_password from auth.users where id = tests.id('planted')), '',
  'Confirming the address removes any password set before it');

-- Later, Sam adds a password of his own, signed in, on his confirmed account (brief 4.13).
update auth.users set encrypted_password = '$2a$10$sams.own.password.hash.abcdefghijklmnopqrstuvwxyz0123'
where id = tests.id('planted');
select isnt((select encrypted_password from auth.users where id = tests.id('planted')), '',
  'A password set on a confirmed account is kept');

select ok(not has_function_privilege('authenticated', 'app.no_planted_password()', 'execute'),
  'Nobody signed in can run the check themselves');

select * from finish();
rollback;
