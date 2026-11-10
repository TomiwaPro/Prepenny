-- Step 3f: shared plans, invite and join (brief 4.14, PLAN.md items 26, 33
-- and 34, D51, D52, D94, D412 to D425).
--
-- 1. Names. Each person gives the name their partner sees ("Jess wants to
--    join your plan"), when they invite or ask to join.
-- 2. Invites. Only a plan's owner makes one, by link or by email. Its secret
--    is kept only scrambled. It lasts 7 days and works once: the first person
--    who asks to join with it uses it up, so a forwarded link is no use to
--    anyone else. Asking doesn't let anyone in: the owner sees who asked,
--    with the email address they signed in with, and chooses "Allow" or
--    "Don't allow". "Don't allow" ends the invite for good.
-- 3. Sharing an account. A private account becomes shared only when its own
--    person chooses, in this step of the server's own: the account and
--    everything on it change privacy together, in one go, or nothing does.
-- 4. Claiming pay (D314, D418). Shared pay that someone else added can be
--    claimed by the person whose pay it is, while nothing else hangs on it.
--
-- Every step here checks who's asking itself. Refusals are short codes, with
-- ids at most: never an amount, a name, a note or an email address (D87,
-- CLAUDE.md). The asker's email address is given only to the plan's owner,
-- for the request they're answering, and never written to a log.

-- ---------------------------------------------------------------------------
-- 1. Names.

-- A name as PrePenny keeps it: the words typed, without spaces at either
-- end, 1 to 30 characters, and no control characters. Refused otherwise.
create function app.nickname(typed text) returns text
language plpgsql volatile set search_path = '' as $$
declare
  name text := btrim(coalesce(typed, ''));
begin
  if name = '' or char_length(name) > 30 or name ~ '[[:cntrl:]]' then
    perform app.refuse('needs-name');
  end if;
  return name;
end;
$$;

-- True when the person is in a plan now, theirs or someone else's. PrePenny
-- keeps one plan for each person, so someone in one can't join another yet:
-- what to do then is the owner's question (D416).
create function app.in_a_plan(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plan_members m where m.person_id = person and m.left_at is null)
$$;

-- How many people are in a plan now.
create function app.members_now(plan uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.plan_members m where m.plan_id = plan and m.left_at is null
$$;

-- ---------------------------------------------------------------------------
-- 2. Invites.

alter table public.invites
  -- Who asked to join with it, and when: the first and only one (it works once).
  add column asked_by uuid references public.people (id),
  add column asked_at timestamptz,
  -- "Don't allow": the invite can't be used again.
  add column refused_at timestamptz;

create index invites_by_plan on public.invites (plan_id, created_at desc);

-- The invite link's secret, scrambled: only this is kept, so a copy of the
-- database can't be used to join (ARCHITECTURE.md 3.2).
create function app.invite_hash(token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest('prepenny-invite:' || coalesce(token, ''), 'sha256'), 'hex')
$$;

-- What an invite is now, whoever looks: cancelled, answered, run out, asked
-- and waiting for the owner, or open.
create function app.invite_state(invite public.invites) returns text
language sql stable set search_path = '' as $$
  select case
    when invite.accepted_at is not null then 'joined'
    when invite.refused_at is not null then 'not-allowed'
    when invite.cancelled_at is not null then 'cancelled'
    when invite.expires_at <= now() then 'ran-out'
    when invite.asked_by is not null then 'waiting'
    else 'open'
  end
$$;

-- The owner's name, as their partner will see it.
create function app.owner_name(plan uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(p.nickname, '') from public.plans pl join public.people p on p.id = pl.owner where pl.id = plan
$$;

-- How many invites a plan may send by email in a day: enough to fix a
-- mistyped address, not enough to send PrePenny's emails to strangers.
create function app.invite_emails_a_day() returns integer
language sql immutable set search_path = '' as $$ select 3 $$;

-- "Share with my partner": a new invite for the owner's plan, by link or by
-- email. Any invite not answered yet is cancelled, so there's one at a time.
-- Gives back the link's secret for a link (the phone shows the link once),
-- and nothing secret for an email, which carries the link itself.
create function public.make_invite(plan uuid, role text, nickname text, email text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  name text;
  address text;
  token text := app.new_token();
  made public.invites;
  site text;
  lasts text;
begin
  if plan is null or not app.session_ok()
    or not exists (select 1 from app.my_owned_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  if role is null or role not in ('editor', 'viewer') then
    perform app.refuse('bad-invite');
  end if;
  name := app.nickname(nickname);
  if app.members_now(plan) >= (select p.max_members from public.plans p where p.id = plan) then
    perform app.refuse('full');
  end if;
  if email is not null and btrim(email) <> '' then
    address := app.email_address(email);
    if address is null then
      perform app.refuse('bad-email');
    end if;
    if (select count(*) from public.invites i
        where i.plan_id = plan and i.email is not null and i.created_at > now() - interval '1 day')
        >= app.invite_emails_a_day() then
      perform app.refuse('too-many-emails');
    end if;
  end if;

  update public.people set nickname = name where id = auth.uid();
  update public.invites i set cancelled_at = now()
    where i.plan_id = plan and i.cancelled_at is null and i.accepted_at is null and i.refused_at is null;
  insert into public.invites (plan_id, role, email, token_hash, created_by, expires_at)
  values (plan, role, address, app.invite_hash(token), auth.uid(), now() + interval '7 days')
  returning * into made;

  if address is not null then
    select s.site into site from app.email_sender s;
    lasts := app.when_words(made.expires_at);
    perform app.send_email(address,
      name || ' has invited you to share a plan in PrePenny',
      name || ' has invited you to share their plan in PrePenny.',
      null,
      array[
        'PrePenny shows the money going out before payday, and what''s left after each payment.',
        'Open the invite on your phone and ask to join. ' || name || ' then chooses whether to allow it.',
        'The invite lasts 7 days, until ' || lasts || ', and works once.'],
      'If you don''t know ' || name || ', or weren''t expecting this, you can ignore this email. '
        || 'Nobody joins without ' || name || ' allowing it.',
      'Open the invite',
      coalesce(site, 'https://prepenny.co.uk') || '/join/#' || token);
  end if;

  return jsonb_build_object('invite', made.id, 'role', made.role,
    'token', case when address is null then token end,
    'expires_at', app.utc_words(made.expires_at), 'now', app.server_time());
end;
$$;

-- "Cancel this invite": the owner ends an invite nobody has been let in with.
create function public.cancel_invite(invite uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_one public.invites;
begin
  select * into found_one from public.invites i where i.id = invite for update;
  if not found or not app.session_ok()
    or not exists (select 1 from app.my_owned_plans() p where p = found_one.plan_id) then
    perform app.refuse('not-found', '42501');
  end if;
  if found_one.accepted_at is null and found_one.refused_at is null and found_one.cancelled_at is null then
    update public.invites i set cancelled_at = now() where i.id = invite;
  end if;
  return jsonb_build_object('state', 'cancelled', 'now', app.server_time());
end;
$$;

-- What an invite link gives the signed-in person who opened it: what it is
-- now, for them. Someone who didn't ask with it sees "used" once anyone has
-- (it works once). The inviter's name is given only when it's for them.
create function public.look_at_invite(token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_one public.invites;
  state text;
  me uuid := auth.uid();
begin
  if not app.session_ok() then
    perform app.refuse('not-found', '42501');
  end if;
  select * into found_one from public.invites i where i.token_hash = app.invite_hash(token);
  if not found or token is null or length(token) < 20 then
    return jsonb_build_object('state', 'not-found');
  end if;
  state := app.invite_state(found_one);
  if found_one.asked_by is distinct from me then
    state := case
      when exists (select 1 from public.plan_members m
          where m.plan_id = found_one.plan_id and m.person_id = me and m.left_at is null)
        then case when (select p.owner from public.plans p where p.id = found_one.plan_id) = me
          then 'yours' else 'member' end
      when state in ('joined', 'not-allowed', 'waiting') then 'used'
      when state <> 'open' then state
      when app.members_now(found_one.plan_id)
          >= (select p.max_members from public.plans p where p.id = found_one.plan_id) then 'full'
      when app.in_a_plan(me) then 'has-a-plan'
      else 'open'
    end;
  end if;
  return jsonb_build_object('state', state, 'role', found_one.role,
    'inviter', case when state in ('open', 'waiting', 'joined', 'not-allowed', 'has-a-plan', 'member', 'full')
      then app.owner_name(found_one.plan_id) end,
    'expires_at', app.utc_words(found_one.expires_at), 'now', app.server_time());
end;
$$;

-- "Ask to join": uses the invite up, for this person only, and tells the
-- owner's phones. Nobody joins until the owner allows it. Asking again while
-- waiting changes nothing. Anything else is refused with what the invite is
-- now ("used", "ran-out", "cancelled", "full", "has-a-plan" and so on).
create function public.ask_to_join(token text, nickname text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_one public.invites;
  looked jsonb;
  name text;
  owner uuid;
begin
  if not app.session_ok() then
    perform app.refuse('not-found', '42501');
  end if;
  name := app.nickname(nickname);
  select * into found_one from public.invites i where i.token_hash = app.invite_hash(token) for update;
  looked := public.look_at_invite(token);
  if looked ->> 'state' = 'waiting' then
    return looked;
  end if;
  if looked ->> 'state' <> 'open' then
    perform app.refuse(looked ->> 'state');
  end if;
  insert into public.people (id, nickname) values (auth.uid(), name)
    on conflict (id) do update set nickname = excluded.nickname;
  update public.invites i set asked_by = auth.uid(), asked_at = now() where i.id = found_one.id;
  select p.owner into owner from public.plans p where p.id = found_one.plan_id;
  perform app.send_nudge('plan:' || found_one.plan_id || ':' || owner);
  return public.look_at_invite(token);
end;
$$;

-- The requests waiting for the owner's answer, in the plans they own: who
-- asked, by name and the email address they signed in with, and when.
create function app.join_requests() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('invite', i.id, 'plan', i.plan_id, 'role', i.role,
      'nickname', coalesce(p.nickname, ''), 'email', u.email, 'asked_at', app.utc_words(i.asked_at))
      order by i.asked_at), '[]'::jsonb)
  from public.invites i
  join public.people p on p.id = i.asked_by
  join auth.users u on u.id = i.asked_by
  where i.plan_id in (select app.my_owned_plans())
    and app.invite_state(i) = 'waiting'
$$;

-- "Allow" or "Don't allow", by the plan's owner only. Allowing adds the
-- person with the invite's role ("Can edit" or "Can view only"); either
-- answer uses the invite up for good.
create function public.answer_join(invite uuid, allow boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_one public.invites;
begin
  select * into found_one from public.invites i where i.id = invite for update;
  if not found or allow is null or not app.session_ok()
    or not exists (select 1 from app.my_owned_plans() p where p = found_one.plan_id) then
    perform app.refuse('not-found', '42501');
  end if;
  if app.invite_state(found_one) <> 'waiting' then
    perform app.refuse(case app.invite_state(found_one) when 'ran-out' then 'ran-out' else 'not-waiting' end);
  end if;
  if not allow then
    update public.invites i set refused_at = now() where i.id = invite;
    return jsonb_build_object('state', 'not-allowed', 'now', app.server_time());
  end if;
  if app.members_now(found_one.plan_id)
      >= (select p.max_members from public.plans p where p.id = found_one.plan_id) then
    perform app.refuse('full');
  end if;
  -- They made or joined a plan meanwhile (D416): they can't be in two.
  if app.in_a_plan(found_one.asked_by) then
    perform app.refuse('has-a-plan');
  end if;
  insert into public.plan_members as m (plan_id, person_id, role)
  values (found_one.plan_id, found_one.asked_by, found_one.role)
  on conflict (plan_id, person_id) do update
    set role = excluded.role, left_at = null, joined_at = now();
  update public.invites i set accepted_at = now(), accepted_by = found_one.asked_by where i.id = invite;
  -- Everyone in the plan looks again: the owner's other phones see who's in it.
  perform app.send_nudge('plan:' || found_one.plan_id);
  return jsonb_build_object('state', 'joined', 'now', app.server_time());
end;
$$;

-- Who's in a plan and, for its owner, the invite: for "Share with my partner".
create function public.sharing(plan uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  latest public.invites;
  owns boolean;
begin
  if plan is null or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  owns := exists (select 1 from app.my_owned_plans() p where p = plan);
  if owns then
    -- The one still open or waiting, or else the newest.
    select * into latest from public.invites i where i.plan_id = plan
      order by app.invite_state(i) in ('open', 'waiting') desc, i.created_at desc limit 1;
  end if;
  return jsonb_build_object(
    'members', (select coalesce(jsonb_agg(jsonb_build_object('person', m.person_id, 'role', m.role,
        'nickname', coalesce(p.nickname, '')) order by m.joined_at), '[]'::jsonb)
      from public.plan_members m left join public.people p on p.id = m.person_id
      where m.plan_id = plan and m.left_at is null),
    'max_members', (select p.max_members from public.plans p where p.id = plan),
    'my_name', (select coalesce(p.nickname, '') from public.people p where p.id = auth.uid()),
    'invite', case when latest.id is null then null else jsonb_build_object(
      'id', latest.id, 'role', latest.role, 'email', latest.email,
      'state', app.invite_state(latest), 'expires_at', app.utc_words(latest.expires_at)) end,
    'requests', case when owns then app.join_requests() else '[]'::jsonb end,
    'now', app.server_time());
end;
$$;

-- The phone's look at its sign-in (step 3e) also brings the requests to join
-- the person's plan, so "Jess wants to join your plan" shows on its own
-- within a minute, or within seconds of the nudge asking sends.
create or replace function public.hello() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  standing text;
  problem text := app.version_problem();
  open_one app.get_back_in;
  asked jsonb;
  requests jsonb;
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
      requests := app.join_requests();
    end if;
    open_one := app.open_get_back_in(auth.uid());
    if open_one.id is not null and open_one.finishing_at is null then
      asked := jsonb_build_object('started_at', app.utc_words(open_one.started_at),
        'ready_at', app.utc_words(app.ready_at(open_one)));
    end if;
  end if;
  return jsonb_build_object('sign_in', standing, 'version', coalesce(problem, 'ok'),
    'now', app.server_time(), 'get_back_in', asked, 'join_requests', coalesce(requests, '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Sharing an account (PLAN.md items 26 and 34).

-- The accounts being shared now, in this transaction only. Set only by
-- public.share_accounts; nothing a person can reach sets it.
create function app.sharing_now() returns uuid[]
language sql stable set search_path = '' as $$
  select case when coalesce(current_setting('prepenny.sharing', true), '') = '' then '{}'::uuid[]
    else string_to_array(current_setting('prepenny.sharing', true), ',')::uuid[] end
$$;

-- The pay family being claimed now, in this transaction only (D418).
create function app.claiming_now() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('prepenny.claiming', true), '')::uuid
$$;

-- Accounts, debts and pay profiles, as before, but an account its own person
-- is sharing in public.share_accounts becomes shared.
create or replace function app.check_owned_record() returns trigger
language plpgsql set search_path = '' as $$
declare
  was uuid := case when tg_op = 'UPDATE' then old.private_to end;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'accounts' and new.private_to is null
    and old.private_to is not null and old.private_to = auth.uid()
    and new.id = any (app.sharing_now()) then
    was := null;
  end if;
  perform app.check_chosen_privacy(new.private_to, was,
    tg_op, new.belongs_to, case when tg_op = 'UPDATE' then old.belongs_to end);
  return new;
end;
$$;

-- Whether a series fits its family, as step 3b's check, with one change:
-- the privacy, lock and pay of a removed series aren't compared. Records
-- removed before an account was shared stay private (share_accounts), so a
-- partner never gets what was removed, and the payments still in the family
-- are shared. Removed series must still be on the same account, and every
-- series still joins only a family it was split into.
create or replace function app.family_problem(
  plan uuid, family uuid, self uuid, account uuid, private uuid, locked uuid, paid uuid, parent uuid
) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and s.id <> self)
      then case when family = self and parent is null then null else 'family-mixed' end
    when exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and s.id <> self
          and (s.account_id <> account
            or (not s.deleted and (s.private_to is distinct from private
              or s.locked_to is distinct from locked or s.paid_to is distinct from paid))))
      then 'family-mixed'
    when parent is null and family <> self
      then 'family-mixed'
    when parent is not null and not exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and s.id = parent)
      then 'family-mixed'
  end
$$;

-- Overtime or a missed shift, as step 3b's check, taking its privacy from a
-- payment still in its family, never from one removed before sharing.
create or replace function app.check_pay_adjustment() returns trigger
language plpgsql set search_path = '' as $$
declare
  parent record;
begin
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then
    perform app.refuse('fixed-field');
  end if;
  select true as seen, s.private_to as private, coalesce(s.paid_to, s.private_to) as paid into parent
    from public.series s where s.family_id = new.family_id and s.plan_id = new.plan_id
    order by s.deleted limit 1;
  if not coalesce(parent.seen, false) then
    perform app.refuse('not-found', '42501');
  end if;
  if app.from_a_person() and parent.paid is distinct from auth.uid() then
    perform app.refuse('not-your-pay');
  end if;
  new.private_to := parent.private;
  new.locked_to := case when parent.private is null then parent.paid end;
  return new;
end;
$$;

-- A series, as step 3b's check, with two of the server's own steps:
-- sharing an account changes the privacy of its whole families at once, and
-- claiming pay changes whose pay its whole family is (D418). Each changes
-- every series of a family in one statement, so the family check, which
-- looks at the others one row at a time, waits for the rules run after it.
create or replace function app.check_series() returns trigger
language plpgsql set search_path = '' as $$
declare
  account record;
  other record;
  week uuid;
  problem text;
  sharing boolean := tg_op = 'UPDATE' and new.account_id = any (app.sharing_now());
  claiming boolean := tg_op = 'UPDATE' and app.claiming_now() = new.family_id
    and new.paid_to = auth.uid() and old.paid_to is distinct from auth.uid();
begin
  if tg_op = 'UPDATE' and (new.account_id <> old.account_id
    or new.to_account_id is distinct from old.to_account_id
    or new.family_id <> old.family_id
    or new.split_from is distinct from old.split_from
    or new.locked_to is distinct from old.locked_to
    or (new.paid_to is distinct from old.paid_to and not claiming)) then
    perform app.refuse('fixed-field');
  end if;

  account := app.account_privacy(new.account_id, new.plan_id);
  if account.seen is not true then
    perform app.refuse('not-found', '42501');
  end if;
  new.private_to := account.private;

  if new.to_account_id is not null then
    other := app.account_privacy(new.to_account_id, new.plan_id);
    if other.seen is not true then
      perform app.refuse('not-found', '42501');
    end if;
    if other.private is distinct from new.private_to then
      perform app.refuse('private-transfer-needs-halves');
    end if;
  end if;
  if new.set_aside_account_id is not null then
    other := app.account_privacy(new.set_aside_account_id, new.plan_id);
    if other.seen is not true then
      perform app.refuse('not-found', '42501');
    end if;
    if other.private is distinct from new.private_to then
      perform app.refuse('private-transfer-needs-halves');
    end if;
  end if;

  if new.debt_id is not null then
    select true as seen, d.private_to as private into other from public.debts d where d.id = new.debt_id and d.plan_id = new.plan_id;
    perform app.check_link(new.private_to, coalesce(other.seen, false), other.private);
  end if;
  if new.goal_id is not null then
    other := null;
    select true as seen, g.private_to as private into other from public.goals g where g.id = new.goal_id and g.plan_id = new.plan_id;
    perform app.check_link(new.private_to, coalesce(other.seen, false), other.private);
  end if;
  if new.pay_profile_id is not null then
    other := null;
    select true as seen, p.private_to as private into other
      from public.pay_profiles p where p.id = new.pay_profile_id and p.plan_id = new.plan_id;
    perform app.check_link(new.private_to, coalesce(other.seen, false), other.private);
  end if;
  foreach week in array coalesce(new.cycle_pay_weeks, '{}') loop
    other := null;
    select true as seen, w.private_to as private into other from public.pay_weeks w where w.id = week and w.plan_id = new.plan_id;
    perform app.check_link(new.private_to, coalesce(other.seen, false), other.private);
  end loop;

  if new.paid_to is not null then
    if new.private_to is not null and new.paid_to <> new.private_to then
      perform app.refuse('not-found', '42501');
    end if;
    if tg_op = 'INSERT' and app.from_a_person() and new.paid_to <> auth.uid() and new.split_from is null then
      perform app.refuse('not-found', '42501');
    end if;
  end if;

  if not sharing and not claiming then
    problem := app.family_problem(new.plan_id, new.family_id, new.id, new.account_id,
      new.private_to, new.locked_to, new.paid_to, new.split_from);
    if problem is not null then
      perform app.refuse(problem);
    end if;
  end if;

  if new.locked_to is not null then
    if new.private_to is not null then
      perform app.refuse('shared-half');
    end if;
    if tg_op = 'INSERT' and app.from_a_person() and new.locked_to <> auth.uid() then
      perform app.refuse('not-found', '42501');
    end if;
    if new.note is not null or new.debt_id is not null or new.goal_id is not null
      or new.pay_profile_id is not null or new.cycle_pay_weeks is not null
      or new.set_aside_account_id is not null or new.mirrored_by is not null
      or new.paid_to is not null then
      perform app.refuse('shared-half');
    end if;
  end if;

  if new.mirrored_by is not null then
    other := null;
    select true as seen, s.private_to as private, s.locked_to as locked into other
      from public.series s where s.id = new.mirrored_by and s.plan_id = new.plan_id;
    if not coalesce(other.seen, false) then
      perform app.refuse('not-found', '42501');
    end if;
    if new.private_to is null or other.private is not null or other.locked is distinct from new.private_to then
      perform app.refuse('shared-half');
    end if;
  end if;
  return new;
end;
$$;

-- A row id worked out from what it's for, exactly as the phone works it out
-- (apps/web/lib/sync-ids.ts): the first 16 bytes of a SHA-256 of
-- "prepenny|plan|kind|parts", written as a UUID version 8. Sharing makes the
-- same private links the phone would, with the same ids, so the plan the
-- phone brings down is exactly the one it would have sent.
create function app.derived_id(plan uuid, kind text, variadic parts text[]) returns uuid
language sql immutable set search_path = '' as $$
  select encode(set_byte(set_byte(b, 6, 128 | (get_byte(b, 6) & 15)), 8, 128 | (get_byte(b, 8) & 63)), 'hex')::uuid
  from (select substring(extensions.digest(
    array_to_string(array['prepenny', plan::text, kind] || parts, '|'), 'sha256') from 1 for 16) as b) h
$$;

-- "Share these accounts": the server's own step (PLAN.md item 26). The
-- accounts become shared, and everything on them with them: balance
-- updates, budgets and their spends, payments with their one-off changes
-- and ticks, and overtime on pay in them, whose details stay private (D303).
-- Every record is saved again through the same checks, which fill its
-- privacy in from what it's on, so nothing can be left private on a shared
-- account, or shared by mistake. One edit, saved whole or not at all, and
-- sent twice it changes nothing the second time.
--
-- What stays private: records removed before sharing (a partner never gets
-- what was removed, D414); savings goals, debts and jobs, which are chosen
-- on their own (D65, D303); and the person's other accounts. A payment in
-- the account that names one of those keeps the link privately, in the
-- person's own private links, as the phone keeps them (D291).
--
-- Only someone who can edit shares an account, and only their own private
-- ones. Refused, with only the person's own record ids:
-- - "share-together" when money moves between one of them and another
--   private account of theirs, naming those accounts: share both, or neither;
-- - "share-has-halves" when one of them has money kept as "From Jess" in a
--   shared account (D16), naming those payments.
create function public.share_accounts(plan uuid, accounts uuid[], edit uuid, made_at text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  me uuid := auth.uid();
  others uuid[];
  halves uuid[];
  jobs jsonb;
begin
  if plan is null or edit is null or not app.session_ok()
    or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  if not exists (select 1 from app.my_edit_plans() p where p = plan) then
    perform app.refuse('view-only', '42501');
  end if;
  if exists (select 1 from public.edits e where e.id = edit and e.plan_id = plan and e.person_id = me) then
    return jsonb_build_object('saved', 'already', 'now', app.server_time());
  end if;
  if coalesce(cardinality(accounts), 0) = 0 or cardinality(accounts) > 20
    or exists (select 1 from unnest(accounts) a(id) where not exists (select 1 from public.accounts x
      where x.id = a.id and x.plan_id = plan and not x.deleted and x.private_to = me)) then
    perform app.refuse('not-found', '42501');
  end if;

  select array_agg(distinct other.id) into others
  from public.series s
  join public.accounts other on other.plan_id = plan
    and other.id in (s.account_id, s.to_account_id, s.set_aside_account_id)
  where s.plan_id = plan and not s.deleted
    and (s.account_id = any (accounts) or s.to_account_id = any (accounts) or s.set_aside_account_id = any (accounts))
    and other.private_to is not null and not (other.id = any (accounts));
  if others is not null then
    raise exception using errcode = 'P0001', message = 'share-together', detail = to_jsonb(others)::text;
  end if;
  select array_agg(s.id) into halves from public.series s
    where s.plan_id = plan and not s.deleted and s.account_id = any (accounts) and s.mirrored_by is not null;
  if halves is not null then
    raise exception using errcode = 'P0001', message = 'share-has-halves', detail = to_jsonb(halves)::text;
  end if;

  if app.begin_edit(plan, edit, made_at, 'share-accounts') = 'already' then
    return jsonb_build_object('saved', 'already', 'now', app.server_time());
  end if;
  perform set_config('prepenny.sharing', array_to_string(accounts, ','), true);
  perform set_config('prepenny.edit', edit::text, true);
  begin
    -- Links to her private debts and goals, for each family (D291).
    insert into public.private_links (id, plan_id, family_id, debt_id)
    select distinct app.derived_id(plan, 'family-debt', s.family_id::text), plan, s.family_id, s.debt_id
      from public.series s join public.debts d on d.id = s.debt_id and d.private_to is not null
      where s.plan_id = plan and s.account_id = any (accounts) and not s.deleted
    on conflict (id) do nothing;
    insert into public.private_links (id, plan_id, family_id, goal_id)
    select distinct app.derived_id(plan, 'family-goal', s.family_id::text), plan, s.family_id, s.goal_id
      from public.series s join public.goals g on g.id = s.goal_id and g.private_to is not null
      where s.plan_id = plan and s.account_id = any (accounts) and not s.deleted
    on conflict (id) do nothing;
    -- Ticks made inside a private debt's Update from statement (D62).
    insert into public.private_links (id, plan_id, tick_id, in_debt_update)
    select app.derived_id(plan, 'tick-debt', t.id::text), plan, t.id, t.in_debt_update
      from public.ticks t
      join public.series s on s.id = t.series_id and s.account_id = any (accounts)
      join public.debts d on d.id = t.in_debt_update and d.private_to is not null
      where t.plan_id = plan and not t.deleted
    on conflict (id) do nothing;
    -- Pay's job and usual weeks, kept for after the series is shared (D303).
    select jsonb_agg(jsonb_build_object('series_id', s.id, 'pay_profile_id', s.pay_profile_id,
        'weeks', s.cycle_pay_weeks)) into jobs
      from public.series s
      where s.plan_id = plan and s.account_id = any (accounts) and not s.deleted and s.pay_profile_id is not null;

    -- A shared account is everyone's in the plan, as the phone keeps it: it
    -- names no one person (ARCHITECTURE.md 3.3), so no phone ever sends a
    -- change to it just to say so, which "Can view only" couldn't make.
    update public.accounts set private_to = null, belongs_to = null where plan_id = plan and id = any (accounts);
    update public.balance_updates set deleted = false
      where plan_id = plan and account_id = any (accounts) and not deleted;
    update public.budgets set deleted = false
      where plan_id = plan and account_id = any (accounts) and not deleted;
    update public.series s set
        debt_id = case when exists (select 1 from public.debts d where d.id = s.debt_id and d.private_to is not null)
          then null else s.debt_id end,
        goal_id = case when exists (select 1 from public.goals g where g.id = s.goal_id and g.private_to is not null)
          then null else s.goal_id end,
        pay_profile_id = null,
        cycle_pay_weeks = null
      where s.plan_id = plan and s.account_id = any (accounts) and not s.deleted;
    insert into public.private_links (id, plan_id, series_id, pay_profile_id, cycle_pay_weeks)
    select app.derived_id(plan, 'series-job', j.series_id::text), plan, j.series_id, j.pay_profile_id, j.weeks
      from jsonb_to_recordset(coalesce(jobs, '[]'::jsonb)) as j(series_id uuid, pay_profile_id uuid, weeks uuid[])
    on conflict (id) do nothing;
    update public.payment_changes c set deleted = false
      where c.plan_id = plan and not c.deleted
        and (c.series_id in (select s.id from public.series s where s.plan_id = plan and s.account_id = any (accounts))
          or c.budget_id in (select b.id from public.budgets b where b.plan_id = plan and b.account_id = any (accounts)));
    -- A tick inside another account's private Update balance counts only for
    -- that account (D83), and a shared tick doesn't name it (D291).
    update public.ticks t set
        in_debt_update = case when exists (select 1 from public.debts d
          where d.id = t.in_debt_update and d.private_to is not null) then null else t.in_debt_update end,
        in_balance_update = case when exists (select 1 from public.balance_updates u
          where u.id = t.in_balance_update and u.private_to is not null) then null else t.in_balance_update end
      where t.plan_id = plan and not t.deleted
        and (t.series_id in (select s.id from public.series s where s.plan_id = plan and s.account_id = any (accounts))
          or t.budget_id in (select b.id from public.budgets b where b.plan_id = plan and b.account_id = any (accounts)));
    update public.spends p set deleted = false
      where p.plan_id = plan and not p.deleted
        and p.budget_id in (select b.id from public.budgets b where b.plan_id = plan and b.account_id = any (accounts));
    update public.pay_adjustments a set deleted = false
      where a.plan_id = plan and not a.deleted
        and a.family_id in (select s.family_id from public.series s where s.plan_id = plan and s.account_id = any (accounts));
  exception
    when sqlstate 'P0001' or insufficient_privilege then
      raise;
    when others then
      perform app.refuse('bad-record');
  end;
  perform set_config('prepenny.sharing', '', true);
  perform set_config('prepenny.edit', '', true);

  -- The families moved whole, so their rules hold as before (D332).
  if app.family_rules_problem(plan, (select array_agg(distinct s.family_id) from public.series s
      where s.plan_id = plan and s.account_id = any (accounts))) is not null then
    perform app.refuse('family-broken');
  end if;
  perform app.send_nudge('plan:' || plan);
  perform app.send_nudge('plan:' || plan || ':' || me);
  return jsonb_build_object('saved', 'new', 'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Claiming pay (D314, D418).

-- "This is my pay": shared pay that someone else added becomes the pay of
-- the person asking, for its whole family, so they can look after it as
-- their own (D311) and add their overtime to it (D303). Only money coming in
-- that's Pay or Benefits, on a shared account, and not "From Jess". Refused
-- ("pay-has-details") while the other person has overtime, a missed shift or
-- their job linked to it, which only they can take off; and never for
-- anyone outside the plan. It's an edit like any other, so it's in the
-- history and nudges the other phones.
create function public.claim_pay(plan uuid, family uuid, edit uuid, made_at text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  pay record;
begin
  if plan is null or family is null or not app.session_ok()
    or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  select s.private_to, s.locked_to, s.direction, s.type, s.paid_to into pay
    from public.series s where s.plan_id = plan and s.family_id = family and not s.deleted limit 1;
  if not found or pay.private_to is not null then
    perform app.refuse('not-found', '42501');
  end if;
  if pay.locked_to is not null or pay.direction <> 'in' or pay.type not in ('pay', 'benefits') then
    perform app.refuse('not-pay');
  end if;
  if pay.paid_to = auth.uid() then
    return jsonb_build_object('saved', 'already', 'now', app.server_time());
  end if;
  if exists (select 1 from public.pay_adjustments a where a.plan_id = plan and a.family_id = family and not a.deleted)
    or exists (select 1 from public.private_links l join public.series s on s.id = l.series_id
      where l.plan_id = plan and s.family_id = family and not l.deleted) then
    perform app.refuse('pay-has-details');
  end if;
  if app.begin_edit(plan, edit, made_at, 'claim-pay') = 'already' then
    return jsonb_build_object('saved', 'already', 'now', app.server_time());
  end if;
  perform set_config('prepenny.claiming', family::text, true);
  perform set_config('prepenny.edit', edit::text, true);
  update public.series s set paid_to = auth.uid() where s.plan_id = plan and s.family_id = family;
  perform set_config('prepenny.claiming', '', true);
  perform set_config('prepenny.edit', '', true);
  if app.family_rules_problem(plan, array[family]) is not null then
    perform app.refuse('family-broken');
  end if;
  perform app.send_nudge('plan:' || plan);
  return jsonb_build_object('saved', 'new', 'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can use which function, as at the end of every migration that adds to
-- `app` (00-every-table.test.sql): everything taken back, then only what the
-- rules and the phone's steps call given to signed-in people. Nobody who
-- isn't signed in can do anything with an invite.

revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on function public.make_invite(uuid, text, text, text), public.cancel_invite(uuid),
  public.look_at_invite(text), public.ask_to_join(text, text), public.answer_join(uuid, boolean),
  public.sharing(uuid), public.share_accounts(uuid, uuid[], uuid, text),
  public.claim_pay(uuid, uuid, uuid, text), public.hello()
  from public, anon, authenticated;
grant execute on function
  app.session_id(), app.session_ok(), app.my_plans(), app.my_edit_plans(),
  app.my_owned_plans(), app.my_partners(), app.my_own_pay(), app.refuse(text, text),
  app.from_a_person(), app.check_chosen_privacy(uuid, uuid, text, uuid, uuid),
  app.check_link(uuid, boolean, uuid), app.account_privacy(uuid, uuid),
  app.family_problem(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid),
  app.record_tables(), app.begin_edit(uuid, uuid, text, text), app.nudge(uuid, boolean),
  app.send_nudge(text), app.family_rules_problem(uuid, uuid[]), app.sent_columns(text), app.may_hear(text),
  app.server_time(), app.tell_clashes(uuid, uuid, jsonb),
  app.sharing_now(), app.claiming_now()
  to authenticated;
grant execute on function public.hello(), public.end_other_devices(), public.add_backup_email(text),
  public.confirm_backup_email(text, text), public.remove_backup_email(), public.stop_get_back_in(),
  public.send_get_in_code(text), public.stop_get_back_in_with_link(text),
  public.make_invite(uuid, text, text, text), public.cancel_invite(uuid), public.look_at_invite(text),
  public.ask_to_join(text, text), public.answer_join(uuid, boolean), public.sharing(uuid),
  public.share_accounts(uuid, uuid[], uuid, text), public.claim_pay(uuid, uuid, uuid, text)
  to authenticated;
