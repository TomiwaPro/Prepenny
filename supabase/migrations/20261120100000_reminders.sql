-- Step 4e: reminders (brief 4.11, D560 to D566), and bank holiday lists only
-- from PrePenny itself (D545).
--
-- 1. Bank holiday lists only from PrePenny's own site (D545): each week the
--    database fetches https://prepenny.co.uk/bank-holidays.json itself, keeps
--    each list it fetched, and gives every plan the newest. A list a phone
--    sends is taken only when the database fetched that same list, and then
--    the database's own copy is kept, never what the phone sent.
-- 2. Each person's reminder choices (D560, D561): every one off at the start.
--    Only the person reads or changes theirs.
-- 3. Each phone's push address (D562): the address its browser's push
--    service gave it, with the phone's public key and secret, for the sign-in
--    session on that phone. A session that ends takes its address with it.
-- 4. What's been sent, and which shortfalls the person knows about: kinds,
--    dates and accounts only, never an amount (D564).
-- 5. The server's own steps, for PrePenny's reminders function alone: who
--    may be due now, their plan read exactly as their own phone reads it
--    (plan_changes, as their own sign-in session), and taking each reminder
--    once only, checked again at that moment.
-- 6. The scheduled jobs: every 15 minutes, the reminders; each Monday, the
--    bank holiday list.
--
-- Nothing here holds an amount, a payment's name or a note, or writes one
-- anywhere: the reminders function works them out in memory, seals each for
-- one phone, and keeps nothing (D564).
--
-- Checks: supabase/tests/database/35-reminders.test.sql and
-- 36-bank-holidays-fetched.test.sql.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- 1. Bank holiday lists only from PrePenny's own site (D545).

-- Every list the database fetched itself, by its version (D536).
create table app.bank_holiday_lists (
  list_version text primary key check (list_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9a-f]{64}$'),
  list jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Requests to PrePenny's site that haven't been answered yet (pg_net).
create table app.bank_holiday_fetches (
  request_id bigint primary key,
  asked_at timestamptz not null default now()
);

comment on table app.bank_holiday_lists is
  'Bank holiday lists the database fetched itself from prepenny.co.uk (D545). Plans take only these.';

-- Asks PrePenny's own site for its list, as the phones do (D537). The answer
-- comes back on its own, and app.take_fetched_bank_holidays takes it.
create function app.ask_for_bank_holidays() returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into app.bank_holiday_fetches (request_id)
  values (net.http_get(
    url := 'https://prepenny.co.uk/bank-holidays.json',
    headers := jsonb_build_object('Cache-Control', 'no-cache'),
    timeout_milliseconds := 30000));
end;
$$;

-- The newest list fetched, by the engine's rule (D536): the later day, then
-- the larger checksum.
create function app.newest_fetched_list() returns text
language sql stable security definer set search_path = '' as $$
  select l.list_version from app.bank_holiday_lists l
  order by split_part(l.list_version, ':', 1) collate "C" desc,
    split_part(l.list_version, ':', 2) collate "C" desc
  limit 1
$$;

-- Puts a fetched list into a plan, as use_bank_holidays did (D536, D522):
-- the plan's shared change counter first, then its one row, then a nudge
-- so every phone in the plan brings it down. Only a list the database
-- fetched, and only when the plan's own isn't one, or is older.
create function app.put_bank_holidays(plan uuid, version text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  fetched app.bank_holiday_lists;
  stored public.bank_holidays;
  had boolean;
  next_seq bigint;
begin
  select * into fetched from app.bank_holiday_lists l where l.list_version = version;
  if not found then
    return false;
  end if;
  insert into app.plan_counters (plan_id, counts_for, last_seq)
    values (plan, app.shared_count(), 0) on conflict (plan_id, counts_for) do nothing;
  perform 1 from app.plan_counters c
    where c.plan_id = plan and c.counts_for = app.shared_count() for update;
  select * into stored from public.bank_holidays b where b.plan_id = plan for update;
  had := found;
  if had and exists (select 1 from app.bank_holiday_lists l where l.list_version = stored.list_version)
      and not app.bank_holidays_newer(version, stored.list_version) then
    return false;
  end if;
  next_seq := app.next_seq(plan, null);
  if not had then
    insert into public.bank_holidays (id, plan_id, seq, list_version, list)
      values (app.derived_id(plan, 'bank-holidays', 'list'), plan, next_seq, version, fetched.list);
  else
    update public.bank_holidays b set list_version = version, list = fetched.list,
        version = b.version + 1, seq = next_seq, changed_at = now()
      where b.plan_id = plan;
  end if;
  perform app.send_nudge('plan:' || plan);
  return true;
end;
$$;

-- Every plan gets the newest list fetched: a plan with none, one with an
-- older one, and one with a list the database never fetched, as one a phone
-- sent before step 4e (D543's accepted case, now closed). Says how many changed.
create function app.give_plans_the_newest_list() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  newest text := app.newest_fetched_list();
  plan uuid;
  changed integer := 0;
begin
  if newest is null then
    return 0;
  end if;
  for plan in select p.id from public.plans p order by p.id loop
    if app.put_bank_holidays(plan, newest) then
      changed := changed + 1;
    end if;
  end loop;
  return changed;
end;
$$;

-- Takes the answer PrePenny's site gave (D545): its file, as
-- apps/web/scripts/build-worker.ts and newest-bank-holidays.ts write it,
-- with the list's version made of the day it was downloaded from GOV.UK
-- and its checksum. Checked as every list is (D543), then kept and given
-- to every plan. Says 'taken', or 'bad-list' and keeps nothing.
create function app.take_bank_holiday_list(body text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  file jsonb;
  version text;
begin
  begin
    file := body::jsonb;
  exception when others then
    return 'bad-list';
  end;
  if file is null or jsonb_typeof(file) <> 'object' then
    return 'bad-list';
  end if;
  version := file ->> 'version';
  if version is null or version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9a-f]{64}$'
      or version is distinct from (file ->> 'downloaded_on') || ':' || (file ->> 'sha256') then
    return 'bad-list';
  end if;
  begin
    if split_part(version, ':', 1)::date not between date '2019-01-01'
        and (now() at time zone 'Europe/London')::date then
      return 'bad-list';
    end if;
  exception when others then
    return 'bad-list';
  end;
  if app.bank_holiday_list_problem(file -> 'list') is not null then
    return 'bad-list';
  end if;
  insert into app.bank_holiday_lists (list_version, list) values (version, file -> 'list')
    on conflict (list_version) do nothing;
  perform app.give_plans_the_newest_list();
  return 'taken';
end;
$$;

-- Takes the site's answers that have come back. An answer that isn't a
-- list, or no answer within an hour, changes nothing: next week's fetch
-- tries again.
create function app.take_fetched_bank_holidays() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  asked app.bank_holiday_fetches;
  answered record;
begin
  for asked in select * from app.bank_holiday_fetches order by request_id loop
    select r.status_code, r.content, r.timed_out into answered
      from net._http_response r where r.id = asked.request_id;
    if found then
      if answered.status_code = 200 and coalesce(answered.timed_out, false) = false then
        perform app.take_bank_holiday_list(answered.content);
      end if;
      delete from app.bank_holiday_fetches f where f.request_id = asked.request_id;
    elsif asked.asked_at < now() - interval '1 hour' then
      delete from app.bank_holiday_fetches f where f.request_id = asked.request_id;
    end if;
  end loop;
end;
$$;

-- A phone's newer list (D536), from step 4e taken only when the database
-- fetched that same list itself (D545), and then its own copy is kept:
-- nobody, with PrePenny or with their own software, can put a made-up
-- list into a plan. 'not-fetched' for any other: the phone tries again
-- when PrePenny next opens, and the database's own weekly fetch gives the
-- plan its list anyway. Answers {saved, list_version} or {kept, list_version}.
create or replace function public.use_bank_holidays(plan uuid, list_version text, list jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  now_has text;
begin
  if plan is null or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  if not exists (select 1 from app.my_edit_plans() p where p = plan) then
    perform app.refuse('view-only', '42501');
  end if;
  -- The list the phone sent is never kept: only the database's own copy.
  if list_version is null or list_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9a-f]{64}$'
      or list is null then
    perform app.refuse('bad-list');
  end if;
  if not exists (select 1 from app.bank_holiday_lists l where l.list_version = list_version) then
    perform app.refuse('not-fetched');
  end if;
  if app.put_bank_holidays(plan, list_version) then
    return jsonb_build_object('saved', list_version);
  end if;
  select b.list_version into now_has from public.bank_holidays b where b.plan_id = plan;
  return jsonb_build_object('kept', now_has);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Each person's reminder choices (D560, D561).

create table app.reminder_choices (
  person_id uuid primary key references auth.users (id) on delete cascade,
  payday boolean not null default false,
  evening boolean not null default false,
  shortfall boolean not null default false,
  weekly boolean not null default false,
  hide_amounts boolean not null default false,
  changed_at timestamptz not null default now(),
  -- When the reminders function last looked at the person's plan, and the
  -- plan's change counts then (shared and their own), so it looks again
  -- only when something changed or a reminder's time has come.
  looked_at timestamptz,
  looked_mark text
);

comment on table app.reminder_choices is
  'Which reminders each person has turned on (D560, D561). Read and changed only by the person, and read by the reminders function.';

-- ---------------------------------------------------------------------------
-- 3. Each phone's push address (D562).

create table app.push_addresses (
  -- The push service's address for this phone, as its browser gave it:
  -- one of the push services the browsers use, never anywhere else, so
  -- PrePenny's server can't be made to send to any other address.
  endpoint text primary key check (length(endpoint) <= 1000),
  person_id uuid not null references auth.users (id) on delete cascade,
  -- The sign-in session on that phone. When it ends (signing out, signing
  -- out of other devices, or after 90 days), nothing more is sent to it.
  session_id uuid not null unique,
  -- The phone's public key (65 bytes) and secret (16 bytes), base64url, so
  -- only that phone can open what's sent (RFC 8291).
  p256dh text not null check (p256dh ~ '^B[A-Za-z0-9_-]{86}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}$'),
  made_at timestamptz not null default now()
);

create index push_addresses_by_person on app.push_addresses (person_id);

comment on table app.push_addresses is
  'Each phone''s push address for reminders, for one sign-in session (D562). Never shown to anyone.';

-- ---------------------------------------------------------------------------
-- 4. What's been sent, and the shortfalls the person knows about (D564).

create table app.reminders_sent (
  person_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('payday', 'evening', 'shortfall', 'weekly')),
  -- The payday, tomorrow for the evening one, the Monday for the weekly one,
  -- and the day it was sent for a shortfall: one a day at most (D565).
  for_day date not null,
  sent_at timestamptz not null default now(),
  primary key (person_id, kind, for_day)
);

create table app.known_shortfalls (
  person_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  short_on date not null,
  primary key (person_id, account_id, short_on)
);

-- ---------------------------------------------------------------------------
-- 5. The reminders function's own settings, and its steps.

create table app.reminder_server (
  one boolean primary key default true check (one),
  -- The reminders function's address, set by the Database workflow once
  -- it's online (README.md, "Reminders"). Until then nothing is sent.
  address text check (address ~ '^https?://[^[:space:]]+$'),
  -- What the scheduled job shows the function, so only the job can start
  -- it. Made here, never written anywhere else.
  tick text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  -- The public half of PrePenny's signing key (RFC 8292), which each phone's
  -- browser is given. The private half is in Supabase's Vault.
  public_key text check (public_key ~ '^B[A-Za-z0-9_-]{86}$'),
  -- For the end-to-end tests on a local Supabase only (supabase/seed.sql):
  -- a stand-in push service's address, and a test clock. Never set on the
  -- real project.
  test_push_prefix text,
  test_clock boolean not null default false
);

insert into app.reminder_server default values;

-- The name of the signing key's private half in Supabase's Vault.
create function app.signing_key_name() returns text
language sql immutable set search_path = '' as $$
  select 'prepenny-reminders-signing-key'
$$;

-- Whether a push address is one of the browsers' push services: Google's
-- (Chrome, Edge on Android, Samsung Internet and others), Mozilla's
-- (Firefox), Apple's (Safari, and PrePenny on an iPhone's Home Screen) or
-- Microsoft's (Edge on Windows). Or, on a local Supabase only, the tests'
-- stand-in.
create function app.push_address_ok(endpoint text) returns boolean
language sql stable security definer set search_path = '' as $$
  select endpoint is not null and length(endpoint) <= 1000 and endpoint !~ '[[:space:]]' and (
    endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/.'
    or exists (
      select 1 from app.reminder_server s
      where s.test_push_prefix is not null and starts_with(endpoint, s.test_push_prefix)
    )
  )
$$;

-- The time the reminders function goes by: now, or on a local Supabase
-- with the test clock on, the time it was given.
create function app.reminder_time(given timestamptz) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when given is not null and (select s.test_clock from app.reminder_server s)
    then given else now() end
$$;

-- The start of the latest reminder time on a UK clock (D560): 8am (quiet
-- hours end), 9am (payday, and a shortfall's day-before warning), 6pm on
-- Sundays (the weekly summary) and 7pm (the evening one). Null in quiet
-- hours, 9pm to 8am, when nothing is sent.
create function app.reminder_slot(moment timestamptz) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare
  uk timestamp := moment at time zone 'Europe/London';
  uk_day date := uk::date;
  uk_hour integer := extract(hour from uk);
  slot time;
begin
  if uk_hour >= 21 or uk_hour < 8 then
    return null;
  end if;
  slot := case
    when uk_hour >= 19 then time '19:00'
    when uk_hour >= 18 and extract(isodow from uk_day) = 7 then time '18:00'
    when uk_hour >= 9 then time '09:00'
    else time '08:00'
  end;
  return (uk_day + slot) at time zone 'Europe/London';
end;
$$;

-- A person's plan's change counts, shared and their own: when this changes,
-- something in the plan they can see has changed.
create function app.plan_mark(person uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select m.plan_id::text || ':'
      || coalesce((select c.last_seq from app.plan_counters c
           where c.plan_id = m.plan_id and c.counts_for = app.shared_count()), 0)::text || ':'
      || coalesce((select c.last_seq from app.plan_counters c
           where c.plan_id = m.plan_id and c.counts_for = person), 0)::text
    from public.plan_members m
    where m.person_id = person and m.left_at is null
    order by m.joined_at desc limit 1), '')
$$;

-- Whether a sign-in session can read the person's plan right now, as their
-- own phone's would (app.session_ok): it exists, hasn't run out, and has
-- passed the second step if two-step sign-in is on.
create function app.session_reads(person uuid, session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = session and s.user_id = person
      and (s.not_after is null or s.not_after > now())
      and (not app.two_step_on(person) or s.aal = 'aal2')
  )
$$;

-- The person's phones that get reminders now: each push address whose
-- sign-in session can still read the plan.
create function app.live_addresses(person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', a.endpoint, 'p256dh', a.p256dh,
      'auth', a.auth) order by a.made_at), '[]'::jsonb)
  from app.push_addresses a
  where a.person_id = person and app.session_reads(person, a.session_id)
$$;

-- The plan exactly as the person's own phone reads it (D564): the same
-- step, plan_changes, run as their own sign-in session on a phone that gets
-- reminders, so its own rules decide every record. Their own private
-- records and the shared ones, never their partner's private ones. Null
-- when the session can't read it now.
create function app.plan_as(person uuid, session uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  old_claims text := current_setting('request.jwt.claims', true);
  old_claim text := current_setting('request.jwt.claim', true);
  old_sub text := current_setting('request.jwt.claim.sub', true);
  old_path text := current_setting('request.path', true);
  level text;
  plan uuid;
  result jsonb;
begin
  if not app.session_reads(person, session) then
    return null;
  end if;
  select s.aal::text into level from auth.sessions s where s.id = session;
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', person, 'session_id', session,
    'role', 'authenticated', 'aal', level)::text, true);
  -- Not a request from a phone, so no app version to check (app.version_problem).
  perform set_config('request.path', '', true);
  select p into plan from app.my_plans() p limit 1;
  if plan is not null then
    result := public.plan_changes(plan, 0, 0);
  end if;
  perform set_config('request.jwt.claims', coalesce(old_claims, ''), true);
  perform set_config('request.jwt.claim', coalesce(old_claim, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(old_sub, ''), true);
  perform set_config('request.path', coalesce(old_path, ''), true);
  return result;
exception when others then
  perform set_config('request.jwt.claims', coalesce(old_claims, ''), true);
  perform set_config('request.jwt.claim', coalesce(old_claim, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(old_sub, ''), true);
  perform set_config('request.path', coalesce(old_path, ''), true);
  raise;
end;
$$;

-- Only the scheduled job, through the reminders function, has the tick.
create function app.check_tick(tick text) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  if tick is null or not exists (select 1 from app.reminder_server s where s.tick = tick) then
    perform app.refuse('not-allowed', '42501');
  end if;
end;
$$;

-- What the reminders function does now: the signing key, if there's one
-- yet, and the people it may need to send to. Each is someone with a
-- reminder on and a phone that gets them, in a plan, whose plan has changed
-- since it last looked, or whose next reminder time has come since. Nobody
-- in quiet hours. 200 at a time, those looked at longest ago first.
create function public.reminder_work(tick text, at_time timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  moment timestamptz;
  slot timestamptz;
  private_key text;
begin
  perform app.check_tick(tick);
  moment := app.reminder_time(at_time);
  slot := app.reminder_slot(moment);
  select s.decrypted_secret into private_key from vault.decrypted_secrets s
    where s.name = app.signing_key_name();
  return jsonb_build_object(
    'now', app.utc_exact(moment),
    'key', case when private_key is null then null
      else jsonb_build_object('publicKey', (select s.public_key from app.reminder_server s),
        'privateJwk', private_key::jsonb) end,
    'people', case when slot is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
          'person', c.person_id,
          'session', (select a.session_id from app.push_addresses a
            where a.person_id = c.person_id and app.session_reads(c.person_id, a.session_id)
            order by a.made_at desc limit 1),
          'mark', app.plan_mark(c.person_id),
          'choices', jsonb_build_object('payday', c.payday, 'evening', c.evening,
            'shortfall', c.shortfall, 'weekly', c.weekly, 'hideAmounts', c.hide_amounts),
          'known', (select coalesce(jsonb_agg(jsonb_build_object('accountId', k.account_id,
              'date', k.short_on) order by k.short_on, k.account_id), '[]'::jsonb)
            from app.known_shortfalls k where k.person_id = c.person_id))
        order by c.looked_at nulls first)
      from (
        select * from app.reminder_choices c
        where (c.payday or c.evening or c.shortfall or c.weekly)
          and app.plan_mark(c.person_id) <> ''
          and jsonb_array_length(app.live_addresses(c.person_id)) > 0
          and (c.looked_at is null or c.looked_at < slot
            or c.looked_mark is distinct from app.plan_mark(c.person_id))
        order by c.looked_at nulls first
        limit 200
      ) c), '[]'::jsonb) end);
end;
$$;

-- The person's plan as their own phone reads it (app.plan_as), only while
-- they have a reminder on and that session's phone gets reminders.
create function public.reminder_plan(tick text, person uuid, session uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.check_tick(tick);
  if not exists (
    select 1 from app.reminder_choices c
    where c.person_id = person and (c.payday or c.evening or c.shortfall or c.weekly)
  ) or not exists (
    select 1 from app.push_addresses a where a.person_id = person and a.session_id = session
  ) then
    return null;
  end if;
  return app.plan_as(person, session);
end;
$$;

-- Takes one reminder, once only, checked again at this very moment: the
-- reminder still turned on, amounts still shown or hidden as when its words
-- were worked out, and the phones that get it now. Anything changed since,
-- or no phone left, and nothing is sent (D563: turning a reminder off, or
-- signing out, stops it straight away).
create function public.claim_reminder(tick text, person uuid, kind text, for_day date,
  hide_amounts boolean, at_time timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  choices app.reminder_choices;
  phones jsonb;
begin
  perform app.check_tick(tick);
  select * into choices from app.reminder_choices c where c.person_id = person for update;
  if not found or choices.hide_amounts is distinct from hide_amounts or not (case kind
      when 'payday' then choices.payday when 'evening' then choices.evening
      when 'shortfall' then choices.shortfall when 'weekly' then choices.weekly else false end) then
    return jsonb_build_object('sent', false, 'why', 'changed');
  end if;
  if app.reminder_slot(app.reminder_time(at_time)) is null then
    return jsonb_build_object('sent', false, 'why', 'quiet');
  end if;
  phones := app.live_addresses(person);
  if jsonb_array_length(phones) = 0 then
    return jsonb_build_object('sent', false, 'why', 'no-phone');
  end if;
  insert into app.reminders_sent (person_id, kind, for_day, sent_at)
    values (person, kind, for_day, app.reminder_time(at_time))
    on conflict do nothing;
  if not found then
    return jsonb_build_object('sent', false, 'why', 'sent');
  end if;
  return jsonb_build_object('sent', true, 'phones', phones);
end;
$$;

-- No phone took it, as when every push service was out of reach: it can be
-- sent at the next look, while its time lasts.
create function public.unclaim_reminder(tick text, person uuid, kind text, for_day date) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  perform app.check_tick(tick);
  delete from app.reminders_sent s
    where s.person_id = person and s.kind = kind and s.for_day = for_day;
end;
$$;

-- Done looking at a person's plan: when, its change counts then, and the
-- shortfalls they now know about (accounts and dates only), only while
-- their shortfall reminder is on.
create function public.done_looking(tick text, person uuid, mark text, known jsonb,
  at_time timestamptz default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  one jsonb;
begin
  perform app.check_tick(tick);
  update app.reminder_choices c set looked_at = app.reminder_time(at_time), looked_mark = mark
    where c.person_id = person;
  delete from app.known_shortfalls k where k.person_id = person;
  if jsonb_typeof(known) = 'array' and exists (
    select 1 from app.reminder_choices c where c.person_id = person and c.shortfall
  ) then
    for one in select value from jsonb_array_elements(known) loop
      insert into app.known_shortfalls (person_id, account_id, short_on)
        values (person, (one ->> 'accountId')::uuid, (one ->> 'date')::date)
        on conflict do nothing;
    end loop;
  end if;
end;
$$;

-- A push service said a phone's address is gone (404 or 410): forgotten.
create function public.forget_push_address(tick text, endpoint text) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  perform app.check_tick(tick);
  delete from app.push_addresses a where a.endpoint = endpoint;
end;
$$;

-- Keeps PrePenny's signing key, made by the reminders function the first
-- time it runs: the public half here, the private half in Supabase's
-- Vault. If one is kept already, that one stays, and is given back.
create function public.keep_signing_key(tick text, public_key text, private_jwk jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  kept text;
begin
  perform app.check_tick(tick);
  perform 1 from app.reminder_server s for update;
  select s.decrypted_secret into kept from vault.decrypted_secrets s
    where s.name = app.signing_key_name();
  if kept is null then
    if public_key is null or public_key !~ '^B[A-Za-z0-9_-]{86}$'
        or jsonb_typeof(private_jwk) <> 'object' or private_jwk ->> 'kty' <> 'EC'
        or private_jwk ->> 'crv' <> 'P-256' or private_jwk ->> 'd' is null then
      perform app.refuse('bad-key');
    end if;
    perform vault.create_secret(private_jwk::text, app.signing_key_name(),
      'PrePenny''s key for signing reminders to push services (step 4e, RFC 8292)');
    update app.reminder_server s set public_key = public_key;
    kept := private_jwk::text;
  end if;
  return jsonb_build_object('publicKey', (select s.public_key from app.reminder_server s),
    'privateJwk', kept::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The person's own steps, from their phone, while signed in (D562).

-- Their reminder choices, whether this phone gets them, and PrePenny's
-- public key for the phone's browser. Nobody else's.
create function public.my_reminders() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  choices app.reminder_choices;
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  select * into choices from app.reminder_choices c where c.person_id = auth.uid();
  return jsonb_build_object(
    'payday', coalesce(choices.payday, false),
    'evening', coalesce(choices.evening, false),
    'shortfall', coalesce(choices.shortfall, false),
    'weekly', coalesce(choices.weekly, false),
    'hide_amounts', coalesce(choices.hide_amounts, false),
    'this_phone', (select a.endpoint from app.push_addresses a
      where a.session_id = app.session_id() and a.person_id = auth.uid()),
    'public_key', (select s.public_key from app.reminder_server s));
end;
$$;

-- Turns the person's reminders on or off (D560, D561). With every one off,
-- every phone of theirs is forgotten too, and what they knew about shortfalls.
create function public.choose_reminders(payday boolean, evening boolean, shortfall boolean,
  weekly boolean, hide_amounts boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  if payday is null or evening is null or shortfall is null or weekly is null
      or hide_amounts is null then
    perform app.refuse('bad-choice');
  end if;
  insert into app.reminder_choices as c (person_id, payday, evening, shortfall, weekly, hide_amounts)
    values (auth.uid(), payday, evening, shortfall, weekly, hide_amounts)
    on conflict (person_id) do update set payday = payday, evening = evening,
      shortfall = shortfall, weekly = weekly, hide_amounts = hide_amounts,
      changed_at = now(), looked_at = null, looked_mark = null;
  if not (payday or evening or shortfall or weekly) then
    delete from app.push_addresses a where a.person_id = auth.uid();
  end if;
  if not shortfall then
    delete from app.known_shortfalls k where k.person_id = auth.uid();
  end if;
  return public.my_reminders();
end;
$$;

-- This phone's push address, for this sign-in session only. One that's
-- another person's, whose phone is still signed in, is refused.
create function public.add_push_address(endpoint text, p256dh text, auth_secret text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  holder app.push_addresses;
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  if not app.push_address_ok(endpoint) or p256dh is null or p256dh !~ '^B[A-Za-z0-9_-]{86}$'
      or auth_secret is null or auth_secret !~ '^[A-Za-z0-9_-]{22}$' then
    perform app.refuse('bad-address');
  end if;
  select * into holder from app.push_addresses a where a.endpoint = endpoint for update;
  if found and holder.session_id <> app.session_id() then
    if holder.person_id <> auth.uid() and app.session_reads(holder.person_id, holder.session_id) then
      perform app.refuse('in-use');
    end if;
    delete from app.push_addresses a where a.endpoint = endpoint;
  end if;
  delete from app.push_addresses a where a.session_id = app.session_id() and a.endpoint <> endpoint;
  insert into app.push_addresses as a (endpoint, person_id, session_id, p256dh, auth)
    values (endpoint, auth.uid(), app.session_id(), p256dh, auth_secret)
    on conflict on constraint push_addresses_pkey do update set p256dh = p256dh, auth = auth_secret;
  update app.reminder_choices c set looked_at = null where c.person_id = auth.uid();
  return public.my_reminders();
end;
$$;

-- Forgets this phone's push address, as signing out does first (D563).
-- Asks only that the sign-in is this person's: it's for leaving.
create function public.remove_push_address() returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from app.push_addresses a
    where a.session_id = app.session_id() and a.person_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The scheduled jobs.

-- Every 15 minutes: the bank holiday list's answer, if one has come; old
-- push addresses and sent marks cleared out; then, if anyone may be due a
-- reminder, the reminders function is started, with the tick.
create function app.reminders_tick() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  server app.reminder_server;
begin
  perform app.take_fetched_bank_holidays();
  delete from app.push_addresses a
    where not exists (select 1 from auth.sessions s where s.id = a.session_id);
  delete from app.reminders_sent s where s.for_day < (now() at time zone 'Europe/London')::date - 60;
  select * into server from app.reminder_server;
  if server.address is null or app.reminder_slot(now()) is null then
    return;
  end if;
  perform net.http_post(
    url := server.address,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-prepenny-tick', server.tick),
    timeout_milliseconds := 120000);
end;
$$;

-- The Database workflow sets the function's address once it's online
-- (README.md, "Reminders"), and starts it once straight away, so its
-- signing key is made before anyone turns a reminder on.
create function app.reminders_address(address text) returns text
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  server app.reminder_server;
begin
  if address is null or address !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/reminders$' then
    perform app.refuse('bad-address');
  end if;
  update app.reminder_server s set address = address returning * into server;
  perform net.http_post(
    url := server.address,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-prepenny-tick', server.tick),
    timeout_milliseconds := 120000);
  return 'set';
end;
$$;

select cron.schedule('prepenny-reminders', '*/15 * * * *', $$select app.reminders_tick()$$);
-- Mondays at 7:41am UTC: after the Bank holidays workflow has put any new
-- list on PrePenny's site (6:23am UTC, D537).
select cron.schedule('prepenny-bank-holidays', '41 7 * * 1', $$select app.ask_for_bank_holidays()$$);

-- ---------------------------------------------------------------------------
-- Who can use what: nobody can read these tables straight; the person's own
-- steps are for signed-in people; the server's steps for the reminders
-- function alone, with Supabase's own secret key and the tick.

revoke all on app.bank_holiday_lists, app.bank_holiday_fetches, app.reminder_choices,
  app.push_addresses, app.reminders_sent, app.known_shortfalls, app.reminder_server
  from public, anon, authenticated, service_role;

revoke all on function
  app.ask_for_bank_holidays(), app.newest_fetched_list(), app.put_bank_holidays(uuid, text),
  app.give_plans_the_newest_list(), app.take_bank_holiday_list(text),
  app.take_fetched_bank_holidays(), app.signing_key_name(), app.push_address_ok(text),
  app.reminder_time(timestamptz), app.reminder_slot(timestamptz), app.plan_mark(uuid),
  app.session_reads(uuid, uuid), app.live_addresses(uuid), app.plan_as(uuid, uuid),
  app.check_tick(text), app.reminders_tick(), app.reminders_address(text)
  from public, anon, authenticated, service_role;

revoke all on function
  public.reminder_work(text, timestamptz), public.reminder_plan(text, uuid, uuid),
  public.claim_reminder(text, uuid, text, date, boolean, timestamptz),
  public.unclaim_reminder(text, uuid, text, date),
  public.done_looking(text, uuid, text, jsonb, timestamptz),
  public.forget_push_address(text, text), public.keep_signing_key(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.reminder_work(text, timestamptz), public.reminder_plan(text, uuid, uuid),
  public.claim_reminder(text, uuid, text, date, boolean, timestamptz),
  public.unclaim_reminder(text, uuid, text, date),
  public.done_looking(text, uuid, text, jsonb, timestamptz),
  public.forget_push_address(text, text), public.keep_signing_key(text, text, jsonb)
  to service_role;

revoke all on function
  public.my_reminders(), public.choose_reminders(boolean, boolean, boolean, boolean, boolean),
  public.add_push_address(text, text, text), public.remove_push_address()
  from public, anon;
grant execute on function
  public.my_reminders(), public.choose_reminders(boolean, boolean, boolean, boolean, boolean),
  public.add_push_address(text, text, text), public.remove_push_address()
  to authenticated;

-- The first fetch of PrePenny's own list, straight away, so plans take only
-- lists the database fetched from now on (D545).
select app.ask_for_bank_holidays();
