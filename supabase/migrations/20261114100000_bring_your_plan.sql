-- Step 3f-2: joining with a plan of your own brings it with you (D426,
-- replacing D416), and a person is never in two plans (D427).
--
-- Sam has a plan of his own. Jess invites him to hers. He asks to join as
-- anyone does, and Jess chooses "Allow" or "Don't allow". Allowing doesn't
-- move anything: a plan is only ever moved by its own person's request, so
-- Jess's "Allow" lets him in, and his phone then makes the move in one step
-- of the server's own (`join_with_my_plan`):
--
-- - he becomes a member of Jess's plan, with the role the invite gave;
-- - every record of his own plan, live and removed, moves into Jess's plan,
--   private to him, saved again through the same checks as every record, so
--   the database itself fills in its privacy from what it's on. His history
--   of changes moves with it, private to him;
-- - his old plan is removed.
--
-- All of it happens, or none of it does: any refusal on the way takes the
-- whole step back, and he stays in his own plan with everything as it was.
--
-- What Jess sees: that he's joined, and the name he gave. Nothing of his
-- plan reaches her until he chooses to share an account (step 3f's
-- `share_accounts`). Every refusal is a short code, with no amount, name,
-- note or email address, and nothing here writes to a log.

-- ---------------------------------------------------------------------------
-- 1. "Allow" for someone with a plan of their own.

alter table public.invites
  -- Allowed by the plan's owner, waiting for the asker's phone to bring
  -- their plan in. Set only for someone who has a plan of their own.
  add column allowed_at timestamptz;

-- What an invite is now, as in step 3f, with one more: allowed, waiting for
-- the asker's phone to bring their plan. An invite allowed but not finished
-- within its 7 days runs out, as any invite does.
create or replace function app.invite_state(invite public.invites) returns text
language sql stable set search_path = '' as $$
  select case
    when invite.accepted_at is not null then 'joined'
    when invite.refused_at is not null then 'not-allowed'
    when invite.cancelled_at is not null then 'cancelled'
    when invite.expires_at <= now() then 'ran-out'
    when invite.allowed_at is not null then 'allowed'
    when invite.asked_by is not null then 'waiting'
    else 'open'
  end
$$;

-- The places taken in a plan now: the people in it, and anyone let in whose
-- phone is still bringing their plan, so a plan never has more people than
-- it allows (brief 4.14's limit, `max_members`).
create or replace function app.members_now(plan uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select ((select count(*) from public.plan_members m where m.plan_id = plan and m.left_at is null)
    + (select count(*) from public.invites i where i.plan_id = plan and app.invite_state(i) = 'allowed'))::integer
$$;

-- The plan a person would bring with them: the one plan they're in, when
-- it's their own and nobody else is in it. Null when they're in no plan, or
-- in one they can't bring: someone else's, or their own shared with someone,
-- which leaving (step 3g) comes before.
create function app.plan_to_bring(person uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.plan_id from public.plan_members m
  where m.person_id = person and m.left_at is null and m.role = 'owner'
    and (select count(*) from public.plan_members x where x.person_id = person and x.left_at is null) = 1
    and not exists (select 1 from public.plan_members o
      where o.plan_id = m.plan_id and o.left_at is null and o.person_id <> person)
$$;

-- What an invite is, for the signed-in person looking: as in step 3f, with
-- what comes with them. For someone with a plan they can bring: `brings`,
-- and the bank holidays of both plans (`nation` the inviter's, `own_nation`
-- theirs), so they're told before they ask what joining changes (D426). The
-- invite's own id goes only to the person who asked with it.
create function app.invite_look(found_one public.invites) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  state text := app.invite_state(found_one);
  bring uuid;
begin
  if found_one.asked_by is distinct from me then
    state := case
      when exists (select 1 from public.plan_members m
          where m.plan_id = found_one.plan_id and m.person_id = me and m.left_at is null)
        then case when (select p.owner from public.plans p where p.id = found_one.plan_id) = me
          then 'yours' else 'member' end
      when state in ('joined', 'not-allowed', 'waiting', 'allowed') then 'used'
      when state <> 'open' then state
      when app.members_now(found_one.plan_id)
          >= (select p.max_members from public.plans p where p.id = found_one.plan_id) then 'full'
      when app.in_a_plan(me) and app.plan_to_bring(me) is null then 'has-a-plan'
      else 'open'
    end;
  end if;
  if state in ('open', 'waiting', 'allowed') then
    bring := app.plan_to_bring(me);
  end if;
  return jsonb_build_object('state', state, 'role', found_one.role,
      'inviter', case when state in ('open', 'waiting', 'allowed', 'joined', 'not-allowed', 'has-a-plan',
          'member', 'full') then app.owner_name(found_one.plan_id) end,
      'expires_at', app.utc_words(found_one.expires_at), 'now', app.server_time())
    || case when found_one.asked_by = me then jsonb_build_object('invite', found_one.id) else '{}'::jsonb end
    || case when bring is null then '{}'::jsonb else jsonb_build_object('brings', true,
      'nation', (select p.nation from public.plans p where p.id = found_one.plan_id),
      'own_nation', (select p.nation from public.plans p where p.id = bring)) end;
end;
$$;

-- An invite link, looked at by the signed-in person who opened it.
create or replace function public.look_at_invite(token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_one public.invites;
begin
  if not app.session_ok() then
    perform app.refuse('not-found', '42501');
  end if;
  select * into found_one from public.invites i where i.token_hash = app.invite_hash(token);
  if not found or token is null or length(token) < 20 then
    return jsonb_build_object('state', 'not-found');
  end if;
  return app.invite_look(found_one);
end;
$$;

-- The invite the person asked with, by its id, for their other phones and
-- for "Finish joining" on any screen, where the link isn't to hand. Only for
-- the person who asked with it: anyone else is told it isn't there.
create function public.look_at_my_invite(invite uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_one public.invites;
begin
  if not app.session_ok() then
    perform app.refuse('not-found', '42501');
  end if;
  select * into found_one from public.invites i where i.id = invite and i.asked_by = auth.uid();
  if not found then
    return jsonb_build_object('state', 'not-found');
  end if;
  return app.invite_look(found_one);
end;
$$;

-- "Allow" or "Don't allow", as in step 3f. Allowing someone with no plan
-- adds them now. Allowing someone with a plan of their own, alone in it,
-- marks the invite allowed and tells their phones, which bring the plan in
-- with their own request: nobody else's request ever moves a plan.
create or replace function public.answer_join(invite uuid, allow boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_one public.invites;
  bring uuid;
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
  if app.in_a_plan(found_one.asked_by) then
    bring := app.plan_to_bring(found_one.asked_by);
    -- In someone else's plan, or their own shared with someone: never two plans (D427).
    if bring is null then
      perform app.refuse('has-a-plan');
    end if;
    update public.invites i set allowed_at = now() where i.id = invite;
    -- Their phones look now, and bring their plan in.
    perform app.send_nudge('plan:' || bring || ':' || found_one.asked_by);
    return jsonb_build_object('state', 'allowed', 'now', app.server_time());
  end if;
  insert into public.plan_members as m (plan_id, person_id, role)
  values (found_one.plan_id, found_one.asked_by, found_one.role)
  on conflict (plan_id, person_id) do update
    set role = excluded.role, left_at = null, joined_at = now();
  update public.invites i set accepted_at = now(), accepted_by = found_one.asked_by where i.id = invite;
  perform app.send_nudge('plan:' || found_one.plan_id);
  return jsonb_build_object('state', 'joined', 'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Moving a plan.

-- Moves every record of one plan into another, private to its person, and
-- removes the old plan. Called only by public.join_with_my_plan, which has
-- checked who's asking, that the old plan is theirs and theirs alone, and
-- has made them a member of the new one and begun the edit. Gives back the
-- payment families moved, for the family rules (D332).
--
-- Each record keeps its own id and everything in it. Rows whose id is worked
-- out from their plan (a one-off change, a tick, overtime's details, the
-- person's settings: lib/sync-ids.ts) get the id the phone works out for the
-- new plan, so the phone and the server agree on every row. Links that were
-- kept apart because a shared payment named something private (D291) are
-- joined back on, as everything is private now: the phone keeps them on the
-- record itself then. Money kept as "From Sam" in an account Sam had shared
-- before anyone joined becomes a payment of its own, private like the rest:
-- the two halves are no longer kept in step, and every amount and date stays.
create function app.move_plan(old uuid, target uuid, me uuid) returns uuid[]
language plpgsql volatile set search_path = '' as $$
declare
  t text;
  taken jsonb := '{}'::jsonb;
  got jsonb;
  one jsonb;
  link jsonb;
  family_debt jsonb := '{}'::jsonb;
  family_goal jsonb := '{}'::jsonb;
  jobs jsonb := '{}'::jsonb;
  tick_debt jsonb := '{}'::jsonb;
  -- Parents before what names them, as the phone sends a first copy.
  tables text[] := array['accounts', 'debts', 'pay_profiles', 'pay_weeks', 'goals', 'budgets',
    'balance_updates', 'series', 'payment_changes', 'ticks', 'spends', 'pay_adjustments',
    'pay_adjustment_details', 'settings'];
begin
  -- Everything in the old plan as it is now, removed records too.
  for t in select unnest(tables) loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(r) order by %s), ''[]''::jsonb) from public.%I r where r.plan_id = $1',
      case when t = 'series'
        then 'r.family_id, r.id <> r.family_id, coalesce(r.first_number, 0), r.id'
        else 'r.list_order, r.id' end,
      t) into got using old;
    taken := taken || jsonb_build_object(t, got);
  end loop;

  -- The private links, to join back on.
  for link in select to_jsonb(l) from public.private_links l where l.plan_id = old and not l.deleted loop
    if link ->> 'family_id' is not null and link ->> 'debt_id' is not null then
      family_debt := family_debt || jsonb_build_object(link ->> 'family_id', link -> 'debt_id');
    elsif link ->> 'family_id' is not null and link ->> 'goal_id' is not null then
      family_goal := family_goal || jsonb_build_object(link ->> 'family_id', link -> 'goal_id');
    elsif link ->> 'series_id' is not null then
      jobs := jobs || jsonb_build_object(link ->> 'series_id', link);
    elsif link ->> 'tick_id' is not null then
      tick_debt := tick_debt || jsonb_build_object(link ->> 'tick_id', link -> 'in_debt_update');
    end if;
  end loop;

  -- The history of changes comes too, private to its person.
  update public.edits e set plan_id = target, private_to = me where e.plan_id = old;

  -- The old plan goes, and everything in it with it (its records are above).
  delete from public.plans p where p.id = old;

  -- Saved again in the new plan, through the same checks as every record.
  for t in select unnest(tables) loop
    for one in select value from jsonb_array_elements(taken -> t) loop
      one := one || jsonb_build_object('plan_id', target);
      case t
        when 'accounts', 'debts', 'goals', 'pay_profiles' then
          one := one || jsonb_build_object('private_to', me, 'belongs_to', me);
        when 'series' then
          one := one || jsonb_build_object('locked_to', null, 'mirrored_by', null);
          if one ->> 'debt_id' is null and family_debt ? (one ->> 'family_id') then
            one := one || jsonb_build_object('debt_id', family_debt -> (one ->> 'family_id'));
          end if;
          if one ->> 'goal_id' is null and family_goal ? (one ->> 'family_id') then
            one := one || jsonb_build_object('goal_id', family_goal -> (one ->> 'family_id'));
          end if;
          if one ->> 'pay_profile_id' is null and jobs ? (one ->> 'id') then
            one := one || jsonb_build_object(
              'pay_profile_id', jobs -> (one ->> 'id') -> 'pay_profile_id',
              'cycle_pay_weeks', jobs -> (one ->> 'id') -> 'cycle_pay_weeks');
          end if;
        when 'payment_changes' then
          one := one || jsonb_build_object('locked_to', null,
            'id', app.derived_id(target, 'payment_changes',
              coalesce(one ->> 'series_id', one ->> 'budget_id'), one ->> 'original_date', ''));
        when 'ticks' then
          if one ->> 'in_debt_update' is null and tick_debt ? (one ->> 'id') then
            one := one || jsonb_build_object('in_debt_update', tick_debt -> (one ->> 'id'));
          end if;
          one := one || jsonb_build_object('locked_to', null,
            'id', app.derived_id(target, 'ticks',
              coalesce(one ->> 'series_id', one ->> 'budget_id'), one ->> 'original_date',
              case when (one ->> 'set_aside')::boolean then 'set-aside' else '' end));
        when 'pay_adjustments' then
          one := one || jsonb_build_object('locked_to', null);
        when 'pay_adjustment_details' then
          one := one || jsonb_build_object('private_to', me,
            'id', app.derived_id(target, 'pay-adjustment-details', one ->> 'adjustment_id'));
        when 'settings' then
          -- Only the person's own: a plan of one person has no one else's.
          continue when one ->> 'private_to' is distinct from me::text;
          one := one || jsonb_build_object('private_to', me,
            'id', app.derived_id(target, 'settings', me::text));
        else
          null;
      end case;
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', t, t)
        using one;
    end loop;
  end loop;

  return array(select distinct (s ->> 'family_id')::uuid from jsonb_array_elements(taken -> 'series') s);
end;
$$;

-- "Join and bring my plan": the person who asked, once the plan's owner has
-- allowed it, joins with the role the invite gave, and their own plan comes
-- with them, private to them (D426). One step: all of it, or nothing.
--
-- Only the person who asked with the invite can, only once it's allowed,
-- only with a plan of their own that nobody else is in, and only while the
-- inviter's plan uses the bank holidays they were shown (`nation`): if it
-- changed meanwhile, "nation-changed", and they're told again. `nation` only
-- matters when a plan comes with them. Someone whose
-- plan was removed meanwhile just joins. Sent twice, it changes nothing the
-- second time. Refusals: "not-found" (42501), "waiting", "cancelled",
-- "ran-out", "not-allowed", "full", "has-a-plan", "nation-changed",
-- "family-broken", "bad-record", and the record checks' own codes.
create function public.join_with_my_plan(invite uuid, nation text, edit uuid, made_at text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  me uuid := auth.uid();
  found_one public.invites;
  target public.plans;
  old uuid;
  families uuid[];
begin
  if invite is null or edit is null or not app.session_ok() then
    perform app.refuse('not-found', '42501');
  end if;
  -- One at a time for this person, as making a plan is (D352): nothing can
  -- make or join another plan of theirs meanwhile.
  perform 1 from public.people p where p.id = me for update;
  select * into found_one from public.invites i where i.id = invite for update;
  if not found or found_one.asked_by is distinct from me then
    perform app.refuse('not-found', '42501');
  end if;
  -- Sent again after it worked: nothing changes.
  if found_one.accepted_at is not null and found_one.accepted_by = me
    and exists (select 1 from public.plan_members m
      where m.plan_id = found_one.plan_id and m.person_id = me and m.left_at is null) then
    return jsonb_build_object('state', 'joined', 'saved', 'already', 'now', app.server_time());
  end if;
  if app.invite_state(found_one) <> 'allowed' then
    perform app.refuse(app.invite_state(found_one));
  end if;

  -- One join into the plan at a time, so it never has more people than it allows.
  select * into target from public.plans p where p.id = found_one.plan_id for no key update;
  if (select count(*) from public.plan_members m where m.plan_id = target.id and m.left_at is null)
    + (select count(*) from public.invites i
        where i.plan_id = target.id and i.id <> invite and app.invite_state(i) = 'allowed')
    >= target.max_members then
    perform app.refuse('full');
  end if;

  -- The plan that comes with them: theirs, with nobody else in it (D427).
  if app.in_a_plan(me) then
    old := app.plan_to_bring(me);
    if old is null then
      perform app.refuse('has-a-plan');
    end if;
    -- The bank holidays they were told about are the ones their plan gets.
    if nation is distinct from target.nation then
      perform app.refuse('nation-changed');
    end if;
    -- Every save to it waits until this is done, so nothing saved is left behind.
    perform 1 from public.plans p where p.id = old for update;
  end if;

  insert into public.plan_members as m (plan_id, person_id, role)
  values (target.id, me, found_one.role)
  on conflict (plan_id, person_id) do update
    set role = excluded.role, left_at = null, joined_at = now();
  if app.begin_edit(target.id, edit, made_at, 'join-with-plan') = 'already' then
    perform app.refuse('not-found', '42501');
  end if;

  if old is not null then
    perform set_config('prepenny.edit', edit::text, true);
    begin
      families := app.move_plan(old, target.id, me);
    exception
      when sqlstate 'P0001' or insufficient_privilege then
        raise;
      when others then
        -- Postgres's own message could show what a record holds (D331).
        perform app.refuse('bad-record');
    end;
    perform set_config('prepenny.edit', '', true);
    if app.family_rules_problem(target.id, families) is not null then
      perform app.refuse('family-broken');
    end if;
  end if;

  update public.invites i set accepted_at = now(), accepted_by = me where i.id = invite;
  -- Everyone in the plan looks again, and the person's own phones, including
  -- any still keeping the old plan, which then bring the new one down.
  perform app.send_nudge('plan:' || target.id);
  perform app.send_nudge('plan:' || target.id || ':' || me);
  if old is not null then
    perform app.send_nudge('plan:' || old || ':' || me);
  end if;
  return jsonb_build_object('state', 'joined', 'saved', 'new', 'brought', old is not null,
    'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Never in two plans (D427).

-- A new plan of a person's own is refused while they're in any plan now,
-- theirs or someone else's, as well as when they own one already (D352).
create or replace function app.one_plan_each() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.people p where p.id = new.owner for update;
  if exists (select 1 from public.plans p where p.owner = new.owner and p.id <> new.id)
    or exists (select 1 from public.plan_members m
      where m.person_id = new.owner and m.left_at is null and m.plan_id <> new.id) then
    perform app.refuse('has-a-plan');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. What the screens are told.

-- "Share with my partner", as in step 3f: an invite allowed and waiting for
-- the other phone counts as the one open, with the name of who asked.
create or replace function public.sharing(plan uuid) returns jsonb
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
    select * into latest from public.invites i where i.plan_id = plan
      order by app.invite_state(i) in ('open', 'waiting', 'allowed') desc, i.created_at desc limit 1;
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
      'state', app.invite_state(latest), 'expires_at', app.utc_words(latest.expires_at),
      'asker', case when app.invite_state(latest) = 'allowed'
        then (select coalesce(p.nickname, '') from public.people p where p.id = latest.asked_by) end) end,
    'requests', case when owns then app.join_requests() else '[]'::jsonb end,
    'now', app.server_time());
end;
$$;

-- The invites this person asked with that have been allowed and are waiting
-- for one of their phones to bring their plan in: "Finish joining".
create function app.my_joining() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('invite', i.id, 'inviter', app.owner_name(i.plan_id))
      order by i.allowed_at), '[]'::jsonb)
  from public.invites i
  where i.asked_by = auth.uid() and app.invite_state(i) = 'allowed'
$$;

-- The phone's look at its sign-in, as in step 3f, also says when this
-- person has been let in and their plan is waiting to be brought.
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
-- rules and the phone's steps call given to signed-in people.

revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on function public.look_at_my_invite(uuid), public.join_with_my_plan(uuid, text, uuid, text)
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
grant execute on function public.look_at_my_invite(uuid), public.join_with_my_plan(uuid, text, uuid, text)
  to authenticated;
