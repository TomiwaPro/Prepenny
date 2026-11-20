-- Step 4j: support tools (brief 4.16, ARCHITECTURE.md 3.7, PLAN.md item 44,
-- the owner's answers to PLAN.md questions 13 and 14, D617 onwards).
--
-- 1. Who support is. The Database workflow gives the database the address
--    the owner signs in with, from a GitHub secret (SUPPORT_EMAIL), never
--    from a file: the repository is public (D452). The database keeps it
--    only scrambled with its own secret (app.address_key). Support is that
--    account, signed in, with two-step sign-in on and passed on that very
--    sign-in: every support step checks it (app.support_only).
-- 2. The inbox: every message and idea from step 4i, newest first, with its
--    picture or plan copy within its 30 days, and support's replies, sent
--    from hello@prepenny.co.uk through Resend and kept with the message.
-- 3. Support access (question 13): a person lets support see their plan
--    for 7 days, read only, exactly as they see it: their own private
--    records and the shared ones, never their partner's private ones. They
--    can end it at any time. In a shared plan their partner is told in
--    Activity.
-- 4. Accounts: found by email; when they signed up, last signed in, whether
--    two-step sign-in is on, their plan type and recent error codes. Never
--    amounts, payment names or notes, except through support access.
-- 5. Support's actions, each recorded with the time, and the person told
--    by email: sign out everywhere; a 7-day wait before two-step sign-in is
--    turned off, with "Stop it" (question 14); and a link to the backup
--    email that wrong codes can't lock, starting getting back in's 24-hour
--    wait, with "Stop it" (D392, question 14).
-- 6. Usage, counts only: sign-ups by week, people who opened PrePenny in
--    the last 7 and 30 days, shared plans, people with reminders on, and
--    messages waiting.
-- 7. Error codes a phone noted, as codes only, for the account's page.
--
-- Nothing here writes an amount, a payment name, a note or an email address
-- to a log or into a refusal: every refusal is a short code (CLAUDE.md).

-- ---------------------------------------------------------------------------
-- 1. Who support is.

create table app.support_person (
  only_one boolean primary key default true check (only_one),
  -- The address support signs in with, scrambled (app.address_key).
  email_key text not null
);
alter table app.support_person enable row level security;
revoke all on app.support_person from public, anon, authenticated, service_role;

-- Sets who support is: the address the owner signs in with, from the
-- Database workflow's SUPPORT_EMAIL secret, sent as a parameter so it's never
-- in a query's text or a log (D617). Empty clears it, so nobody is support.
-- Answers "set" or "cleared". Only the database's administrator can call it.
create function app.set_support(email text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text := app.email_address(email);
begin
  if address is null then
    if coalesce(btrim(email), '') <> '' then
      perform app.refuse('bad-email');
    end if;
    delete from app.support_person;
    return 'cleared';
  end if;
  insert into app.support_person as s (only_one, email_key)
  values (true, app.address_key('support:' || address))
  on conflict (only_one) do update set email_key = excluded.email_key;
  return 'set';
end;
$$;

-- True when this person's sign-in address is support's: a confirmed,
-- ordinary account (not single sign-on, not anonymous), as only those keep
-- an address to themselves (D638).
create function app.is_support_address(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.support_person s join auth.users u on u.id = person
    where u.email is not null and u.email_confirmed_at is not null
      and not coalesce(u.is_sso_user, false) and not coalesce(u.is_anonymous, false)
      and s.email_key = app.address_key('support:' || lower(u.email))
  )
$$;

-- True when the request is support's: that account, from a sign-in that
-- still holds, on the version this database expects, with two-step sign-in
-- on and passed on this sign-in (app.session_ok checks the last part).
create function app.is_support() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and app.is_support_address(auth.uid())
    and app.two_step_on(auth.uid())
    and app.session_ok()
$$;

-- Every support step starts with this: anyone else is refused, as for a
-- step that doesn't exist.
create function app.support_only() returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_support() then
    perform app.refuse('not-allowed', '42501');
  end if;
end;
$$;

-- Whether this person is support, for the support screen's first look:
-- "support"; "two-step" when it's support's address but two-step sign-in
-- isn't on, or this sign-in hasn't passed it; otherwise "no". It says
-- nothing about anyone else.
create function public.support_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if app.is_support() then
    return jsonb_build_object('status', 'support');
  end if;
  if auth.uid() is not null and app.is_support_address(auth.uid()) and exists (
      select 1 from auth.sessions s
      where s.id = app.session_id() and s.user_id = auth.uid()
        and (s.not_after is null or s.not_after > now())) then
    return jsonb_build_object('status', 'two-step');
  end if;
  return jsonb_build_object('status', 'no');
end;
$$;

-- ---------------------------------------------------------------------------
-- Records: what support did, replies, error codes, support access, the
-- two-step waits and support's links to get back in.

-- Every action support takes, with the time (D619): a reply, looking at a
-- plan with the person's access, signing out everywhere, the two-step wait
-- started, stopped or finished, a link to the backup email. Kept 12 months.
create table app.support_actions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references auth.users (id) on delete cascade,
  message_id uuid references app.support_messages (id) on delete set null,
  action text not null check (action in ('reply', 'looked', 'signed-out', 'two-step-wait',
    'two-step-stopped', 'two-step-kept', 'two-step-off', 'backup-link', 'backup-finish-link')),
  -- The person was emailed.
  emailed boolean not null default false,
  -- How many emails it counts for in support's own allowance (D633): the
  -- ones it sent, and for a link, the ones opening it can lead to.
  emails smallint not null default 0 check (emails between 0 and 5),
  at timestamptz not null default now()
);
create index support_actions_by_person on app.support_actions (person_id, at desc);
create index support_actions_by_time on app.support_actions (at);

-- Support's replies, kept with their message, and deleted with it (D604).
create table app.support_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references app.support_messages (id) on delete cascade,
  words text not null check (char_length(words) between 1 and 5000),
  sent_at timestamptz not null default now()
);
create index support_replies_by_message on app.support_replies (message_id, sent_at);

-- Error codes a person's phone noted, as codes only ("not-allowed",
-- "screen-broke"), with the screen's name and the version. Kept 30 days.
create table app.error_codes (
  person_id uuid not null references auth.users (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9-]{1,40}$'),
  screen text check (screen ~ '^[a-z0-9-]{1,60}$'),
  app_version text not null check (app_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  at timestamptz not null default now()
);
create index error_codes_by_person on app.error_codes (person_id, at desc);
create index error_codes_by_time on app.error_codes (at);

-- Support access (question 13, D618): from when, until when, and when the
-- person ended it early, if they did.
create table app.support_access (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references auth.users (id) on delete cascade,
  -- The plan they were in when they gave it: it's for that plan only (D637).
  plan_id uuid not null references public.plans (id) on delete cascade,
  granted_at timestamptz not null default now(),
  ends_at timestamptz not null,
  ended_at timestamptz,
  last_looked_at timestamptz,
  check (ends_at > granted_at)
);
create index support_access_by_person on app.support_access (person_id, granted_at desc);

-- The 7-day wait before two-step sign-in is turned off (question 14, D621).
create table app.two_step_waits (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  -- The stop link's token, scrambled; gone once the wait has ended.
  stop_hash text unique,
  stopped_at timestamptz,
  stopped_how text check (stopped_how in ('link', 'support', 'device', 'app-used')),
  done_at timestamptz,
  check (stopped_at is null or done_at is null)
);
create unique index two_step_waits_one_open on app.two_step_waits (person_id)
  where stopped_at is null and done_at is null;

-- Links support sends to a backup email to get back in (D392, question 14,
-- D622): an unguessable token in place of a 6-digit code, so wrong codes
-- typed by anyone else can't lock it or use it up. "start" asks to get back
-- in, starting the 24-hour wait; "finish", sent once the wait is over,
-- finishes. Each works once, for 24 hours.
create table app.support_links (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references auth.users (id) on delete cascade,
  backup_email text not null check (backup_email = lower(backup_email)),
  token_hash text not null unique,
  stage text not null check (stage in ('start', 'finish')),
  request_id uuid references app.get_back_in (id) on delete cascade,
  sent_at timestamptz not null default now(),
  used_at timestamptz
);
create index support_links_by_person on app.support_links (person_id, sent_at desc);

-- A request to get back in started from support's link, and when its
-- finishing link went.
alter table app.get_back_in add column from_support boolean not null default false;
alter table app.get_back_in add column finish_link_at timestamptz;

alter table app.support_actions enable row level security;
alter table app.support_replies enable row level security;
alter table app.error_codes enable row level security;
alter table app.support_access enable row level security;
alter table app.two_step_waits enable row level security;
alter table app.support_links enable row level security;
revoke all on app.support_actions, app.support_replies, app.error_codes, app.support_access,
  app.two_step_waits, app.support_links from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Settings, each in one place, the owner's to change.

-- Support access lasts 7 days (brief 4.16).
create function app.support_access_lasts() returns interval
language sql immutable set search_path = '' as $$ select interval '7 days' $$;
-- The wait before two-step sign-in is turned off (question 14).
create function app.two_step_wait() returns interval
language sql immutable set search_path = '' as $$ select interval '7 days' $$;
-- How long a link from support works.
create function app.support_link_lasts() returns interval
language sql immutable set search_path = '' as $$ select interval '24 hours' $$;
-- Support's own emails in any 24 hours: replies and every action's email
-- together (D620). With step 4i's 21 at most, that's 36 of Resend's 100 a
-- day, leaving at least 64 for sign-in codes.
create function app.support_own_emails_a_day() returns integer
language sql immutable set search_path = '' as $$ select 15 $$;
-- Error codes kept for each person: at most 30 a day, for 30 days.
create function app.error_codes_a_day() returns integer
language sql immutable set search_path = '' as $$ select 30 $$;
create function app.error_codes_kept() returns interval
language sql immutable set search_path = '' as $$ select interval '30 days' $$;

-- How many emails support's tools sent, or a link sent may yet lead to, in
-- the last 24 hours.
create function app.support_emails_today() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(a.emails), 0)::integer from app.support_actions a
  where a.at > now() - interval '24 hours'
$$;

-- Refuses "busy" once support's own emails have reached their allowance.
-- On the local test database only, 100 times higher, as step 4i's caps for
-- everyone together are there (app.support_scale, D606): the end-to-end
-- tests all act as one support, many times a day. 40-support-tools.test.sql
-- puts it back to 1 and checks the real number.
create function app.support_may_email(needed integer default 1) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.support_one_at_a_time();
  if app.support_emails_today() + needed > app.support_own_emails_a_day() * app.support_scale() then
    perform app.refuse('busy');
  end if;
end;
$$;

create function app.note_support_action(person uuid, message uuid, what text, emailed boolean,
  emails integer default null)
returns void
language sql volatile security definer set search_path = '' as $$
  insert into app.support_actions (person_id, message_id, action, emailed, emails, at)
  values (person, message, what, emailed, coalesce(emails, case when emailed then 1 else 0 end),
    clock_timestamp())
$$;

-- The address a person signs in with, or null.
create function app.sign_in_address(person uuid) returns text
language sql stable security definer set search_path = '' as $$
  select nullif(lower(u.email), '') from auth.users u where u.id = person
$$;

-- "Fri 20 Nov" for a moment, in UK time, with the year only when it isn't
-- this year (docs/VOICE.md).
create function app.moment_day_words(moment timestamptz) returns text
language sql stable set search_path = '' as $$
  select app.day_words((moment at time zone 'Europe/London')::date)
$$;

-- ---------------------------------------------------------------------------
-- 2. The inbox, and replies.

-- One message as support reads it.
create function app.support_message_json(m app.support_messages) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    -- To the microsecond, so "Show older messages" never skips one sent in the same second (D638).
    'id', m.id, 'kind', m.kind, 'sent_at', app.utc_exact(m.sent_at), 'words', m.words,
    'screen', m.screen, 'app_version', m.app_version, 'phone_type', m.phone_type,
    'answer_by', m.answer_by, 'file_kind', m.file_kind,
    'has_file', exists (select 1 from app.support_files f where f.message_id = m.id),
    'file_gone_at', app.utc_words(m.file_gone_at),
    'person', m.person_id, 'signed_in', m.person_id is not null,
    'from', coalesce(m.email, app.sign_in_address(m.person_id)),
    'replied_at', app.utc_words(m.replied_at), 'last_reply_at', app.utc_words(m.last_reply_at))
$$;

-- Every message and idea, newest first, 50 at a time: with `older_than`,
-- the 50 sent before that moment. With how many are waiting for a reply
-- (Contact us and Something looks wrong with none yet).
create function public.support_inbox(older_than text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_ones jsonb;
  how_many integer;
begin
  perform app.support_only();
  if older_than is not null then
    perform app.check_made_at(older_than);
  end if;
  select coalesce(jsonb_agg(app.support_message_json(m.one) order by m.n) filter (where m.n <= 50),
      '[]'::jsonb), count(*)
    into found_ones, how_many
    from (select x as one, row_number() over (order by x.sent_at desc, x.id desc) as n
      from app.support_messages x
      where older_than is null or x.sent_at < older_than::timestamptz
      order by x.sent_at desc, x.id desc limit 51) m;
  return jsonb_build_object('messages', found_ones, 'more', how_many > 50,
    'waiting', (select count(*) from app.support_messages m where m.kind <> 'idea' and m.replied_at is null),
    'now', app.server_time());
end;
$$;

-- One message, with its replies, the facts of its picture or plan copy, and
-- whether the person who sent it has let support see their plan.
create function public.support_message(message uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  m app.support_messages;
begin
  perform app.support_only();
  select * into m from app.support_messages x where x.id = message;
  if not found then
    perform app.refuse('not-found', '42501');
  end if;
  return app.support_message_json(m) || jsonb_build_object(
    'replies', coalesce((select jsonb_agg(jsonb_build_object('words', r.words,
        'sent_at', app.utc_exact(r.sent_at)) order by r.sent_at)
      from app.support_replies r where r.message_id = m.id), '[]'::jsonb),
    'file', (select jsonb_build_object('kind', f.kind, 'content_type', f.content_type, 'bytes', f.bytes,
        'width', f.width, 'height', f.height, 'added_at', app.utc_words(f.added_at),
        'gone_at', app.utc_words(f.added_at + app.support_files_kept()))
      from app.support_files f where f.message_id = m.id),
    'access', m.person_id is not null and app.access_open(m.person_id),
    'now', app.server_time());
end;
$$;

-- A message's picture or plan copy, within its 30 days: its type and its
-- contents in base64.
create function public.support_file(message uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  f app.support_files;
begin
  perform app.support_only();
  select * into f from app.support_files x where x.message_id = message;
  if not found then
    perform app.refuse('not-found', '42501');
  end if;
  return jsonb_build_object('kind', f.kind, 'content_type', f.content_type,
    'data', translate(encode(f.data, 'base64'), E'\n', ''));
end;
$$;

-- Support's reply to a message: emailed from hello@prepenny.co.uk, through
-- Resend on the real project, to the address the message came from (the
-- one the person signs in with, or the one they proved with a code), kept
-- with the message, and recorded. Each line typed is a paragraph. The
-- email never repeats the person's own words (D601).
create function public.support_reply(message uuid, words text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  m app.support_messages;
  said text := btrim(coalesce(words, ''));
  address text;
  lines text[];
begin
  perform app.support_only();
  if char_length(said) not between 1 and 5000 then
    perform app.refuse('bad-reply');
  end if;
  perform app.support_one_at_a_time();
  select * into m from app.support_messages x where x.id = message for update;
  if not found then
    perform app.refuse('not-found', '42501');
  end if;
  address := coalesce(m.email, app.sign_in_address(m.person_id));
  if address is null then
    perform app.refuse('no-address');
  end if;
  if not app.email_ready() then
    perform app.refuse('email-off');
  end if;
  perform app.support_may_email();
  select array_agg(btrim(line) order by n) into lines
    from regexp_split_to_table(said, E'\\r?\\n') with ordinality as l(line, n)
    where btrim(line) <> '';
  perform app.send_email(address, 'A reply from PrePenny support',
    'PrePenny support has replied to your message.', null,
    lines || array['You can reply to this email.'],
    'For your privacy, this email doesn''t repeat what you wrote. PrePenny will never ask for a password or a card number.');
  insert into app.support_replies (message_id, words) values (m.id, said);
  update app.support_messages x set replied_at = coalesce(x.replied_at, now()), last_reply_at = now()
    where x.id = m.id;
  perform app.note_support_action(m.person_id, m.id, 'reply', true);
  return jsonb_build_object('sent', true, 'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Support access (question 13, D618).

-- True while a person's support access is open: given, not stopped, its 7
-- days not over, and they're still in the plan they gave it for (D637).
create function app.access_open(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.support_access a
    where a.person_id = person and a.ended_at is null and a.ends_at > now()
      and a.plan_id = (select p.plan_id from app.plan_now(person) p))
$$;

-- The person's support access as their phone shows it.
create function app.access_json(person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'on', a.id is not null,
    'ends_at', app.utc_words(a.ends_at),
    'last_looked_at', app.utc_words(a.last_looked_at),
    'now', app.server_time())
  from (select 1) one
  left join lateral (select * from app.support_access x
    where x.person_id = person and x.ended_at is null and x.ends_at > now()
      and x.plan_id = (select p.plan_id from app.plan_now(person) p)
    order by x.granted_at desc limit 1) a on true
$$;

-- The person's own support access: whether it's on, until when, and when
-- support last looked.
create function public.my_support_access() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  return app.access_json(auth.uid());
end;
$$;

-- Says in Activity, to everyone in the person's plan, that they let support
-- see it until a day ("Jess let PrePenny support see the plan until Fri 20
-- Nov."), or that they ended it.
create function app.note_access_in_activity(person uuid, summary jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  plan uuid;
begin
  select p.plan_id into plan from app.plan_now(person) p;
  if plan is null then
    return;
  end if;
  insert into public.edits (id, plan_id, private_to, person_id, made_at, kind, summary)
  values (gen_random_uuid(), plan, null, person, app.server_time(), 'support-access', summary);
  perform app.send_nudge('plan:' || plan);
end;
$$;

-- "Let PrePenny support see my plan": for 7 days, read only, exactly as the
-- person sees it. Only for a plan kept in the account. Asked again while
-- it's on, nothing changes.
create function public.give_support_access() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  plan uuid;
  given app.support_access;
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  select p.plan_id into plan from app.plan_now(me) p;
  if plan is null then
    perform app.refuse('no-plan');
  end if;
  perform app.one_at_a_time(me::text, 'support-access');
  if app.access_open(me) then
    return app.access_json(me);
  end if;
  insert into app.support_access (person_id, plan_id, ends_at)
  values (me, plan, now() + app.support_access_lasts())
  returning * into given;
  perform app.note_access_in_activity(me, jsonb_build_object('until',
    (given.ends_at at time zone 'Europe/London')::date));
  return app.access_json(me);
end;
$$;

-- "Stop support seeing my plan": ends it at once.
create function public.end_support_access() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  perform app.one_at_a_time(me::text, 'support-access');
  if app.access_open(me) then
    perform app.note_access_in_activity(me, jsonb_build_object('ended', true));
  end if;
  update app.support_access a set ended_at = now()
    where a.person_id = me and a.ended_at is null;
  return app.access_json(me);
end;
$$;

-- Whenever someone joins a plan or leaves one, support access given by
-- anyone in either plan ends at once (D637): the plan support would see
-- isn't the one it was given for, and whoever joined wasn't told. Each can
-- give it again, and Activity says so then.
create function app.end_support_access_on_joining() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.left_at is not distinct from old.left_at
      and new.plan_id = old.plan_id and new.person_id = old.person_id then
    return new;
  end if;
  update app.support_access a set ended_at = now()
    where a.ended_at is null and a.ends_at > now()
      and (a.person_id = new.person_id
        or a.plan_id in (new.plan_id, case when tg_op = 'UPDATE' then old.plan_id end)
        or a.person_id in (select m.person_id from public.plan_members m
          where m.plan_id in (new.plan_id, case when tg_op = 'UPDATE' then old.plan_id end)));
  return new;
end;
$$;

create trigger prepenny_end_support_access after insert or update on public.plan_members
  for each row execute function app.end_support_access_on_joining();

-- The person's plan exactly as plan_changes gives it to their own phone
-- (D564, D618): the same rows, from the same tables, chosen by the same
-- rule, their own private records and the shared ones, never anyone else's
-- private ones. 40-support-tools.test.sql checks it's the same as
-- plan_changes run as the person, row for row.
create function app.plan_as_seen_by(person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  plan uuid;
  all_rows jsonb;
  the_plan jsonb;
  every_table text;
begin
  select p.plan_id into plan from app.plan_now(person) p;
  if plan is null then
    return null;
  end if;
  select jsonb_build_object('id', p.id, 'nation', p.nation, 'owner', p.owner, 'version', p.version,
      'seq', p.seq, 'changed_at', p.changed_at, 'edit_id', p.edit_id,
      'edit_made_at', e.made_at, 'edit_saved_at', app.utc_exact(e.saved_at),
      'edit_by', e.person_id, 'edit_kind', e.kind)
    into the_plan from public.plans p
    left join public.edits e on e.id = p.edit_id and e.plan_id = p.id
      and (e.private_to is null or e.private_to = person)
    where p.id = plan;
  -- Who changed each record, as the person's phone may read it: the
  -- privacy rules on edits give a phone only shared ones and its own.
  select string_agg(format($q$
      select %s as kind_order, r.seq, jsonb_build_object('table', %L,
          'row', to_jsonb(r) - 'plan_id' - 'created_at',
          'edit_made_at', e.made_at, 'edit_saved_at', app.utc_exact(e.saved_at),
          'edit_by', e.person_id, 'edit_kind', e.kind) as one
      from public.%I r
      left join public.edits e on e.id = r.edit_id and e.plan_id = r.plan_id
        and (e.private_to is null or e.private_to = $2)
      where r.plan_id = $1 and r.seq > 0
        and (r.private_to is null or r.private_to = $2)$q$,
      t.n, t.name, t.name), ' union all ' order by t.n)
    into every_table
    from unnest(app.record_tables()) with ordinality as t(name, n);
  execute format($q$
      select coalesce(jsonb_agg(x.one order by x.kind_order, x.seq), '[]'::jsonb) from (
        %s
        union all
        select 1000, r.seq, jsonb_build_object('table', 'paydays', 'row', to_jsonb(r) - 'plan_id')
        from public.paydays r
        where r.plan_id = $1 and r.seq > 0
        union all
        select 1001, r.seq, jsonb_build_object('table', 'bank_holidays', 'row', to_jsonb(r) - 'plan_id')
        from public.bank_holidays r
        where r.plan_id = $1 and r.seq > 0
      ) x$q$, every_table)
    into all_rows using plan, person;
  return jsonb_build_object('plan', the_plan, 'rows', all_rows,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('person', m.person_id, 'role', m.role,
        'nickname', coalesce(p.nickname, ''))), '[]'::jsonb)
      from public.plan_members m left join public.people p on p.id = m.person_id
      where m.plan_id = plan and m.left_at is null));
end;
$$;

-- Support reads a person's plan, while their access is open: exactly what
-- they see, read only (nothing here can change it). Each look is recorded,
-- once every 10 minutes at most, and the person sees when support last
-- looked. Refused "no-access" once it has ended, at that very moment.
create function public.support_plan(person uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  seen jsonb;
begin
  perform app.support_only();
  if person is null or not app.access_open(person) then
    perform app.refuse('no-access', '42501');
  end if;
  seen := app.plan_as_seen_by(person);
  if seen is null then
    perform app.refuse('no-plan');
  end if;
  if not exists (select 1 from app.support_actions a where a.person_id = person and a.action = 'looked'
      and a.at > now() - interval '10 minutes') then
    perform app.note_support_action(person, null, 'looked', false);
  end if;
  update app.support_access a set last_looked_at = now()
    where a.person_id = person and a.ended_at is null and a.ends_at > now();
  return seen || jsonb_build_object('me', person,
    'ends_at', (select app.utc_words(max(a.ends_at)) from app.support_access a
      where a.person_id = person and a.ended_at is null),
    'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Accounts.

-- Finds an account by the address it signs in with, or by its backup email:
-- {found: false}, or {found: true, person}.
create function public.support_find(email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text := app.email_address(email);
  person uuid;
begin
  perform app.support_only();
  if address is null then
    perform app.refuse('bad-email');
  end if;
  select u.id into person from auth.users u where lower(u.email) = address limit 1;
  if person is null then
    select b.person_id into person from app.backup_emails b where b.email = address;
  end if;
  return case when person is null then jsonb_build_object('found', false)
    else jsonb_build_object('found', true, 'person', person) end;
end;
$$;

-- The person's open two-step wait, or null; one that's due is finished
-- first, so what support sees is never out of date.
create function app.open_two_step_wait(person uuid) returns app.two_step_waits
language sql stable security definer set search_path = '' as $$
  select * from app.two_step_waits w
  where w.person_id = person and w.stopped_at is null and w.done_at is null
$$;

-- An account as support sees it: when it signed up and last signed in,
-- whether two-step sign-in is on, its plan type, recent error codes,
-- support access, what's under way, and what support did. Never amounts,
-- payment names or notes.
create function public.support_account(person uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  u auth.users;
  plan uuid;
  members integer;
  wait app.two_step_waits;
  request app.get_back_in;
begin
  perform app.support_only();
  select * into u from auth.users x where x.id = person;
  if not found then
    perform app.refuse('not-found', '42501');
  end if;
  perform app.finish_two_step_waits(person);
  select p.plan_id into plan from app.plan_now(person) p;
  if plan is not null then
    select count(*) into members from public.plan_members m where m.plan_id = plan and m.left_at is null;
  end if;
  wait := app.open_two_step_wait(person);
  request := app.open_get_back_in(person);
  return jsonb_build_object(
    'person', u.id,
    'email', nullif(lower(u.email), ''),
    'backup_email', (select b.email from app.backup_emails b where b.person_id = person),
    'signed_up_at', app.utc_words(u.created_at),
    'last_signed_in_at', app.utc_words(u.last_sign_in_at),
    'two_step', app.two_step_on(person),
    'plan', case when plan is null then 'none' when members > 1 then 'shared' else 'own' end,
    'devices', (select count(*) from auth.sessions s
      where s.user_id = person and (s.not_after is null or s.not_after > now())),
    'is_you', person = auth.uid(),
    'access', app.access_json(person),
    'error_codes', coalesce((select jsonb_agg(jsonb_build_object('code', e.code, 'screen', e.screen,
        'app_version', e.app_version, 'at', app.utc_exact(e.at)) order by e.at desc)
      from (select * from app.error_codes x where x.person_id = person order by x.at desc limit 20) e),
      '[]'::jsonb),
    'two_step_wait', case when wait.id is null then null else jsonb_build_object(
      'started_at', app.utc_words(wait.started_at),
      'ends_at', app.utc_words(wait.started_at + app.two_step_wait())) end,
    'get_back_in', case when request.id is null then null else jsonb_build_object(
      'started_at', app.utc_words(request.started_at),
      'ready_at', app.utc_words(app.ready_at(request)),
      'from_support', request.from_support,
      'finish_link_at', app.utc_words(request.finish_link_at)) end,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind,
        'sent_at', app.utc_words(m.sent_at), 'replied', m.replied_at is not null) order by m.sent_at desc)
      from (select * from app.support_messages x
        where x.person_id = person or x.email in (lower(u.email),
          (select b.email from app.backup_emails b where b.person_id = person))
        order by x.sent_at desc limit 20) m), '[]'::jsonb),
    -- Times to the microsecond, each one apart from the next (D638).
    'actions', coalesce((select jsonb_agg(jsonb_build_object('action', a.action,
        'at', app.utc_exact(a.at), 'emailed', a.emailed) order by a.at desc)
      from (select * from app.support_actions x where x.person_id = person order by x.at desc limit 30) a),
      '[]'::jsonb),
    'now', app.server_time());
end;
$$;

-- A phone notes an error code the person met: a code only, with the
-- screen's name and the version, never anything typed or about money. From
-- any version whose sign-in holds, as for support messages (D613). At most
-- 30 a day for a person; more are let go. {noted: true or false}.
create function public.note_error_code(code text, screen text, app_version text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if code is null or code !~ '^[a-z0-9-]{1,40}$'
      or (screen is not null and screen !~ '^[a-z0-9-]{1,60}$')
      or app_version is null or app_version !~ '^[A-Za-z0-9._-]{1,40}$' then
    perform app.refuse('bad-code');
  end if;
  if not app.support_signed_in() then
    perform app.refuse('not-allowed', '42501');
  end if;
  perform app.one_at_a_time(auth.uid()::text, 'error-code');
  if (select count(*) from app.error_codes e
      where e.person_id = auth.uid() and e.at > now() - interval '24 hours') >= app.error_codes_a_day() then
    return jsonb_build_object('noted', false);
  end if;
  insert into app.error_codes (person_id, code, screen, app_version)
  values (auth.uid(), code, screen, app_version);
  return jsonb_build_object('noted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Support's actions. Each is recorded, and the person is emailed.

-- A person support can act on: there, and not support's own account.
create function app.support_target(person uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text;
begin
  if person is null or not exists (select 1 from auth.users u where u.id = person) then
    perform app.refuse('not-found', '42501');
  end if;
  if person = auth.uid() then
    perform app.refuse('is-you');
  end if;
  address := app.sign_in_address(person);
  if not app.email_ready() then
    perform app.refuse('email-off');
  end if;
  return address;
end;
$$;

-- Signs a person out of every phone and computer (D621), as finishing
-- getting back in does: each sign-in's refresh tokens go with it, and their
-- phones are nudged so each removes the plan within a minute, keeping
-- anything not yet sent (D348).
create function public.support_sign_out(person uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text;
  ended integer;
begin
  perform app.support_only();
  address := app.support_target(person);
  perform app.support_may_email();
  perform app.nudge_my_phones(person);
  delete from auth.sessions s where s.user_id = person;
  get diagnostics ended = row_count;
  delete from app.devices d where d.person_id = person;
  if address is not null then
    perform app.send_email(address, 'PrePenny support signed you out',
      'PrePenny support signed your account out everywhere', null,
      array['At ' || app.when_words(now()) || ', PrePenny support signed your PrePenny account out of every phone and computer.',
        'Your plan is safe in your account. To see it again, sign in with this email address.'],
      'If you didn''t ask PrePenny support for this, reply to this email straight away.');
  end if;
  perform app.note_support_action(person, null, 'signed-out', address is not null);
  return jsonb_build_object('ended', ended, 'now', app.server_time());
end;
$$;

-- Starts the 7-day wait before two-step sign-in is turned off, for someone
-- who has lost their authenticator app but still has their email (question
-- 14, D621). Nothing changes for 7 days. The address they sign in with gets
-- an email with "Stop it", a link that works once and can only stop it.
create function public.support_start_two_step_wait(person uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text;
  backup text;
  token text := app.new_token();
  started app.two_step_waits;
  site text;
begin
  perform app.support_only();
  address := app.support_target(person);
  if not app.two_step_on(person) then
    perform app.refuse('two-step-off');
  end if;
  if address is null then
    perform app.refuse('no-address');
  end if;
  perform app.one_at_a_time(person::text, 'two-step-wait');
  if (app.open_two_step_wait(person)).id is not null then
    perform app.refuse('already');
  end if;
  select b.email into backup from app.backup_emails b where b.person_id = person;
  perform app.support_may_email(case when backup is null then 1 else 2 end);
  insert into app.two_step_waits (person_id, stop_hash) values (person, app.token_hash(token))
    returning * into started;
  select s.site into site from app.email_sender s;
  perform app.send_email(address, 'PrePenny support is turning off two-step sign-in',
    'Two-step sign-in on your PrePenny account will be turned off', null,
    array['At ' || app.when_words(started.started_at) || ', PrePenny support was asked to turn off two-step sign-in on your account, because the authenticator app was lost.',
      'Nothing changes for 7 days. Unless it''s stopped, at ' || app.when_words(started.started_at + app.two_step_wait())
        || ' two-step sign-in is turned off, and you sign in with this email address alone.',
      'If it was you, you don''t need to do anything. If it wasn''t, stop it now.'],
    'This link works once, and can only stop this. You can also stop it in PrePenny on any phone or computer that''s signed in.',
    'Stop it', coalesce(site, 'https://prepenny.co.uk') || '/stop-two-step-off/#' || token);
  -- The backup address is told too, in case the sign-in address isn't the
  -- person's own any more (D638).
  if backup is not null then
    perform app.send_email(backup, 'PrePenny support is turning off two-step sign-in',
      'Two-step sign-in on your PrePenny account will be turned off', null,
      array['PrePenny support was asked to turn off two-step sign-in on the PrePenny account this is the backup email for, because the authenticator app was lost.',
        'Unless it''s stopped, at ' || app.when_words(started.started_at + app.two_step_wait())
          || ' two-step sign-in is turned off.'],
      'If you didn''t ask for this, stop it with the link in the email to the address you sign in with, or in PrePenny on any phone or computer that''s signed in.');
  end if;
  -- Every signed-in phone shows the notice with "Stop it" at once.
  perform app.nudge_my_phones(person);
  perform app.note_support_action(person, null, 'two-step-wait', true,
    case when backup is null then 1 else 2 end);
  return jsonb_build_object('started_at', app.utc_words(started.started_at),
    'ends_at', app.utc_words(started.started_at + app.two_step_wait()), 'now', app.server_time());
end;
$$;

-- Support stops a two-step wait, as when the person found their app.
create function public.support_stop_two_step_wait(person uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text;
begin
  perform app.support_only();
  address := app.support_target(person);
  perform app.support_may_email();
  perform app.nudge_my_phones(person);
  update app.two_step_waits w set stopped_at = now(), stopped_how = 'support', stop_hash = null
    where w.person_id = person and w.stopped_at is null and w.done_at is null;
  if not found then
    perform app.refuse('not-found', '42501');
  end if;
  if address is not null then
    perform app.send_email(address, 'Two-step sign-in stays on',
      'Two-step sign-in stays on for your PrePenny account', null,
      array['PrePenny support has stopped turning off two-step sign-in on your account. Nothing on your account changed.'],
      'If you didn''t ask PrePenny support for this, reply to this email.');
  end if;
  perform app.note_support_action(person, null, 'two-step-stopped', address is not null);
  return jsonb_build_object('stopped', true, 'now', app.server_time());
end;
$$;

-- The stop link in the email: stops that one wait, once, and can do nothing
-- else. It signs nobody in or out, and says nothing about the account.
create function public.stop_two_step_off_with_link(token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  stopped app.two_step_waits;
begin
  if token is null or token !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('stopped', false);
  end if;
  update app.two_step_waits w set stopped_at = now(), stopped_how = 'link', stop_hash = null
    where w.stop_hash = app.token_hash(token) and w.stopped_at is null and w.done_at is null
      and w.started_at > now() - app.two_step_wait()
    returning * into stopped;
  if not found then
    return jsonb_build_object('stopped', false);
  end if;
  -- Support's account page shows why it stopped (D638).
  perform app.note_support_action(stopped.person_id, null, 'two-step-kept', false);
  perform app.nudge_my_phones(stopped.person_id);
  return jsonb_build_object('stopped', true);
end;
$$;

-- "Stop it", in the notice on a phone or computer signed in to the account
-- (D638): stops the person's own wait, never anyone else's.
create function public.stop_two_step_off() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  update app.two_step_waits w set stopped_at = now(), stopped_how = 'device', stop_hash = null
    where w.person_id = auth.uid() and w.stopped_at is null and w.done_at is null;
  if not found then
    return jsonb_build_object('stopped', false, 'now', app.server_time());
  end if;
  perform app.note_support_action(auth.uid(), null, 'two-step-kept', false);
  perform app.nudge_my_phones(auth.uid());
  return jsonb_build_object('stopped', true, 'now', app.server_time());
end;
$$;

-- True when the person has used their authenticator app since a moment: a
-- code checked on any of their sign-ins (D638). Someone who can do that
-- hasn't lost it.
create function app.app_used_since(person uuid, moment timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from auth.mfa_amr_claims c join auth.sessions s on s.id = c.session_id
      where s.user_id = person and c.authentication_method = 'totp' and c.updated_at > moment)
    or exists (
      select 1 from auth.mfa_challenges ch join auth.mfa_factors f on f.id = ch.factor_id
      where f.user_id = person and ch.verified_at > moment)
$$;

-- Finishes the two-step waits that are due, for one person or everyone:
-- every authenticator app on the account is removed, so two-step sign-in is
-- off, the person's phones are nudged, and they're emailed. Run by the
-- scheduled job every 15 minutes, and before support looks at an account.
create function app.finish_two_step_waits(only_person uuid default null) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  due app.two_step_waits;
  address text;
  done integer := 0;
begin
  for due in
    select * from app.two_step_waits w
    where w.stopped_at is null and w.done_at is null and w.started_at <= now() - app.two_step_wait()
      and (only_person is null or w.person_id = only_person)
    for update skip locked
  loop
    address := app.sign_in_address(due.person_id);
    -- They used the app during the wait, so it isn't lost: it stays on (D638).
    if app.app_used_since(due.person_id, due.started_at) then
      update app.two_step_waits w set stopped_at = now(), stopped_how = 'app-used', stop_hash = null
        where w.id = due.id;
      perform app.nudge_my_phones(due.person_id);
      if address is not null and app.email_ready() then
        perform app.send_email(address, 'Two-step sign-in stays on',
          'Two-step sign-in stays on for your PrePenny account', null,
          array['Your authenticator app was used to sign in to your account after PrePenny support was asked to turn off two-step sign-in, so it stays on. Nothing on your account changed.'],
          'If you didn''t ask PrePenny support for this, reply to this email.');
      end if;
      perform app.note_support_action(due.person_id, null, 'two-step-kept', address is not null);
      continue;
    end if;
    delete from auth.mfa_factors f where f.user_id = due.person_id;
    update app.two_step_waits w set done_at = now(), stop_hash = null where w.id = due.id;
    perform app.nudge_my_phones(due.person_id);
    if address is not null and app.email_ready() then
      perform app.send_email(address, 'Two-step sign-in is off',
        'Two-step sign-in is now off for your PrePenny account', null,
        array['Nobody stopped it in the 7 days after PrePenny support was asked, so you now sign in with this email address alone.',
          'To turn it on again with a new authenticator app, sign in, then go to More, then Two-step sign-in.'],
        'If you didn''t ask PrePenny support for this, reply to this email straight away.');
    end if;
    perform app.note_support_action(due.person_id, null, 'two-step-off', address is not null);
    done := done + 1;
  end loop;
  return done;
end;
$$;

-- Removing an authenticator app needs a code typed in the last 5 minutes
-- (D382), unless it's a two-step wait that's due: then the database itself
-- removes it, as the person can't type a code.
create or replace function app.fresh_second_step_to_turn_off() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'verified'
    and exists (select 1 from auth.users u where u.id = old.user_id)
    and not exists (
      select 1 from auth.mfa_amr_claims c join auth.sessions s on s.id = c.session_id
      where s.user_id = old.user_id and c.authentication_method = 'totp'
        and c.updated_at > now() - interval '5 minutes'
    )
    and not exists (
      select 1 from app.two_step_waits w
      where w.person_id = old.user_id and w.stopped_at is null and w.done_at is null
        and w.started_at <= now() - app.two_step_wait()
    ) then
    perform app.refuse('second-step-needed', '42501');
  end if;
  return old;
end;
$$;

-- Sends a link to a person's backup email that gets them back in, for when
-- their backup address is kept locked by someone typing wrong codes (D392,
-- question 14, D622). With no request open, the link starts one, with the
-- same 24-hour wait and "Stop it" as a code does. With one open and its 24
-- hours over, it finishes it. While the 24 hours run, "waiting".
create function public.support_send_backup_link(person uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  backup text;
  open_one app.get_back_in;
  stage text;
begin
  perform app.support_only();
  perform app.support_target(person);
  select b.email into backup from app.backup_emails b where b.person_id = person;
  if backup is null then
    perform app.refuse('no-backup');
  end if;
  perform app.one_at_a_time(backup, 'get-in');
  open_one := app.open_get_back_in(person);
  if open_one.id is not null and (open_one.finishing_at is not null or now() < app.ready_at(open_one)) then
    perform app.refuse('waiting');
  end if;
  stage := case when open_one.id is null then 'start' else 'finish' end;
  -- A link counts for what opening it can lead to (D638): a start link, the
  -- email to the sign-in address and one to the backup if it's stopped; a
  -- finish link, the email to the old address.
  perform app.support_may_email(case when stage = 'start' then 3 else 2 end);
  perform app.send_support_link(person, backup, stage, open_one.id);
  perform app.note_support_action(person, null,
    case when stage = 'start' then 'backup-link' else 'backup-finish-link' end, true,
    case when stage = 'start' then 3 else 2 end);
  return jsonb_build_object('sent', stage, 'now', app.server_time());
end;
$$;

-- Makes and emails a link: earlier links not used are used up.
create function app.send_support_link(person uuid, backup text, stage text, request uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  token text := app.new_token();
  site text;
begin
  update app.support_links l set used_at = now() where l.person_id = person and l.used_at is null;
  insert into app.support_links (person_id, backup_email, token_hash, stage, request_id)
    values (person, backup, app.token_hash(token), stage, request);
  if stage = 'finish' then
    update app.get_back_in r set finish_link_at = now() where r.id = request;
  end if;
  select s.site into site from app.email_sender s;
  if stage = 'start' then
    perform app.send_email(backup, 'A link from PrePenny support to get back in',
      'PrePenny support sent you a link to get back in', null,
      array['Open it on the phone or computer you want to use. It works once, for 24 hours.',
        'For your safety, nothing changes for 24 hours, and we tell the address you sign in with now, so it can be stopped if it wasn''t you. After 24 hours, we email you a new link to finish.'],
      'If you didn''t ask PrePenny support for this, you can ignore this email. Nothing changes without the link.',
      'Get back in', coalesce(site, 'https://prepenny.co.uk') || '/get-back-in/#support=' || token);
  else
    perform app.send_email(backup, 'A link from PrePenny support to finish getting back in',
      'You can finish getting back into PrePenny', null,
      array['Open this link to finish. It works once, for 24 hours.',
        'Once you do, this address becomes the one you sign in with. Every phone and computer signed in to your account is signed out, and any Google sign-in is removed.'],
      'If you didn''t ask for this, you can ignore this email, and tell us at hello@prepenny.co.uk.',
      'Finish getting back in', coalesce(site, 'https://prepenny.co.uk') || '/get-back-in/#support=' || token);
  end if;
end;
$$;

-- Sends the finishing link for every request started from support's link
-- whose 24 hours are over. Run by the scheduled job every 15 minutes. Once
-- a link has gone, another goes only when it has run out, and so, if a
-- finish didn't complete and the request is open again, within 24 hours
-- (D638), while the request can still be finished (7 days, D391).
create function app.send_finish_links() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  ready app.get_back_in;
  sent integer := 0;
begin
  for ready in
    select * from app.get_back_in r
    where r.from_support and r.stopped_at is null and r.done_at is null
      and r.finishing_at is null and now() >= app.ready_at(r)
      and r.started_at > now() - app.get_back_in_wait() - app.get_back_in_lasts()
      and (r.finish_link_at is null or r.finish_link_at <= now() - app.support_link_lasts())
    for update skip locked
  loop
    continue when not app.email_ready()
      or not exists (select 1 from app.backup_emails b where b.person_id = ready.person_id
        and b.email = ready.backup_email);
    perform app.send_support_link(ready.person_id, ready.backup_email, 'finish', ready.id);
    perform app.note_support_action(ready.person_id, null, 'backup-finish-link', true, 2);
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

-- The link from support, from the get-back-in function, as
-- get_back_in_with_code is for a code: {in: false} for a link that isn't
-- one, was used, or has run out; a start link starts a request and its
-- 24-hour wait ({in: true, state: "waiting", ready_at, email}); a finish
-- link, sent after the 24 hours, gives the function what it needs to make
-- the change through Supabase's admin route ({in: true, state: "finish", ...}).
-- No code, wrong or right, can lock it or use it up.
create function public.get_back_in_with_link(token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  link app.support_links;
  open_one app.get_back_in;
  in_the_way uuid;
begin
  if not app.from_supabase_admin() then
    perform app.refuse('not-allowed', '42501');
  end if;
  if app.version_problem() is not null then
    perform app.refuse(app.version_problem());
  end if;
  if token is null or token !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('in', false);
  end if;
  update app.support_links l set used_at = now()
    where l.token_hash = app.token_hash(token) and l.used_at is null
      and l.sent_at > now() - app.support_link_lasts()
      and exists (select 1 from app.backup_emails b where b.person_id = l.person_id
        and b.email = l.backup_email)
    returning * into link;
  if not found then
    return jsonb_build_object('in', false);
  end if;
  perform app.one_at_a_time(link.backup_email, 'get-in');
  open_one := app.open_get_back_in(link.person_id);
  if link.stage = 'start' then
    if open_one.id is null then
      open_one := app.start_get_back_in(link.person_id, link.backup_email, 'support-link');
    end if;
    -- Opened while a request asked for with a code is open, from the same
    -- backup address: it's support's now too, so its link to finish is
    -- emailed (D638), as the screen says it will be.
    if open_one.backup_email = link.backup_email then
      update app.get_back_in r set from_support = true where r.id = open_one.id;
    end if;
    return jsonb_build_object('in', true, 'state', 'waiting',
      'ready_at', app.utc_words(app.ready_at(open_one)), 'email', link.backup_email);
  end if;
  if open_one.id is null or open_one.id is distinct from link.request_id
      or link.sent_at < app.ready_at(open_one) or open_one.backup_email <> link.backup_email then
    return jsonb_build_object('in', false);
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = link.backup_email
        and u.id <> link.person_id and u.email_confirmed_at is not null)
      or exists (select 1 from auth.identities i join auth.users u on u.id = i.user_id
        where i.email = link.backup_email and i.user_id <> link.person_id
          and u.email_confirmed_at is not null) then
    return jsonb_build_object('in', true, 'state', 'in-use');
  end if;
  select u.id into in_the_way from auth.users u
    where lower(u.email) = link.backup_email and u.id <> link.person_id
      and u.email_confirmed_at is null
    limit 1;
  update app.get_back_in r set finishing_at = now(),
      old_email = coalesce(r.old_email, (select u.email from auth.users u where u.id = link.person_id))
    where r.id = open_one.id and r.stopped_at is null and r.done_at is null
    returning * into open_one;
  if not found then
    return jsonb_build_object('in', false);
  end if;
  return jsonb_build_object('in', true, 'state', 'finish', 'request', open_one.id,
    'person', link.person_id, 'email', link.backup_email, 'in_the_way', in_the_way);
end;
$$;

-- Getting back in's start, as step 3e hardening made it, now saying what
-- was used: a code typed, or a link from PrePenny support (D638), so the
-- person deciding whether to stop it is told what happened.
drop function app.start_get_back_in(uuid, text);
create function app.start_get_back_in(person uuid, backup text, how text default 'code')
returns app.get_back_in
language plpgsql security definer set search_path = '' as $$
declare
  token text := app.new_token();
  started app.get_back_in;
  sign_in_email text;
  site text;
begin
  insert into app.get_back_in (person_id, backup_email, stop_hash, from_support)
    values (person, backup, app.token_hash(token), how = 'support-link')
    returning * into started;
  select u.email into sign_in_email from auth.users u where u.id = person;
  select s.site into site from app.email_sender s;
  if sign_in_email is not null and sign_in_email <> '' then
    perform app.send_email(sign_in_email, 'Someone asked to get into your PrePenny account',
      'Someone asked to get into your PrePenny account', null,
      array[case when how = 'support-link'
          then 'At ' || app.when_words(started.started_at) || ', someone opened a link PrePenny support sent to your backup email, '
            || backup || ', to get into your account.'
          else 'At ' || app.when_words(started.started_at) || ', someone typed a code sent to your backup email, '
            || backup || ', to get into your account.' end,
        'Nothing has changed yet. Unless it''s stopped, from ' || app.when_words(app.ready_at(started))
          || ' they can make ' || backup || ' the address your account signs in with, and every phone and computer signed in to it will be signed out.',
        'If it was you, you don''t need to do anything. If it wasn''t, stop it now.'],
      'This link works once, and can only stop this. You can also stop it in PrePenny on any phone or computer that''s signed in.',
      'Stop it', coalesce(site, 'https://prepenny.co.uk') || '/stop-get-back-in/#' || token);
  end if;
  perform app.nudge_my_phones(person);
  return started;
end;
$$;

-- What a signed-in phone asks when PrePenny opens and every minute, as in
-- step 3h, now also with support's two-step wait, if there's one (D638).
create or replace function public.hello() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  standing text;
  problem text := app.version_problem();
  open_one app.get_back_in;
  asked jsonb;
  requests jsonb;
  joining jsonb;
  wait app.two_step_waits;
  two_step_off jsonb;
begin
  if auth.uid() is not null and not exists (select 1 from auth.users u where u.id = auth.uid()) then
    standing := 'deleted';
  elsif not exists (
    select 1 from auth.sessions s
    where s.id = app.session_id() and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  ) then
    standing := 'ended';
  elsif app.two_step_on(auth.uid()) and not app.second_step_passed() then
    standing := 'second-step';
  else
    standing := 'ok';
    if problem is null then
      insert into app.devices as d (session_id, person_id, last_used_at)
      values (app.session_id(), auth.uid(), now())
      on conflict (session_id) do update set last_used_at = now()
        where d.last_used_at < now() - interval '1 minute';
      requests := app.join_requests();
      joining := app.my_joining();
    end if;
    open_one := app.open_get_back_in(auth.uid());
    if open_one.id is not null and open_one.finishing_at is null then
      asked := jsonb_build_object('started_at', app.utc_words(open_one.started_at),
        'ready_at', app.utc_words(app.ready_at(open_one)));
    end if;
    -- Step 4j (D638): PrePenny support's 7-day wait to turn off two-step
    -- sign-in, so every signed-in device shows its notice with "Stop it".
    wait := app.open_two_step_wait(auth.uid());
    if wait.id is not null then
      two_step_off := jsonb_build_object('started_at', app.utc_words(wait.started_at),
        'ends_at', app.utc_words(wait.started_at + app.two_step_wait()));
    end if;
  end if;
  return jsonb_build_object('sign_in', standing, 'version', coalesce(problem, 'ok'),
    'now', app.server_time(), 'get_back_in', asked, 'join_requests', coalesce(requests, '[]'::jsonb),
    'joining', coalesce(joining, '[]'::jsonb), 'two_step_off', two_step_off);
end;
$$;


-- ---------------------------------------------------------------------------
-- 6. Usage, counts only (D623): never a name, an address or an amount.

create function public.support_usage() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  this_week date := date_trunc('week', (now() at time zone 'Europe/London'))::date;
begin
  perform app.support_only();
  return jsonb_build_object(
    'sign_ups', (select jsonb_agg(jsonb_build_object('week', w.week, 'count', (
        select count(*) from auth.users u
        where u.email_confirmed_at is not null
          and (u.created_at at time zone 'Europe/London')::date >= w.week
          and (u.created_at at time zone 'Europe/London')::date < w.week + 7)) order by w.week desc)
      from (select this_week - 7 * n as week from generate_series(0, 7) n) w),
    'opened_7', app.people_opened(interval '7 days'),
    'opened_30', app.people_opened(interval '30 days'),
    'shared_plans', (select count(*) from (select m.plan_id from public.plan_members m
      where m.left_at is null group by m.plan_id having count(*) > 1) s),
    'reminders_on', (select count(*) from app.reminder_choices c
      where c.payday or c.evening or c.shortfall or c.weekly or c.partner),
    'waiting', (select count(*) from app.support_messages m where m.kind <> 'idea' and m.replied_at is null),
    'now', app.server_time());
end;
$$;

-- People signed in on a phone or computer that asked PrePenny's server
-- anything, or renewed its sign-in, in the last span.
create function app.people_opened(span interval) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(distinct who) from (
    select d.person_id as who from app.devices d where d.last_used_at > now() - span
    union all
    select s.user_id from auth.sessions s
    where greatest(s.created_at, s.refreshed_at at time zone 'utc', s.updated_at) > now() - span
  ) seen
$$;

-- ---------------------------------------------------------------------------
-- Activity: "Jess let PrePenny support see the plan until Fri 20 Nov."

-- Support access is the server's own step, never sent by a phone, and has
-- its own way back (D618).
create or replace function app.undoable(kind text) returns boolean
language sql immutable set search_path = '' as $$
  select kind not in ('first-copy', 'join-with-plan', 'share-accounts', 'claim-pay', 'make-private',
    'share-record', 'change-role', 'leave', 'support-access')
$$;

create or replace function app.server_kind(kind text) returns boolean
language sql immutable set search_path = '' as $$
  select kind in ('join-with-plan', 'share-accounts', 'claim-pay', 'make-private', 'share-record',
    'change-role', 'leave', 'support-access')
$$;

-- Activity as step 3i made it, with support access shown, which changes no
-- record.
create or replace function public.plan_activity(plan uuid, older_than text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  one public.edits;
  copies jsonb;
  found_edits jsonb := '[]'::jsonb;
  shown integer := 0;
  more boolean := false;
  undoer public.edits;
begin
  if plan is null or not app.session_ok() or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  if older_than is not null then
    perform app.check_made_at(older_than);
  end if;
  for one in
    select * from public.edits e
    where e.plan_id = plan
      and (e.private_to is null or e.private_to = me)
      and e.kind not in ('first-copy', 'join-with-plan')
      and (older_than is null or e.saved_at < older_than::timestamptz)
    order by e.saved_at desc, e.id desc
  loop
    select coalesce(jsonb_agg(jsonb_build_object('table', r.record_table, 'id', r.record_id,
        'before', case when r.before_private is null or r.before_private = me then r.before end,
        'after', case when r.after_private is null or r.after_private = me then r.after end,
        'context', case when r.after_private is null or r.after_private = me then r.context end) order by r.n), '[]'::jsonb)
      into copies
      from app.edit_records r
      where r.edit_id = one.id
        and (r.after_private is null or r.after_private = me or r.before_private is null or r.before_private = me)
        and app.readable_now(plan, r.record_table, r.record_id);
    if jsonb_array_length(copies) = 0
        and one.kind not in ('change-role', 'make-private', 'share-record', 'leave', 'support-access') then
      continue;
    end if;
    if shown = 50 then
      more := true;
      exit;
    end if;
    shown := shown + 1;
    undoer := null;
    if one.undone_by is not null then
      select * into undoer from public.edits u where u.id = one.undone_by;
    end if;
    found_edits := found_edits || jsonb_build_object(
      'id', one.id,
      'by', one.person_id,
      'made_at', one.made_at,
      'saved_at', app.utc_exact(one.saved_at),
      'kind', one.kind,
      'mine', one.person_id = me,
      'undone', undoer.id is not null and undoer.undone_by is null,
      'undoes', case when one.kind = 'undo' then one.summary ->> 'undoes' end,
      'can_undo', one.person_id = me and app.undo_problem(plan, one.id) is null,
      'summary', case when one.kind in ('change-role', 'make-private', 'share-record', 'leave',
        'support-access') then one.summary end,
      'records', copies);
  end loop;
  return jsonb_build_object('edits', found_edits, 'more', more, 'people', app.names_in(plan),
    'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- hello@prepenny.co.uk's notice now points to the support screen.

create or replace function app.tell_support() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  told app.support_told;
  waiting integer;
  support text;
  site text;
begin
  select * into told from app.support_told for update;
  if told.told_at is not null and told.told_at > now() - app.support_told_every() then
    return 0;
  end if;
  select count(*) into waiting from app.support_messages m where not m.told;
  if waiting = 0 or not app.email_ready() then
    return 0;
  end if;
  select s.from_address, s.site into support, site from app.email_sender s;
  perform app.send_email(support, 'A message is waiting in PrePenny''s support inbox',
    case when waiting = 1 then '1 message is waiting.' else waiting || ' messages are waiting.' end,
    null,
    array['Someone wrote to PrePenny support. This email doesn''t hold their words or their email address.',
      'Read it on PrePenny''s support screen, signed in as support with two-step sign-in.'],
    'PrePenny sends this at most once every 4 hours.',
    'Open the support screen', coalesce(site, 'https://prepenny.co.uk') || '/app/support/');
  update app.support_messages m set told = true where not m.told;
  update app.support_told t set told_at = now() where t.only_one;
  return waiting;
end;
$$;

-- ---------------------------------------------------------------------------
-- Every 15 minutes: two-step waits that are due, finishing links, and
-- tidying (D604, D619).

create function app.support_tools_tick() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  finished integer;
  links integer;
begin
  finished := app.finish_two_step_waits(null);
  links := app.send_finish_links();
  delete from app.error_codes e where e.at < now() - app.error_codes_kept();
  delete from app.support_actions a where a.at < now() - app.support_messages_kept();
  delete from app.support_links l where l.sent_at < now() - interval '7 days';
  delete from app.support_access a where coalesce(a.ended_at, a.ends_at) < now() - app.support_messages_kept();
  delete from app.two_step_waits w where coalesce(w.stopped_at, w.done_at) < now() - app.support_messages_kept();
  return jsonb_build_object('two_step_off', finished, 'finish_links', links);
end;
$$;

select cron.schedule('prepenny-support-tools', '3,18,33,48 * * * *', $$select app.support_tools_tick()$$);

-- ---------------------------------------------------------------------------
-- Who can use what. Support's steps are for signed-in people, and each
-- refuses anyone but support (app.support_only). The person's own steps
-- need their sign-in. The stop link works for anyone, as getting back in's
-- does. The link from support goes only through the get-back-in function,
-- with Supabase's admin key.

revoke all on function
  app.start_get_back_in(uuid, text, text), app.app_used_since(uuid, timestamptz),
  app.end_support_access_on_joining(),
  app.set_support(text), app.is_support_address(uuid), app.is_support(), app.support_only(),
  app.support_access_lasts(), app.two_step_wait(), app.support_link_lasts(),
  app.support_own_emails_a_day(), app.error_codes_a_day(), app.error_codes_kept(),
  app.support_emails_today(), app.support_may_email(integer),
  app.note_support_action(uuid, uuid, text, boolean, integer),
  app.sign_in_address(uuid), app.moment_day_words(timestamptz),
  app.support_message_json(app.support_messages), app.access_open(uuid), app.access_json(uuid),
  app.note_access_in_activity(uuid, jsonb), app.plan_as_seen_by(uuid), app.open_two_step_wait(uuid),
  app.support_target(uuid), app.finish_two_step_waits(uuid), app.send_support_link(uuid, text, text, uuid),
  app.send_finish_links(), app.people_opened(interval), app.support_tools_tick()
  from public, anon, authenticated, service_role;

revoke all on function
  public.support_status(), public.support_inbox(text), public.support_message(uuid),
  public.support_file(uuid), public.support_reply(uuid, text), public.my_support_access(),
  public.give_support_access(), public.end_support_access(), public.support_plan(uuid),
  public.support_find(text), public.support_account(uuid), public.note_error_code(text, text, text),
  public.support_sign_out(uuid), public.support_start_two_step_wait(uuid),
  public.support_stop_two_step_wait(uuid), public.stop_two_step_off_with_link(text),
  public.support_send_backup_link(uuid), public.get_back_in_with_link(text), public.support_usage(),
  public.stop_two_step_off()
  from public, anon, authenticated, service_role;

grant execute on function
  public.support_status(), public.support_inbox(text), public.support_message(uuid),
  public.support_file(uuid), public.support_reply(uuid, text), public.my_support_access(),
  public.give_support_access(), public.end_support_access(), public.support_plan(uuid),
  public.support_find(text), public.support_account(uuid), public.note_error_code(text, text, text),
  public.support_sign_out(uuid), public.support_start_two_step_wait(uuid),
  public.support_stop_two_step_wait(uuid), public.stop_two_step_off_with_link(text),
  public.support_send_backup_link(uuid), public.support_usage(), public.stop_two_step_off()
  to authenticated;
grant execute on function public.stop_two_step_off_with_link(text) to anon;
grant execute on function public.get_back_in_with_link(text) to service_role;
