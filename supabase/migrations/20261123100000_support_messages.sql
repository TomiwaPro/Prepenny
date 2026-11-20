-- Step 4i: Contact us, Something looks wrong and Suggest a feature
-- (brief 4.16, D55, the owner's answers to PLAN.md questions 10, 11 and 12:
-- D601 to D604, and D605 to D613).
--
-- 1. Every message is kept here, in PrePenny's own database (D601): Contact
--    us ("contact"), Something looks wrong ("problem", with a picture or a
--    copy of the plan if the person chose one, after the consent message)
--    and Suggest a feature ("idea"). The words never leave the database: no
--    email, log line or refusal holds them.
-- 2. Signed in, a message is the person's; the automatic reply goes to the
--    address they sign in with. Signed out, the person first proves the
--    address is theirs with a 6-digit code sent to it (D605), so nobody can
--    use PrePenny to send email to anyone else, and the reply goes there.
-- 3. hello@prepenny.co.uk gets a short email saying messages are waiting,
--    with none of their words and no address, at most once every 4 hours.
-- 4. Caps per address and per connection stop floods, and caps for everyone
--    together keep support's emails well under Resend's free plan's 100 a
--    day, so they can never use up what sign-in codes need (D606, D615).
--    The outside review (D615) added: a file is read before waiting for any
--    other request, and bounded; codes and replies have their own
--    allowances; Cloudflare's own header names the connection; someone
--    whose sign-in doesn't hold can write with an address and its code; and
--    the picture check is stricter.
-- 5. Pictures are JPEG or PNG only, checked by their contents, with no
--    hidden details (the phone removes them; this checks), 2 MB at most;
--    plan copies are a PrePenny backup file, 5 MB at most (D607). Both are
--    kept privately, read by nobody signed in or out, and deleted 30 days
--    after they're sent (D55). Messages are deleted 12 months after the last
--    reply, or after they were sent if there's none (D604).
--
-- Until step 4j's support screen, the owner reads messages in Supabase's
-- SQL Editor (README.md part V). Nothing here is on the Data API but the two
-- steps a phone calls; every table is closed to everyone but the database.

-- ---------------------------------------------------------------------------
-- Tables.

create table app.support_messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('contact', 'problem', 'idea')),
  -- Signed in: the person, and the reply goes to the address they sign in
  -- with. Deleting their account deletes their messages.
  person_id uuid references auth.users (id) on delete cascade,
  -- Signed out: the address proven with a code.
  email text check (email = lower(email)),
  words text not null check (char_length(words) between 1 and 2000),
  -- Something looks wrong: which screen, as a name such as "coming-up"; never an id.
  screen text check (screen ~ '^[a-z0-9-]{1,60}$'),
  app_version text not null check (app_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  phone_type text not null check (phone_type ~ (
    '^(Android|iPhone|iPad|Windows|Mac|Linux|Chromebook|Another device), '
    || '(Chrome|Safari|Firefox|Edge|Samsung Internet|Opera|Another browser)( [0-9]{1,4})?$')),
  sent_at timestamptz not null default now(),
  -- The working day the automatic reply aims for (Contact us and Something looks wrong).
  answer_by date,
  -- A picture or a plan copy: the consent message was shown first.
  file_kind text check (file_kind in ('picture', 'plan')),
  consent_at timestamptz,
  file_gone_at timestamptz,
  -- hello@prepenny.co.uk has been told it's waiting.
  told boolean not null default false,
  -- Support's replies, from step 4j.
  replied_at timestamptz,
  last_reply_at timestamptz,
  check ((person_id is null) <> (email is null)),
  check ((kind = 'problem') or (screen is null and file_kind is null)),
  check (file_kind is null or consent_at is not null)
);

create index support_messages_by_time on app.support_messages (sent_at);
create index support_messages_by_person on app.support_messages (person_id);
create index support_messages_by_email on app.support_messages (email);
create index support_messages_not_told on app.support_messages (told) where not told;

-- A message's picture or plan copy, kept apart so it can go after 30 days
-- while the message stays.
create table app.support_files (
  message_id uuid primary key references app.support_messages (id) on delete cascade,
  kind text not null check (kind in ('picture', 'plan')),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'application/json')),
  data bytea not null,
  bytes integer not null check (bytes > 0),
  width integer check (width between 1 and 10000),
  height integer check (height between 1 and 10000),
  added_at timestamptz not null default now()
);

create index support_files_by_time on app.support_files (added_at);

-- Codes sent to an address someone typed while signed out, kept a day.
create table app.support_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  code_hash text not null,
  sent_at timestamptz not null default now(),
  tries smallint not null default 0,
  used_at timestamptz
);

create index support_codes_by_address on app.support_codes (email, sent_at desc);

-- What was sent, for the caps: each code, message, automatic reply and
-- notice, with who sent it and from which connection, both scrambled with
-- the database's own secret, kept 2 days.
create table app.support_sends (
  what text not null check (what in ('code', 'message', 'file', 'reply')),
  sender_key text,
  connection_key text not null,
  bytes integer not null default 0,
  at timestamptz not null default now()
);

create index support_sends_by_what on app.support_sends (what, at);
create index support_sends_by_sender on app.support_sends (sender_key, what, at);
create index support_sends_by_connection on app.support_sends (connection_key, what, at);

-- When hello@prepenny.co.uk was last told messages are waiting.
create table app.support_told (
  only_one boolean primary key default true check (only_one),
  told_at timestamptz
);
insert into app.support_told default values;

alter table app.support_messages enable row level security;
alter table app.support_files enable row level security;
alter table app.support_codes enable row level security;
alter table app.support_sends enable row level security;
alter table app.support_told enable row level security;
revoke all on app.support_messages, app.support_files, app.support_codes, app.support_sends,
  app.support_told from public, anon, authenticated, service_role;

-- Wrong tries and locks for support codes, as for the other codes (D392).
alter table app.code_tries drop constraint code_tries_purpose_check;
alter table app.code_tries add constraint code_tries_purpose_check
  check (purpose in ('add-backup', 'get-in', 'support'));
alter table app.code_locks drop constraint code_locks_purpose_check;
alter table app.code_locks add constraint code_locks_purpose_check
  check (purpose in ('add-backup', 'get-in', 'support'));

-- ---------------------------------------------------------------------------
-- The caps (D606) and how long things are kept (D55, D604), each in one
-- place so they can be changed.

-- Codes: 3 a day for an address (as D392), once a minute; 6 a day from one connection.
create function app.support_codes_a_connection() returns integer
language sql immutable set search_path = '' as $$ select 6 $$;
-- Messages of every kind: 5 a day from one sender, 10 from one connection, 100 from everyone.
create function app.support_messages_a_sender() returns integer
language sql immutable set search_path = '' as $$ select 5 $$;
create function app.support_messages_a_connection() returns integer
language sql immutable set search_path = '' as $$ select 10 $$;
create function app.support_messages_a_day() returns integer
language sql immutable set search_path = '' as $$ select 100 $$;
-- Support's emails to senders in any 24 hours, each with its own allowance,
-- so a flood of one never stops the other (D615): 10 codes and 5 automatic
-- replies. With at most 6 notices a day, that's 21 at most of Resend's 100
-- a day, leaving 79 for sign-in codes and the account's emails.
create function app.support_codes_emails_a_day() returns integer
language sql immutable set search_path = '' as $$ select 10 $$;
create function app.support_replies_emails_a_day() returns integer
language sql immutable set search_path = '' as $$ select 5 $$;
-- hello@prepenny.co.uk is told at most once in this long.
create function app.support_told_every() returns interval
language sql immutable set search_path = '' as $$ select interval '4 hours' $$;
-- Pictures and plan copies: each at most this big; 2 a day from one sender,
-- 4 from one connection; 25 MB a day from everyone; 150 MB kept at most.
create function app.support_picture_most_bytes() returns integer
language sql immutable set search_path = '' as $$ select 2 * 1024 * 1024 $$;
create function app.support_plan_most_bytes() returns integer
language sql immutable set search_path = '' as $$ select 5 * 1024 * 1024 $$;
create function app.support_files_a_sender() returns integer
language sql immutable set search_path = '' as $$ select 2 $$;
create function app.support_files_a_connection() returns integer
language sql immutable set search_path = '' as $$ select 4 $$;
create function app.support_file_bytes_a_day() returns bigint
language sql immutable set search_path = '' as $$ select 25::bigint * 1024 * 1024 $$;
create function app.support_file_bytes_kept() returns bigint
language sql immutable set search_path = '' as $$ select 150::bigint * 1024 * 1024 $$;
-- Pictures and plan copies are deleted this long after they're sent (D55).
create function app.support_files_kept() returns interval
language sql immutable set search_path = '' as $$ select interval '30 days' $$;
-- Messages are deleted this long after the last reply, or after they were
-- sent if there's none (D604, the owner's to change).
create function app.support_messages_kept() returns interval
language sql immutable set search_path = '' as $$ select interval '12 months' $$;

-- For the local test database only (supabase/seed.sql), never the real
-- project: the end-to-end tests all run on one computer, through one
-- connection, many times a day, so there the caps for one connection and for
-- everyone together are multiplied by this. 39-support-messages.test.sql
-- puts it back to 1 and checks the real numbers. Only the database's
-- administrator can change it, as for the reminders' test clock (step 4e).
create table app.support_test (
  only_one boolean primary key default true check (only_one),
  scale integer not null default 1 check (scale between 1 and 1000)
);
insert into app.support_test default values;
alter table app.support_test enable row level security;
revoke all on app.support_test from public, anon, authenticated, service_role;

create function app.support_scale() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select t.scale from app.support_test t), 1)
$$;

-- ---------------------------------------------------------------------------
-- Who's sending, and from where.

-- One at a time for every support step, so the caps hold for requests made
-- at the same moment.
create function app.support_one_at_a_time() returns void
language sql volatile set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('prepenny-support', 0))
$$;

-- The connection a request came from, scrambled with the database's own
-- secret so no IP address is kept: Cloudflare's CF-Connecting-IP when
-- Supabase passes it on, which Cloudflare writes itself, or else the first
-- address in X-Forwarded-For, as Supabase's own documentation shows
-- ("takes the client IP before the first comma", Securing your API, read
-- 19 Nov 2026). Someone can disguise the second, so the caps for everyone
-- together are what keep the emails and storage safe (D606, D615).
create function app.support_connection() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  headers jsonb;
  seen text;
begin
  begin
    headers := current_setting('request.headers', true)::jsonb;
  exception when others then
    headers := null;
  end;
  seen := nullif(btrim(coalesce(headers ->> 'cf-connecting-ip', '')), '');
  if seen is null then
    seen := btrim(split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1));
  end if;
  return app.address_key('connection:' || seen);
end;
$$;

-- A signed-in sender's sign-in still holds (D21) and has passed the second
-- step when two-step sign-in is on. Unlike app.session_ok, any version of
-- the app can contact support: a phone that can't update can still write.
create function app.support_signed_in() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (
      select 1 from auth.sessions s
      where s.id = app.session_id() and s.user_id = auth.uid()
        and (s.not_after is null or s.not_after > now())
    )
    and (not app.two_step_on(auth.uid()) or app.second_step_passed())
$$;

create function app.support_count(which text, key text, field text) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from app.support_sends s
  where s.what = which and s.at > now() - interval '24 hours'
    and case field
      when 'sender' then s.sender_key = key
      when 'connection' then s.connection_key = key
      else true end
$$;

-- ---------------------------------------------------------------------------
-- Words for the emails.

-- "Fri 20 Nov", with the year only when it isn't this year (docs/VOICE.md),
-- joined with non-breaking spaces, as app.when_words.
create function app.day_words(day date) returns text
language sql stable set search_path = '' as $$
  select replace(to_char(day, 'Dy FMDD Mon')
    || case when extract(year from day) <> extract(year from now() at time zone 'Europe/London')
      then to_char(day, ' YYYY') else '' end, ' ', chr(160))
$$;

-- The working day support aims to answer by: the first working day after
-- the day it was sent, in UK time, skipping weekends and England and Wales
-- bank holidays from the newest list PrePenny fetched (D608).
create function app.support_answer_by(sent timestamptz) returns date
language plpgsql stable security definer set search_path = '' as $$
declare
  day date := (sent at time zone 'Europe/London')::date;
  holidays date[];
begin
  begin
    select coalesce(array_agg((e ->> 'date')::date), '{}') into holidays
    from app.bank_holiday_lists l,
      jsonb_array_elements(l.list -> 'england-and-wales' -> 'events') as t(e)
    where l.list_version = app.newest_fetched_list();
  exception when others then
    holidays := '{}';
  end;
  loop
    day := day + 1;
    exit when extract(isodow from day) < 6 and not (day = any (coalesce(holidays, '{}')));
  end loop;
  return day;
end;
$$;

-- True when PrePenny's own emails can go: to the local test inbox here, or
-- through Resend with its key on the real project.
create function app.email_ready() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.email_sender s
    where s.kind <> 'resend'
      or exists (select 1 from vault.decrypted_secrets v where v.name = 'resend_api_key')
  )
$$;

-- ---------------------------------------------------------------------------
-- Pictures and plan copies (D607).

-- What a picture is, read from its contents, never its name: its type and
-- size, or a problem. The phone takes every hidden detail out before
-- sending (apps/web/lib/picture.ts); this checks again, every way it can
-- without decoding the picture itself, so a picture that didn't come from
-- PrePenny's own screen is refused (D607, D615):
-- - a PNG may have only the chunks a picture needs, each exactly its
--   standard size (no text, no eXIf, no time, nothing after its end);
-- - a JPEG only its tables, each exactly as long as what's in it, its size,
--   its picture data and a plain JFIF header with no thumbnail (no Exif,
--   no XMP, no comments, no other application data), anywhere in the file,
--   and exactly one end, at the end;
-- - neither may hold the words that start Exif or XMP anywhere at all.
-- Bounded: at most 7 fill bytes in a row, 64 parts before a JPEG's picture
-- data and 4,096 PNG chunks, so a file made to be slow to read is refused
-- quickly.
create function app.picture_facts(data bytea) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  n integer := coalesce(octet_length(data), 0);
  at integer;
  len bigint;
  kind text;
  marker integer;
  w bigint;
  h bigint;
  seen_data boolean := false;
  parts integer := 0;
  fill integer := 0;
  inside integer;
  table_end integer;
  counted integer;
  rest bytea;
  tables integer;
begin
  -- The words Exif and XMP start with, which no picture needs.
  if position('\x457869660000'::bytea in data) > 0
      or position(convert_to('<x:xmpmeta', 'UTF8') in data) > 0
      or position(convert_to('http://ns.adobe.com/xap', 'UTF8') in data) > 0 then
    return jsonb_build_object('problem', 'details');
  end if;

  if n >= 8 and substring(data from 1 for 8) = '\x89504e470d0a1a0a'::bytea then
    at := 8;
    loop
      parts := parts + 1;
      if parts > 4096 or at + 12 > n then
        return jsonb_build_object('problem', 'broken');
      end if;
      len := get_byte(data, at)::bigint * 16777216 + get_byte(data, at + 1) * 65536
        + get_byte(data, at + 2) * 256 + get_byte(data, at + 3);
      if at + 12 + len > n then
        return jsonb_build_object('problem', 'broken');
      end if;
      kind := encode(substring(data from at + 5 for 4), 'escape');
      if at = 8 then
        if kind <> 'IHDR' or len <> 13 then
          return jsonb_build_object('problem', 'broken');
        end if;
        w := get_byte(data, at + 8)::bigint * 16777216 + get_byte(data, at + 9) * 65536
          + get_byte(data, at + 10) * 256 + get_byte(data, at + 11);
        h := get_byte(data, at + 12)::bigint * 16777216 + get_byte(data, at + 13) * 65536
          + get_byte(data, at + 14) * 256 + get_byte(data, at + 15);
      elsif kind = 'IDAT' then
        seen_data := true;
      elsif kind = 'PLTE' then
        if len = 0 or len > 768 or len % 3 <> 0 then
          return jsonb_build_object('problem', 'details');
        end if;
      elsif (kind = 'tRNS' and len > 256) or (kind = 'sRGB' and len <> 1) or (kind = 'gAMA' and len <> 4)
          or (kind = 'cHRM' and len <> 32) or (kind = 'pHYs' and len <> 9) or (kind = 'IEND' and len <> 0) then
        return jsonb_build_object('problem', 'details');
      elsif kind not in ('tRNS', 'sRGB', 'gAMA', 'cHRM', 'pHYs', 'IEND') then
        return jsonb_build_object('problem', 'details');
      end if;
      at := at + 12 + len::integer;
      exit when kind = 'IEND';
    end loop;
    if at <> n or not seen_data or w is null or w not between 1 and 10000
        or h not between 1 and 10000 then
      return jsonb_build_object('problem', 'broken');
    end if;
    return jsonb_build_object('type', 'image/png', 'width', w, 'height', h);
  end if;

  if n >= 4 and get_byte(data, 0) = 255 and get_byte(data, 1) = 216 then
    at := 2;
    loop
      if at + 4 > n or get_byte(data, at) <> 255 then
        return jsonb_build_object('problem', 'broken');
      end if;
      marker := get_byte(data, at + 1);
      if marker = 255 then
        fill := fill + 1;
        if fill > 7 then
          return jsonb_build_object('problem', 'broken');
        end if;
        at := at + 1;
        continue;
      end if;
      fill := 0;
      parts := parts + 1;
      if parts > 64 then
        return jsonb_build_object('problem', 'broken');
      end if;
      if marker = 1 or marker between 208 and 215 then
        at := at + 2;
        continue;
      end if;
      if marker in (216, 217) then
        return jsonb_build_object('problem', 'broken');
      end if;
      len := get_byte(data, at + 2) * 256 + get_byte(data, at + 3);
      if len < 2 or at + 2 + len > n then
        return jsonb_build_object('problem', 'broken');
      end if;
      if marker = 224 then
        -- APP0: only a plain JFIF header, with no thumbnail in it.
        if len <> 16 or substring(data from at + 5 for 5) <> '\x4a46494600'::bytea
            or get_byte(data, at + 16) <> 0 or get_byte(data, at + 17) <> 0 then
          return jsonb_build_object('problem', 'details');
        end if;
      elsif marker = 219 then
        -- Quantisation tables: each 65 bytes, or 129 for 16-bit values, and nothing else.
        inside := at + 4;
        table_end := at + 2 + len::integer;
        tables := 0;
        while inside < table_end and tables < 4 loop
          inside := inside + case when get_byte(data, inside) >> 4 = 0 then 65 else 129 end;
          tables := tables + 1;
        end loop;
        if inside <> table_end then
          return jsonb_build_object('problem', 'details');
        end if;
      elsif marker = 196 then
        -- Huffman tables: each 17 bytes and as many values as its counts say.
        inside := at + 4;
        table_end := at + 2 + len::integer;
        tables := 0;
        while inside + 17 <= table_end and tables < 8 loop
          counted := 0;
          for i in 1..16 loop
            counted := counted + get_byte(data, inside + i);
          end loop;
          inside := inside + 17 + counted;
          tables := tables + 1;
        end loop;
        if inside <> table_end then
          return jsonb_build_object('problem', 'details');
        end if;
      elsif marker = 221 then
        if len <> 4 then
          return jsonb_build_object('problem', 'details');
        end if;
      elsif marker = 204 then
        if (len - 2) % 2 <> 0 then
          return jsonb_build_object('problem', 'details');
        end if;
      elsif marker in (192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207) then
        if len < 8 or len <> 8 + 3 * get_byte(data, at + 9) then
          return jsonb_build_object('problem', 'broken');
        end if;
        h := get_byte(data, at + 5) * 256 + get_byte(data, at + 6);
        w := get_byte(data, at + 7) * 256 + get_byte(data, at + 8);
      elsif marker = 218 then
        if len < 6 or len <> 6 + 2 * get_byte(data, at + 4) then
          return jsonb_build_object('problem', 'broken');
        end if;
        exit;
      else
        return jsonb_build_object('problem', 'details');
      end if;
      at := at + 2 + len::integer;
    end loop;
    if w is null or w not between 1 and 10000 or h not between 1 and 10000
        or get_byte(data, n - 2) <> 255 or get_byte(data, n - 1) <> 217 then
      return jsonb_build_object('problem', 'broken');
    end if;
    -- After the picture data starts, no application data, comment or start
    -- of a picture, and the one end at the very end: in picture data a 255
    -- byte is always followed by 0 or a restart, so these can only be markers.
    rest := substring(data from at + 1);
    if position('\xffd8'::bytea in rest) > 0 or position('\xfffe'::bytea in rest) > 0
        or position('\xffd9'::bytea in rest) <> octet_length(rest) - 1 then
      return jsonb_build_object('problem', 'details');
    end if;
    for forbidden in 224..239 loop
      if position(('\xff'::bytea || set_byte('\x00'::bytea, 0, forbidden)) in rest) > 0 then
        return jsonb_build_object('problem', 'details');
      end if;
    end loop;
    return jsonb_build_object('type', 'image/jpeg', 'width', w, 'height', h);
  end if;

  return jsonb_build_object('problem', 'not-a-picture');
end;
$$;

-- True when a file is a PrePenny backup from Download my data (step 3h),
-- read from its contents: JSON, saying it's PrePenny's backup, version 1,
-- with a plan in it.
create function app.plan_copy_ok(data bytea) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  copy jsonb;
begin
  copy := convert_from(data, 'UTF8')::jsonb;
  return jsonb_typeof(copy) = 'object' and copy ->> 'app' = 'PrePenny'
    and copy ->> 'kind' = 'backup' and copy -> 'version' = '1'::jsonb
    and jsonb_typeof(copy -> 'plan') = 'object';
exception when others then
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Telling hello@prepenny.co.uk.

-- Emails hello@prepenny.co.uk that messages are waiting, at most once every
-- 4 hours, and only when one came since the last time: how many, and none
-- of their words or addresses. Called after each message, and every 15
-- minutes by prepenny-support-told for any that came while it waited.
create function app.tell_support() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  told app.support_told;
  waiting integer;
  support text;
begin
  select * into told from app.support_told for update;
  if told.told_at is not null and told.told_at > now() - app.support_told_every() then
    return 0;
  end if;
  select count(*) into waiting from app.support_messages m where not m.told;
  if waiting = 0 or not app.email_ready() then
    return 0;
  end if;
  select s.from_address into support from app.email_sender s;
  perform app.send_email(support, 'A message is waiting in PrePenny''s support inbox',
    case when waiting = 1 then '1 message is waiting.' else waiting || ' messages are waiting.' end,
    null,
    array['Someone wrote to PrePenny support. This email doesn''t hold their words or their email address.',
      'Read it in Supabase''s SQL Editor, as README.md part V says.'],
    'PrePenny sends this at most once every 4 hours.');
  update app.support_messages m set told = true where not m.told;
  update app.support_told t set told_at = now() where t.only_one;
  return waiting;
end;
$$;

-- ---------------------------------------------------------------------------
-- The two steps a phone calls.

-- Sends a 6-digit code to the address someone signed out typed, to prove
-- it's theirs before their message goes (D605). Answers {sent: true}, or
-- {sent: false, wait} within a minute of the last code to that address.
-- Refused: "bad-email"; "too-many" after 3 codes to the address in a day,
-- 10 wrong codes in a day for it, or 6 codes from the connection; "busy"
-- once support has sent 10 codes in 24 hours; "email-off" when PrePenny's
-- emails can't go.
create function public.support_code(email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text := app.email_address(email);
  connection text := app.support_connection();
  code text := app.new_code();
  code_id uuid := gen_random_uuid();
  last_sent timestamptz;
begin
  if address is null then
    perform app.refuse('bad-email');
  end if;
  perform app.support_one_at_a_time();
  select max(c.sent_at) into last_sent from app.support_codes c where c.email = address;
  if last_sent > now() - interval '1 minute' then
    return jsonb_build_object('sent', false,
      'wait', ceil(extract(epoch from last_sent + interval '1 minute' - now()))::integer);
  end if;
  if app.address_locked(address, 'support')
      or (select count(*) from app.support_codes c
        where c.email = address and c.sent_at > now() - interval '24 hours') >= app.codes_a_day()
      or app.support_count('code', connection, 'connection')
        >= app.support_codes_a_connection() * app.support_scale() then
    perform app.refuse('too-many');
  end if;
  if app.support_count('code', null, 'everyone') >= app.support_codes_emails_a_day() * app.support_scale() then
    perform app.refuse('busy');
  end if;
  if not app.email_ready() then
    perform app.refuse('email-off');
  end if;
  delete from app.support_codes c where c.sent_at < now() - interval '24 hours';
  update app.support_codes c set used_at = now() where c.email = address and c.used_at is null;
  insert into app.support_codes (id, email, code_hash) values (code_id, address, app.code_hash(code_id, code));
  insert into app.support_sends (what, sender_key, connection_key)
    values ('code', app.address_key('email:' || address), connection);
  perform app.send_email(address, 'Your PrePenny code to send your message',
    'Your PrePenny code is', code,
    array['Type it into PrePenny to send your message to PrePenny support. It lasts 10 minutes.'],
    'If you didn''t ask for this, you can ignore this email. Nothing is sent without the code.');
  return jsonb_build_object('sent', true);
end;
$$;

-- Checks a support code for an address: "ok" (and it's used up), "wrong" or
-- "ran-out", as app.check_code does for the other codes, with the same lock
-- after 10 wrong tries in a day.
create function app.check_support_code(address text, typed text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  newest app.support_codes;
begin
  if address is null then
    return 'wrong';
  end if;
  if app.address_locked(address, 'support') then
    return 'wrong';
  end if;
  select * into newest from app.support_codes c
    where c.email = address and c.used_at is null
    order by c.sent_at desc limit 1;
  if found and newest.tries < 5 and typed is not null and btrim(typed) ~ '^[0-9]{6}$'
      and app.code_hash(newest.id, btrim(typed)) = newest.code_hash then
    if newest.sent_at < now() - app.code_lasts() then
      return 'ran-out';
    end if;
    update app.support_codes c set used_at = now() where c.id = newest.id;
    return 'ok';
  end if;
  if found then
    update app.support_codes c set tries = c.tries + 1 where c.id = newest.id;
  end if;
  perform app.note_wrong_try(address, 'support');
  return 'wrong';
end;
$$;

-- Sends a message to PrePenny support: Contact us ("contact"), Something
-- looks wrong ("problem") or Suggest a feature ("idea").
--
-- - Signed in, it's the person's own, from a sign-in that still holds.
--   Signed out, with the address and the code sent to it (support_code),
--   as also for someone whose sign-in has ended or isn't finished.
-- - The phone adds the app's version and the phone's type ("Android,
--   Chrome 131"), each checked against its pattern, never the browser's
--   whole description. Never any money data: the phone sends nothing else.
-- - Something looks wrong may add the screen's name and one picture or plan
--   copy (`file_data` in base64), after the consent message (`consent`).
--
-- Answers {sent: true, answer_by, replied} once it's kept: `answer_by` is
-- the working day support aims to answer by (not for ideas), and `replied`
-- whether the automatic reply went. Or {sent: false, why: "code-wrong" or
-- "code-ran-out"}, keeping the wrong try. Refused, with nothing kept:
-- "not-allowed", "bad-message", "bad-email", "bad-picture", "bad-plan",
-- "file-too-big", "too-many" (5 messages a day from one sender, 10 from
-- one connection, or 2 files from one sender, 4 from one connection),
-- "busy" (100 messages a day from everyone) and "files-full" (25 MB of
-- files a day from everyone, or 150 MB kept).
create function public.send_support(kind text, words text, screen text, app_version text,
  phone_type text, file_kind text, file_data text, consent boolean, email text, code text)
  returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  address text;
  reply_to text;
  sender text;
  connection text := app.support_connection();
  said text := btrim(coalesce(words, ''));
  file bytea;
  facts jsonb;
  content text;
  message uuid := gen_random_uuid();
  answer date;
  replied boolean := false;
  checked text;
begin
  if kind is null or kind not in ('contact', 'problem', 'idea')
      or char_length(said) not between 1 and 2000
      or (kind <> 'problem' and (screen is not null or file_kind is not null or file_data is not null))
      or (screen is not null and screen !~ '^[a-z0-9-]{1,60}$')
      or app_version is null or app_version !~ '^[A-Za-z0-9._-]{1,40}$'
      or phone_type is null or phone_type !~ (
        '^(Android|iPhone|iPad|Windows|Mac|Linux|Chromebook|Another device), '
        || '(Chrome|Safari|Firefox|Edge|Samsung Internet|Opera|Another browser)( [0-9]{1,4})?$')
      or (file_kind is null) <> (file_data is null)
      or (file_kind is not null and (file_kind not in ('picture', 'plan') or consent is not true)) then
    perform app.refuse('bad-message');
  end if;

  -- A picture or a plan copy, checked by its contents before waiting for
  -- any other request, so a file made to be slow to read holds up nobody
  -- else (D615).
  if file_kind is not null then
    if length(file_data) > (greatest(app.support_picture_most_bytes(), app.support_plan_most_bytes()) / 3 + 1) * 4 + 64 then
      perform app.refuse('file-too-big');
    end if;
    begin
      file := decode(file_data, 'base64');
    exception when others then
      perform app.refuse(case when file_kind = 'picture' then 'bad-picture' else 'bad-plan' end);
    end;
    if file_kind = 'picture' then
      if octet_length(file) > app.support_picture_most_bytes() then
        perform app.refuse('file-too-big');
      end if;
      facts := app.picture_facts(file);
      if facts ? 'problem' then
        perform app.refuse('bad-picture');
      end if;
      content := facts ->> 'type';
    else
      if octet_length(file) > app.support_plan_most_bytes() then
        perform app.refuse('file-too-big');
      end if;
      if not app.plan_copy_ok(file) then
        perform app.refuse('bad-plan');
      end if;
      content := 'application/json';
    end if;
  end if;

  perform app.support_one_at_a_time();

  -- Who's sending. Someone whose sign-in has ended, or isn't finished (the
  -- second step not passed yet), can write as someone signed out, with the
  -- address and its code (D615).
  if me is not null and not app.support_signed_in() and email is not null and code is not null then
    me := null;
  end if;
  if me is not null then
    if not app.support_signed_in() then
      perform app.refuse('not-allowed', '42501');
    end if;
    select lower(u.email) into reply_to from auth.users u where u.id = me;
    sender := app.address_key('person:' || me::text);
  else
    address := app.email_address(email);
    if address is null then
      perform app.refuse('bad-email');
    end if;
    checked := app.check_support_code(address, code);
    if checked = 'wrong' then
      return jsonb_build_object('sent', false, 'why', 'code-wrong');
    elsif checked = 'ran-out' then
      return jsonb_build_object('sent', false, 'why', 'code-ran-out');
    end if;
    reply_to := address;
    sender := app.address_key('email:' || address);
  end if;

  -- The caps on messages.
  if app.support_count('message', sender, 'sender') >= app.support_messages_a_sender()
      or app.support_count('message', connection, 'connection')
        >= app.support_messages_a_connection() * app.support_scale() then
    perform app.refuse('too-many');
  end if;
  if app.support_count('message', null, 'everyone') >= app.support_messages_a_day() * app.support_scale() then
    perform app.refuse('busy');
  end if;

  -- The caps on pictures and plan copies, checked above before the wait.
  if file_kind is not null then
    if app.support_count('file', sender, 'sender') >= app.support_files_a_sender()
        or app.support_count('file', connection, 'connection')
          >= app.support_files_a_connection() * app.support_scale() then
      perform app.refuse('too-many');
    end if;
    if (select coalesce(sum(s.bytes), 0) from app.support_sends s
        where s.what = 'file' and s.at > now() - interval '24 hours') + octet_length(file)
          > app.support_file_bytes_a_day() * app.support_scale()
        or (select coalesce(sum(f.bytes), 0) from app.support_files f) + octet_length(file)
          > app.support_file_bytes_kept() then
      perform app.refuse('files-full');
    end if;
  end if;

  -- Kept.
  delete from app.support_sends s where s.at < now() - interval '2 days';
  if kind <> 'idea' then
    answer := app.support_answer_by(now());
  end if;
  insert into app.support_messages (id, kind, person_id, email, words, screen, app_version, phone_type,
      answer_by, file_kind, consent_at)
    values (message, kind, me, address, said, case when kind = 'problem' then screen end,
      app_version, phone_type, answer, file_kind, case when file_kind is not null then now() end);
  insert into app.support_sends (what, sender_key, connection_key) values ('message', sender, connection);
  if file_kind is not null then
    insert into app.support_files (message_id, kind, content_type, data, bytes, width, height)
      values (message, file_kind, content, file, octet_length(file),
        (facts ->> 'width')::integer, (facts ->> 'height')::integer);
    insert into app.support_sends (what, sender_key, connection_key, bytes)
      values ('file', sender, connection, octet_length(file));
  end if;

  -- The automatic reply, once a day for a sender, while support's emails allow.
  if kind <> 'idea' and reply_to is not null and app.email_ready()
      and app.support_count('reply', sender, 'sender') = 0
      and app.support_count('reply', null, 'everyone')
        < app.support_replies_emails_a_day() * app.support_scale() then
    perform app.send_email(reply_to, 'PrePenny has your message',
      'We''ve got your message.', null,
      array['We aim to answer within 1 working day, so by the end of ' || app.day_words(answer) || '.',
        'We''ll reply to this email address. For your privacy, this email doesn''t repeat what you wrote.'],
      'If you didn''t write to PrePenny, reply to this email and tell us.');
    insert into app.support_sends (what, sender_key, connection_key) values ('reply', sender, connection);
    replied := true;
  end if;

  perform app.tell_support();
  return jsonb_build_object('sent', true, 'answer_by', answer, 'replied', replied);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tidying, every hour (D55, D604).

-- Deletes pictures and plan copies 30 days after they were sent, noting on
-- the message when; messages 12 months after the last reply, or after they
-- were sent if there's none; codes after a day and the caps' counts after
-- 2 days. Answers how many files and messages went.
create function app.tidy_support() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  files integer;
  messages integer;
begin
  with gone as (
    delete from app.support_files f where f.added_at < now() - app.support_files_kept()
    returning f.message_id
  ), noted as (
    update app.support_messages m set file_gone_at = now()
    where m.id in (select g.message_id from gone g)
    returning 1
  )
  select count(*) into files from gone;
  with gone as (
    delete from app.support_messages m
    where coalesce(m.last_reply_at, m.sent_at) < now() - app.support_messages_kept()
    returning 1
  )
  select count(*) into messages from gone;
  delete from app.support_codes c where c.sent_at < now() - interval '24 hours';
  delete from app.support_sends s where s.at < now() - interval '2 days';
  return jsonb_build_object('files', files, 'messages', messages);
end;
$$;

-- ---------------------------------------------------------------------------
-- Deleting an account deletes what the person sent (step 3h, D478): signed
-- in, by their id, as their messages name them (on delete cascade); signed
-- out, by the addresses they could prove, the one they sign in with and
-- their backup; with any codes sent to them.
create function app.forget_support_messages() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  addresses text[];
begin
  addresses := array_remove(array[lower(old.email),
    (select lower(b.email) from app.backup_emails b where b.person_id = old.id)], null);
  delete from app.support_messages m where m.person_id = old.id or m.email = any (addresses);
  delete from app.support_codes c where c.email = any (addresses);
  return old;
end;
$$;

create trigger prepenny_forget_support_messages before delete on auth.users
  for each row execute function app.forget_support_messages();

-- ---------------------------------------------------------------------------
-- Scheduled jobs.

select cron.schedule('prepenny-support-told', '7,22,37,52 * * * *', $$select app.tell_support()$$);
select cron.schedule('prepenny-support-tidy', '17 * * * *', $$select app.tidy_support()$$);

-- ---------------------------------------------------------------------------
-- Who can use what: nobody reads the tables, or any of the database's own
-- steps here; anyone, signed in or not, can ask for a code and send a
-- message, and nothing else.

revoke all on function
  app.support_codes_a_connection(), app.support_messages_a_sender(),
  app.support_messages_a_connection(), app.support_messages_a_day(),
  app.support_codes_emails_a_day(), app.support_replies_emails_a_day(), app.support_told_every(),
  app.support_picture_most_bytes(), app.support_plan_most_bytes(), app.support_files_a_sender(),
  app.support_files_a_connection(), app.support_file_bytes_a_day(), app.support_file_bytes_kept(),
  app.support_files_kept(), app.support_messages_kept(), app.support_one_at_a_time(),
  app.support_scale(),
  app.support_connection(), app.support_signed_in(), app.support_count(text, text, text),
  app.day_words(date), app.support_answer_by(timestamptz), app.email_ready(),
  app.picture_facts(bytea), app.plan_copy_ok(bytea), app.tell_support(),
  app.check_support_code(text, text), app.tidy_support(), app.forget_support_messages()
  from public, anon, authenticated, service_role;

revoke all on function public.support_code(text),
  public.send_support(text, text, text, text, text, text, text, boolean, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.support_code(text),
  public.send_support(text, text, text, text, text, text, text, boolean, text, text)
  to anon, authenticated;
