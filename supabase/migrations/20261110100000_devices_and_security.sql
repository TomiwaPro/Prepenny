-- Step 3e: signed-in devices and extra security (brief 4.13, D21), and a
-- phone on an older version of PrePenny never quietly keeping a different
-- plan.
--
-- 1. The version check. Every request through the Data API names the
--    version of the database the app was built for, in a header
--    (x-prepenny-version: the newest migration the app knows). An app
--    built for an older database, or a newer one, gets no plan data and
--    can save nothing, so a phone left on an old version can't quietly
--    keep a different plan: its changes wait on the phone until it has
--    updated itself. The database's own work, its tests and Realtime don't
--    come through the Data API, and aren't checked.
-- 2. Two-step sign-in with an authenticator app (Supabase's own). Once
--    someone has turned it on, a sign-in that hasn't passed the second
--    step gets nothing: app.session_ok(), which every privacy rule and
--    every step the phone calls goes through, says no. Signing out
--    everywhere, and adding or removing a backup email, need the second
--    step to have been passed in the last 5 minutes; Supabase's own
--    sign-in service already refuses turning it off or changing the email
--    address without the second step, and the triggers here make those
--    need it in the last 5 minutes too.
-- 3. Signed-in devices. Each person sees their own sign-in sessions, with a
--    plain name worked out from the browser's own description (never an IP
--    address or a place) and when each was last used, and can end one or
--    all. An ended session's very next request gets nothing (D21, step 3a),
--    and the person's phones are nudged to look straight away.
-- 4. A backup email, to get back in when the main one is lost: added only
--    with a code sent to it, from a sign-in that has passed the second step
--    if it's on. Getting back in needs a code sent to it as well; then it
--    becomes the sign-in address, every device is signed out, and the old
--    address is told. The emails are sent from the database itself
--    (pg_net), to the local test inbox here and to Resend on the real
--    project, and hold no amount, payment name or note.
-- 5. The device that made each change, so a notice about a change a newer
--    one replaced can be shown by the person's other phone too (PLAN.md
--    item 39).
--
-- Nothing here is ever written to a log or an error with an email address
-- or anything about money (CLAUDE.md): every refusal is a short code.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. The version check.

-- The version of this database: the newest migration it has.
create function app.database_version() returns text
language sql stable security definer set search_path = '' as $$
  select max(version)::text from supabase_migrations.schema_migrations
$$;

-- What's wrong with the version of the app asking, or null when nothing
-- is: "update-needed" for an app built for an older database, as a phone
-- still running the PrePenny from before an update, and "server-behind"
-- for one built for a newer database, in the minutes after an update while
-- the database is still being changed. Only a request through the Data API
-- is checked.
create function app.version_problem() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  sent text;
  newest text;
begin
  if coalesce(current_setting('request.path', true), '') = '' then
    return null;
  end if;
  newest := app.database_version();
  if newest is null then
    return null;
  end if;
  begin
    sent := current_setting('request.headers', true)::jsonb ->> 'x-prepenny-version';
  exception when others then
    sent := null;
  end;
  if sent is null or sent !~ '^[0-9]{14}$' or sent < newest then
    return 'update-needed';
  end if;
  if sent > newest then
    return 'server-behind';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Two-step sign-in.

-- True when the person has turned on two-step sign-in: an authenticator
-- app checked once, so its codes now work.
create function app.two_step_on(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.mfa_factors f where f.user_id = person and f.status = 'verified'
  )
$$;

-- True when the session in the person's token has passed the second step,
-- both in Supabase's own record of it and in the token itself, which says
-- so only once the code has been checked.
create function app.second_step_passed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = app.session_id() and s.user_id = auth.uid() and s.aal = 'aal2'
  ) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- True while the sign-in session in the person's token still exists (D21),
-- from an app on the version this database expects, and, once the person
-- has turned on two-step sign-in, after the second step. Every privacy rule
-- and every step the phone calls goes through it.
create or replace function app.session_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.version_problem() is null
    and exists (
      select 1 from auth.sessions s
      where s.id = app.session_id()
        and s.user_id = auth.uid()
        and (s.not_after is null or s.not_after > now())
    )
    and (not app.two_step_on(auth.uid()) or app.second_step_passed())
$$;

-- True when the person has no two-step sign-in, or this session typed a
-- code from the authenticator app in the last 5 minutes. For signing out
-- everywhere and changing the backup email: someone who picks up a phone
-- left signed in can't do either without the authenticator app.
create function app.second_step_fresh() returns boolean
language sql stable security definer set search_path = '' as $$
  select not app.two_step_on(auth.uid()) or exists (
    select 1 from auth.mfa_amr_claims c
    where c.session_id = app.session_id()
      and c.authentication_method = 'totp'
      and c.updated_at > now() - interval '5 minutes'
  )
$$;

-- Supabase's sign-in service refuses to turn two-step sign-in off, or to
-- change the email address, from a sign-in that hasn't passed the second
-- step. These make both need a code typed in the last 5 minutes too, on
-- any of the person's sessions: the service doesn't say which session is
-- asking. Removing a whole account, which removes its factors with it, is
-- never held up.
create function app.fresh_second_step_to_turn_off() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'verified'
    and exists (select 1 from auth.users u where u.id = old.user_id)
    and not exists (
      select 1 from auth.mfa_amr_claims c join auth.sessions s on s.id = c.session_id
      where s.user_id = old.user_id and c.authentication_method = 'totp'
        and c.updated_at > now() - interval '5 minutes'
    ) then
    perform app.refuse('second-step-needed', '42501');
  end if;
  return old;
end;
$$;

create trigger fresh_second_step before delete on auth.mfa_factors
  for each row execute function app.fresh_second_step_to_turn_off();

create function app.fresh_second_step_to_change_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.email_change, '') <> ''
    and new.email_change is distinct from old.email_change
    and app.two_step_on(new.id)
    and not exists (
      select 1 from auth.mfa_amr_claims c join auth.sessions s on s.id = c.session_id
      where s.user_id = new.id and c.authentication_method = 'totp'
        and c.updated_at > now() - interval '5 minutes'
    ) then
    perform app.refuse('second-step-needed', '42501');
  end if;
  return new;
end;
$$;

create trigger fresh_second_step before update on auth.users
  for each row execute function app.fresh_second_step_to_change_email();

-- ---------------------------------------------------------------------------
-- 3. Signed-in devices.

-- The kind of browser in a browser's own description of itself, as a code
-- the phone turns into words: "chrome", "safari", "firefox", "edge",
-- "samsung", "opera", or "" when it can't tell, as for an app added to an
-- iPhone's home screen.
create function app.browser_of(description text) returns text
language sql immutable set search_path = '' as $$
  select case
    when description is null then ''
    when description ~ 'SamsungBrowser' then 'samsung'
    when description ~ '(Edg/|EdgA/|EdgiOS/)' then 'edge'
    when description ~ '(OPR/|OPiOS/)' then 'opera'
    when description ~ '(Firefox/|FxiOS/)' then 'firefox'
    when description ~ '(Chrome/|CriOS/)' then 'chrome'
    when description ~ 'Safari/' then 'safari'
    else ''
  end
$$;

-- The kind of device, as a code: "iphone", "ipad", "android-phone",
-- "android-tablet", "chromebook", "windows", "mac", "linux", or "".
create function app.device_of(description text) returns text
language sql immutable set search_path = '' as $$
  select case
    when description is null then ''
    when description ~ 'iPhone' then 'iphone'
    when description ~ 'iPad' then 'ipad'
    when description ~ 'Android' and description ~ 'Mobile' then 'android-phone'
    when description ~ 'Android' then 'android-tablet'
    when description ~ 'CrOS' then 'chromebook'
    when description ~ 'Windows' then 'windows'
    when description ~ 'Macintosh|Mac OS X' then 'mac'
    when description ~ 'Linux' then 'linux'
    else ''
  end
$$;

-- When each device was last used, for the list of signed-in devices. Only
-- its own person ever reads it (brief 4.14: nothing shows a partner when
-- someone last opened the app). Kept here, outside what the Data API shows.
create table app.devices (
  session_id uuid primary key,
  person_id uuid not null references auth.users (id) on delete cascade,
  last_used_at timestamptz not null default now()
);

-- Asked by a signed-in phone before it sends changes or brings the plan
-- down, when PrePenny opens and every minute while it's open: whether its
-- sign-in still stands ("ok", "ended", or "second-step" when two-step
-- sign-in is on and this sign-in hasn't passed it yet), whether it's on
-- the version this database expects ("ok", "update-needed" or
-- "server-behind"), and the server's time. Notes when this device was
-- last used, at most once a minute.
create function public.hello() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  standing text;
  problem text := app.version_problem();
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
    end if;
  end if;
  return jsonb_build_object('sign_in', standing, 'version', coalesce(problem, 'ok'),
    'now', app.server_time());
end;
$$;

-- The person's own signed-in devices, this one first, then the most
-- recently used: an id, the kind of browser and device as codes, whether
-- it's this one, and when it was last used. Never an IP address or a place.
create function public.my_devices() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  delete from app.devices d
  where d.person_id = auth.uid()
    and not exists (select 1 from auth.sessions s where s.id = d.session_id);
  return jsonb_build_object('devices', coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'browser', app.browser_of(s.user_agent),
        'device', app.device_of(s.user_agent),
        'this', s.id = app.session_id(),
        'last_used_at', to_char(greatest(d.last_used_at, s.refreshed_at at time zone 'utc',
          s.created_at) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
      order by (s.id = app.session_id()) desc,
        greatest(d.last_used_at, s.refreshed_at at time zone 'utc', s.created_at) desc)
    from auth.sessions s
    left join app.devices d on d.session_id = s.id
    where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
  ), '[]'::jsonb), 'now', app.server_time());
end;
$$;

-- Nudges every phone of the person's, so an ended one looks at once and
-- finds it's signed out, rather than at its next minute.
create function app.nudge_my_phones(person uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  plan uuid;
begin
  for plan in select m.plan_id from public.plan_members m where m.person_id = person and m.left_at is null loop
    perform app.send_nudge('plan:' || plan || ':' || person);
  end loop;
end;
$$;

-- "Sign out of this device", for one of the person's own devices. Ending
-- someone else's is refused exactly as one that doesn't exist.
create function public.end_device(device uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  delete from auth.sessions s where s.id = device and s.user_id = auth.uid();
  if not found then
    perform app.refuse('not-found', '42501');
  end if;
  delete from app.devices d where d.session_id = device;
  perform app.nudge_my_phones(auth.uid());
  return jsonb_build_object('ended', 1, 'now', app.server_time());
end;
$$;

-- "Sign out everywhere": every device of the person's, this one included,
-- once the second step has been passed in the last 5 minutes if it's on.
create function public.end_every_device() returns jsonb
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
  perform app.nudge_my_phones(auth.uid());
  delete from auth.sessions s where s.user_id = auth.uid();
  get diagnostics ended = row_count;
  delete from app.devices d where d.person_id = auth.uid();
  return jsonb_build_object('ended', ended, 'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A backup email, and getting back in with it.

-- Who sends PrePenny's own emails: the local test inbox here, set by
-- seed.sql, or Resend on the real project, set by the Database workflow
-- (app.use_resend). With neither, nothing is sent, and the steps that need
-- an email say so ("email-off").
create table app.email_sender (
  only_one boolean primary key default true check (only_one),
  kind text not null check (kind in ('test-inbox', 'resend')),
  url text not null,
  from_address text not null default 'hello@prepenny.co.uk',
  from_name text not null default 'PrePenny'
);

-- Each person's backup email, once it has been checked with a code: one
-- each, and never the same as anyone else's.
create table app.backup_emails (
  person_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (email = lower(email)),
  added_at timestamptz not null default now()
);

create unique index backup_emails_one_each on app.backup_emails (email);

-- The codes sent to a backup email, scrambled, to add it ("add-backup") or
-- to get back in with it ("get-in"). A code lasts 10 minutes and takes 5
-- tries at most; a new one replaces the last.
create table app.email_codes (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('add-backup', 'get-in')),
  person_id uuid not null references auth.users (id) on delete cascade,
  email text not null check (email = lower(email)),
  code_hash text not null,
  sent_at timestamptz not null default now(),
  tries smallint not null default 0,
  used_at timestamptz
);

create index email_codes_by_address on app.email_codes (email, purpose, sent_at desc);

alter table app.email_sender enable row level security;
alter table app.backup_emails enable row level security;
alter table app.email_codes enable row level security;
alter table app.devices enable row level security;
revoke all on app.email_sender, app.backup_emails, app.email_codes, app.devices
  from public, anon, authenticated;

-- A code lasts this long, and a new one can be asked for once a minute, 5 an hour.
create function app.code_lasts() returns interval
language sql immutable set search_path = '' as $$ select interval '10 minutes' $$;

-- An email address as PrePenny keeps it, or null when it isn't one.
create function app.email_address(typed text) returns text
language sql immutable set search_path = '' as $$
  select case
    when lower(btrim(typed)) ~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'
      and length(btrim(typed)) <= 254
      then lower(btrim(typed))
  end
$$;

-- Text made safe to put in an email's HTML.
create function app.html_text(words text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(words, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

-- A new 6-digit code, from the database's secure random numbers.
create function app.new_code() returns text
language sql volatile set search_path = '' as $$
  select lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0')
$$;

create function app.code_hash(code_id uuid, code text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(code_id::text || ':' || code, 'sha256'), 'hex')
$$;

-- One of PrePenny's emails, laid out like the sign-in email
-- (supabase/templates/sign-in-code.html, DESIGN.md's colours): the heading,
-- a code if there is one, then each line.
create function app.email_html(heading text, code text, lines text[], small text) returns text
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
    || '<p style="margin:0;font-size:14px;line-height:1.5;color:#4A5060;">' || app.html_text(small) || '</p>'
    || '</div><p style="max-width:480px;margin:16px auto 0;font-size:13px;color:#4A5060;text-align:center;">'
    || 'PrePenny. Plan every penny before payday.</p></body></html>'
$$;

-- Sends one email, after this request's changes are saved: pg_net sends it
-- from the database's own queue once the request has finished, so nothing
-- is sent for a request that's refused. Nothing about it is written to a log.
create function app.send_email(to_address text, subject text, heading text, code text,
  lines text[], small text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sender app.email_sender;
  words text := heading || coalesce(E'\n\n' || code, '') || E'\n\n' || array_to_string(lines, E'\n\n')
    || E'\n\n' || small || E'\n\nPrePenny. Plan every penny before payday.';
  html text := app.email_html(heading, code, lines, small);
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

-- Set by the Database workflow on the real project, with GitHub's
-- RESEND_API_KEY: PrePenny's own emails go through Resend, from
-- hello@prepenny.co.uk, as the sign-in emails do. The key is kept in
-- Supabase's Vault, never in a table. Only the database's administrator
-- can run it.
create function app.use_resend(key text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  kept uuid;
begin
  if key is null or key !~ '^re_[A-Za-z0-9_]+$' then
    perform app.refuse('bad-key');
  end if;
  select s.id into kept from vault.secrets s where s.name = 'resend_api_key';
  if kept is null then
    perform vault.create_secret(key, 'resend_api_key', 'For PrePenny''s own emails (step 3e)');
  else
    perform vault.update_secret(kept, key);
  end if;
  insert into app.email_sender (kind, url) values ('resend', 'https://api.resend.com/emails')
  on conflict (only_one) do update set kind = 'resend', url = 'https://api.resend.com/emails';
end;
$$;

-- The person's backup email, or null.
create function public.backup_email() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  return (select jsonb_build_object('email', b.email, 'added_at', b.added_at)
    from app.backup_emails b where b.person_id = auth.uid());
end;
$$;

-- Sends a code to an address the person wants as their backup email. It's
-- added only once that code is typed in (confirm_backup_email). Needs the
-- second step in the last 5 minutes when two-step sign-in is on.
create function public.add_backup_email(email text) returns jsonb
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
  if (select count(*) from app.email_codes c where c.person_id = auth.uid() and c.purpose = 'add-backup'
      and c.sent_at > now() - interval '1 hour') >= 5 then
    perform app.refuse('too-many');
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

-- Checks a code against the newest one sent for a purpose and address:
-- "ok" (and the code is used up), "wrong" (a try is counted, and after 5
-- the code no longer works) or "ran-out" after 10 minutes. The caller
-- doesn't raise on "wrong", so the try counted is kept.
create function app.check_code(which text, address text, person uuid, typed text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  newest app.email_codes;
begin
  -- A new code uses up the one before, so there's at most one not used yet.
  select * into newest from app.email_codes c
    where c.purpose = which and c.email = address and c.person_id = person and c.used_at is null
    order by c.sent_at desc limit 1;
  if not found or newest.tries >= 5 then
    return 'wrong';
  end if;
  if newest.sent_at < now() - app.code_lasts() then
    return 'ran-out';
  end if;
  if typed is null or btrim(typed) !~ '^[0-9]{6}$'
    or app.code_hash(newest.id, btrim(typed)) <> newest.code_hash then
    update app.email_codes c set tries = c.tries + 1 where c.id = newest.id;
    return 'wrong';
  end if;
  update app.email_codes c set used_at = now() where c.id = newest.id;
  return 'ok';
end;
$$;

-- Adds the backup email once its code is typed in. Refused when the
-- address is already someone else's backup, or the address another
-- account signs in with ("in-use"): only the address's owner could have
-- typed the code, so saying so tells them nothing new.
create function public.confirm_backup_email(email text, code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text := app.email_address(email);
  checked text;
  sign_in_email text;
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  checked := case when address is null then 'wrong'
    else app.check_code('add-backup', address, auth.uid(), code) end;
  if checked <> 'ok' then
    return jsonb_build_object('added', false, 'problem', checked);
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = address and u.id <> auth.uid())
    or exists (select 1 from app.backup_emails b where b.email = address and b.person_id <> auth.uid()) then
    perform app.refuse('in-use');
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

-- Removes the backup email. Needs the second step in the last 5 minutes
-- when two-step sign-in is on.
create function public.remove_backup_email() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  if not app.second_step_fresh() then
    perform app.refuse('second-step-needed', '42501');
  end if;
  delete from app.backup_emails b where b.person_id = auth.uid();
  update app.email_codes c set used_at = now()
    where c.person_id = auth.uid() and c.used_at is null;
  return jsonb_build_object('removed', true);
end;
$$;

-- "Can't get into your email?": sends a code to an address, if it's
-- someone's backup email. The answer is the same whether it is or not, and
-- whether a code was sent or held back for the once-a-minute limit, so
-- nobody can find out which addresses are backups. Anyone can ask, signed
-- in or not.
create function public.send_get_in_code(email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text := app.email_address(email);
  backup app.backup_emails;
  code text := app.new_code();
  code_id uuid := gen_random_uuid();
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
    and not exists (select 1 from app.email_codes c where c.email = address and c.purpose = 'get-in'
      and c.sent_at > now() - interval '1 minute')
    and (select count(*) from app.email_codes c where c.email = address and c.purpose = 'get-in'
      and c.sent_at > now() - interval '1 hour') < 5 then
    update app.email_codes c set used_at = now()
      where c.email = address and c.purpose = 'get-in' and c.used_at is null;
    insert into app.email_codes (id, purpose, person_id, email, code_hash)
      values (code_id, 'get-in', backup.person_id, address, app.code_hash(code_id, code));
    perform app.send_email(address, 'Your PrePenny code to get back in',
      'Your PrePenny code is', code,
      array['Type it into PrePenny to get back into your account. It lasts 10 minutes.',
        'Once it''s typed in, this address becomes the one you sign in with, and every phone and computer signed in to your account is signed out.'],
      'If you didn''t ask for this, you can ignore this email. Nothing changes without the code.');
  end if;
  return jsonb_build_object('sent', true);
end;
$$;

-- Getting back in: once the code sent to the backup email is typed in,
-- that address becomes the one the account signs in with, every device is
-- signed out, and the old address is told. The phone then signs in with
-- the new address as usual, with a sign-in code sent to it, and with the
-- second step when two-step sign-in is on: getting back in never gets
-- past the authenticator app. A wrong code, or an address that's nobody's
-- backup, a code that has run out, or no code at all: all get the same
-- answer, so nobody can find out which addresses are backups this way. The
-- phone knows when it asked for the code, so it can say when one has run out.
create function public.use_get_in_code(email text, code text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text := app.email_address(email);
  backup app.backup_emails;
  old_email text;
begin
  if app.version_problem() is not null then
    perform app.refuse(app.version_problem());
  end if;
  select * into backup from app.backup_emails b where b.email = address;
  if address is null or not found
    or app.check_code('get-in', address, backup.person_id, code) <> 'ok' then
    return jsonb_build_object('in', false);
  end if;
  -- Someone else signs in with this address now: it can't be this account's.
  if exists (select 1 from auth.users u where lower(u.email) = address and u.id <> backup.person_id
      and u.email_confirmed_at is not null) then
    perform app.refuse('in-use');
  end if;
  -- A sign-up with this address that was never confirmed holds nothing, and would be in the way.
  delete from auth.users u where lower(u.email) = address and u.id <> backup.person_id
    and u.email_confirmed_at is null;
  select u.email into old_email from auth.users u where u.id = backup.person_id;
  update auth.users u set
      email = address,
      email_confirmed_at = coalesce(u.email_confirmed_at, now()),
      email_change = '',
      email_change_token_new = '',
      email_change_token_current = '',
      email_change_confirm_status = 0,
      updated_at = now()
    where u.id = backup.person_id;
  update auth.identities i set identity_data = i.identity_data || jsonb_build_object('email', address),
      updated_at = now()
    where i.user_id = backup.person_id and i.provider = 'email';
  delete from app.backup_emails b where b.person_id = backup.person_id;
  update app.email_codes c set used_at = now() where c.person_id = backup.person_id and c.used_at is null;
  -- Every device is nudged to look at once, and finds it's signed out.
  perform app.nudge_my_phones(backup.person_id);
  delete from auth.sessions s where s.user_id = backup.person_id;
  delete from app.devices d where d.person_id = backup.person_id;
  if old_email is not null and old_email <> '' and lower(old_email) <> address then
    perform app.send_email(old_email, 'Your PrePenny sign-in email has changed',
      'Your PrePenny sign-in email has changed', null,
      array['Your backup email was used to get back into your PrePenny account, so it''s now the address you sign in with, in place of this one.',
        'Every phone and computer that was signed in to your account has been signed out.'],
      'If this wasn''t you, reply to this email straight away.');
  end if;
  return jsonb_build_object('in', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The device that made each change (PLAN.md item 39).

-- Which device each change was made on, as codes, kept beside the history
-- and outside what the Data API shows. A notice about a change a newer one
-- replaced names it, so another phone of the same person can say which.
create table app.edit_devices (
  edit_id uuid primary key references public.edits (id) on delete cascade,
  session_id uuid,
  browser text not null,
  device text not null
);

alter table app.edit_devices enable row level security;
revoke all on app.edit_devices from public, anon, authenticated;

-- Starts saving an edit, as in step 3d, and notes the device it came from.
create or replace function app.begin_edit(plan uuid, edit uuid, made text, what text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  saved record;
begin
  if not app.session_ok() or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  insert into public.edits as e (id, plan_id, private_to, person_id, made_at, kind)
  values (edit, plan, auth.uid(), auth.uid(), app.no_later_than_now(made)::app.utc_time, what)
  on conflict (id) do nothing;
  if found then
    insert into app.edit_devices (edit_id, session_id, browser, device)
    select edit, s.id, app.browser_of(s.user_agent), app.device_of(s.user_agent)
    from auth.sessions s where s.id = app.session_id()
    on conflict (edit_id) do nothing;
    return 'new';
  end if;
  select e.plan_id, e.person_id into saved from public.edits e where e.id = edit;
  if saved.plan_id = plan and saved.person_id = auth.uid() then
    return 'already';
  end if;
  perform app.refuse('not-found', '42501');
  return null;
end;
$$;

-- Leaves a notice for each person whose edit this one replaced, as in step
-- 3d, now also naming the device the replaced change was made on: its
-- session, and its kind of browser and device as codes.
create or replace function app.tell_clashes(plan uuid, edit uuid, lost jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  winner record;
  one record;
begin
  if app.current_edit() is distinct from edit then
    perform app.refuse('not-found', '42501');
  end if;
  select e.person_id, e.made_at into winner
    from public.edits e where e.id = edit and e.plan_id = plan and e.person_id = auth.uid();
  if not found then
    perform app.refuse('not-found', '42501');
  end if;
  for one in
    select (x ->> 'edit')::uuid as lost_edit,
      jsonb_agg(jsonb_build_object('table', x ->> 'table', 'id', x ->> 'id') order by x ->> 'table', x ->> 'id') as rows
    from jsonb_array_elements(coalesce(lost, '[]'::jsonb)) x
    group by 1
  loop
    insert into public.notices (plan_id, for_person, kind, edit_id, data)
    select plan, e.person_id, 'clash', edit,
      jsonb_build_object('lost', e.id, 'by', winner.person_id, 'made_at', winner.made_at, 'rows', one.rows,
        'from', case when d.edit_id is null then null else
          jsonb_build_object('session', d.session_id, 'browser', d.browser, 'device', d.device) end)
    from public.edits e
    left join app.edit_devices d on d.edit_id = e.id
    where e.id = one.lost_edit and e.plan_id = plan and e.id <> edit
      and e.made_at::timestamptz <= winner.made_at::timestamptz;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can use which function, as at the end of every migration that adds to
-- `app` (00-every-table.test.sql): everything taken back, then only what the
-- rules and the phone's steps call given to signed-in people, and only the
-- two steps for getting back in to someone who isn't signed in.

revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on function public.hello(), public.my_devices(), public.end_device(uuid),
  public.end_every_device(), public.backup_email(), public.add_backup_email(text),
  public.confirm_backup_email(text, text), public.remove_backup_email(),
  public.send_get_in_code(text), public.use_get_in_code(text, text)
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
grant execute on function public.hello(), public.my_devices(), public.end_device(uuid),
  public.end_every_device(), public.backup_email(), public.add_backup_email(text),
  public.confirm_backup_email(text, text), public.remove_backup_email(),
  public.send_get_in_code(text), public.use_get_in_code(text, text)
  to authenticated;
grant execute on function public.send_get_in_code(text), public.use_get_in_code(text, text) to anon;
