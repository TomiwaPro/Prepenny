-- Step 4i: Contact us, Something looks wrong and Suggest a feature (brief
-- 4.16, D55, D601 to D613).
--
-- Proves, each with its rule broken on purpose to see it fail (D609):
-- 1. Nobody reads anyone else's message or picture: the tables are closed to
--    everyone signed in or out, and the two steps a phone calls give back
--    nothing of anyone's messages.
-- 2. Signed in, a message is the person's, and the automatic reply goes only
--    to the address they sign in with; signed out, only after a code sent to
--    the address proves it's theirs. So nobody can use PrePenny to send email
--    to someone else.
-- 3. No email holds the words: the automatic reply says when to expect an
--    answer, and hello@prepenny.co.uk is told only that messages are waiting,
--    at most once every 4 hours. No refusal holds them either.
-- 4. The caps per address, per sender, per connection and for everyone, and
--    support's emails kept to 15 codes and 10 replies a day.
-- 5. Pictures: JPEG or PNG only, by their contents; no hidden details; 2 MB
--    at most; only with the consent message. Plan copies: a PrePenny backup,
--    5 MB at most. Caps on files.
-- 6. Pictures and plan copies are deleted 30 days after they're sent, and
--    messages 12 months after the last reply, by the scheduled job's step.
-- 7. Deleting an account deletes what the person sent.

begin;
create extension if not exists pgtap with schema extensions;

select plan(132);

-- The real caps, not the local end-to-end tests' (seed.sql, D606).
update app.support_test set scale = 1 where only_one;

select tests.make_person('jess');
select tests.make_person('tom');
select tests.make_person('alex');
insert into app.backup_emails (person_id, email) values (tests.id('alex'), 'alex.backup@example.test');

-- A refusal's words, or "no refusal".
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  said text;
begin
  execute statement;
  return 'no refusal';
exception when others then
  get stacked diagnostics said = message_text;
  return said;
end;
$$;
grant execute on function pg_temp.refusal(text) to authenticated, anon;

-- A request through the Data API from a connection, as Supabase passes it
-- to the database (X-Forwarded-For, the sender's address first).
create function pg_temp.from_connection(address text) returns void language plpgsql security definer as $$
begin
  perform set_config('request.path', '/rpc/send_support', true);
  perform set_config('request.headers', json_build_object(
    'x-prepenny-version', app.database_version(),
    'x-forwarded-for', address || ', 10.0.0.1')::text, true);
end;
$$;
grant execute on function pg_temp.from_connection(text) to authenticated, anon;

-- A request as Cloudflare passes it on: its own CF-Connecting-IP, and an
-- X-Forwarded-For that starts with whatever the sender wrote.
create function pg_temp.from_cloudflare(address text, made_up text) returns void language plpgsql security definer as $$
begin
  perform set_config('request.path', '/rpc/support_code', true);
  perform set_config('request.headers', json_build_object(
    'x-prepenny-version', app.database_version(),
    'cf-connecting-ip', address,
    'x-forwarded-for', made_up || ', ' || address || ', 10.0.0.1')::text, true);
end;
$$;
grant execute on function pg_temp.from_cloudflare(text, text) to authenticated, anon;

-- Sends a message as whoever is acting, with no file.
create function pg_temp.send(kind text, words text, email text default null, code text default null)
returns jsonb language sql as $$
  select public.send_support(kind, words, null, 'b498ae820a00', 'Android, Chrome 131', null, null, null,
    email, code)
$$;
grant execute on function pg_temp.send(text, text, text, text) to authenticated, anon;

-- Sends Something looks wrong with a file, as whoever is acting.
create function pg_temp.send_file(file_kind text, file bytea, consent boolean default true)
returns jsonb language sql as $$
  select public.send_support('problem', 'The balance looks wrong', 'coming-up', 'b498ae820a00',
    'iPhone, Safari 18', file_kind, encode(file, 'base64'), consent, null, null)
$$;
grant execute on function pg_temp.send_file(text, bytea, boolean) to authenticated, anon;

-- The emails queued to an address, and what's in them.
create function pg_temp.emails_to(address text) returns bigint language sql security definer as $$
  select count(*) from net.http_request_queue q
  where convert_from(q.body, 'utf8')::jsonb -> 'To' -> 0 ->> 'Email' = address
$$;
create function pg_temp.newest_to(address text) returns jsonb language sql security definer as $$
  select convert_from(q.body, 'utf8')::jsonb from net.http_request_queue q
  where convert_from(q.body, 'utf8')::jsonb -> 'To' -> 0 ->> 'Email' = address
  order by q.id desc limit 1
$$;
create function pg_temp.code_sent_to(address text) returns text language sql security definer as $$
  select substring(pg_temp.newest_to(address) ->> 'Text' from '\n\n([0-9]{6})\n\n')
$$;
create function pg_temp.any_email_has(words text) returns boolean language sql security definer as $$
  select exists (select 1 from net.http_request_queue q where convert_from(q.body, 'utf8') like '%' || words || '%')
$$;
grant execute on function pg_temp.emails_to(text), pg_temp.newest_to(text), pg_temp.code_sent_to(text),
  pg_temp.any_email_has(text) to authenticated, anon;

-- Time passing, for support: every time it keeps moves back by `span`.
create function pg_temp.time_passes(span interval) returns void language sql security definer as $$
  update app.support_messages set sent_at = sent_at - span, last_reply_at = last_reply_at - span;
  update app.support_files set added_at = added_at - span;
  update app.support_codes set sent_at = sent_at - span, used_at = used_at - span;
  update app.support_sends set at = at - span;
  update app.support_told set told_at = told_at - span where only_one;
  update app.code_tries set tried_at = tried_at - span;
  update app.code_locks set locked_until = locked_until - span;
$$;
-- A fresh day for the caps, with nothing else changed.
create function pg_temp.next_day() returns void language sql security definer as $$
  select pg_temp.time_passes(interval '25 hours')
$$;

-- Pictures, as their bytes: a 1 by 1 PNG, the same with a text chunk, a
-- JPEG with a plain JFIF header, the same with Exif, and a GIF.
create function pg_temp.png(extra bytea default '') returns bytea language sql as $$
  select '\x89504e470d0a1a0a0000000d494844520000000100000001080600000000000000'::bytea || extra
    || '\x0000000d4944415478da63f8cfc0f01f000500020100000000'::bytea
    || '\x0000000049454e44ae426082'::bytea
$$;
create function pg_temp.jpeg(extra bytea default '') returns bytea language sql as $$
  select '\xffd8ffe000104a46494600010100000100010000'::bytea || extra
    || '\xffdb004300'::bytea || decode(repeat('01', 64), 'hex')
    || '\xffc00011080002000303012200021101031101'::bytea
    || '\xffda000c03010002110311003f00a1b2c3ffd9'::bytea
$$;
create function pg_temp.a_plan_copy() returns bytea language sql as $$
  select convert_to('{"app":"PrePenny","kind":"backup","version":1,"about":"A copy","madeAt":"2026-11-19T10:00:00Z",'
    || '"plan":{"nation":"england-and-wales","records":{}},"account":null,"people":null,"history":null}', 'UTF8')
$$;

-- ---------------------------------------------------------------------------
-- 1. Nobody reads anyone's messages or pictures.

select tests.as_person('tom');
select throws_ok($$ select * from app.support_messages $$, '42501', null,
  'Someone signed in can''t read any message');
select throws_ok($$ select * from app.support_files $$, '42501', null, 'or any picture or plan copy');
select throws_ok($$ select * from app.support_codes $$, '42501', null, 'or any code');
select throws_ok($$ select * from app.support_sends $$, '42501', null, 'or the caps'' counts');
select throws_ok($$ update app.support_test set scale = 1000 $$, '42501', null,
  'or change the local tests'' multiplier for the shared caps');
select tests.as_nobody();
select throws_ok($$ select * from app.support_messages $$, '42501', null,
  'Someone signed out can''t read any message');
select throws_ok($$ select * from app.support_files $$, '42501', null, 'or any picture or plan copy');
select throws_ok($$ update app.support_test set scale = 1000 $$, '42501', null, 'or the multiplier');
select tests.as_test();
select is_empty($$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname ~ '(support|picture|plan_copy|tidy|day_words|email_ready)'
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('service_role', p.oid, 'execute')) $$,
  'Nobody, Supabase''s own key included, can use the database''s own support steps');
select set_eq($$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname ~ 'support'
       and has_function_privilege('anon', p.oid, 'execute') $$,
  array['support_code', 'send_support'],
  'Anyone can ask for a code and send a message: the only two steps, and neither reads a message');

-- ---------------------------------------------------------------------------
-- 2. Signed in: the person's own, replied to at their own address only.

select tests.as_person('jess');
select pg_temp.from_connection('203.0.113.1');
select is(pg_temp.send('contact', 'I can''t find my rent', 'tom@example.test', '000000') ->> 'sent', 'true',
  'Jess sends Contact us, signed in');
select tests.as_test();
select is((select count(*) from app.support_messages
    where person_id = tests.id('jess') and email is null and kind = 'contact'
      and words = 'I can''t find my rent' and app_version = 'b498ae820a00'
      and phone_type = 'Android, Chrome 131' and screen is null and file_kind is null),
  1::bigint, 'It''s kept as hers, with the words, the version and the phone type, and no address');
select is(pg_temp.emails_to('jess@example.test'), 1::bigint,
  'The automatic reply goes to the address she signs in with');
select is(pg_temp.emails_to('tom@example.test'), 0::bigint,
  'and never to an address she typed: signed in, the address and code are ignored');
select is(pg_temp.newest_to('jess@example.test') ->> 'Subject', 'PrePenny has your message',
  'Its subject');
select is(pg_temp.newest_to('jess@example.test') ->> 'Text',
  'We''ve got your message.' || E'\n\n'
  || 'We aim to answer within 1 working day, so by the end of '
  || app.day_words(app.support_answer_by(now())) || '.' || E'\n\n'
  || 'We''ll reply to this email address. For your privacy, this email doesn''t repeat what you wrote.'
  || E'\n\n' || 'If you didn''t write to PrePenny, reply to this email and tell us.'
  || E'\n\n' || 'PrePenny. Plan every penny before payday.',
  'Its words say when to expect an answer, and hold none of hers');
select is(pg_temp.emails_to('hello@prepenny.co.uk'), 1::bigint, 'hello@prepenny.co.uk is told');
select is(pg_temp.newest_to('hello@prepenny.co.uk') ->> 'Subject',
  'A message is waiting in PrePenny''s support inbox', 'that a message is waiting');
select is(pg_temp.newest_to('hello@prepenny.co.uk') ->> 'Text',
  '1 message is waiting.' || E'\n\n'
  || 'Someone wrote to PrePenny support. This email doesn''t hold their words or their email address.'
  || E'\n\n' || 'Read it in Supabase''s SQL Editor, as README.md part V says.'
  || E'\n\n' || 'PrePenny sends this at most once every 4 hours.'
  || E'\n\n' || 'PrePenny. Plan every penny before payday.',
  'with none of the words, and not who sent it');
select ok(not pg_temp.any_email_has('find my rent'), 'No email holds anything she typed');

-- Suggest a feature: kept, with no automatic reply and no time to answer by.
select tests.as_person('jess');
select pg_temp.from_connection('203.0.113.1');
select is(pg_temp.send('idea', 'Remind me before my phone bill'),
  '{"sent": true, "replied": false, "answer_by": null}'::jsonb,
  'Jess suggests a feature: no automatic reply, and no time to answer by');
select tests.as_test();
select is(pg_temp.emails_to('jess@example.test'), 1::bigint, 'No email to her for an idea');
select is(pg_temp.emails_to('hello@prepenny.co.uk'), 1::bigint,
  'and hello@prepenny.co.uk isn''t told again within 4 hours');

-- A second message the same day gets no second automatic reply.
select tests.as_person('jess');
select pg_temp.from_connection('203.0.113.1');
select is(pg_temp.send('contact', 'One more thing') ->> 'replied', 'false',
  'A second message the same day gets no second automatic reply');
select tests.as_test();
select is(pg_temp.emails_to('jess@example.test'), 1::bigint, 'so she''s sent one email a day at most');

-- After 4 hours, hello@prepenny.co.uk is told about the ones that came meanwhile, by the job's step.
select pg_temp.time_passes(interval '3 hours 59 minutes');
select is(app.tell_support(), 0, 'Before 4 hours, the job''s step tells nobody');
select pg_temp.time_passes(interval '2 minutes');
select is(app.tell_support(), 2, 'After 4 hours it tells hello@prepenny.co.uk the 2 that came meanwhile');
select is(pg_temp.newest_to('hello@prepenny.co.uk') ->> 'Text' like '2 messages are waiting.%', true,
  'how many, and nothing else about them');
select is(app.tell_support(), 0, 'and tells nobody again until another comes');

-- A sign-in that has ended can't send.
select tests.as_test();
delete from auth.sessions where id = tests.id('tom-session');
select tests.as_person('tom');
select pg_temp.from_connection('203.0.113.2');
select is(pg_temp.refusal($$ select pg_temp.send('contact', 'Hello') $$), 'not-allowed',
  'A phone whose sign-in has ended is refused');
-- but can write as someone signed out, with an address and its code (D615).
select is(public.support_code('tom.elsewhere@example.test') ->> 'sent', 'true',
  'and can ask for a code at an address')
;
select is(pg_temp.send('contact', 'My sign-in ended', 'tom.elsewhere@example.test',
    pg_temp.code_sent_to('tom.elsewhere@example.test')) ->> 'sent', 'true',
  'and send with it, as someone signed out');
select tests.as_test();
select is((select count(*) from app.support_messages
    where email = 'tom.elsewhere@example.test' and person_id is null), 1::bigint,
  'kept with the address the code proved, not as his');
insert into auth.sessions (id, user_id) values (tests.id('tom-session'), tests.id('tom'));

-- Any version of the app can write, so a phone that can't update can still ask for help.
select tests.as_person('tom');
select set_config('request.headers', json_build_object('x-prepenny-version', '20261101100000',
  'x-forwarded-for', '203.0.113.2')::text, true);
select is(pg_temp.send('contact', 'My phone won''t update') ->> 'sent', 'true',
  'A phone on an older version of PrePenny can still contact support');

-- ---------------------------------------------------------------------------
-- 3. Signed out: only after a code proves the address is theirs.

select tests.as_nobody();
select pg_temp.from_connection('198.51.100.7');
select is(pg_temp.send('contact', 'I lost my email', 'sam@example.test', '123456'),
  '{"sent": false, "why": "code-wrong"}'::jsonb,
  'Signed out, a message with no code sent is refused');
select is(pg_temp.refusal($$ select pg_temp.send('contact', 'Hi', null, null) $$), 'bad-email',
  'and one with no address');
select tests.as_test();
select is((select count(*) from app.support_messages where email = 'sam@example.test'), 0::bigint,
  'Nothing is kept');
select is(pg_temp.emails_to('sam@example.test'), 0::bigint, 'and nothing is emailed to the address typed');

select tests.as_nobody();
select pg_temp.from_connection('198.51.100.7');
select is(public.support_code('  Sam@Example.TEST '), '{"sent": true}'::jsonb,
  'Signed out, Sam asks for a code');
select tests.as_test();
select is(pg_temp.emails_to('sam@example.test'), 1::bigint, 'It''s sent to the address he typed');
select is(pg_temp.newest_to('sam@example.test') ->> 'Subject', 'Your PrePenny code to send your message',
  'Its subject');
select is(pg_temp.newest_to('sam@example.test') ->> 'Text',
  'Your PrePenny code is' || E'\n\n' || pg_temp.code_sent_to('sam@example.test') || E'\n\n'
  || 'Type it into PrePenny to send your message to PrePenny support. It lasts 10 minutes.'
  || E'\n\n' || 'If you didn''t ask for this, you can ignore this email. Nothing is sent without the code.'
  || E'\n\n' || 'PrePenny. Plan every penny before payday.', 'Its words hold nothing typed but the address');
select is((select count(*) from app.support_codes where email = 'sam@example.test'
    and code_hash <> pg_temp.code_sent_to('sam@example.test')), 1::bigint,
  'The code is kept only scrambled');

select tests.as_nobody();
select pg_temp.from_connection('198.51.100.7');
select is(public.support_code('sam@example.test') ->> 'sent', 'false',
  'Another code within a minute isn''t sent');
select ok((public.support_code('sam@example.test') ->> 'wait')::integer between 1 and 60,
  'and says how long to wait');
select is(pg_temp.send('contact', 'I lost my email', 'sam@example.test',
    lpad(((pg_temp.code_sent_to('sam@example.test')::integer + 1) % 1000000)::text, 6, '0')),
  '{"sent": false, "why": "code-wrong"}'::jsonb, 'A wrong code sends nothing');
select is(pg_temp.send('contact', 'I lost my email', 'pat@example.test', pg_temp.code_sent_to('sam@example.test')),
  '{"sent": false, "why": "code-wrong"}'::jsonb, 'nor does Sam''s code with another address');
select is(pg_temp.send('contact', 'I lost my email, I signed up as sam.old@example.test', 'sam@example.test',
    pg_temp.code_sent_to('sam@example.test')) ->> 'sent', 'true',
  'With the right code, it''s sent');
select tests.as_test();
select is((select count(*) from app.support_messages
    where email = 'sam@example.test' and person_id is null and kind = 'contact'),
  1::bigint, 'It''s kept with the address the code proved');
select is(pg_temp.emails_to('pat@example.test'), 0::bigint, 'The other address got nothing');
select is(pg_temp.emails_to('sam@example.test'), 2::bigint, 'Sam gets the automatic reply');
select is(pg_temp.newest_to('sam@example.test') ->> 'Subject', 'PrePenny has your message', 'as Jess did');
select ok(not pg_temp.any_email_has('sam.old'), 'and no email holds anything he typed');

select tests.as_nobody();
select pg_temp.from_connection('198.51.100.7');
select is(pg_temp.send('contact', 'Again', 'sam@example.test', pg_temp.code_sent_to('sam@example.test')),
  '{"sent": false, "why": "code-wrong"}'::jsonb, 'A code works once');

-- A code runs out after 10 minutes.
select pg_temp.time_passes(interval '2 minutes');
select is(public.support_code('sam@example.test') ->> 'sent', 'true', 'A new code for Sam');
select pg_temp.time_passes(interval '11 minutes');
select is(pg_temp.send('contact', 'Late', 'sam@example.test', pg_temp.code_sent_to('sam@example.test')),
  '{"sent": false, "why": "code-ran-out"}'::jsonb, 'After 10 minutes it has run out');

-- ---------------------------------------------------------------------------
-- 4. The caps.

-- Codes: 3 a day for an address.
select pg_temp.time_passes(interval '2 minutes');
select is(public.support_code('sam@example.test') ->> 'sent', 'true', 'Sam''s third code today');
select pg_temp.time_passes(interval '2 minutes');
select is(pg_temp.refusal($$ select public.support_code('sam@example.test') $$), 'too-many',
  'A fourth to the same address in a day is refused');
select tests.as_test();
select is(pg_temp.emails_to('sam@example.test'), 4::bigint, 'and isn''t sent');
select pg_temp.next_day();
select tests.as_nobody();
select pg_temp.from_connection('198.51.100.7');
select is(public.support_code('sam@example.test') ->> 'sent', 'true', 'The next day, a code goes again');

-- 10 wrong codes in a day lock the address for 24 hours.
select pg_temp.from_connection('198.51.100.70');
select pg_temp.send('contact', 'Guess', 'sam@example.test', 'guess' || n) from generate_series(1, 10) n;
select is(pg_temp.send('contact', 'Right', 'sam@example.test', pg_temp.code_sent_to('sam@example.test')),
  '{"sent": false, "why": "code-wrong"}'::jsonb,
  'After 10 wrong codes in a day, even the right one is refused');
select pg_temp.time_passes(interval '2 minutes');
select is(pg_temp.refusal($$ select public.support_code('sam@example.test') $$), 'too-many',
  'and no code is sent to the address for 24 hours');
select pg_temp.time_passes(interval '24 hours 1 minute');
select is(public.support_code('sam@example.test') ->> 'sent', 'true', 'Then codes go again');

-- 6 codes a day from one connection, whatever the addresses.
select pg_temp.next_day();
select pg_temp.from_connection('198.51.100.9');
select public.support_code('flood' || n || '@example.test') from generate_series(1, 6) n;
select is(pg_temp.refusal($$ select public.support_code('flood7@example.test') $$), 'too-many',
  'A seventh code from one connection in a day is refused');
select pg_temp.from_connection('198.51.100.10');
select is(public.support_code('flood7@example.test') ->> 'sent', 'true',
  'while another connection can still ask');

-- Messages: 5 a day from one sender.
select pg_temp.next_day();
select tests.as_person('jess');
select pg_temp.from_connection('203.0.113.1');
select pg_temp.send('idea', 'Idea ' || n) from generate_series(1, 5) n;
select is(pg_temp.refusal($$ select pg_temp.send('idea', 'Idea 6') $$), 'too-many',
  'A sixth message from one person in a day is refused');
select tests.as_person('tom');
select pg_temp.from_connection('203.0.113.1');
select is(pg_temp.send('idea', 'From Tom') ->> 'sent', 'true', 'Tom isn''t held back by Jess''s cap');

-- 10 a day from one connection.
select pg_temp.next_day();
select tests.as_test();
select pg_temp.time_passes(interval '1 hour');
select tests.as_person('jess');
select pg_temp.from_connection('192.0.2.50');
select pg_temp.send('idea', 'Idea ' || n) from generate_series(1, 5) n;
select tests.as_person('tom');
select pg_temp.from_connection('192.0.2.50');
select pg_temp.send('idea', 'Idea ' || n) from generate_series(1, 5) n;
select tests.as_person('alex');
select pg_temp.from_connection('192.0.2.50');
select is(pg_temp.refusal($$ select pg_temp.send('idea', 'Eleventh') $$), 'too-many',
  'An eleventh message from one connection in a day is refused');
select pg_temp.from_connection('192.0.2.51');
select is(pg_temp.send('idea', 'From elsewhere') ->> 'sent', 'true', 'from another, it goes');

-- 100 a day from everyone.
select pg_temp.next_day();
select tests.as_test();
insert into app.support_sends (what, sender_key, connection_key)
  select 'message', 'someone-' || n, 'somewhere-' || n from generate_series(1, 100) n;
select tests.as_person('alex');
select pg_temp.from_connection('192.0.2.60');
select is(pg_temp.refusal($$ select pg_temp.send('contact', 'Hello') $$), 'busy',
  'Past 100 messages a day from everyone, more are refused for that day');

-- Support's emails: 5 automatic replies and 10 codes a day, each its own,
-- so a flood of one never stops the other (D615).
select pg_temp.next_day();
select tests.as_test();
insert into app.support_sends (what, sender_key, connection_key)
  select 'reply', 'someone-' || n, 'somewhere-' || n from generate_series(1, 5) n;
select tests.as_person('alex');
select pg_temp.from_connection('192.0.2.61');
select is(pg_temp.send('contact', 'Hello') ->> 'replied', 'false',
  'Once support has sent 5 automatic replies in a day, a message is still kept, with no reply');
select tests.as_test();
select is(pg_temp.emails_to('alex@example.test'), 0::bigint, 'none is sent');
select tests.as_nobody();
select pg_temp.from_connection('192.0.2.62');
select is(public.support_code('pat@example.test') ->> 'sent', 'true', 'but codes still go');
select tests.as_test();
insert into app.support_sends (what, sender_key, connection_key)
  select 'code', 'someone-' || n, 'somewhere-' || n from generate_series(1, 9) n;
select tests.as_nobody();
select pg_temp.from_connection('192.0.2.63');
select is(pg_temp.refusal($$ select public.support_code('kim@example.test') $$), 'busy',
  'until 10 codes in a day, which with the replies and notices keeps at least 79 of Resend''s 100 for signing in');
select tests.as_test();
select is(pg_temp.emails_to('kim@example.test'), 0::bigint, 'none is sent');
select pg_temp.next_day();
insert into app.support_sends (what, sender_key, connection_key)
  select 'code', 'someone-' || n, 'somewhere-' || n from generate_series(1, 10) n;
select tests.as_person('tom');
select pg_temp.from_connection('192.0.2.64');
select is(pg_temp.send('contact', 'After a flood of codes') ->> 'replied', 'true',
  'A flood of codes never stops the automatic replies');

-- One connection, as Cloudflare names it, whatever X-Forwarded-For says.
select pg_temp.next_day();
select tests.as_nobody();
select pg_temp.from_cloudflare('203.0.113.77', 'fake-' || n || '.example') ,
  public.support_code('cf' || n || '@example.test') from generate_series(1, 6) n;
select pg_temp.from_cloudflare('203.0.113.77', 'another-fake.example');
select is(pg_temp.refusal($$ select public.support_code('cf7@example.test') $$), 'too-many',
  'Where Cloudflare names the connection, a made-up X-Forwarded-For doesn''t get past its cap');

-- ---------------------------------------------------------------------------
-- 5. Pictures and plan copies.

select pg_temp.next_day();
select tests.as_test();
select is(app.picture_facts(pg_temp.png()), '{"type": "image/png", "width": 1, "height": 1}'::jsonb,
  'A PNG is read from its contents');
select is(app.picture_facts(pg_temp.jpeg()), '{"type": "image/jpeg", "width": 3, "height": 2}'::jsonb,
  'and a JPEG');
select is(app.picture_facts('\x474946383961010001000000002c00000000010001000002024401003b'::bytea) ->> 'problem',
  'not-a-picture', 'A GIF isn''t taken, whatever it''s called');
select is(app.picture_facts(pg_temp.png('\x0000000a74455874436f6d6d656e7400686900000000'::bytea)) ->> 'problem',
  'details', 'A PNG with a text chunk has hidden details');
select is(app.picture_facts(pg_temp.png('\x00000004655849664d4d002a00000000'::bytea)) ->> 'problem',
  'details', 'and one with Exif');
select is(app.picture_facts(pg_temp.jpeg('\xffe1000a457869660000aabb'::bytea)) ->> 'problem',
  'details', 'A JPEG with Exif (where a location is kept) has hidden details');
select is(app.picture_facts(pg_temp.jpeg('\xfffe0006686921'::bytea)) ->> 'problem',
  'details', 'and one with a comment');
select is(app.picture_facts(substring(pg_temp.jpeg() from 1 for 60)) ->> 'problem',
  'broken', 'A JPEG cut short is refused');
select is(app.picture_facts(substring(pg_temp.png() from 1 for 40)) ->> 'problem',
  'broken', 'and a PNG cut short');
-- Stricter, from the outside review (D615): nothing hidden after the picture
-- data starts, in a table, or in a chunk; and no file made to be slow to read.
select is(app.picture_facts(decode(replace(encode(pg_temp.jpeg(), 'hex'), 'a1b2c3ffd9', 'a1b2c3ffe10006aabbccddffd9'), 'hex')) ->> 'problem',
  'details', 'A JPEG with application data after its picture data starts');
select is(app.picture_facts(decode(replace(encode(pg_temp.jpeg(), 'hex'), 'a1b2c3ffd9',
    'a1b2c3ffd9' || encode(convert_to('Taken at home', 'UTF8'), 'hex') || 'ffd9'), 'hex')) ->> 'problem',
  'details', 'or words after a first end');
select is(app.picture_facts(decode(replace(encode(pg_temp.jpeg(), 'hex'), 'ffdb004300' || repeat('01', 64),
    'ffdb004d00' || repeat('01', 64) || encode(convert_to('Taken home', 'UTF8'), 'hex')), 'hex')) ->> 'problem',
  'details', 'A quantisation table with words after it is refused');
select is(app.picture_facts(pg_temp.png(decode('00000015704859730000000100000001'
    || encode(convert_to('Taken@home!!', 'UTF8'), 'hex') || '00000000', 'hex'))) ->> 'problem',
  'details', 'and a PNG chunk longer than its standard size, with words in it');
select is(app.picture_facts(pg_temp.png(decode('00000009704859730000000100000001' || '0000000000', 'hex'))) ->> 'problem',
  null, 'while a standard one is fine');
select is(app.picture_facts('\xffd8'::bytea || decode(repeat('ff', 2 * 1024 * 1024), 'hex')) ->> 'problem',
  'broken', 'A JPEG of nothing but fill bytes is refused');
create function pg_temp.ms_to_read(data bytea) returns numeric language plpgsql as $$
declare
  started timestamptz := clock_timestamp();
begin
  perform app.picture_facts(data);
  return extract(epoch from clock_timestamp() - started) * 1000;
end;
$$;
select cmp_ok(pg_temp.ms_to_read('\xffd8'::bytea || decode(repeat('ff', 2 * 1024 * 1024), 'hex')), '<', 500::numeric,
  'at once, so a file made to be slow to read holds nobody up (it took 1.7 seconds before the outside review)');
select is(app.picture_facts(pg_temp.png(decode('0000000a49444154' || encode(convert_to('Exif', 'UTF8'), 'hex')
    || '0000' || '4d4d002a' || '00000000', 'hex'))) ->> 'problem',
  'details', 'Exif''s opening words anywhere in a picture are refused');
select ok(app.plan_copy_ok(pg_temp.a_plan_copy()), 'A backup file from Download my data is a plan copy');
select ok(not app.plan_copy_ok(convert_to('{"app":"Other","kind":"backup","version":1,"plan":{}}', 'UTF8')),
  'Another app''s file isn''t');
select ok(not app.plan_copy_ok(convert_to('not json', 'UTF8')), 'and nor is anything else');

select tests.as_person('jess');
select pg_temp.from_connection('203.0.113.1');
select is(pg_temp.send_file('picture', pg_temp.png()) ->> 'sent', 'true',
  'Jess sends Something looks wrong with a screenshot');
select tests.as_test();
select is((select row(m.kind, m.screen, m.file_kind, m.consent_at is not null, f.content_type, f.bytes, f.width, f.height)::text
    from app.support_messages m join app.support_files f on f.message_id = m.id
    where m.person_id = tests.id('jess') and m.kind = 'problem'),
  row('problem', 'coming-up', 'picture', true, 'image/png', octet_length(pg_temp.png()), 1, 1)::text,
  'It''s kept with the screen''s name, when she agreed, and the picture as a PNG, from its contents');
select tests.as_person('jess');
select pg_temp.from_connection('203.0.113.1');
select is(pg_temp.refusal($$ select pg_temp.send_file('picture', pg_temp.jpeg(), false) $$), 'bad-message',
  'A picture without the consent message is refused');
select is(pg_temp.refusal($$ select pg_temp.send_file('picture', pg_temp.jpeg('\xffe1000a457869660000aabb'::bytea)) $$),
  'bad-picture', 'and one with hidden details');
select is(pg_temp.refusal($$ select pg_temp.send_file('picture',
    '\x474946383961010001000000002c00000000010001000002024401003b'::bytea) $$),
  'bad-picture', 'and a GIF');
select is(pg_temp.refusal($$ select pg_temp.send_file('picture', pg_temp.png(
    '\x00200001'::bytea || '\x74455874'::bytea || decode(repeat('00', 2097153), 'hex') || '\x00000000'::bytea)) $$),
  'file-too-big', 'and one over 2 MB');
select is(pg_temp.refusal($$ select pg_temp.send_file('plan', convert_to('{"app":"Other"}', 'UTF8')) $$),
  'bad-plan', 'A plan copy that isn''t PrePenny''s backup is refused');
select is(pg_temp.refusal($$ select public.send_support('contact', 'Hi', null, 'b498ae820a00', 'iPhone, Safari 18',
    'picture', encode(pg_temp.png(), 'base64'), true, null, null) $$), 'bad-message',
  'Only Something looks wrong takes a picture');
select is(pg_temp.send_file('plan', pg_temp.a_plan_copy()) ->> 'sent', 'true', 'Jess sends a plan copy');
select is(pg_temp.refusal($$ select pg_temp.send_file('picture', pg_temp.jpeg()) $$), 'too-many',
  'A third picture or plan copy from one person in a day is refused');
select tests.as_test();
select is((select f.content_type from app.support_files f join app.support_messages m on m.id = f.message_id
    where m.person_id = tests.id('jess') and f.kind = 'plan'), 'application/json', 'It''s kept as JSON');

-- 25 MB a day from everyone, 150 MB kept.
select tests.as_test();
insert into app.support_sends (what, sender_key, connection_key, bytes)
  values ('file', 'someone', 'somewhere', 25 * 1024 * 1024 - 10);
select tests.as_person('tom');
select pg_temp.from_connection('203.0.113.3');
select is(pg_temp.refusal($$ select pg_temp.send_file('picture', pg_temp.png()) $$), 'files-full',
  'Past 25 MB of files a day from everyone, a file is refused');
select is(pg_temp.send('problem', 'Without a picture') ->> 'sent', 'true',
  'but the message can go without one');

-- The words never reach an error.
select tests.as_person('alex');
select pg_temp.from_connection('203.0.113.4');
select is(pg_temp.refusal($$ select pg_temp.send('contact', repeat('My secret words ', 200)) $$), 'bad-message',
  'A message over 2,000 characters is refused with a short code, and none of its words');
select is(pg_temp.refusal($$ select public.send_support('contact', 'Hi', null, 'b498ae820a00',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
    null, null, null, null, null) $$), 'bad-message',
  'A browser''s whole description is never kept, only "Android, Chrome 131"');
select is(pg_temp.refusal($$ select public.send_support('contact', 'Hi', 'coming-up', 'b498ae820a00',
    'iPhone, Safari 18', null, null, null, null, null) $$), 'bad-message',
  'Only Something looks wrong names a screen');

-- ---------------------------------------------------------------------------
-- 6. Deleted on time, by the scheduled job's step.

select tests.as_test();
select is((select schedule || ' ' || command from cron.job where jobname = 'prepenny-support-tidy'),
  '17 * * * * select app.tidy_support()', 'The tidy-up runs every hour');
select is((select schedule || ' ' || command from cron.job where jobname = 'prepenny-support-told'),
  '7,22,37,52 * * * * select app.tell_support()',
  'and hello@prepenny.co.uk is told every 15 minutes of any that came while it waited');

select tests.as_test();
select pg_temp.time_passes(interval '29 days 23 hours');
select is(app.tidy_support(), '{"files": 0, "messages": 0}'::jsonb,
  'Just under 30 days on, nothing is deleted');
select pg_temp.time_passes(interval '2 hours');
select is(app.tidy_support() ->> 'files', '2', '30 days after they were sent, both files are deleted');
select is((select count(*) from app.support_files), 0::bigint, 'none is left');
select is((select count(*) from app.support_messages
    where person_id = tests.id('jess') and file_kind is not null and file_gone_at is not null),
  2::bigint, 'Their messages stay, saying when the file was deleted');
select is((select count(*) from app.support_codes) + (select count(*) from app.support_sends), 0::bigint,
  'Codes and the caps'' counts are gone after a day or two');

-- Messages: 12 months after the last reply, or after they were sent if there's none.
select tests.as_test();
delete from app.support_messages;
insert into app.support_messages (kind, email, words, app_version, phone_type, sent_at, last_reply_at)
values
  ('contact', 'a@example.test', 'No reply, 12 months and an hour', 'local', 'Mac, Safari 18',
    now() - interval '12 months 1 hour', null),
  ('contact', 'b@example.test', 'No reply, a day short of 12 months', 'local', 'Mac, Safari 18',
    now() - interval '12 months' + interval '1 day', null),
  ('contact', 'c@example.test', 'Replied 11 months ago', 'local', 'Mac, Safari 18',
    now() - interval '2 years', now() - interval '11 months'),
  ('contact', 'd@example.test', 'Replied 12 months and an hour ago', 'local', 'Mac, Safari 18',
    now() - interval '2 years', now() - interval '12 months 1 hour');
select is(app.tidy_support() ->> 'messages', '2', 'The tidy-up deletes 2 of 4 messages');
select set_eq($$ select email from app.support_messages $$, array['b@example.test', 'c@example.test'],
  'one sent 12 months ago with no reply, and one whose last reply was 12 months ago; '
  || 'not one sent a day short of 12 months ago, or one replied to 11 months ago');

-- The working day to answer by: the next one, past weekends and bank holidays.
insert into app.bank_holiday_lists (list_version, list) values ('2026-11-01:' || repeat('a', 64),
  '{"england-and-wales": {"division": "england-and-wales", "events": [
     {"title": "Christmas Day", "date": "2026-12-25"}, {"title": "Boxing Day", "date": "2026-12-28"}]},
    "scotland": {"division": "scotland", "events": []}, "northern-ireland": {"division": "northern-ireland", "events": []}}');
select is(app.support_answer_by('2026-11-19 15:00+00'), '2026-11-20'::date, 'Sent on a Thursday: by Friday');
select is(app.support_answer_by('2026-11-20 23:30+00'), '2026-11-23'::date,
  'Sent late on a Friday: by Monday');
select is(app.support_answer_by('2026-11-21 10:00+00'), '2026-11-23'::date, 'Sent on a Saturday: by Monday');
select is(app.support_answer_by('2026-12-24 10:00+00'), '2026-12-29'::date,
  'Sent on Christmas Eve: past Christmas Day, the weekend and the Boxing Day holiday, by Tue 29 Dec');
select is(app.support_answer_by('2026-10-22 23:30+00'), '2026-10-26'::date,
  'in UK time: 11:30pm UTC on Thu 22 Oct is Friday in the UK, so by Monday');

-- ---------------------------------------------------------------------------
-- 7. Deleting an account deletes what the person sent, signed in and out.

select tests.as_test();
delete from net.http_request_queue;
select tests.as_person('alex');
select pg_temp.from_connection('203.0.113.9');
select is(pg_temp.send('contact', 'Signed in') ->> 'sent', 'true', 'Alex writes signed in');
select tests.as_nobody();
select pg_temp.from_connection('203.0.113.9');
select public.support_code('alex.backup@example.test');
select is(pg_temp.send('contact', 'From my backup', 'alex.backup@example.test',
  pg_temp.code_sent_to('alex.backup@example.test')) ->> 'sent', 'true', 'and signed out, from his backup email');
select tests.as_test();
select is((select count(*) from app.support_messages where person_id = tests.id('alex')
    or email = 'alex.backup@example.test'), 2::bigint, 'Both are kept');
delete from auth.users where id = tests.id('alex');
select is((select count(*) from app.support_messages where person_id = tests.id('alex')
    or email in ('alex@example.test', 'alex.backup@example.test')), 0::bigint,
  'Once his account is deleted, neither is');
select is((select count(*) from app.support_codes where email = 'alex.backup@example.test'), 0::bigint,
  'nor any code sent to his addresses');

select * from finish();
rollback;
