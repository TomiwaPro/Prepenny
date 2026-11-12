-- Step 3h: download my data, import a backup, and delete my account (brief
-- 4.12, 4.13 and 7.2, PLAN.md item 66).
--
-- 1. Download: the person's own account, as only they see it. The plan
--    itself comes from their phone, which only ever holds what they may see,
--    and its history from plan_activity, with Activity's own rule (D458).
-- 2. Import: a backup takes the place of the person's own plan, in one step
--    (`replace_plan`): the old plan goes and a new, empty one starts, or
--    neither. The backup's records then go up as the new plan's first copy,
--    through save_edit, so every privacy rule and check applies to each one,
--    exactly as for a plan made on the phone. Never in a shared plan.
-- 3. Delete my account (`delete_my_account`): everything of the person's,
--    their plan and its history, devices, backup email, codes, sign-in and
--    Supabase's own sign-in records, in one step, or nothing. It needs a
--    sign-in made in the last 10 minutes, the authenticator app's code in
--    the last 5 when two-step sign-in is on, and "delete" typed. An email
--    says it's done. Someone who has ever shared a plan waits for the
--    owner's choice of what a partner's history then says (PLAN.md item 66).
--
-- Nothing here writes an amount, a name, a note or an email address to a
-- log or an error (CLAUDE.md): every refusal is a short code.

-- ---------------------------------------------------------------------------
-- 1. Download my data: the account, as its own person sees it.

-- Everything about the person's account that isn't in their plan: the
-- address they sign in with, when they signed up, the name their partner
-- sees, their backup email, whether two-step sign-in is on and Google signs
-- them in, their signed-in devices (as plain names, never an IP address or a
-- place), and the plans they've been in. Only ever about the person asking.
create function public.my_account_data() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  person auth.users;
begin
  if me is null or not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  select * into person from auth.users u where u.id = me;
  return jsonb_build_object(
    'email', person.email,
    'signed_up_at', app.utc_words(person.created_at),
    'name', (select nullif(p.nickname, '') from public.people p where p.id = me),
    'backup_email', (select b.email from app.backup_emails b where b.person_id = me),
    'two_step', app.two_step_on(me),
    'google', exists (select 1 from auth.identities i where i.user_id = me and i.provider = 'google'),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
          'browser', app.browser_of(s.user_agent),
          'device', app.device_of(s.user_agent),
          'this', s.id = app.session_id(),
          'signed_in_at', app.utc_words(s.created_at),
          'last_used_at', app.utc_words(greatest(d.last_used_at, s.refreshed_at at time zone 'utc', s.created_at)))
        order by s.created_at)
      from auth.sessions s
      left join app.devices d on d.session_id = s.id
      where s.user_id = me and (s.not_after is null or s.not_after > now())
    ), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
          'role', m.role,
          'joined_at', app.utc_words(m.joined_at),
          'left_at', case when m.left_at is null then null else app.utc_words(m.left_at) end,
          'now', m.left_at is null)
        order by m.joined_at)
      from public.plan_members m where m.person_id = me
    ), '[]'::jsonb),
    'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Import a backup: a new, empty plan of the person's own takes the place
-- of the one they have, in one step. `old_plan` is null for someone with no
-- plan in their account yet. Refused, with nothing changed:
-- - "not-found" for a plan that isn't the person's own (remove_plan),
-- - "shared-plan" while anyone else is in it (remove_plan): a backup never
--   goes into a shared plan,
-- - "has-a-plan" when they have a plan and didn't name it (D352), or are in
--   someone else's (D427).
-- The backup's records then go up through save_edit, as a first copy.
create function public.replace_plan(old_plan uuid, new_plan uuid, nation text) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
begin
  if new_plan is null or not app.session_ok() then
    perform app.refuse('not-found', '42501');
  end if;
  if old_plan = new_plan then
    perform app.refuse('not-found', '42501');
  end if;
  if old_plan is not null then
    perform public.remove_plan(old_plan);
  end if;
  -- start_plan does nothing for a plan the person owns already, so a plan
  -- that's still there by this id is refused rather than kept.
  if exists (select 1 from app.my_owned_plans() p where p = new_plan) then
    perform app.refuse('not-found', '42501');
  end if;
  perform public.start_plan(new_plan, nation);
  return jsonb_build_object('plan', new_plan, 'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Delete my account.

-- Each account deleted, as a scrambled id and when, for 30 days: so if a
-- backup from before is ever put back, the deletion can be made again
-- (`app.delete_again_after_restore`). The id is scrambled with the
-- database's own secret (step 3e hardening), so the list can't be checked
-- against anyone without it, and nothing else of the person is in it.
create table app.deletions (
  person_key text primary key,
  deleted_at timestamptz not null default now()
);
alter table app.deletions enable row level security;
revoke all on app.deletions from public, anon, authenticated;

create function app.person_key(person uuid) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.digest(s.secret || ':deleted:' || person::text, 'sha256'), 'hex')
  from app.address_secret s
$$;

-- How long the list is kept: longer than Supabase's paid plan keeps its
-- daily backups (7 days), and within brief 7.2's 30 days.
create function app.deletions_kept() returns interval
language sql immutable set search_path = '' as $$ select interval '30 days' $$;

-- A sign-in made in the last 10 minutes, on this device: "sign in again"
-- before deleting. A sign-in that's only been renewed since doesn't count.
create function app.fresh_sign_in() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = app.session_id() and s.user_id = auth.uid()
      and s.created_at > now() - interval '10 minutes'
  )
$$;

-- True for someone who is, or has ever been, in a plan with someone else:
-- their name is then in the other person's history, which waits for the
-- owner's choice (PLAN.md item 66).
create function app.ever_shared(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.plan_members mine
    join public.plan_members other on other.plan_id = mine.plan_id and other.person_id <> mine.person_id
    where mine.person_id = person
  )
$$;

-- Removes everything of one person's: their plans, with every record, change
-- and history in them; their name on invites to other plans; their codes,
-- tries and locks; their nudges; Supabase's own records of their sign-ins;
-- and their sign-in itself, which takes their identities, sessions, refresh
-- tokens, authenticator app, one-time codes, devices and backup email with
-- it. Then notes the deletion, scrambled. Gives the address they signed in
-- with, for the email that says it's done.
create function app.delete_person(me uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  address text;
  addresses text[];
begin
  select u.email into address from auth.users u where u.id = me;
  addresses := array_remove(array[lower(address),
    (select lower(b.email) from app.backup_emails b where b.person_id = me)], null);

  -- Their plans, and everything in them: records, changes, history, members,
  -- invites, notices and counters go with each (supabase/migrations, step 3a).
  delete from public.plans p where p.owner = me;

  -- Invites to someone else's plan that they asked to join and weren't let
  -- into: no longer theirs, and no longer waiting. An invite sent to one of
  -- their addresses keeps nothing of it.
  update public.invites i
    set asked_by = null, asked_at = null, email = null,
      cancelled_at = case when i.refused_at is null and i.accepted_at is null
        then coalesce(i.cancelled_at, now()) else i.cancelled_at end
    where i.asked_by = me;
  update public.invites i set email = null where lower(i.email) = any (addresses);

  -- Codes sent to their addresses, wrong tries, locks and asks.
  delete from app.email_codes c where c.person_id = me or lower(c.email) = any (addresses);
  delete from app.code_tries t where t.address_key in (select app.address_key(a) from unnest(addresses) a);
  delete from app.code_locks l where l.address_key in (select app.address_key(a) from unnest(addresses) a);
  delete from app.code_asks a where a.person_id = me;
  delete from app.get_back_in g where g.person_id = me;
  delete from app.devices d where d.person_id = me;

  -- The nudges sent to their phones hold nothing but the topic, which has
  -- their id in it. Supabase's own log of their sign-ins, when it's kept in
  -- the database, has their address. Both go, where this database may.
  begin
    delete from realtime.messages m where m.topic like 'plan:%:' || me::text;
  exception when insufficient_privilege or undefined_table then
    null;
  end;
  begin
    delete from auth.audit_log_entries e
      where e.payload ->> 'actor_id' = me::text or e.payload -> 'traits' ->> 'user_id' = me::text;
  exception when insufficient_privilege or undefined_table then
    null;
  end;
  delete from auth.flow_state f where f.user_id = me;
  delete from auth.refresh_tokens r where r.user_id = me::text;

  -- Their sign-in, with everything Supabase keeps for it, and their name.
  delete from auth.users u where u.id = me;
  delete from public.people p where p.id = me;

  delete from app.deletions d where d.deleted_at < now() - app.deletions_kept();
  insert into app.deletions (person_key) values (app.person_key(me)) on conflict (person_key) do nothing;
  return address;
end;
$$;

-- "Delete my account and all my data". Refused, with nothing changed:
-- - "not-allowed" for someone not signed in, or whose sign-in has ended,
-- - "sign-in-again" unless this device signed in in the last 10 minutes,
-- - "second-step-needed" unless, with two-step sign-in on, the
--   authenticator app's code was typed in the last 5 minutes,
-- - "confirm" unless "delete" was typed,
-- - "shared-plan" for someone who is or has been in a plan with someone
--   else, until the owner chooses what their partner's history then says.
-- Only ever the person asking: there's nobody else it can name.
create function public.delete_my_account(confirm text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  address text;
  emailed boolean := true;
begin
  if me is null or not app.session_ok() then
    perform app.refuse('not-allowed', '42501');
  end if;
  -- One at a time for this person, as joining and leaving are.
  perform 1 from public.people p where p.id = me for update;
  if not app.fresh_sign_in() then
    perform app.refuse('sign-in-again');
  end if;
  if not app.second_step_fresh() then
    perform app.refuse('second-step-needed', '42501');
  end if;
  if confirm is null or lower(btrim(confirm)) <> 'delete' then
    perform app.refuse('confirm');
  end if;
  if app.ever_shared(me) then
    perform app.refuse('shared-plan');
  end if;

  address := app.delete_person(me);

  -- The email that says it's done, sent once this step has finished. It
  -- names no amount, payment or note. With no way to send emails, the
  -- account is deleted all the same.
  begin
    perform app.send_email(address, 'Your PrePenny account has been deleted',
      'Your PrePenny account has been deleted', null,
      array['As you asked, at ' || app.when_words(now()) || ' we deleted your account and everything in it: '
          || 'your plan and its history, your signed-in devices, your backup email and your sign-in.',
        'Nothing of it is left in PrePenny. Copies in PrePenny''s backups, and in the records of the services '
          || 'that run it, are gone within 30 days.',
        'You can make a new account with this email address at any time.'],
      'If you didn''t ask for this, write to hello@prepenny.co.uk.');
  exception when sqlstate 'P0001' then
    emailed := false;
  end;
  return jsonb_build_object('deleted', true, 'emailed', emailed, 'now', app.server_time());
end;
$$;

-- After a backup from before is put back (README.md, "If a backup is ever
-- put back"): every account deleted since is deleted again, with no email.
-- Gives how many. For the database's own roles only, from the SQL Editor.
create function app.delete_again_after_restore() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  person uuid;
  done integer := 0;
begin
  for person in
    select u.id from auth.users u
    where app.person_key(u.id) in (select d.person_key from app.deletions d)
  loop
    perform app.delete_person(person);
    done := done + 1;
  end loop;
  return done;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A deleted account's phones: "hello" says "deleted" while the phone's
-- sign-in token lasts, so it removes everything at once, a change not sent
-- included, and says why. Everything else is refused already: every rule
-- needs the sign-in session, which went with the account.
create or replace function public.hello() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  standing text;
  problem text := app.version_problem();
  open_one app.get_back_in;
  asked jsonb;
  requests jsonb;
  joining jsonb;
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
  end if;
  return jsonb_build_object('sign_in', standing, 'version', coalesce(problem, 'ok'),
    'now', app.server_time(), 'get_back_in', asked, 'join_requests', coalesce(requests, '[]'::jsonb),
    'joining', coalesce(joining, '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can use which function, as at the end of every migration that adds to
-- `app` (00-every-table.test.sql): everything taken back, then only what the
-- rules and these steps call given to signed-in people.

revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on function public.my_account_data(), public.replace_plan(uuid, uuid, text),
  public.delete_my_account(text)
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
  app.sharing_now(), app.claiming_now(), app.privacy_step(uuid, uuid, uuid, uuid),
  app.undo_writes(uuid, uuid), app.mark_undone(uuid, uuid, uuid),
  app.server_kind(text), app.others_in(uuid), app.check_made_at(text), app.leaving_now()
  to authenticated;
grant execute on function public.my_account_data(), public.replace_plan(uuid, uuid, text),
  public.delete_my_account(text)
  to authenticated;
