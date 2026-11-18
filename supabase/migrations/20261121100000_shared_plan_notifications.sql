-- Step 4f: notifications in a shared plan (brief 4.14, PLAN.md question 8,
-- D575 to D583), on step 4e's reminders.
--
-- 1. A new choice beside the reminders, off until each person turns it on:
--    "When Tom changes something" (D575). With it, how far the person has
--    been told: the plan, and the moment up to which every change someone
--    else made in it has been told, or passed over as nothing they can see.
-- 2. The server's steps, for PrePenny's reminders function alone, with the
--    tick: the person's Activity read exactly as their own phone reads it
--    (plan_activity, as their own sign-in session, D458), and a group of
--    changes taken once only, checked again at that very moment, with the
--    plan held so nothing in it can change while it's checked (D577).
-- 3. The scheduled job runs every minute instead of every 15, and starts the
--    function only when someone may be due something now (D578), so a
--    partner's changes come a few minutes after the last one, and a
--    shortfall a partner's change makes comes within minutes too.
--
-- Nothing here holds an amount, a payment's name or a note: the function
-- works the words out in memory from what Activity gives the person, seals
-- them for each of their phones, and keeps nothing (D564).
--
-- Checks: supabase/tests/database/37-shared-plan-notifications.test.sql.

-- Activity, and the notifications, read a plan's changes newest first.
create index if not exists edits_by_plan_and_time on public.edits (plan_id, saved_at);

-- ---------------------------------------------------------------------------
-- 1. The choice, and how far the person has been told (D575, D576).

alter table app.reminder_choices
  add column partner boolean not null default false,
  -- The plan the person was last told about, and the moment up to which
  -- every change someone else made in it has been told or passed over.
  -- Set when the choice is turned on, and when the person's first phone
  -- that gets notifications is added, so nothing from before then comes.
  add column told_plan uuid,
  add column told_to timestamptz;

comment on column app.reminder_choices.partner is
  'Whether the person is told when someone else in their shared plan changes something they both see (step 4f, D575).';

-- The plan a person is in now, and when they joined it.
create function app.plan_now(person uuid) returns table (plan_id uuid, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.plan_id, m.joined_at from public.plan_members m
  where m.person_id = person and m.left_at is null
  order by m.joined_at desc limit 1
$$;

-- From when someone else's changes are still to be told: when the person
-- was last told, and never before they joined the plan they're in now,
-- even one they were in before, left and joined again (D583). Null in no
-- plan, or never turned on.
create function app.partner_since(person uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when c.told_to is null or m.plan_id is null then null
    else greatest(c.told_to, m.joined_at) end
  from app.reminder_choices c
  left join app.plan_now(person) m on true
  where c.person_id = person
$$;

-- Changes someone else made in the person's plan since then that anyone in
-- it may read: the only ones the person's Activity can show (D458). Their
-- own changes, and anything private to someone, never count.
create function app.partner_changes_waiting(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.reminder_choices c
    join app.plan_now(person) m on true
    join public.edits e on e.plan_id = m.plan_id
    where c.person_id = person and c.partner
      and e.private_to is null and e.person_id is distinct from person
      and e.kind not in ('first-copy', 'join-with-plan')
      and e.saved_at > app.partner_since(person))
$$;

-- The newest of those saved at least a minute before the moment, so
-- nothing still being saved can be passed over (D576).
create function app.partner_settled_to(person uuid, moment timestamptz) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(e.saved_at)
  from app.plan_now(person) m
  join public.edits e on e.plan_id = m.plan_id
  where e.private_to is null and e.person_id is distinct from person
    and e.kind not in ('first-copy', 'join-with-plan')
    and e.saved_at > app.partner_since(person)
    and e.saved_at <= moment - interval '1 minute'
$$;

-- Every change in a plan, as one short mark: how many, and which, with
-- whose they are, who may read each and which were undone. Any change in
-- the plan at all, by anyone, private ones included, changes it. Holds
-- nothing but counts and a checksum of ids.
create function app.plan_edits_mark(plan uuid) returns text
language sql stable security definer set search_path = '' as $$
  select count(*)::text || ':' || coalesce(bit_xor(('x' || left(md5(e.id::text || '|'
      || coalesce(e.person_id::text, '') || '|' || coalesce(e.private_to::text, '') || '|'
      || coalesce(e.undone_by::text, '')), 16))::bit(64)::bigint), 0)::text
  from public.edits e where e.plan_id = plan
$$;

-- A moment the function sends back, as app.utc_exact wrote it, or null.
create function app.moment_of(text_value text) returns timestamptz
language plpgsql stable set search_path = '' as $$
begin
  if text_value is null
      or text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$' then
    return null;
  end if;
  return text_value::timestamptz;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Who may be due something now (D578), for the function and the job.

-- Someone with a reminder or the partner choice on, a phone that gets them,
-- in a plan: whose plan has changed since the function last looked, or
-- whose next reminder time has come since, or with changes someone else
-- made that they haven't been told about. Nobody in quiet hours. On a local
-- Supabase with the test clock on, a test can ask about its own person only.
create function app.due_for_reminders(moment timestamptz, test_person uuid default null)
returns setof app.reminder_choices
language sql stable security definer set search_path = '' as $$
  select c.* from app.reminder_choices c
  where (c.payday or c.evening or c.shortfall or c.weekly or c.partner)
    and app.reminder_slot(moment) is not null
    and app.plan_mark(c.person_id) <> ''
    and jsonb_array_length(app.live_addresses(c.person_id)) > 0
    and (c.looked_at is null or c.looked_at < app.reminder_slot(moment)
      or c.looked_mark is distinct from app.plan_mark(c.person_id)
      or app.partner_changes_waiting(c.person_id))
    and (test_person is null or not (select s.test_clock from app.reminder_server s)
      or c.person_id = test_person)
$$;

-- What the reminders function does now, as in step 4e, with the partner
-- choice: for each person who has it on, their plan, from when changes are
-- still to be told, and the newest change it may pass over if they can see
-- none of them.
create or replace function public.reminder_work(tick text, at_time timestamptz default null,
  test_person uuid default null) returns jsonb
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
    -- Null on the real project: the stand-in push service of the local tests only.
    'testPushPrefix', (select s.test_push_prefix from app.reminder_server s),
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
          'version', c.version,
          'choices', jsonb_build_object('payday', c.payday, 'evening', c.evening,
            'shortfall', c.shortfall, 'weekly', c.weekly, 'hideAmounts', c.hide_amounts,
            'partner', c.partner),
          'known', (select coalesce(jsonb_agg(jsonb_build_object('accountId', k.account_id,
              'date', k.short_on) order by k.short_on, k.account_id), '[]'::jsonb)
            from app.known_shortfalls k where k.person_id = c.person_id),
          'partner', case when c.partner and app.partner_since(c.person_id) is not null then
            jsonb_build_object(
              'plan', (select m.plan_id from app.plan_now(c.person_id) m),
              'since', app.utc_exact(app.partner_since(c.person_id)),
              'settledTo', app.utc_exact(app.partner_settled_to(c.person_id, moment))) end)
        order by c.looked_at nulls first)
      from (
        select * from app.due_for_reminders(moment, test_person) d
        order by d.looked_at nulls first
        limit 50
      ) c), '[]'::jsonb) end);
end;
$$;

-- The person's plan as their own phone reads it (step 4e), now also for
-- someone with only the partner choice on: its words name payments and
-- accounts by what their own phone holds.
create or replace function public.reminder_plan(tick text, person uuid, session uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.check_tick(tick);
  if not exists (
    select 1 from app.reminder_choices c
    where c.person_id = person and (c.payday or c.evening or c.shortfall or c.weekly or c.partner)
  ) or not exists (
    select 1 from app.push_addresses a where a.person_id = person and a.session_id = session
  ) then
    return null;
  end if;
  return app.plan_as(person, session);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The person's Activity, exactly as their own phone reads it (D576).

-- plan_activity itself, run as the person's own sign-in session on a phone
-- that gets notifications, as app.plan_as runs plan_changes (D564): its own
-- rules decide every change and every copy (D458), so it holds only the
-- changes they could read when each was made and can still read now. Null
-- when the session can't read the plan now.
create function app.activity_as(person uuid, session uuid, plan uuid, older_than text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  old_claims text := current_setting('request.jwt.claims', true);
  old_claim text := current_setting('request.jwt.claim', true);
  old_sub text := current_setting('request.jwt.claim.sub', true);
  old_path text := current_setting('request.path', true);
  level text;
  result jsonb;
begin
  if plan is null or not app.session_reads(person, session) then
    return null;
  end if;
  select s.aal::text into level from auth.sessions s where s.id = session;
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', person, 'session_id', session,
    'role', 'authenticated', 'aal', level)::text, true);
  -- Not a request from a phone, so no app version to check (app.version_problem).
  perform set_config('request.path', '', true);
  if exists (select 1 from app.my_plans() p where p = plan) then
    result := public.plan_activity(plan, older_than);
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

-- The person's Activity, 50 changes at a time, newest first, only while
-- they have the partner choice on and that session's phone gets
-- notifications; with the plan's mark, taken first, so a change saved
-- while it's read always shows as a change when the group is taken.
create function public.partner_activity(tick text, person uuid, session uuid,
  older_than text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  plan uuid;
  mark text;
  answer jsonb;
begin
  perform app.check_tick(tick);
  if not exists (select 1 from app.reminder_choices c where c.person_id = person and c.partner)
    or not exists (select 1 from app.push_addresses a where a.person_id = person and a.session_id = session) then
    return null;
  end if;
  select m.plan_id into plan from app.plan_now(person) m;
  if plan is null then
    return null;
  end if;
  mark := app.plan_edits_mark(plan);
  answer := app.activity_as(person, session, plan, older_than);
  if answer is null then
    return null;
  end if;
  return answer || jsonb_build_object('plan', plan, 'mark', mark);
end;
$$;

-- Takes a group of changes once only, checked again at this very moment
-- (D577). The plan is held until this step ends: every change saves an
-- edit naming its plan, so a change being saved now finishes first, and
-- none can be saved while this checks. Then: the choice still on, amounts
-- still shown or hidden as when the words were worked out, the person
-- still in that plan, not told already, nothing in the plan changed since
-- its Activity was read (so nothing named has been made private, or left
-- with someone who left), not quiet hours, and the phones that get it now.
create function public.claim_partner_changes(tick text, person uuid, plan uuid, since text,
  through text, hide_amounts boolean, mark text, at_time timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  choices app.reminder_choices;
  from_moment timestamptz := app.moment_of(since);
  to_moment timestamptz := app.moment_of(through);
  phones jsonb;
begin
  perform app.check_tick(tick);
  if person is null or plan is null or from_moment is null or to_moment is null
      or to_moment <= from_moment or mark is null or hide_amounts is null then
    perform app.refuse('bad-claim');
  end if;
  perform 1 from public.plans p where p.id = plan for update;
  select * into choices from app.reminder_choices c where c.person_id = person for update;
  if not found or not choices.partner or choices.hide_amounts is distinct from hide_amounts
      or not exists (select 1 from app.plan_now(person) m where m.plan_id = plan) then
    return jsonb_build_object('sent', false, 'why', 'changed');
  end if;
  if app.partner_since(person) is distinct from from_moment then
    return jsonb_build_object('sent', false, 'why', 'sent');
  end if;
  if app.plan_edits_mark(plan) is distinct from mark then
    return jsonb_build_object('sent', false, 'why', 'changed');
  end if;
  if app.reminder_slot(app.reminder_time(at_time)) is null then
    return jsonb_build_object('sent', false, 'why', 'quiet');
  end if;
  phones := app.live_addresses(person);
  if jsonb_array_length(phones) = 0 then
    return jsonb_build_object('sent', false, 'why', 'no-phone');
  end if;
  update app.reminder_choices c set told_plan = plan, told_to = to_moment
    where c.person_id = person;
  return jsonb_build_object('sent', true, 'phones', phones);
end;
$$;

-- No phone took it: the group can go at the next look.
create function public.unclaim_partner_changes(tick text, person uuid, plan uuid, since text,
  through text) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  perform app.check_tick(tick);
  update app.reminder_choices c set told_plan = plan, told_to = app.moment_of(since)
    where c.person_id = person and c.told_plan = plan and c.told_to = app.moment_of(through)
      and app.moment_of(since) is not null;
end;
$$;

-- Nothing among the changes since then is anything the person can see (or
-- each was undone again straight away): passed over, up to `through`, so
-- they aren't looked at again. Only while they're still told up to the
-- moment the function read from: the row is held first, so a group taken
-- by another run at the same moment is seen, and never overwritten (D583).
create function public.partner_seen(tick text, person uuid, plan uuid, since text, through text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  from_moment timestamptz := app.moment_of(since);
  to_moment timestamptz := app.moment_of(through);
  choices app.reminder_choices;
begin
  perform app.check_tick(tick);
  if from_moment is null or to_moment is null or to_moment <= from_moment then
    perform app.refuse('bad-claim');
  end if;
  select * into choices from app.reminder_choices c where c.person_id = person for update;
  if not found or not choices.partner
      or app.partner_since(person) is distinct from from_moment
      or not exists (select 1 from app.plan_now(person) m where m.plan_id = plan) then
    return;
  end if;
  update app.reminder_choices c set told_plan = plan, told_to = to_moment
    where c.person_id = person;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The person's own steps, from their phone, while signed in.

-- Their choices, with the partner one, whether this phone gets them, and
-- PrePenny's public key. Nobody else's.
create or replace function public.my_reminders() returns jsonb
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
    'partner', coalesce(choices.partner, false),
    'this_phone', (select a.endpoint from app.push_addresses a
      where a.session_id = app.session_id() and a.person_id = auth.uid()),
    'public_key', (select s.public_key from app.reminder_server s));
end;
$$;

-- Turns the person's reminders and the partner choice on or off (D560,
-- D561, D575). A phone from before step 4f sends no partner choice: it's
-- kept as it is. Turning it on tells them only about changes from then on.
-- With every one off, every phone of theirs is forgotten.
drop function public.choose_reminders(boolean, boolean, boolean, boolean, boolean);
create function public.choose_reminders(payday boolean, evening boolean, shortfall boolean,
  weekly boolean, hide_amounts boolean, partner boolean default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  was app.reminder_choices;
  partner_now boolean;
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  if payday is null or evening is null or shortfall is null or weekly is null
      or hide_amounts is null then
    perform app.refuse('bad-choice');
  end if;
  select * into was from app.reminder_choices c where c.person_id = auth.uid() for update;
  partner_now := coalesce(partner, was.partner, false);
  insert into app.reminder_choices as c (person_id, payday, evening, shortfall, weekly, hide_amounts,
      partner)
    values (auth.uid(), payday, evening, shortfall, weekly, hide_amounts, partner_now)
    on conflict (person_id) do update set payday = payday, evening = evening,
      shortfall = shortfall, weekly = weekly, hide_amounts = hide_amounts, partner = partner_now,
      changed_at = now(), version = c.version + 1, looked_at = null, looked_mark = null;
  if partner_now and not coalesce(was.partner, false) then
    update app.reminder_choices c
      set told_plan = (select m.plan_id from app.plan_now(auth.uid()) m), told_to = now()
      where c.person_id = auth.uid();
  end if;
  if not (payday or evening or shortfall or weekly or partner_now) then
    delete from app.push_addresses a where a.person_id = auth.uid();
  end if;
  if not shortfall then
    delete from app.known_shortfalls k where k.person_id = auth.uid();
  end if;
  return public.my_reminders();
end;
$$;

-- This phone's push address, as in step 4e. When it's the first of the
-- person's phones to get notifications, changes from before aren't told
-- now: only from this moment (D576).
create or replace function public.add_push_address(endpoint text, p256dh text, auth_secret text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  holder app.push_addresses;
  had_one boolean;
begin
  if not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  if not app.push_address_ok(endpoint) or p256dh is null or p256dh !~ '^B[A-Za-z0-9_-]{86}$'
      or auth_secret is null or auth_secret !~ '^[A-Za-z0-9_-]{22}$' then
    perform app.refuse('bad-address');
  end if;
  had_one := jsonb_array_length(app.live_addresses(auth.uid())) > 0;
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
  update app.reminder_choices c set looked_at = null, version = c.version + 1
    where c.person_id = auth.uid();
  if not had_one then
    update app.reminder_choices c
      set told_plan = (select m.plan_id from app.plan_now(auth.uid()) m), told_to = now()
      where c.person_id = auth.uid() and c.partner;
  end if;
  return public.my_reminders();
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The scheduled job, every minute (D578).

-- As in step 4e, but every minute: the bank holiday list's answer, if one
-- has come; old push addresses and sent marks cleared out; then, only if
-- someone may be due something now, the reminders function is started.
create or replace function app.reminders_tick() returns void
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
  -- Most minutes nobody is due anything, and the function isn't started.
  if not exists (select 1 from app.due_for_reminders(now())) then
    return;
  end if;
  perform net.http_post(
    url := server.address,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-prepenny-tick', server.tick),
    timeout_milliseconds := 120000);
end;
$$;

-- The same job's name, so this replaces step 4e's every 15 minutes.
select cron.schedule('prepenny-reminders', '* * * * *', $$select app.reminders_tick()$$);

-- ---------------------------------------------------------------------------
-- Who can use what, as in step 4e: nobody reads the tables straight; the
-- person's own steps are for signed-in people; the server's steps for the
-- reminders function alone, with Supabase's own secret key and the tick.

revoke all on function
  app.plan_now(uuid), app.partner_since(uuid), app.partner_changes_waiting(uuid),
  app.partner_settled_to(uuid, timestamptz), app.plan_edits_mark(uuid), app.moment_of(text),
  app.due_for_reminders(timestamptz, uuid), app.activity_as(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

revoke all on function
  public.partner_activity(text, uuid, uuid, text),
  public.claim_partner_changes(text, uuid, uuid, text, text, boolean, text, timestamptz),
  public.unclaim_partner_changes(text, uuid, uuid, text, text),
  public.partner_seen(text, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function
  public.partner_activity(text, uuid, uuid, text),
  public.claim_partner_changes(text, uuid, uuid, text, text, boolean, text, timestamptz),
  public.unclaim_partner_changes(text, uuid, uuid, text, text),
  public.partner_seen(text, uuid, uuid, text, text)
  to service_role;

revoke all on function
  public.choose_reminders(boolean, boolean, boolean, boolean, boolean, boolean)
  from public, anon;
grant execute on function
  public.choose_reminders(boolean, boolean, boolean, boolean, boolean, boolean)
  to authenticated;
