-- Step 3e hardening: safer recovery (the owner's instructions, 9 Nov 2026).
--
-- 1. Getting back in with a backup email waits 24 hours, with a cancel.
--    Typing the code sent to the backup email starts a request and changes
--    nothing on the account. Straight away, the address the account signs
--    in with is told, with a link that can only stop it, works once and
--    can't be guessed, and every signed-in device shows a notice with a way
--    to stop it (`hello`). After 24 hours, if nobody stopped it, a fresh code
--    sent to the backup email finishes it: then the backup becomes the
--    sign-in address, every device is signed out, and the old address is
--    told. Two-step sign-in still applies after that.
-- 2. Guess-proofing: 3 codes a day for an address, and after 10 wrong tries
--    in a day the address is locked for 24 hours, for "get back in" codes
--    and "add a backup email" codes alike. A locked address gets the same
--    answers as any other, so nobody can tell it's locked or that it's a
--    backup.
-- 3. The sign-in address is changed through Supabase's own admin route
--    (supabase/functions/get-back-in), not by writing to auth.users and
--    auth.identities here: that route checks the address isn't anyone
--    else's, keeps the email sign-in (identity) in step, makes one for an
--    account that only had Google, and notes the change in Supabase's own
--    log. Signing devices out still removes their rows from auth.sessions,
--    as Supabase's own sign-out does (it has no admin route that ends
--    another device's sign-in), and their refresh tokens go with them
--    (05-ended-session.test.sql checks Supabase still keeps it that way).
-- 4. "Sign out everywhere" becomes "Sign out of all other devices", which
--    keeps this device signed in.
--
-- Nothing here is written to a log or an error with an email address or
-- anything about money (CLAUDE.md): every refusal is a short code.

-- ---------------------------------------------------------------------------
-- Words and times for the emails.

-- "2:05pm on Tue 10 Nov", in UK time, with the year only when it isn't this
-- year (docs/VOICE.md). The date's parts are joined with non-breaking
-- spaces, so it stays on one line, as in the app.
create function app.when_words(moment timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(moment at time zone 'Europe/London', 'FMHH12:MIam')
    || ' on ' || replace(to_char(moment at time zone 'Europe/London', 'Dy FMDD Mon')
    || case when extract(year from moment at time zone 'Europe/London')
        <> extract(year from now() at time zone 'Europe/London')
      then to_char(moment at time zone 'Europe/London', ' YYYY') else '' end, ' ', chr(160))
$$;

-- One of PrePenny's emails, as step 3e's, with a button: the heading, a code
-- if there is one, each line, then the button, then the small print.
create function app.email_html(heading text, code text, lines text[], small text,
  link_label text, link_url text) returns text
language sql immutable set search_path = '' as $$
  select '<!doctype html><html lang="en-GB"><head><meta charset="utf-8">'
    || '<meta name="viewport" content="width=device-width, initial-scale=1"><title>PrePenny</title></head>'
    || '<body style="margin:0;padding:24px 16px;background:#F4EFE6;color:#1A2238;font-family:Figtree,system-ui,-apple-system,''Segoe UI'',Roboto,sans-serif;">'
    || '<div style="max-width:480px;margin:0 auto;background:#FFFDF8;border:1px solid #E3D9C6;border-radius:16px;padding:24px 20px;">'
    || '<p style="margin:0 0 16px;font-size:17px;font-weight:700;color:#14213D;">PrePenny</p>'
    || '<p style="margin:0 0 8px;font-size:16px;">' || app.html_text(heading) || '</p>'
    || case when code is null then '' else
         '<p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:6px;font-variant-numeric:tabular-nums;">'
         || app.html_text(code) || '</p>' end
    || coalesce((select string_agg('<p style="margin:0 0 16px;font-size:16px;line-height:1.5;">'
         || app.html_text(line) || '</p>', '' order by n) from unnest(lines) with ordinality as l(line, n)), '')
    || case when link_url is null then '' else
         '<p style="margin:0 0 16px;"><a href="' || app.html_text(link_url) || '" '
         || 'style="display:inline-block;padding:14px 20px;border-radius:12px;background:#14213D;color:#F4EFE6;'
         || 'font-size:16px;font-weight:600;text-decoration:none;">' || app.html_text(link_label) || '</a></p>' end
    || '<p style="margin:0;font-size:14px;line-height:1.5;color:#4A5060;">' || app.html_text(small) || '</p>'
    || '</div><p style="max-width:480px;margin:16px auto 0;font-size:13px;color:#4A5060;text-align:center;">'
    || 'PrePenny. Plan every penny before payday.</p></body></html>'
$$;

-- The address of PrePenny's own site, for links in its emails: the local
-- app in the tests (seed.sql), and prepenny.co.uk on the real project.
alter table app.email_sender add column site text not null default 'https://prepenny.co.uk'
  check (site ~ '^https?://[^/#?]+$');

-- Sends one email, as step 3e's app.send_email, with a button that opens a
-- link. The text version has the link written out after the button's words.
create function app.send_email(to_address text, subject text, heading text, code text,
  lines text[], small text, link_label text, link_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sender app.email_sender;
  words text := heading || coalesce(E'\n\n' || code, '') || E'\n\n' || array_to_string(lines, E'\n\n')
    || coalesce(E'\n\n' || link_label || ': ' || link_url, '')
    || E'\n\n' || small || E'\n\nPrePenny. Plan every penny before payday.';
  html text := app.email_html(heading, code, lines, small, link_label, link_url);
  api_key text;
begin
  select * into sender from app.email_sender;
  if not found then
    perform app.refuse('email-off');
  end if;
  if sender.kind = 'resend' then
    select s.decrypted_secret into api_key from vault.decrypted_secrets s where s.name = 'resend_api_key';
    if api_key is null then
      perform app.refuse('email-off');
    end if;
    perform net.http_post(
      url := sender.url,
      body := jsonb_build_object('from', sender.from_name || ' <' || sender.from_address || '>',
        'to', jsonb_build_array(to_address), 'subject', subject, 'html', html, 'text', words),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || api_key),
      timeout_milliseconds := 10000);
  else
    perform net.http_post(
      url := sender.url,
      body := jsonb_build_object('From', jsonb_build_object('Email', sender.from_address, 'Name', sender.from_name),
        'To', jsonb_build_array(jsonb_build_object('Email', to_address)), 'Subject', subject,
        'HTML', html, 'Text', words),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000);
  end if;
end;
$$;

-- Step 3e's emails without a button go the same way.
create or replace function app.send_email(to_address text, subject text, heading text, code text,
  lines text[], small text) returns void
language sql security definer set search_path = '' as $$
  select app.send_email(to_address, subject, heading, code, lines, small, null, null)
$$;

-- ---------------------------------------------------------------------------
-- 2. Guess-proofing: 3 codes a day for an address, and a 24-hour lock after
-- 10 wrong tries in a day.

-- An address as the tries and locks keep it: scrambled, so addresses typed
-- by people who aren't anyone's are never kept as they were typed.
create function app.address_key(address text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest('prepenny-address:' || coalesce(address, ''), 'sha256'), 'hex')
$$;

-- Each wrong try of a code, for an address and a purpose, for a day.
create table app.code_tries (
  address_key text not null,
  purpose text not null check (purpose in ('add-backup', 'get-in')),
  tried_at timestamptz not null default now()
);

create index code_tries_by_address on app.code_tries (address_key, purpose, tried_at desc);

-- An address locked for a purpose, after 10 wrong tries in a day.
create table app.code_locks (
  address_key text not null,
  purpose text not null check (purpose in ('add-backup', 'get-in')),
  locked_until timestamptz not null,
  primary key (address_key, purpose)
);

alter table app.code_tries enable row level security;
alter table app.code_locks enable row level security;
revoke all on app.code_tries, app.code_locks from public, anon, authenticated;

-- How many codes an address can be sent for a purpose in a day, how many
-- wrong tries in a day lock it, and for how long.
create function app.codes_a_day() returns integer
language sql immutable set search_path = '' as $$ select 3 $$;
create function app.wrong_tries_to_lock() returns integer
language sql immutable set search_path = '' as $$ select 10 $$;
create function app.locked_for() returns interval
language sql immutable set search_path = '' as $$ select interval '24 hours' $$;

-- True while an address is locked for a purpose.
create function app.address_locked(address text, which text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.code_locks l
    where l.address_key = app.address_key(address) and l.purpose = which and l.locked_until > now()
  )
$$;

-- True when another code can be sent to an address for a purpose: it isn't
-- locked, and it has had fewer than 3 in the last 24 hours.
create function app.may_send_code(address text, which text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not app.address_locked(address, which)
    and (select count(*) from app.email_codes c
      where c.email = address and c.purpose = which and c.sent_at > now() - interval '24 hours')
      < app.codes_a_day()
$$;

-- Notes a wrong try for an address, and locks it for 24 hours at the 10th
-- in a day. The tries start again from nothing once it's locked.
create function app.note_wrong_try(address text, which text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  key text := app.address_key(address);
begin
  delete from app.code_tries t where t.tried_at < now() - interval '24 hours';
  delete from app.code_locks l where l.locked_until < now();
  insert into app.code_tries (address_key, purpose) values (key, which);
  if (select count(*) from app.code_tries t
      where t.address_key = key and t.purpose = which and t.tried_at > now() - interval '24 hours')
      >= app.wrong_tries_to_lock() then
    insert into app.code_locks (address_key, purpose, locked_until)
    values (key, which, now() + app.locked_for())
    on conflict (address_key, purpose) do update set locked_until = excluded.locked_until;
    delete from app.code_tries t where t.address_key = key and t.purpose = which;
  end if;
end;
$$;

-- Checks a code against the newest one sent for a purpose and address, as in
-- step 3e: "ok" (and the code is used up), "wrong" or "ran-out" after 10
-- minutes. Now a locked address says "wrong" to every code, the right one
-- too, and every wrong try counts towards the lock, for any address typed,
-- whether or not a code was ever sent to it. The caller doesn't raise on
-- "wrong", so the try counted is kept.
create or replace function app.check_code(which text, address text, person uuid, typed text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  newest app.email_codes;
begin
  if address is null then
    return 'wrong';
  end if;
  if app.address_locked(address, which) then
    return 'wrong';
  end if;
  -- A new code uses up the one before, so there's at most one not used yet.
  select * into newest from app.email_codes c
    where c.purpose = which and c.email = address and c.person_id = person and c.used_at is null
    order by c.sent_at desc limit 1;
  if found and newest.tries < 5 and typed is not null and btrim(typed) ~ '^[0-9]{6}$'
    and app.code_hash(newest.id, btrim(typed)) = newest.code_hash then
    if newest.sent_at < now() - app.code_lasts() then
      return 'ran-out';
    end if;
    update app.email_codes c set used_at = now() where c.id = newest.id;
    return 'ok';
  end if;
  if found then
    update app.email_codes c set tries = c.tries + 1 where c.id = newest.id;
  end if;
  perform app.note_wrong_try(address, which);
  return 'wrong';
end;
$$;

-- Sends a code to an address the person wants as their backup email, as in
-- step 3e. Now the answer is "sent" whenever the address is one, even when
-- it's had its 3 codes today or is locked, so nobody can tell either; the
-- screen says a code may take a minute, and that 3 can be sent a day.
-- Asking again within a minute still says how long to wait: that's about
-- this person's own last request, never anyone else's.
create or replace function public.add_backup_email(email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text := app.email_address(email);
  code text := app.new_code();
  code_id uuid := gen_random_uuid();
  last_sent timestamptz;
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  if not app.second_step_fresh() then
    perform app.refuse('second-step-needed', '42501');
  end if;
  if address is null then
    perform app.refuse('bad-email');
  end if;
  if exists (select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = address) then
    perform app.refuse('same-as-sign-in');
  end if;
  select max(c.sent_at) into last_sent from app.email_codes c
    where c.person_id = auth.uid() and c.purpose = 'add-backup';
  if last_sent > now() - interval '1 minute' then
    return jsonb_build_object('sent', false,
      'wait', ceil(extract(epoch from last_sent + interval '1 minute' - now()))::integer);
  end if;
  if not app.may_send_code(address, 'add-backup') then
    return jsonb_build_object('sent', true);
  end if;
  update app.email_codes c set used_at = now()
    where c.person_id = auth.uid() and c.purpose = 'add-backup' and c.used_at is null;
  insert into app.email_codes (id, purpose, person_id, email, code_hash)
    values (code_id, 'add-backup', auth.uid(), address, app.code_hash(code_id, code));
  perform app.send_email(address, 'Your PrePenny code to add a backup email',
    'Your PrePenny code is', code,
    array['Type it into PrePenny to make this your backup email address. It lasts 10 minutes.',
      'A backup email lets you get back into PrePenny if you can''t get into the email address you sign in with.'],
    'If you didn''t ask for this, you can ignore this email. This address isn''t added without the code.');
  return jsonb_build_object('sent', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Getting back in waits 24 hours, with a cancel.

-- Each request to get back in with a backup email, from the code typed at
-- the backup to the end of its wait. Nothing on the account changes until
-- it's finished.
create table app.get_back_in (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references auth.users (id) on delete cascade,
  -- The backup email it was asked from.
  backup_email text not null check (backup_email = lower(backup_email)),
  started_at timestamptz not null default now(),
  -- The stop link's token, scrambled. Gone once the request has ended, so
  -- the link never works again. While it's finishing, the link does nothing.
  stop_hash text unique,
  stopped_at timestamptz,
  stopped_how text check (stopped_how in ('link', 'device', 'backup-changed', 'ran-out')),
  -- The moment the finishing code was accepted: from then on it can't be
  -- stopped. Set back to null if Supabase's admin route couldn't make the change.
  finishing_at timestamptz,
  -- The address the account signed in with when it was finished, to tell.
  old_email text,
  done_at timestamptz,
  check (stopped_at is null or done_at is null)
);

-- One request open at a time for each person.
create unique index get_back_in_one_open on app.get_back_in (person_id)
  where stopped_at is null and done_at is null;

alter table app.get_back_in enable row level security;
revoke all on app.get_back_in from public, anon, authenticated;

-- How long a request waits before it can be finished, and how long after
-- that it can still be finished before it runs out and has to start again.
create function app.get_back_in_wait() returns interval
language sql immutable set search_path = '' as $$ select interval '24 hours' $$;
create function app.get_back_in_lasts() returns interval
language sql immutable set search_path = '' as $$ select interval '7 days' $$;

-- The codes sent to a backup email to get back in say what typing them does
-- ("start", "wait" or "finish"), and a code to finish names its request.
alter table app.email_codes add column stage text check (stage in ('start', 'wait', 'finish'));
alter table app.email_codes add column request_id uuid references app.get_back_in (id) on delete cascade;

-- The person's open request, or null: not stopped, not done, and not run
-- out. One that has run out is marked so, and its stop link stops working.
create function app.open_get_back_in(person uuid) returns app.get_back_in
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_one app.get_back_in;
begin
  update app.get_back_in r set stopped_at = now(), stopped_how = 'ran-out', stop_hash = null
    where r.person_id = person and r.stopped_at is null and r.done_at is null and r.finishing_at is null
      and r.started_at <= now() - app.get_back_in_wait() - app.get_back_in_lasts();
  select * into found_one from app.get_back_in r
    where r.person_id = person and r.stopped_at is null and r.done_at is null;
  return found_one;
end;
$$;

-- When a request can be finished.
create function app.ready_at(request app.get_back_in) returns timestamptz
language sql immutable set search_path = '' as $$
  select request.started_at + app.get_back_in_wait()
$$;

-- A time as the phone reads it: UTC, to the second.
create function app.utc_words(moment timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(moment at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
$$;

-- An unguessable token for a stop link: 32 bytes from the database's secure
-- random numbers, written so it fits in a web address.
create function app.new_token() returns text
language sql volatile set search_path = '' as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=')
$$;

create function app.token_hash(token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest('prepenny-stop:' || coalesce(token, ''), 'sha256'), 'hex')
$$;

-- Tells the backup email that a request to get back in with it was stopped,
-- and how, and nudges the person's phones so the notice goes.
create function app.tell_stopped(request app.get_back_in, how text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.nudge_my_phones(request.person_id);
  perform app.send_email(request.backup_email, 'Getting back into PrePenny was stopped',
    'Getting back into your PrePenny account was stopped', null,
    array[case how
        when 'link' then 'It was stopped with the link we sent to the address the account signs in with, so nothing on the account has changed.'
        when 'device' then 'It was stopped on a phone or computer signed in to the account, so nothing on the account has changed.'
        else 'The account''s backup email was changed or removed, so nothing on the account has changed.'
      end,
      'If you asked to get back in and still can''t get into the address you sign in with, write to hello@prepenny.co.uk.'],
    'If you didn''t ask to get back in, you can ignore this email.');
end;
$$;

-- Starts a request: nothing on the account changes. The address the account
-- signs in with is told at once, with a link that can only stop it, and
-- every signed-in phone is nudged so its notice shows straight away.
create function app.start_get_back_in(person uuid, backup text) returns app.get_back_in
language plpgsql security definer set search_path = '' as $$
declare
  token text := app.new_token();
  started app.get_back_in;
  sign_in_email text;
  site text;
begin
  insert into app.get_back_in (person_id, backup_email, stop_hash)
    values (person, backup, app.token_hash(token))
    returning * into started;
  select u.email into sign_in_email from auth.users u where u.id = person;
  select s.site into site from app.email_sender s;
  if sign_in_email is not null and sign_in_email <> '' then
    perform app.send_email(sign_in_email, 'Someone asked to get into your PrePenny account',
      'Someone asked to get into your PrePenny account', null,
      array['At ' || app.when_words(started.started_at) || ', someone typed a code sent to your backup email, '
          || backup || ', to get into your account.',
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

-- Stops every open request of the person's, as when their backup email is
-- changed or removed, and tells the backup each was started from.
create function app.stop_get_back_in_for(person uuid, how text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  stopped app.get_back_in;
  how_many integer := 0;
begin
  for stopped in
    update app.get_back_in r set stopped_at = now(), stopped_how = how, stop_hash = null
      where r.person_id = person and r.stopped_at is null and r.done_at is null and r.finishing_at is null
      returning *
  loop
    perform app.tell_stopped(stopped, how);
    how_many := how_many + 1;
  end loop;
  return how_many;
end;
$$;

-- "Can't get into your email?": sends a code to an address, if it's
-- someone's backup email, unless it has had 3 today or is locked. The
-- answer is the same whatever happens, so nobody can find out which
-- addresses are backups, or which are locked. The email says what typing
-- the code will do: ask to get back in, see when it can be finished, or
-- finish. Anyone can ask, signed in or not.
create or replace function public.send_get_in_code(email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text := app.email_address(email);
  backup app.backup_emails;
  open_one app.get_back_in;
  code text := app.new_code();
  code_id uuid := gen_random_uuid();
  stage text;
begin
  if app.version_problem() is not null then
    perform app.refuse(app.version_problem());
  end if;
  if not exists (select 1 from app.email_sender) then
    perform app.refuse('email-off');
  end if;
  if address is null then
    perform app.refuse('bad-email');
  end if;
  select * into backup from app.backup_emails b where b.email = address;
  if found
    and app.may_send_code(address, 'get-in')
    and not exists (select 1 from app.email_codes c where c.email = address and c.purpose = 'get-in'
      and c.sent_at > now() - interval '1 minute') then
    open_one := app.open_get_back_in(backup.person_id);
    stage := case
      when open_one.id is null then 'start'
      when now() < app.ready_at(open_one) then 'wait'
      else 'finish' end;
    update app.email_codes c set used_at = now()
      where c.email = address and c.purpose = 'get-in' and c.used_at is null;
    insert into app.email_codes (id, purpose, person_id, email, code_hash, stage, request_id)
      values (code_id, 'get-in', backup.person_id, address, app.code_hash(code_id, code), stage,
        case when stage = 'start' then null else open_one.id end);
    if stage = 'start' then
      perform app.send_email(address, 'Your PrePenny code to get back in',
        'Your PrePenny code is', code,
        array['Type it into PrePenny to ask to get back into your account. It lasts 10 minutes.',
          'For your safety, nothing changes for 24 hours, and we tell the address you sign in with now, so it can be stopped if it wasn''t you. After 24 hours, ask for a new code to finish.'],
        'If you didn''t ask for this, you can ignore this email. Nothing changes without the code.');
    elsif stage = 'wait' then
      perform app.send_email(address, 'Your PrePenny code to get back in',
        'Your PrePenny code is', code,
        array['Type it into PrePenny to see when you can finish getting back in. It lasts 10 minutes.',
          'You''ve already asked to get back in. You can finish from ' || app.when_words(app.ready_at(open_one))
            || ': ask for a new code then.'],
        'If you didn''t ask for this, you can ignore this email. Nothing changes without the code.');
    else
      perform app.send_email(address, 'Your PrePenny code to finish getting back in',
        'Your PrePenny code is', code,
        array['Type it into PrePenny to finish getting back into your account. It lasts 10 minutes.',
          'Once it''s typed, this address becomes the one you sign in with, and every phone and computer signed in to your account is signed out.'],
        'If you didn''t ask for this, you can ignore this email, and tell us at hello@prepenny.co.uk.');
    end if;
  end if;
  return jsonb_build_object('sent', true);
end;
$$;

-- Step 3e's step that changed the sign-in address straight away is gone:
-- typing the code now goes through Supabase's admin route
-- (supabase/functions/get-back-in), which calls the three steps below.
drop function public.use_get_in_code(text, text);

-- True when the Data API request is made with Supabase's secret key, as
-- the get-back-in function makes it. Nobody else can call the steps below.
create function app.from_supabase_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

-- The code typed at the backup email, from the get-back-in function:
-- - wrong, or for an address that's nobody's backup, or locked: {in: false},
--   the same each time;
-- - right, with nothing open: a request starts, and nothing on the account
--   changes: {in: true, state: "waiting", ready_at};
-- - right, while it waits: {in: true, state: "waiting", ready_at};
-- - right, after 24 hours, but sent before then: {in: true, state: "new-code"};
-- - right, sent after 24 hours to finish: the request can no longer be
--   stopped, and the function is given what it needs to make the change
--   through Supabase's admin route: {in: true, state: "finish", ...}.
create function public.get_back_in_with_code(email text, code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text := app.email_address(email);
  backup app.backup_emails;
  used app.email_codes;
  open_one app.get_back_in;
  in_the_way uuid;
begin
  if not app.from_supabase_admin() then
    perform app.refuse('not-allowed', '42501');
  end if;
  if app.version_problem() is not null then
    perform app.refuse(app.version_problem());
  end if;
  select * into backup from app.backup_emails b where b.email = address;
  if address is null or not found then
    perform app.check_code('get-in', address, null, code);
    return jsonb_build_object('in', false);
  end if;
  if app.check_code('get-in', address, backup.person_id, code) <> 'ok' then
    return jsonb_build_object('in', false);
  end if;
  select * into used from app.email_codes c
    where c.purpose = 'get-in' and c.email = address and c.person_id = backup.person_id
      and c.used_at is not null
    order by c.used_at desc, c.sent_at desc limit 1;
  open_one := app.open_get_back_in(backup.person_id);
  if open_one.id is null then
    open_one := app.start_get_back_in(backup.person_id, address);
    return jsonb_build_object('in', true, 'state', 'waiting', 'ready_at', app.utc_words(app.ready_at(open_one)));
  end if;
  if now() < app.ready_at(open_one) then
    return jsonb_build_object('in', true, 'state', 'waiting', 'ready_at', app.utc_words(app.ready_at(open_one)));
  end if;
  if used.stage is distinct from 'finish' or used.request_id is distinct from open_one.id
    or used.sent_at < app.ready_at(open_one) or open_one.backup_email <> address then
    return jsonb_build_object('in', true, 'state', 'new-code');
  end if;
  -- Someone else signs in with this address now, by email or with Google:
  -- it can't be this account's. (Supabase's admin route checks only the
  -- first itself.)
  if exists (select 1 from auth.users u where lower(u.email) = address and u.id <> backup.person_id
      and u.email_confirmed_at is not null)
    or exists (select 1 from auth.identities i join auth.users u on u.id = i.user_id
      where i.email = address and i.user_id <> backup.person_id and u.email_confirmed_at is not null) then
    return jsonb_build_object('in', true, 'state', 'in-use');
  end if;
  -- A sign-up with this address that was never confirmed holds nothing; the
  -- function removes it through the admin route, as it's in the way.
  select u.id into in_the_way from auth.users u
    where lower(u.email) = address and u.id <> backup.person_id and u.email_confirmed_at is null
    limit 1;
  update app.get_back_in r set finishing_at = now(),
      old_email = (select u.email from auth.users u where u.id = backup.person_id)
    where r.id = open_one.id;
  return jsonb_build_object('in', true, 'state', 'finish', 'request', open_one.id,
    'person', backup.person_id, 'email', address, 'in_the_way', in_the_way);
end;
$$;

-- Once Supabase's admin route has made the backup the sign-in address:
-- every device is signed out and nudged, the backup is used up, and the old
-- address is told. Called once; a second call does nothing.
create function public.get_back_in_finished(request uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  done app.get_back_in;
begin
  if not app.from_supabase_admin() then
    perform app.refuse('not-allowed', '42501');
  end if;
  update app.get_back_in r set done_at = now(), stop_hash = null
    where r.id = request and r.finishing_at is not null and r.done_at is null
      and exists (select 1 from auth.users u where u.id = r.person_id and lower(u.email) = r.backup_email)
    returning * into done;
  if not found then
    return jsonb_build_object('done', false);
  end if;
  delete from app.backup_emails b where b.person_id = done.person_id;
  update app.email_codes c set used_at = now() where c.person_id = done.person_id and c.used_at is null;
  -- Every device is nudged to look at once, and finds it's signed out. Its
  -- refresh tokens go with its session, as with Supabase's own sign-out.
  perform app.nudge_my_phones(done.person_id);
  delete from auth.sessions s where s.user_id = done.person_id;
  delete from app.devices d where d.person_id = done.person_id;
  if done.old_email is not null and done.old_email <> '' and lower(done.old_email) <> done.backup_email then
    perform app.send_email(done.old_email, 'Your PrePenny sign-in email has changed',
      'Your PrePenny sign-in email has changed', null,
      array['Your backup email, ' || done.backup_email || ', was used to get back into your PrePenny account, so it''s now the address you sign in with, in place of this one.',
        'It was asked for at ' || app.when_words(done.started_at) || ', and nobody stopped it in the 24 hours after.',
        'Every phone and computer that was signed in to your account has been signed out.'],
      'If this wasn''t you, reply to this email straight away.');
  end if;
  return jsonb_build_object('done', true);
end;
$$;

-- When Supabase's admin route couldn't make the change, the request is as
-- it was before the finishing code: still open, and still able to be
-- stopped, with the same link.
create function public.get_back_in_not_finished(request uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.from_supabase_admin() then
    perform app.refuse('not-allowed', '42501');
  end if;
  update app.get_back_in r set finishing_at = null, old_email = null
    where r.id = request and r.finishing_at is not null and r.done_at is null;
  return jsonb_build_object('reopened', found);
end;
$$;

-- "Stop it", on a phone or computer signed in to the account: stops the
-- person's own open request, never anyone else's. Nothing else.
create function public.stop_get_back_in() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  return jsonb_build_object('stopped', app.stop_get_back_in_for(auth.uid(), 'device') > 0,
    'now', app.server_time());
end;
$$;

-- The stop link in the email to the sign-in address. It stops that one
-- request, once, and can do nothing else: it signs nobody in or out, and
-- says nothing about the account. A link that's been used, or whose request
-- has ended, or that was never one, says {stopped: false}.
create function public.stop_get_back_in_with_link(token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  stopped app.get_back_in;
begin
  if app.version_problem() is not null then
    perform app.refuse(app.version_problem());
  end if;
  if token is null or token !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('stopped', false);
  end if;
  update app.get_back_in r set stopped_at = now(), stopped_how = 'link', stop_hash = null
    where r.stop_hash = app.token_hash(token) and r.stopped_at is null and r.done_at is null
      and r.finishing_at is null
      and r.started_at > now() - app.get_back_in_wait() - app.get_back_in_lasts()
    returning * into stopped;
  if not found then
    return jsonb_build_object('stopped', false);
  end if;
  perform app.tell_stopped(stopped, 'link');
  return jsonb_build_object('stopped', true);
end;
$$;

-- A changed or removed backup email stops any request made with the old one.
create or replace function public.confirm_backup_email(email text, code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text := app.email_address(email);
  checked text;
  sign_in_email text;
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  checked := app.check_code('add-backup', address, auth.uid(), code);
  if checked <> 'ok' then
    return jsonb_build_object('added', false, 'problem', checked);
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = address and u.id <> auth.uid())
    or exists (select 1 from app.backup_emails b where b.email = address and b.person_id <> auth.uid()) then
    perform app.refuse('in-use');
  end if;
  if exists (select 1 from app.backup_emails b where b.person_id = auth.uid() and b.email <> address) then
    perform app.stop_get_back_in_for(auth.uid(), 'backup-changed');
  end if;
  insert into app.backup_emails as b (person_id, email) values (auth.uid(), address)
  on conflict (person_id) do update set email = excluded.email, added_at = now();
  select u.email into sign_in_email from auth.users u where u.id = auth.uid();
  if sign_in_email is not null and sign_in_email <> '' then
    perform app.send_email(sign_in_email, 'A backup email was added to your PrePenny account',
      'Your PrePenny account has a new backup email', null,
      array[address || ' is now the backup email for your PrePenny account. It can be used to get back in if you can''t get into this address.',
        'You can change it or remove it in PrePenny: More, then Email addresses.'],
      'If this wasn''t you, reply to this email straight away.');
  end if;
  return jsonb_build_object('added', true);
end;
$$;

create or replace function public.remove_backup_email() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  if not app.second_step_fresh() then
    perform app.refuse('second-step-needed', '42501');
  end if;
  perform app.stop_get_back_in_for(auth.uid(), 'backup-changed');
  delete from app.backup_emails b where b.person_id = auth.uid();
  update app.email_codes c set used_at = now()
    where c.person_id = auth.uid() and c.purpose = 'add-backup' and c.used_at is null;
  return jsonb_build_object('removed', true);
end;
$$;

-- What a signed-in phone asks when PrePenny opens and every minute, as in
-- step 3e, now also with the person's open request to get back in, if
-- there is one: when it was asked for and when it could be finished, so
-- every signed-in device shows the notice with "Stop it".
create or replace function public.hello() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  standing text;
  problem text := app.version_problem();
  open_one app.get_back_in;
  asked jsonb;
begin
  if not exists (
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
      open_one := app.open_get_back_in(auth.uid());
      if open_one.id is not null and open_one.finishing_at is null then
        asked := jsonb_build_object('started_at', app.utc_words(open_one.started_at),
          'ready_at', app.utc_words(app.ready_at(open_one)));
      end if;
    end if;
  end if;
  return jsonb_build_object('sign_in', standing, 'version', coalesce(problem, 'ok'),
    'now', app.server_time(), 'get_back_in', asked);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. "Sign out of all other devices": every device of the person's but this
-- one, once the second step has been passed in the last 5 minutes if it's
-- on. This device stays signed in. Replaces "Sign out everywhere".

drop function public.end_every_device();

create function public.end_other_devices() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  ended integer;
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  if not app.second_step_fresh() then
    perform app.refuse('second-step-needed', '42501');
  end if;
  delete from auth.sessions s where s.user_id = auth.uid() and s.id <> app.session_id();
  get diagnostics ended = row_count;
  delete from app.devices d where d.person_id = auth.uid() and d.session_id <> app.session_id();
  perform app.nudge_my_phones(auth.uid());
  return jsonb_build_object('ended', ended, 'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can use which function, as at the end of every migration that adds to
-- `app` (00-every-table.test.sql): everything taken back, then only what the
-- rules and the phone's steps call given to signed-in people; to someone
-- who isn't signed in, asking for a code at a backup email and the stop
-- link; and the three steps for finishing with a code to Supabase's admin
-- key only, which the get-back-in function uses.

revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on function public.send_get_in_code(text), public.get_back_in_with_code(text, text),
  public.get_back_in_finished(uuid), public.get_back_in_not_finished(uuid),
  public.stop_get_back_in(), public.stop_get_back_in_with_link(text), public.end_other_devices(),
  public.add_backup_email(text), public.confirm_backup_email(text, text), public.remove_backup_email(),
  public.hello()
  from public, anon, authenticated;
grant execute on function
  app.session_id(), app.session_ok(), app.my_plans(), app.my_edit_plans(),
  app.my_owned_plans(), app.my_partners(), app.my_own_pay(), app.refuse(text, text),
  app.from_a_person(), app.check_chosen_privacy(uuid, uuid, text, uuid, uuid),
  app.check_link(uuid, boolean, uuid), app.account_privacy(uuid, uuid),
  app.family_problem(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid),
  app.record_tables(), app.begin_edit(uuid, uuid, text, text), app.nudge(uuid, boolean),
  app.send_nudge(text), app.family_rules_problem(uuid, uuid[]), app.sent_columns(text), app.may_hear(text),
  app.server_time(), app.tell_clashes(uuid, uuid, jsonb)
  to authenticated;
grant execute on function public.hello(), public.end_other_devices(), public.add_backup_email(text),
  public.confirm_backup_email(text, text), public.remove_backup_email(), public.stop_get_back_in(),
  public.send_get_in_code(text), public.stop_get_back_in_with_link(text)
  to authenticated;
grant execute on function public.send_get_in_code(text), public.stop_get_back_in_with_link(text) to anon;
grant execute on function public.get_back_in_with_code(text, text), public.get_back_in_finished(uuid),
  public.get_back_in_not_finished(uuid) to service_role;
