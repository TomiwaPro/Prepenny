-- Step 4j: support tools (brief 4.16, ARCHITECTURE.md 3.7, PLAN.md item 44,
-- questions 13 and 14, D617 to D625).
--
-- Proves, each with its rule broken on purpose to see it fail (D624):
-- 1. Nobody but support, signed in with two-step sign-in on and passed on
--    that very sign-in, can read anything or take any action: not someone
--    signed out, not anyone else signed in, not support's own address
--    without two-step sign-in or before its code, not an ended sign-in,
--    and not through the database's own steps or tables.
-- 2. Who support is comes only from the Database workflow's secret, kept
--    scrambled, and changes at once.
-- 3. Support access shows exactly what that person sees, read only: never
--    their partner's private records. It stops at once when they end it,
--    and when its 7 days are over. Their partner is told in Activity.
-- 4. Every action is recorded with the time, and the person is emailed:
--    replies, signing out everywhere, the two-step wait (with "Stop it",
--    and two-step sign-in off after 7 days), and the link to a backup email
--    that wrong codes can't lock, with the 24-hour wait and "Stop it".
-- 5. Support's own emails stay within their allowance.
-- 6. Usage is counts only; error codes are codes only.
-- 7. No refusal holds an email address or anything about money.
-- 8. Deleting an account deletes what support kept about it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(190);

-- As on a fresh database, whatever the end-to-end tests left on this one
-- (PLAN.md item 41): all undone when the test ends.
update app.support_test set scale = 1 where only_one;
delete from app.support_messages;
delete from app.support_sends;
delete from app.support_actions;
delete from app.support_access;
delete from app.two_step_waits;
delete from app.support_links;
delete from app.code_tries;
delete from app.code_locks;
delete from net.http_request_queue;
delete from app.support_person;

select tests.make_jess_and_tom();
select tests.make_person('sue');
select tests.make_person('pat');
select tests.make_person('lee');
-- Every account here has proved its address, as signing up does.
update auth.users set email_confirmed_at = now()
  where id in (tests.id('jess'), tests.id('tom'), tests.id('alex'), tests.id('sue'), tests.id('pat'), tests.id('lee'));
insert into app.backup_emails (person_id, email) values (tests.id('alex'), 'alex.backup@example.test'),
  (tests.id('tom'), 'tom.backup@example.test');

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
grant execute on function pg_temp.refusal(text) to authenticated, anon, service_role;

-- Every support step, as a statement, with a message and a person to use.
create function pg_temp.support_steps(message uuid) returns text[] language sql as $$
  select array[
    'select public.support_inbox()',
    format('select public.support_message(%L)', message),
    format('select public.support_file(%L)', message),
    format('select public.support_reply(%L, %L)', message, 'Hello'),
    format('select public.support_plan(%L)', tests.id('jess')),
    'select public.support_find(''jess@example.test'')',
    format('select public.support_account(%L)', tests.id('jess')),
    format('select public.support_sign_out(%L)', tests.id('alex')),
    format('select public.support_start_two_step_wait(%L)', tests.id('alex')),
    format('select public.support_stop_two_step_wait(%L)', tests.id('alex')),
    format('select public.support_send_backup_link(%L)', tests.id('alex')),
    'select public.support_usage()']
$$;
grant execute on function pg_temp.support_steps(uuid) to authenticated, anon;

-- What each step says, run as whoever is acting now.
create function pg_temp.each_says(message uuid) returns text[] language plpgsql as $$
declare
  step text;
  said text[] := '{}';
begin
  foreach step in array pg_temp.support_steps(message) loop
    said := said || pg_temp.refusal(step);
  end loop;
  return said;
end;
$$;
grant execute on function pg_temp.each_says(uuid) to authenticated, anon;

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
create function pg_temp.token_in(address text, path text) returns text language sql security definer as $$
  select substring(pg_temp.newest_to(address) ->> 'Text' from path || '([A-Za-z0-9_-]{43})')
$$;
grant execute on function pg_temp.emails_to(text), pg_temp.newest_to(text), pg_temp.token_in(text, text)
  to authenticated, anon, service_role;

-- What support recorded about a person: each action's name, oldest first.
create function pg_temp.actions_on(name text) returns text[] language sql security definer as $$
  select coalesce(array_agg(a.action order by a.at), '{}') from app.support_actions a
  where a.person_id = tests.id(name)
$$;

-- Time passing for support's records: every time they keep moves back.
create function pg_temp.time_passes(span interval) returns void language sql security definer as $$
  update app.support_actions set at = at - span;
  update app.support_access set granted_at = granted_at - span, ends_at = ends_at - span,
    ended_at = ended_at - span, last_looked_at = last_looked_at - span;
  update app.two_step_waits set started_at = started_at - span, stopped_at = stopped_at - span,
    done_at = done_at - span;
  update app.support_links set sent_at = sent_at - span, used_at = used_at - span;
  update app.get_back_in set started_at = started_at - span, stopped_at = stopped_at - span,
    finishing_at = finishing_at - span, done_at = done_at - span, finish_link_at = finish_link_at - span;
  update app.email_codes set sent_at = sent_at - span, used_at = used_at - span;
  update app.code_tries set tried_at = tried_at - span;
  update app.code_locks set locked_until = locked_until - span;
  update app.error_codes set at = at - span;
  update auth.mfa_amr_claims set created_at = created_at - span, updated_at = updated_at - span;
  update auth.mfa_challenges set created_at = created_at - span, verified_at = verified_at - span;
$$;

-- Support is Sue, with two-step sign-in on and passed on this sign-in.
create function pg_temp.as_support() returns void language sql as $$
  select tests.as_person_with_second_step('sue')
$$;
grant execute on function pg_temp.as_support() to authenticated, anon, service_role;

-- A message from Jess, signed in, and one from an address proved with a code.
insert into app.support_messages (id, kind, person_id, words, app_version, phone_type, sent_at)
values (tests.id('message-jess'), 'contact', tests.id('jess'), 'Words only support reads', 'b498ae820a00',
  'Android, Chrome 131', now() - interval '1 hour');
insert into app.support_messages (id, kind, email, words, screen, app_version, phone_type, file_kind,
    consent_at, sent_at)
values (tests.id('message-sam'), 'problem', 'sam@example.test', 'The lowest point looks wrong', 'home',
  'b498ae820a00', 'iPhone, Safari 18', 'picture', now(), now() - interval '10 minutes');
insert into app.support_files (message_id, kind, content_type, data, bytes, width, height)
values (tests.id('message-sam'), 'picture', 'image/png', '\x89504e470d0a1a0a00'::bytea, 9, 1, 1);

-- ---------------------------------------------------------------------------
-- 2. Who support is.

select tests.as_person('jess');
select throws_ok($$ select app.set_support('jess@example.test') $$, '42501', null,
  'Nobody signed in can say who support is');
select tests.as_test();
select is(app.set_support('  Sue@Example.TEST '), 'set', 'The Database workflow sets who support is');
select ok(not exists (select 1 from app.support_person s where s.email_key ilike '%sue%'
    or s.email_key = 'sue@example.test'),
  'and the address is kept only scrambled');
select is_empty($$ select r from unnest(array['anon', 'authenticated', 'service_role']) r
     where has_function_privilege(r, 'app.set_support(text)', 'execute') $$,
  'Nobody but the database''s administrator can say who support is, Supabase''s own key included');
select is_empty($$ select t from unnest(array['app.support_person', 'app.support_actions', 'app.support_replies',
       'app.error_codes', 'app.support_access', 'app.two_step_waits', 'app.support_links']) t,
       unnest(array['anon', 'authenticated', 'service_role']) r
     where has_table_privilege(r, t, 'select') or has_table_privilege(r, t, 'insert')
       or has_table_privilege(r, t, 'update') or has_table_privilege(r, t, 'delete') $$,
  'Nobody signed in or out, nor Supabase''s own key, can read or change any of support''s records');
select is_empty($$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.oid in (
       'app.is_support()'::regprocedure, 'app.support_only()'::regprocedure,
       'app.plan_as_seen_by(uuid)'::regprocedure, 'app.finish_two_step_waits(uuid)'::regprocedure,
       'app.send_support_link(uuid, text, text, uuid)'::regprocedure,
       'app.support_tools_tick()'::regprocedure,
       'app.note_support_action(uuid, uuid, text, boolean, integer)'::regprocedure,
       'app.app_used_since(uuid, timestamptz)'::regprocedure, 'app.end_support_access_on_joining()'::regprocedure,
       'app.no_plan_for_support()'::regprocedure,
       'app.start_get_back_in(uuid, text, text)'::regprocedure,
       'app.access_open(uuid)'::regprocedure, 'app.people_opened(interval)'::regprocedure)
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('service_role', p.oid, 'execute')) $$,
  'Nobody can use the database''s own support steps directly');

-- ---------------------------------------------------------------------------
-- 1. Nobody but support, with two-step sign-in passed.

select tests.as_nobody();
select ok((select bool_and(said like 'permission denied for function%')
    from unnest(pg_temp.each_says(tests.id('message-sam'))) said),
  'Someone signed out can use none of support''s steps');

select tests.as_person('jess');
select is(pg_temp.each_says(tests.id('message-sam')), array_fill('not-allowed'::text, array[12]),
  'Jess, signed in, is refused every support step, as for a step that doesn''t exist');
select is(public.support_status() ->> 'status', 'no', 'and isn''t told who support is');
select is(public.give_support_access() ->> 'on', 'true', '(Jess lets support see her plan, for the next checks)');

select tests.as_person('sue');
select is(public.support_status() ->> 'status', 'two-step',
  'Support''s own address without two-step sign-in is told to turn it on');
select is(pg_temp.each_says(tests.id('message-sam')), array_fill('not-allowed'::text, array[12]),
  'and is refused every step');

select tests.as_test();
select tests.turn_on_two_step('sue', false);
select tests.as_person('sue');
select is(public.support_status() ->> 'status', 'two-step',
  'With two-step sign-in on but its code not typed on this sign-in');
select is(pg_temp.each_says(tests.id('message-sam')), array_fill('not-allowed'::text, array[12]),
  'every step is refused');
select tests.as_person_with_second_step('sue');
select is(pg_temp.each_says(tests.id('message-sam')), array_fill('not-allowed'::text, array[12]),
  'and a token claiming the second step isn''t enough while the sign-in itself hasn''t passed it');

select tests.as_test();
update auth.sessions set aal = 'aal2' where id = tests.id('sue-session');
select pg_temp.as_support();
select is(public.support_status() ->> 'status', 'support', 'Once it''s passed, Sue is support');
select tests.as_test();
update auth.users set email_confirmed_at = null where id = tests.id('sue');
select pg_temp.as_support();
select is(pg_temp.refusal('select public.support_inbox()'), 'not-allowed',
  'An account that hasn''t proved support''s address isn''t support (D638)');
select tests.as_test();
update auth.users set email_confirmed_at = now() where id = tests.id('sue');
select pg_temp.as_support();
select is(jsonb_typeof(public.support_inbox() -> 'messages'), 'array', 'and reads the inbox');

-- An ended sign-in.
select tests.as_test();
update auth.sessions set not_after = now() - interval '1 second' where id = tests.id('sue-session');
select pg_temp.as_support();
select is(pg_temp.each_says(tests.id('message-sam')), array_fill('not-allowed'::text, array[12]),
  'An ended sign-in, even support''s, is refused every step');
select tests.as_test();
update auth.sessions set not_after = null where id = tests.id('sue-session');

-- Someone else's two-step sign-in, and support's address on another account, don't count.
select tests.as_test();
select tests.turn_on_two_step('alex', true);
select tests.as_person_with_second_step('alex');
select is(pg_temp.each_says(tests.id('message-sam')), array_fill('not-allowed'::text, array[12]),
  'Alex, with two-step sign-in passed, isn''t support');

-- A new address for support takes effect at once, for every step.
select tests.as_test();
select is(app.set_support('pat@example.test'), 'set', 'Support''s address changed in the secret');
select pg_temp.as_support();
select is(public.support_status() ->> 'status', 'no', 'Sue is no longer support at once');
select is(pg_temp.refusal('select public.support_inbox()'), 'not-allowed', 'and can''t read the inbox');
select tests.as_test();
select is(app.set_support(''), 'cleared', 'With no secret, nobody is support');
select pg_temp.as_support();
select is(pg_temp.refusal('select public.support_inbox()'), 'not-allowed', 'not even Sue');
select tests.as_test();
select is(app.set_support('sue@example.test'), 'set', 'Sue is support again');

-- Nobody but support reads any of it through the Data API's tables either.
select tests.as_person('jess');
select throws_ok($$ select * from app.support_actions $$, '42501', null,
  'Jess can''t read what support did');
select throws_ok($$ select * from app.support_access $$, '42501', null, 'or anyone''s support access');
select throws_ok($$ select * from app.error_codes $$, '42501', null, 'or error codes, her own included');

-- ---------------------------------------------------------------------------
-- The inbox and replies.

select pg_temp.as_support();
select is((select array_agg(m ->> 'id') from jsonb_array_elements(public.support_inbox() -> 'messages') m),
  array[tests.id('message-sam')::text, tests.id('message-jess')::text], 'The inbox is newest first');
select is(public.support_inbox() -> 'messages' -> 1 ->> 'words', 'Words only support reads',
  'with each message''s words');
select is(public.support_inbox() -> 'messages' -> 1 ->> 'from', 'jess@example.test',
  'who it''s from: the address Jess signs in with');
select is(public.support_inbox() -> 'messages' -> 0 ->> 'from', 'sam@example.test',
  'or the address proved with a code');
select is((public.support_inbox() ->> 'waiting')::integer, 2, 'and how many are waiting for a reply');
select is(public.support_message(tests.id('message-sam')) -> 'file' ->> 'kind', 'picture',
  'A message shows its picture''s facts');
select is(decode(public.support_file(tests.id('message-sam')) ->> 'data', 'base64'),
  '\x89504e470d0a1a0a00'::bytea, 'and the picture itself, byte for byte');
select is(pg_temp.refusal(format('select public.support_reply(%L, %L)', tests.id('message-jess'), '   ')),
  'bad-reply', 'An empty reply is refused');
select is(public.support_reply(tests.id('message-jess'), E'Thanks for writing.\nTry signing in again.') ->> 'sent',
  'true', 'Support replies to Jess');
select is(pg_temp.newest_to('jess@example.test') ->> 'Subject', 'A reply from PrePenny support',
  'The reply goes to the address she signs in with');
select is(pg_temp.newest_to('jess@example.test') ->> 'Text',
  'PrePenny support has replied to your message.' || E'\n\n' || 'Thanks for writing.' || E'\n\n'
  || 'Try signing in again.' || E'\n\n' || 'You can reply to this email.' || E'\n\n'
  || 'For your privacy, this email doesn''t repeat what you wrote. PrePenny will never ask for a password or a card number.'
  || E'\n\n' || 'PrePenny. Plan every penny before payday.',
  'from hello@prepenny.co.uk, each line a paragraph, without her own words');
select is(pg_temp.newest_to('jess@example.test') -> 'From' ->> 'Email', 'hello@prepenny.co.uk',
  'It''s from hello@prepenny.co.uk');
select is(public.support_message(tests.id('message-jess')) -> 'replies' -> 0 ->> 'words',
  E'Thanks for writing.\nTry signing in again.', 'The reply is kept with the message');
select ok(public.support_message(tests.id('message-jess')) ->> 'replied_at' is not null,
  'and the message is marked replied to');
select is(public.support_reply(tests.id('message-sam'), 'Thanks. We''re looking.') ->> 'sent', 'true',
  'A reply to a message sent signed out');
select is(pg_temp.newest_to('sam@example.test') ->> 'Subject', 'A reply from PrePenny support',
  'goes to the address proved with its code');
select is((public.support_inbox() ->> 'waiting')::integer, 0, 'Nothing is waiting now');

-- ---------------------------------------------------------------------------
-- 3. Support access shows exactly what that person sees.

-- What Jess's own phone gets, as her.
select tests.as_person('jess');
select set_config('test.jess_sees', (public.plan_changes(tests.id('plan'), 0, 0) -> 'rows')::text, true);
select pg_temp.as_support();
select set_config('test.support_sees', (public.support_plan(tests.id('jess')) -> 'rows')::text, true);
select tests.as_test();
select is(current_setting('test.support_sees')::jsonb, current_setting('test.jess_sees')::jsonb,
  'Support sees Jess''s plan exactly as her own phone gets it, row for row');
select ok(jsonb_array_length(current_setting('test.support_sees')::jsonb) > 0, 'and it has rows');
select is_empty(format($$ select x from jsonb_array_elements(%L::jsonb) x
     where x -> 'row' ->> 'id' = any (tests.private_ids('tom')) $$, current_setting('test.support_sees')),
  'None of Tom''s private records');
select ok(exists (select 1 from jsonb_array_elements(current_setting('test.support_sees')::jsonb) x
    where x -> 'row' ->> 'id' = any (tests.private_ids('jess'))),
  'but Jess''s own private records, as she sees them');
select is(pg_temp.actions_on('jess'), array['reply', 'looked'],
  'Looking is recorded, with the time, after the reply to her message');
select ok((select last_looked_at from app.support_access where person_id = tests.id('jess')) is not null,
  'and Jess can see when support last looked');
select tests.as_person('jess');
select ok(public.my_support_access() ->> 'last_looked_at' is not null, 'as her own phone reads it');

-- Read only: support isn't in the plan, so reads and changes nothing in it.
select pg_temp.as_support();
select is((select sum(tests.readable(t)) from unnest(app.record_tables() || array['plans', 'plan_members',
    'edits', 'paydays', 'bank_holidays']) t), 0::numeric,
  'Support reads no plan record directly');
select is(pg_temp.refusal(format($$ select public.plan_changes(%L, 0, 0) $$, tests.id('plan'))), 'not-found',
  'and can''t ask for the plan as a member does');
select is(tests.rows_changed(format($$ update public.accounts set name = 'Changed' where plan_id = %L $$,
  tests.id('plan'))), 0::bigint, 'or change any of it');

-- Tom is told in Activity.
select tests.as_person('tom');
select is((select e -> 'summary' ->> 'until' from jsonb_array_elements(public.plan_activity(tests.id('plan')) -> 'edits') e
    where e ->> 'kind' = 'support-access' and e ->> 'by' = tests.id('jess')::text),
  ((now() + interval '7 days') at time zone 'Europe/London')::date::text,
  'Tom sees in Activity that Jess let support see the plan, until the day 7 days on');
select is((select e ->> 'can_undo' from jsonb_array_elements(public.plan_activity(tests.id('plan')) -> 'edits') e
    where e ->> 'kind' = 'support-access'), 'false', 'which nobody can undo from Activity');
select ok(app.server_kind('support-access'), 'and no phone can send');

-- Jess ends it: support stops seeing it at once.
select tests.as_person('jess');
select is(public.end_support_access() ->> 'on', 'false', 'Jess stops support seeing her plan');
select pg_temp.as_support();
select is(pg_temp.refusal(format('select public.support_plan(%L)', tests.id('jess'))), 'no-access',
  'Support can''t see it from that moment');
select tests.as_person('tom');
-- (Both entries are saved at the same moment inside this test's transaction,
-- so it's looked for by what it says, not by which is newer.)
select ok(exists (select 1 from jsonb_array_elements(public.plan_activity(tests.id('plan')) -> 'edits') e
    where e ->> 'kind' = 'support-access' and e ->> 'by' = tests.id('jess')::text
      and e -> 'summary' ->> 'ended' = 'true'),
  'and Tom sees in Activity that it ended');

-- After 7 days it ends by itself, to the second.
select tests.as_person('jess');
select is(public.give_support_access() ->> 'on', 'true', 'Jess lets support see it again');
select is(public.give_support_access() ->> 'on', 'true', 'asking twice changes nothing');
select tests.as_test();
select is((select count(*) from app.support_access where person_id = tests.id('jess') and ended_at is null),
  1::bigint, 'one open at a time');
select pg_temp.time_passes(interval '7 days' - interval '1 minute');
select pg_temp.as_support();
select is(pg_temp.refusal(format('select public.support_plan(%L)', tests.id('jess'))), 'no refusal',
  'A minute before its 7 days are over, support can still see it');
select tests.as_test();
select pg_temp.time_passes(interval '1 minute');
select pg_temp.as_support();
select is(pg_temp.refusal(format('select public.support_plan(%L)', tests.id('jess'))), 'no-access',
  'When they''re over, it''s ended');
select tests.as_person('jess');
select is(public.my_support_access() ->> 'on', 'false', 'and Jess''s phone says so');

-- Tom's own access shows what Tom sees: never Jess's private records.
select tests.as_person('tom');
select is(public.give_support_access() ->> 'on', 'true', 'Tom lets support see his plan');
select pg_temp.as_support();
select is_empty(format($$ select x from jsonb_array_elements(%L::jsonb) x
     where x -> 'row' ->> 'id' = any (tests.private_ids('jess')) $$, public.support_plan(tests.id('tom')) -> 'rows'),
  'Support sees none of Jess''s private records through Tom''s access');
select is(pg_temp.refusal(format('select public.support_plan(%L)', tests.id('jess'))), 'no-access',
  'and still nothing of Jess''s plan through hers');
-- Someone joining the plan ends it at once, for everyone in it (D637): the
-- plan isn't the one it was given for, and whoever joined wasn't told.
select tests.as_test();
insert into public.plan_members (plan_id, person_id, role) values (tests.id('plan'), tests.id('lee'), 'viewer');
select pg_temp.as_support();
select is(pg_temp.refusal(format('select public.support_plan(%L)', tests.id('tom'))), 'no-access',
  'When someone joins the plan, support access given before ends at once');
select tests.as_person('tom');
select is(public.my_support_access() ->> 'on', 'false', 'and Tom''s phone says so');
select tests.as_test();
delete from public.plan_members where plan_id = tests.id('plan') and person_id = tests.id('lee');
-- Someone who can view only can let support see what they see too, and
-- Activity tells the rest of the plan, as for anyone in it (D617, D639).
update public.plan_members set role = 'viewer'
  where plan_id = tests.id('plan') and person_id = tests.id('tom');
select tests.as_person('tom');
select is(public.give_support_access() ->> 'on', 'true',
  'Tom, who can view only, lets support see what he sees');
select tests.as_test();
select is((select count(*)::int from public.edits e where e.plan_id = tests.id('plan')
    and e.kind = 'support-access' and e.person_id = tests.id('tom') and e.private_to is null
    and e.summary ? 'until'), 2,
  'and Activity says so to everyone in the plan, as the second time he has');
select pg_temp.as_support();
select is_empty(format($$ select x from jsonb_array_elements(%L::jsonb) x
     where x -> 'row' ->> 'id' = any (tests.private_ids('jess')) $$, public.support_plan(tests.id('tom')) -> 'rows'),
  'and support sees none of Jess''s private records through it');
select tests.as_person('tom');
select is(public.end_support_access() ->> 'on', 'false', 'He stops it again');
select tests.as_test();
update public.plan_members set role = 'editor'
  where plan_id = tests.id('plan') and person_id = tests.id('tom');
select tests.as_person('pat');
select is(pg_temp.refusal('select public.give_support_access()'), 'no-plan',
  'Someone with no plan in their account can''t give access to nothing');
select tests.as_nobody();
select throws_ok($$ select public.give_support_access() $$, '42501', null,
  'Nobody signed out can give anyone''s access');

-- ---------------------------------------------------------------------------
-- 4. Accounts and actions.

select pg_temp.as_support();
select is(public.support_find('JESS@example.test') ->> 'person', tests.id('jess')::text,
  'Support finds an account by the address it signs in with');
select is(public.support_find('tom.backup@example.test') ->> 'person', tests.id('tom')::text,
  'or by its backup email');
select is(public.support_find('nobody@example.test'), '{"found": false}'::jsonb,
  'An address that''s nobody''s says so, and no more');
select is(pg_temp.refusal('select public.support_find(''not an address'')'), 'bad-email',
  'Words that aren''t an address are refused with a code, not the words');
select is(public.support_account(tests.id('jess')) ->> 'plan', 'shared', 'Jess''s plan is shared');
select is(public.support_account(tests.id('pat')) ->> 'plan', 'none', 'Pat has none in the account');
select is(public.support_account(tests.id('alex')) ->> 'two_step', 'true', 'Alex has two-step sign-in on');
select is_empty(format($$ select k from jsonb_object_keys(%L::jsonb) k
     where k not in ('person', 'email', 'backup_email', 'signed_up_at', 'last_signed_in_at', 'two_step',
       'plan', 'devices', 'is_you', 'access', 'error_codes', 'two_step_wait', 'get_back_in', 'messages',
       'actions', 'now') $$, public.support_account(tests.id('jess'))),
  'An account says nothing more than its status: no amount, payment name or note');

-- Error codes, as codes only.
select tests.as_person('jess');
select is(public.note_error_code('not-allowed', 'coming-up', 'b498ae820a00') ->> 'noted', 'true',
  'Jess''s phone notes an error code');
select is(pg_temp.refusal($$ select public.note_error_code('Rent £600', 'home', 'b498ae820a00') $$), 'bad-code',
  'Anything but a code is refused, so no words or amounts are kept');
select is(pg_temp.refusal($$ select public.note_error_code('not-allowed', 'debt#id=x', 'b498ae820a00') $$),
  'bad-code', 'and a screen that isn''t only its name');
select tests.as_test();
insert into app.error_codes (person_id, code, app_version, at)
  select tests.id('jess'), 'server', 'b498ae820a00', now() - interval '1 hour' from generate_series(1, 29);
select tests.as_person('jess');
select is(public.note_error_code('server', null, 'b498ae820a00') ->> 'noted', 'false',
  'At most 30 a day are kept for a person');
select pg_temp.as_support();
select is(public.support_account(tests.id('jess')) -> 'error_codes' -> 0 ->> 'code', 'not-allowed',
  'Support sees the newest first');
select is(jsonb_array_length(public.support_account(tests.id('jess')) -> 'error_codes'), 20,
  'the 20 newest');
select tests.as_nobody();
select throws_ok($$ select public.note_error_code('server', null, 'b498ae820a00') $$, '42501', null,
  'Nobody signed out can note one');

-- Signing out everywhere.
select pg_temp.as_support();
select is(pg_temp.refusal(format('select public.support_sign_out(%L)', tests.id('sue'))), 'is-you',
  'Support can''t act on its own account');
select is(public.support_sign_out(tests.id('tom')) ->> 'ended', '1', 'Support signs Tom out everywhere');
select tests.as_test();
select is((select count(*) from auth.sessions where user_id = tests.id('tom')), 0::bigint,
  'Every sign-in of his ends');
select is(pg_temp.newest_to('tom@example.test') ->> 'Subject', 'PrePenny support signed you out',
  'and he''s told by email');
select ok(pg_temp.newest_to('tom@example.test') ->> 'Text' like
    'PrePenny support signed your account out everywhere' || E'\n\n' || 'At %, PrePenny support signed your PrePenny account out of every phone and computer.%',
  'saying when');
select is(pg_temp.actions_on('tom'), array['looked', 'signed-out'], 'It''s recorded, with the time');
select tests.as_person('tom');
select is(pg_temp.refusal('select public.my_support_access()'), 'not-allowed',
  'Tom''s ended sign-in gets nothing more');

-- The 7-day wait before two-step sign-in is turned off.
select pg_temp.as_support();
select is(pg_temp.refusal(format('select public.support_start_two_step_wait(%L)', tests.id('jess'))),
  'two-step-off', 'There''s nothing to turn off for someone without two-step sign-in');
select ok(public.support_start_two_step_wait(tests.id('alex')) ->> 'ends_at' is not null,
  'Support starts the 7-day wait for Alex');
select is(pg_temp.refusal(format('select public.support_start_two_step_wait(%L)', tests.id('alex'))),
  'already', 'once');
select is(pg_temp.newest_to('alex@example.test') ->> 'Subject', 'PrePenny support is turning off two-step sign-in',
  'The address Alex signs in with is told');
select ok(pg_temp.token_in('alex@example.test', '/stop-two-step-off/#') is not null, 'with a link to stop it');
select ok(pg_temp.newest_to('alex@example.test') ->> 'Text' like '%Nothing changes for 7 days. Unless it''s stopped, at % two-step sign-in is turned off, and you sign in with this email address alone.%',
  'saying when it will be off');
select is(pg_temp.newest_to('alex.backup@example.test') ->> 'Subject', 'PrePenny support is turning off two-step sign-in',
  'and his backup address is told too (D638)');
select tests.as_person_with_second_step('alex');
select ok(public.hello() -> 'two_step_off' ->> 'ends_at' is not null,
  'Every phone signed in to his account hears of it, to show the notice with Stop it');
select set_config('test.stop', pg_temp.token_in('alex@example.test', '/stop-two-step-off/#'), true);
select tests.as_nobody();
select is(public.stop_two_step_off_with_link(repeat('A', 43)) ->> 'stopped', 'false',
  'A made-up link stops nothing');
select is(public.stop_two_step_off_with_link(current_setting('test.stop')) ->> 'stopped', 'true',
  'The link stops it, signed in or not');
select is(public.stop_two_step_off_with_link(current_setting('test.stop')) ->> 'stopped', 'false',
  'once only');
select tests.as_test();
select ok(app.two_step_on(tests.id('alex')), 'Alex''s two-step sign-in is still on');
select is(pg_temp.actions_on('alex'), array['two-step-wait', 'two-step-kept'],
  'and support sees he stopped it');

-- "Stop it" in the notice on his phone.
select pg_temp.as_support();
select ok(public.support_start_two_step_wait(tests.id('alex')) ->> 'ends_at' is not null, 'Started again');
select tests.as_person('jess');
select is(public.stop_two_step_off() ->> 'stopped', 'false', 'Jess can''t stop Alex''s wait, only her own');
select tests.as_person_with_second_step('alex');
select is(public.stop_two_step_off() ->> 'stopped', 'true', 'Alex stops it on his phone');
select ok(public.hello() -> 'two_step_off' = 'null'::jsonb, 'and the notice goes');
select tests.as_test();
select is((select count(*) from app.two_step_waits where person_id = tests.id('alex') and stopped_how = 'device'),
  1::bigint, 'stopped on a device');

select pg_temp.as_support();
select ok(public.support_start_two_step_wait(tests.id('alex')) ->> 'ends_at' is not null, 'Started a third time');
select tests.as_test();
-- Alex last typed a code an hour ago.
update auth.mfa_amr_claims set updated_at = now() - interval '1 hour' where session_id = tests.id('alex-session');
select throws_ok(format($$ delete from auth.mfa_factors where user_id = %L $$, tests.id('alex')),
  'second-step-needed', 'While it waits, nobody can remove the app without a fresh code (D382)');
select pg_temp.time_passes(interval '7 days' - interval '1 minute');
select is((app.support_tools_tick() ->> 'two_step_off')::integer, 0, 'A minute before its 7 days, nothing yet');
select ok(app.two_step_on(tests.id('alex')), 'still on');
select pg_temp.time_passes(interval '1 minute');
select is((app.support_tools_tick() ->> 'two_step_off')::integer, 1,
  'After 7 days, the scheduled job turns it off');
select ok(not app.two_step_on(tests.id('alex')), 'Two-step sign-in is off for Alex');
select is(pg_temp.newest_to('alex@example.test') ->> 'Subject', 'Two-step sign-in is off', 'and he''s told');
select is(pg_temp.actions_on('alex'), array['two-step-wait', 'two-step-kept', 'two-step-wait', 'two-step-kept',
  'two-step-wait', 'two-step-off'], 'Each is recorded');

-- Support can stop one too, and says so.
select tests.as_test();
select tests.turn_on_two_step('pat', true);
select pg_temp.as_support();
select ok(public.support_start_two_step_wait(tests.id('pat')) ->> 'ends_at' is not null, 'A wait for Pat');
select is(public.support_stop_two_step_wait(tests.id('pat')) ->> 'stopped', 'true', 'stopped by support');
select is(pg_temp.newest_to('pat@example.test') ->> 'Subject', 'Two-step sign-in stays on', 'Pat is told');
select is(pg_temp.actions_on('pat'), array['two-step-wait', 'two-step-stopped'], 'and both are recorded');

-- Using the app during the wait keeps it on (D638): it isn't lost.
select ok(public.support_start_two_step_wait(tests.id('pat')) ->> 'ends_at' is not null, 'Another wait for Pat');
select tests.as_test();
update auth.mfa_amr_claims set updated_at = now() + interval '1 second' where session_id = tests.id('pat-session');
select pg_temp.time_passes(interval '7 days');
select is((app.support_tools_tick() ->> 'two_step_off')::integer, 0,
  'After 7 days, Pat''s two-step sign-in isn''t turned off, as Pat used the app meanwhile');
select ok(app.two_step_on(tests.id('pat')), 'it''s still on');
select is(pg_temp.newest_to('pat@example.test') ->> 'Subject', 'Two-step sign-in stays on', 'and Pat is told why');
select is(pg_temp.actions_on('pat'), array['two-step-wait', 'two-step-stopped', 'two-step-wait', 'two-step-kept'],
  'which support sees');

-- A backup address kept locked by someone typing wrong codes (D392).
select tests.as_test();
select app.note_wrong_try('alex.backup@example.test', 'get-in') from generate_series(1, 10);
select ok(app.address_locked('alex.backup@example.test', 'get-in'), 'Someone has locked Alex''s backup address');
select pg_temp.as_support();
select is(public.support_send_backup_link(tests.id('alex')) ->> 'sent', 'start',
  'Support sends a link to the backup address');
select is(pg_temp.newest_to('alex.backup@example.test') ->> 'Subject', 'A link from PrePenny support to get back in',
  'It goes to the backup address');
select set_config('test.link', pg_temp.token_in('alex.backup@example.test', '/get-back-in/#support='), true);
select ok(current_setting('test.link') is not null, 'with the link in it');
select is(pg_temp.refusal(format('select public.support_send_backup_link(%L)', tests.id('jess'))), 'no-backup',
  'Someone with no backup email can''t be sent one');

select tests.as_person('alex');
select is(pg_temp.refusal(format('select public.get_back_in_with_link(%L)', current_setting('test.link'))),
  'permission denied for function get_back_in_with_link', 'Only the get-back-in function can use the link');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('alex.backup@example.test', '123456') ->> 'in', 'false',
  'More wrong codes do nothing');
select is(public.get_back_in_with_link(repeat('B', 43)) ->> 'in', 'false', 'A made-up link does nothing');
select is(public.get_back_in_with_link(current_setting('test.link')) - 'ready_at',
  '{"in": true, "state": "waiting", "email": "alex.backup@example.test"}'::jsonb,
  'Support''s link starts the 24-hour wait, though the address is locked');
select is(public.get_back_in_with_link(current_setting('test.link')) ->> 'in', 'false', 'once only');
select is(pg_temp.newest_to('alex@example.test') ->> 'Subject', 'Someone asked to get into your PrePenny account',
  'The address Alex signs in with is told, as for a code');
select ok(pg_temp.newest_to('alex@example.test') ->> 'Text' like
    '%someone opened a link PrePenny support sent to your backup email, alex.backup@example.test, to get into your account.%',
  'saying it was support''s link, not a code (D638)');
select ok(pg_temp.token_in('alex@example.test', '/stop-get-back-in/#') is not null, 'with "Stop it"');
select tests.as_test();
select is((select from_support from app.get_back_in where person_id = tests.id('alex') and done_at is null
    and stopped_at is null), true, 'The request is support''s');
select pg_temp.as_support();
select is(pg_temp.refusal(format('select public.support_send_backup_link(%L)', tests.id('alex'))), 'waiting',
  'Nothing more can be sent while the 24 hours run');

select tests.as_test();
select pg_temp.time_passes(interval '24 hours');
select is((app.support_tools_tick() ->> 'finish_links')::integer, 1,
  'After 24 hours, the scheduled job sends the link to finish');
select is((app.support_tools_tick() ->> 'finish_links')::integer, 0, 'once');
select is(pg_temp.newest_to('alex.backup@example.test') ->> 'Subject',
  'A link from PrePenny support to finish getting back in', 'to the backup address');
select set_config('test.finish', pg_temp.token_in('alex.backup@example.test', '/get-back-in/#support='), true);
select tests.as_supabase_admin();
select is(public.get_back_in_with_link(current_setting('test.finish')) ->> 'state', 'finish',
  'It finishes, through Supabase''s admin route, as a code would');
select tests.as_test();
select ok((select finishing_at from app.get_back_in where person_id = tests.id('alex') and done_at is null
    and stopped_at is null) is not null, 'and from then on it can''t be stopped');

-- A finish that didn't complete opens the request again: the next link to
-- finish goes once the last has run out (D638).
select set_config('test.request', (select id::text from app.get_back_in where person_id = tests.id('alex')
  and done_at is null and stopped_at is null), true);
select tests.as_supabase_admin();
select is(public.get_back_in_not_finished(current_setting('test.request')::uuid) ->> 'done', 'false',
  'Supabase''s admin route couldn''t finish: the request is open again');
select tests.as_test();
select is((app.support_tools_tick() ->> 'finish_links')::integer, 0, 'The link sent today hasn''t run out yet');
select pg_temp.time_passes(interval '24 hours');
select is((app.support_tools_tick() ->> 'finish_links')::integer, 1, 'Once it has, a new link to finish goes');
select is(pg_temp.actions_on('alex'), array['two-step-wait', 'two-step-kept', 'two-step-wait', 'two-step-kept',
  'two-step-wait', 'two-step-off', 'backup-link', 'backup-finish-link', 'backup-finish-link'],
  'Every link is recorded');

-- Support's start link, opened while a request Tom asked for with a code is
-- open: it's support's too, so the link to finish is emailed (D638).
select pg_temp.as_support();
select is(public.support_send_backup_link(tests.id('tom')) ->> 'sent', 'start', 'A link for Tom');
select set_config('test.tom', pg_temp.token_in('tom.backup@example.test', '/get-back-in/#support='), true);
select tests.as_nobody();
select is(public.send_get_in_code('tom.backup@example.test') ->> 'sent', 'true', 'Tom asks for a code himself');
select tests.as_supabase_admin();
select is(public.get_back_in_with_code('tom.backup@example.test',
    substring(pg_temp.newest_to('tom.backup@example.test') ->> 'Text' from '\n\n([0-9]{6})\n\n')) ->> 'state',
  'waiting', 'and his code starts the 24-hour wait');
select is(public.get_back_in_with_link(current_setting('test.tom')) ->> 'state', 'waiting',
  'Support''s link, opened after, says it''s waiting');
select tests.as_test();
select is((select from_support from app.get_back_in where person_id = tests.id('tom') and done_at is null
    and stopped_at is null), true, 'and the request is support''s too, so its link to finish will go');

-- A link runs out after 24 hours.
select tests.as_test();
insert into app.backup_emails (person_id, email) values (tests.id('lee'), 'lee.backup@example.test');
select pg_temp.as_support();
select is(public.support_send_backup_link(tests.id('lee')) ->> 'sent', 'start', 'A link for Lee');
select set_config('test.lee', pg_temp.token_in('lee.backup@example.test', '/get-back-in/#support='), true);
select tests.as_test();
select pg_temp.time_passes(interval '24 hours' + interval '1 second');
select tests.as_supabase_admin();
select is(public.get_back_in_with_link(current_setting('test.lee')) ->> 'in', 'false',
  'A link not used in 24 hours does nothing');

-- ---------------------------------------------------------------------------
-- 5. Support's own emails stay within their allowance (D620).

select tests.as_test();
delete from app.support_actions;
insert into app.support_actions (person_id, action, emailed, emails)
  select null, 'reply', true, 1 from generate_series(1, 13);
select pg_temp.as_support();
select is(pg_temp.refusal(format('select public.support_send_backup_link(%L)', tests.id('lee'))), 'busy',
  'With 13 sent, a link is refused: it counts for the emails opening it can lead to (D638)');
select is(public.support_reply(tests.id('message-jess'), 'One more.') ->> 'sent', 'true', 'The 14th email goes');
select is(public.support_reply(tests.id('message-jess'), 'And one more.') ->> 'sent', 'true', 'The 15th email goes');
select is(pg_temp.refusal(format('select public.support_reply(%L, %L)', tests.id('message-jess'), 'And another.')),
  'busy', 'The 16th in 24 hours is refused, so sign-in codes keep their share of Resend''s 100 a day');
select is(pg_temp.refusal(format('select public.support_sign_out(%L)', tests.id('jess'))), 'busy',
  'and so is an action that emails');
select tests.as_test();
select pg_temp.time_passes(interval '24 hours' + interval '1 second');
select pg_temp.as_support();
select is(public.support_reply(tests.id('message-jess'), 'A day later.') ->> 'sent', 'true', 'A day later it goes');

-- ---------------------------------------------------------------------------
-- 6. Usage, counts only.

select pg_temp.as_support();
select set_config('test.before', public.support_usage()::text, true);
select tests.as_test();
select tests.make_person('kim');
update auth.users set email_confirmed_at = now(), created_at = now() where id = tests.id('kim');
insert into app.reminder_choices (person_id, payday) values (tests.id('kim'), true);
insert into app.devices (session_id, person_id, last_used_at) values (tests.id('kim-session'), tests.id('kim'), now());
select pg_temp.as_support();
select is((public.support_usage() -> 'sign_ups' -> 0 ->> 'count')::integer,
  (current_setting('test.before')::jsonb -> 'sign_ups' -> 0 ->> 'count')::integer + 1,
  'Someone signing up adds 1 to this week''s sign-ups');
select is(jsonb_array_length(public.support_usage() -> 'sign_ups'), 8, 'for each of the last 8 weeks');
select is((public.support_usage() ->> 'opened_7')::integer,
  (current_setting('test.before')::jsonb ->> 'opened_7')::integer + 1, 'and to people who opened PrePenny this week');
select is((public.support_usage() ->> 'reminders_on')::integer,
  (current_setting('test.before')::jsonb ->> 'reminders_on')::integer + 1, 'and to people with reminders on');
select ok((public.support_usage() ->> 'shared_plans')::integer >= 1, 'Jess and Tom''s plan counts as shared');
select is_empty(format($$ select k from jsonb_object_keys(%L::jsonb) k
     where k not in ('sign_ups', 'opened_7', 'opened_30', 'shared_plans', 'reminders_on', 'waiting', 'now') $$,
     public.support_usage()),
  'Usage is counts only: no names, addresses or money');
-- Support's own account is left out of the usage numbers (D640).
select tests.as_test();
select set_config('test.week_people', (select count(*) from auth.users u
    where u.email_confirmed_at is not null and u.id <> tests.id('sue')
      and (u.created_at at time zone 'Europe/London')::date
        >= date_trunc('week', now() at time zone 'Europe/London')::date)::text, true);
-- Support's account signed up this week, and its phone or computer asked
-- the server something just now.
update auth.users set created_at = now() where id = tests.id('sue');
insert into app.devices as d (session_id, person_id, last_used_at)
values (tests.id('sue-session'), tests.id('sue'), now())
on conflict (session_id) do update set last_used_at = now();
select set_config('test.opened', app.people_opened(interval '7 days')::text, true);
select pg_temp.as_support();
select is(public.support_usage() -> 'sign_ups' -> 0 ->> 'count', current_setting('test.week_people'),
  'Support''s own account isn''t among this week''s sign-ups (D640)');
select tests.as_test();
select app.set_support('');
select is(app.people_opened(interval '7 days'), current_setting('test.opened')::bigint + 1,
  'nor among the people who opened PrePenny: it would be, as anyone else''s');
select app.set_support('sue@example.test');

-- ---------------------------------------------------------------------------
-- 7. No refusal holds an address or anything about money.

select tests.as_test();
select is_empty($$ select said from unnest(array[
    pg_temp.refusal('select app.set_support(''jess at example'')'),
    pg_temp.refusal(format('select public.support_plan(%L)', tests.id('pat')))]) said
  where said !~ '^[a-z-]+$' $$,
  'Every refusal is a short code');

-- ---------------------------------------------------------------------------
-- 8. Support's own account never has a plan (D640).

select tests.as_test();
select is(pg_temp.refusal(format(
    'insert into public.plan_members (plan_id, person_id, role) values (%L, %L, ''editor'')',
    tests.id('plan'), tests.id('sue'))), 'support-account',
  'Nobody can add support''s account to a plan, not even the database''s administrator');
select pg_temp.as_support();
select is(pg_temp.refusal(format('select public.start_plan(%L, ''england-and-wales'')', tests.id('sue-plan'))),
  'support-account', 'Support''s account can''t start a plan of its own, or keep a phone''s');
select is(public.hello() ->> 'support_account', 'true',
  'A phone signed in to it is told it''s support''s account, so the app shows nothing else');
select tests.as_person('jess');
select is(public.hello() ->> 'support_account', 'false', 'and nobody else''s phone is');
select tests.as_test();
select is(app.set_support('jess@example.test'), 'in-a-plan',
  'An address whose account is in a plan, such as someone''s own, is never taken as support''s');
select ok(not exists (select 1 from app.support_person),
  'and nobody is support until the secret is support''s own address');
select is(app.set_support('sue@example.test'), 'set', '(Sue is support again)');

-- ---------------------------------------------------------------------------
-- 9. Deleting an account deletes what support kept about it.

delete from auth.users where id = tests.id('alex');
select is((select count(*) from app.support_actions where person_id = tests.id('alex'))
  + (select count(*) from app.two_step_waits where person_id = tests.id('alex'))
  + (select count(*) from app.support_links where person_id = tests.id('alex'))
  + (select count(*) from app.error_codes where person_id = tests.id('alex'))
  + (select count(*) from app.support_access where person_id = tests.id('alex')), 0::bigint,
  'Deleting Alex''s account deletes what support kept about him');

select * from finish();
rollback;
