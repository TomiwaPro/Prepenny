-- Step 3c: your plan on the server (ARCHITECTURE.md 3.5, PLAN.md items 25 and 27).
--
-- 1. `save_edit`: every change a phone sends is one edit with its records,
--    saved whole or not at all. It runs as the person (security invoker), so
--    every record it writes goes through the same privacy rules and checks
--    as before (steps 3a and 3b). It adds what those rules can't:
--    - the same edit sent twice changes nothing the second time;
--    - a record changed since the phone last saw it refuses the whole edit
--      ("changed-since"), so nothing is overwritten unseen (step 3d decides
--      what the phone does then);
--    - the engine's rules for a payment's family (item 27);
--    - the edit itself in the history, which only the server writes (D296);
--    - a nudge to the plan's other phones, which holds no money data.
--    The two things a person can't do themselves, writing the history and
--    sending the nudge, are done by two small helpers with the database's own
--    rights, `app.begin_edit` and `app.nudge`. Each checks who's asking
--    itself, and the `app` part is never on the Data API.
-- 2. `plan_changes`: everything in a plan the person can read, after the
--    change numbers their phone already has. It runs as the person, so the
--    privacy rules decide every row: a partner never gets anything private.
-- 3. `start_plan` makes a plan for the first copy; `remove_plan` removes the
--    person's own plan when they choose to keep the one on their phone.
-- 4. The rules for the plan's live nudges (Supabase Realtime, D295).
--
-- Nothing here ever puts an amount, a name, a note or an email address into
-- a refusal: only short codes and record ids (D87, CLAUDE.md).

-- ---------------------------------------------------------------------------
-- 1. Which edit a record is saved in.

-- The edit `save_edit` is saving now, or nothing. It's set only by save_edit,
-- for its own transaction; nobody can set it through the Data API.
create function app.current_edit() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('prepenny.edit', true), '')::uuid
$$;

-- The edit a record saved now names. Every edit starts private to its
-- person, so a partner never sees when someone changed only private things
-- (D299). The first shared record saved in it makes it shared, so everyone
-- who reads that record can read the edit it names (D291). It holds no
-- before-copies or summary yet (Activity is step 3g), so a shared edit says
-- nothing about anything private.
create function app.edit_for(private uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  edit uuid := app.current_edit();
begin
  if edit is not null and private is null then
    update public.edits set private_to = null
      where id = edit and person_id = auth.uid() and private_to is not null;
  end if;
  return edit;
end;
$$;

create or replace function app.fill_sync_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Someone outside the plan is refused before anything is counted.
  if app.from_a_person() and not exists (select 1 from app.my_plans() p where p = new.plan_id) then
    perform app.refuse('not-found', '42501');
  end if;
  -- Inside save_edit, the record names the edit being saved, whatever was sent.
  if app.current_edit() is not null then
    new.edit_id := app.edit_for(new.private_to);
  end if;
  -- The edit that saved it is in the plan, and everyone who can read this
  -- record can read the edit too, so a shared record never names a private
  -- edit (D291). One that doesn't exist is refused the same way.
  if new.edit_id is not null and not exists (select 1 from public.edits e
      where e.id = new.edit_id and e.plan_id = new.plan_id
        and (e.private_to is null or e.private_to is not distinct from new.private_to)) then
    perform app.refuse('not-found', '42501');
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    new.version := 1;
  else
    if new.id <> old.id or new.plan_id <> old.plan_id then
      perform app.refuse('fixed-field');
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.version := old.version + 1;
  end if;
  new.changed_at := now();
  new.changed_by := auth.uid();
  new.seq := app.next_seq(new.plan_id, new.private_to);
  return new;
end;
$$;

-- The plan's own row (its nation) names the edit too, and is shared.
create or replace function app.before_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.owner := coalesce(auth.uid(), new.owner);
    new.created_at := now();
    new.created_by := auth.uid();
    new.version := 1;
    new.seq := 1;
  else
    if new.id <> old.id or new.owner <> old.owner then
      perform app.refuse('fixed-field');
    end if;
    -- Only the owner renames the plan (ARCHITECTURE.md 3.6).
    if new.name is distinct from old.name
      and not exists (select 1 from app.my_owned_plans() p where p = new.id)
      and auth.uid() is not null then
      perform app.refuse('owner-only', '42501');
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.version := old.version + 1;
    new.seq := app.next_seq(new.id, null);
    if app.current_edit() is not null then
      new.edit_id := app.edit_for(null);
    end if;
  end if;
  new.changed_at := now();
  new.changed_by := auth.uid();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The helpers with the database's own rights. Each answers only about the
-- person asking, and checks everything it's given.

-- Starts saving an edit: writes it in the history, private to its person
-- (D296). Says 'new', or 'already' when this person has saved this edit in
-- this plan before, so the same edit sent twice changes nothing. Anything
-- else is refused as not found: someone else's edit id, another plan, a plan
-- the person isn't in, or a sign-in that has ended (D21).
create function app.begin_edit(plan uuid, edit uuid, made text, what text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  saved record;
begin
  if not app.session_ok() or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  insert into public.edits as e (id, plan_id, private_to, person_id, made_at, kind)
  values (edit, plan, auth.uid(), auth.uid(), made::app.utc_time, what)
  on conflict (id) do nothing;
  if found then
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

-- Nudges the plan's other phones that something changed (ARCHITECTURE.md
-- 3.5): "plan:<id>" for shared records, which everyone in the plan hears,
-- and "plan:<id>:<person>" for a person's private ones, which only their own
-- phones hear (D299). The nudge says nothing at all: each phone then asks
-- for what's new. Only a current member nudges, and only their own plan.
create function app.nudge(plan uuid, shared boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  perform app.send_nudge(case when shared then 'plan:' || plan else 'plan:' || plan || ':' || auth.uid() end);
end;
$$;

-- Sends one nudge through Supabase Realtime, on a private channel, with
-- nothing in it. A nudge that can't be sent never stops a change being
-- saved: the phones also look for changes when they open, when they come
-- back on screen and every minute or so.
create function app.send_nudge(topic text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', topic, true);
exception when others then
  -- No live updates here: the phones still find the change themselves.
  null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The engine's rules for a payment's family (D49, D89, D94, PLAN.md item
-- 27), checked after every edit for the families it touched. The engine makes
-- only families like these; the server refuses one that isn't, whoever sends
-- it. Runs as the person: a family has one privacy, so they see all of it.

create function app.family_rules_problem(plan uuid, families uuid[]) returns text
language plpgsql stable set search_path = '' as $$
declare
  family uuid;
begin
  foreach family in array coalesce(families, '{}') loop
    -- Each payment number belongs to one series of the family.
    if exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and not s.deleted
        group by coalesce(s.first_number, 0) having count(*) > 1) then
      return 'family-broken';
    end if;
    -- The family's first series is the one it's named after, and starts at payment 0.
    if exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family
          and ((s.split_from is null) <> (s.id = family)
            or (s.split_from is null and coalesce(s.first_number, 0) <> 0))) then
      return 'family-broken';
    end if;
    -- A series split from another starts after it.
    if exists (select 1 from public.series s join public.series parent on parent.id = s.split_from
        where s.plan_id = plan and s.family_id = family and not s.deleted
          and (parent.family_id <> family
            or coalesce(s.first_number, 0) <= coalesce(parent.first_number, 0))) then
      return 'family-broken';
    end if;
    -- Only the family's last series can end with a different last amount,
    -- and every series before it ends.
    if exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and not s.deleted
          and exists (select 1 from public.series later
            where later.plan_id = plan and later.family_id = family and not later.deleted
              and coalesce(later.first_number, 0) > coalesce(s.first_number, 0))
          and (s.last_amount is not null or s.end_rule ->> 'kind' = 'never')) then
      return 'family-broken';
    end if;
    -- The two halves of a private transfer match (D94): the private half
    -- names its shared half, which is on its own family, and carries the same
    -- money on the same days. Only the person whose money it is sees both.
    if exists (select 1 from public.series s
        left join public.series half on half.id = s.mirrored_by and half.plan_id = plan
        where s.plan_id = plan and s.family_id = family and s.mirrored_by is not null
          and (half.id is null or half.family_id = family or half.deleted <> s.deleted
            or (not s.deleted and (half.amount <> s.amount
              or half.amount_cycle is distinct from s.amount_cycle
              or half.cycle_offset is distinct from s.cycle_offset
              or half.start_date <> s.start_date or half.schedule <> s.schedule
              or half.end_rule <> s.end_rule or half.last_amount is distinct from s.last_amount
              or half.holiday_rule <> s.holiday_rule or half.is_estimate <> s.is_estimate
              or coalesce(half.first_number, 0) <> coalesce(s.first_number, 0))))) then
      return 'family-broken';
    end if;
    -- A shared half locked to this person mirrors exactly one private half of theirs.
    if exists (select 1 from public.series half
        where half.plan_id = plan and half.family_id = family and not half.deleted
          and half.locked_to = auth.uid()
          and (select count(*) from public.series s
            where s.plan_id = plan and s.mirrored_by = half.id and not s.deleted) <> 1) then
      return 'family-broken';
    end if;
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Saving an edit.

-- The tables an edit can write, and what's filled in by the database rather
-- than sent: the sync fields (ARCHITECTURE.md 3.1) and who ticked, recorded
-- or is locked out of a record (D293, D303).
create function app.sent_columns(t text) returns text[]
language sql stable set search_path = '' as $$
  select array_agg(a.attname::text order by a.attnum)
  from pg_catalog.pg_attribute a
  where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname <> all (array['id', 'plan_id', 'version', 'seq', 'created_at', 'created_by',
      'changed_at', 'changed_by', 'edit_id', 'deleted', 'ticked_by', 'recorded_by'])
    and not (t in ('payment_changes', 'ticks', 'pay_adjustments') and a.attname = 'locked_to')
$$;

-- Saves one edit: `writes` is a list of {table, id, version, row}.
-- - `version` null with a `row`: a new record.
-- - `version` n with a `row`: the record as it is now, replacing version n.
-- - `version` n with no `row`: the record is removed (marked removed, so every
--   phone hears about it, ARCHITECTURE.md 3.1).
-- `row` holds the record's own columns, all of them, null where empty; the
-- database fills in the rest.
-- Gives back each record's new version and change number, for the phone.
create function public.save_edit(plan uuid, edit uuid, made_at text, kind text, writes jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  write jsonb;
  t text;
  record_id uuid;
  base integer;
  new_row jsonb;
  column_list text;
  saved_version integer;
  saved_seq bigint;
  saved_private uuid;
  saved_deleted boolean;
  seen integer;
  results jsonb := '[]'::jsonb;
  changed jsonb := '[]'::jsonb;
  families uuid[] := '{}'::uuid[];
  shared boolean := false;
  mine boolean := false;
  problem text;
begin
  if plan is null or edit is null or writes is null or jsonb_typeof(writes) <> 'array'
    or jsonb_array_length(writes) > 1000
    or kind is null or kind !~ '^[a-z][a-z-]{0,39}$'
    or made_at is null
    or made_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$' then
    perform app.refuse('bad-edit');
  end if;

  -- Only someone in the plan, while their sign-in lasts (D21).
  if app.begin_edit(plan, edit, made_at, kind) = 'already' then
    -- Sent before and saved: nothing changes. The phone gets each record's
    -- version as it is now, as far as it can read it.
    for write in select * from jsonb_array_elements(writes) loop
      t := write ->> 'table';
      saved_version := null;
      if t = 'plans' then
        select p.version, p.seq, null::uuid, false into saved_version, saved_seq, saved_private, saved_deleted
          from public.plans p where p.id = plan;
      elsif t = any (app.record_tables()) then
        execute format('select version, seq, private_to, deleted from public.%I where id = $1 and plan_id = $2', t)
          into saved_version, saved_seq, saved_private, saved_deleted using (write ->> 'id')::uuid, plan;
      else
        perform app.refuse('bad-edit');
      end if;
      if saved_version is not null then
        results := results || jsonb_build_object('table', t, 'id', write ->> 'id', 'version', saved_version,
          'seq', saved_seq, 'private_to', saved_private, 'deleted', saved_deleted);
      end if;
    end loop;
    return jsonb_build_object('saved', 'already', 'rows', results);
  end if;

  -- From here, every record saved names this edit (app.fill_sync_fields).
  perform set_config('prepenny.edit', edit::text, true);

  begin
    for write in select * from jsonb_array_elements(writes) loop
      t := write ->> 'table';
      record_id := (write ->> 'id')::uuid;
      base := (write ->> 'version')::integer;
      new_row := write -> 'row';
      if new_row = 'null'::jsonb then
        new_row := null;
      end if;
      if record_id is null or (new_row is not null and jsonb_typeof(new_row) <> 'object')
        or (new_row is null and base is null) then
        perform app.refuse('bad-edit');
      end if;
      saved_version := null;

      if t = 'plans' then
        -- Only the plan's bank holidays change through an edit (D155, D289).
        if record_id <> plan or base is null or new_row is null then
          perform app.refuse('bad-edit');
        end if;
        update public.plans p set nation = new_row ->> 'nation'
          where p.id = plan and p.version = base
          returning p.version, p.seq, null::uuid, false into saved_version, saved_seq, saved_private, saved_deleted;
      elsif t = any (app.record_tables()) then
        if new_row is null then
          execute format('update public.%I set deleted = true where id = $1 and plan_id = $2 and version = $3
              returning version, seq, private_to, deleted', t)
            into saved_version, saved_seq, saved_private, saved_deleted using record_id, plan, base;
        else
          -- The columns sent, of those a phone may send. The phone sends every
          -- one, null where empty; one left out keeps its default or its value.
          select string_agg(format('%I', c), ', ') into column_list
            from unnest(app.sent_columns(t)) c where new_row ? c;
          if column_list is null then
            perform app.refuse('bad-edit');
          end if;
          if base is null then
            -- Made already, by this person's other phone or someone else in
            -- the plan: changed since (a clash, step 3d).
            execute format('select count(*) from public.%I where id = $1 and plan_id = $2', t)
              into seen using record_id, plan;
            if seen = 0 then
              execute format('insert into public.%1$I (id, plan_id, %2$s)
                  select $1, $2, %2$s from jsonb_populate_record(null::public.%1$I, $3)
                  returning version, seq, private_to, deleted', t, column_list)
                into saved_version, saved_seq, saved_private, saved_deleted using record_id, plan, new_row;
            end if;
          else
            execute format('update public.%1$I set (%2$s, deleted) =
                  (select %2$s, false from jsonb_populate_record(null::public.%1$I, $2))
                where id = $1 and plan_id = $3 and version = $4
                returning version, seq, private_to, deleted', t, column_list)
              into saved_version, saved_seq, saved_private, saved_deleted using record_id, new_row, plan, base;
          end if;
        end if;
      else
        perform app.refuse('bad-edit');
      end if;

      if saved_version is null then
        -- Nothing was saved. Either it isn't at the version the phone saw
        -- (changed since), or the person may read it but not change it ("Can
        -- view only", or locked to someone else), or they can't see it at
        -- all, which is refused as not found (D290).
        if t = 'plans' then
          select p.version into seen from public.plans p where p.id = plan;
        else
          execute format('select version from public.%I where id = $1 and plan_id = $2', t)
            into seen using record_id, plan;
        end if;
        if seen is null then
          perform app.refuse('not-found', '42501');
        end if;
        if base is not null and seen = base then
          perform app.refuse('not-allowed', '42501');
        end if;
        changed := changed || jsonb_build_object('table', t, 'id', record_id);
        continue;
      end if;

      if t = 'series' then
        families := families || (select s.family_id from public.series s where s.id = record_id);
      end if;
      if saved_private is null then
        shared := true;
      else
        mine := true;
      end if;
      results := results || jsonb_build_object('table', t, 'id', record_id, 'version', saved_version,
        'seq', saved_seq, 'private_to', saved_private, 'deleted', saved_deleted);
    end loop;
  exception
    -- PrePenny's own refusals and the privacy rules' own say no more than a code.
    when sqlstate 'P0001' or insufficient_privilege then
      raise;
    -- Anything else, such as a box the database checks, would say what the
    -- record holds, and that could be an amount or a name. So only a code
    -- goes back, and into the database's logs (CLAUDE.md).
    when unique_violation then
      perform app.refuse('not-found', '42501');
    when others then
      perform app.refuse('bad-record');
  end;

  -- Anything changed since the phone saw it refuses the whole edit, cleanly:
  -- nothing of it is saved, and the phone hears which records (step 3d).
  if jsonb_array_length(changed) > 0 then
    raise exception using errcode = 'P0001', message = 'changed-since', detail = changed::text;
  end if;

  problem := app.family_rules_problem(plan, families);
  if problem is not null then
    perform app.refuse(problem);
  end if;

  if shared then
    perform app.nudge(plan, true);
  end if;
  if mine then
    perform app.nudge(plan, false);
  end if;
  return jsonb_build_object('saved', 'new', 'rows', results);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Bringing a plan down.

-- Every record of the plan the person can read with a change number after
-- the ones their phone has: `shared_after` for the plan's shared records,
-- `mine_after` for their own private ones (D299). Removed records come too,
-- so the phone removes them. Runs as the person: the privacy rules decide
-- every row, so a partner never gets anything private (D16, D303).
create function public.plan_changes(plan uuid, shared_after bigint, mine_after bigint)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  t text;
  found_rows jsonb;
  all_rows jsonb := '[]'::jsonb;
  the_plan jsonb;
begin
  if plan is null or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  select jsonb_build_object('id', p.id, 'nation', p.nation, 'owner', p.owner, 'version', p.version,
      'seq', p.seq, 'changed_at', p.changed_at)
    into the_plan from public.plans p where p.id = plan;
  for t in select unnest(app.record_tables()) loop
    execute format($q$
      select coalesce(jsonb_agg(jsonb_build_object('table', %L, 'row',
          to_jsonb(r) - 'plan_id' - 'created_at' - 'created_by' - 'edit_id') order by r.seq), '[]'::jsonb)
      from public.%I r
      where r.plan_id = $1
        and ((r.private_to is null and r.seq > $2) or (r.private_to = auth.uid() and r.seq > $3))
    $q$, t, t) into found_rows using plan, coalesce(shared_after, 0), coalesce(mine_after, 0);
    all_rows := all_rows || found_rows;
  end loop;
  return jsonb_build_object('plan', the_plan, 'rows', all_rows,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('person', m.person_id, 'role', m.role)), '[]'::jsonb)
      from public.plan_members m where m.plan_id = plan and m.left_at is null));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Making and removing a plan.

-- Makes a plan for the first copy from a phone, with the phone's own id, or
-- does nothing when this person has made it already. Runs as the person:
-- anyone signed in can make a plan, and becomes its owner (step 3a). Someone
-- signing up for the first time is added to `people` too.
create function public.start_plan(plan uuid, nation text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if plan is null or not app.session_ok() then
    perform app.refuse('not-found', '42501');
  end if;
  if exists (select 1 from app.my_owned_plans() p where p = plan) then
    return;
  end if;
  -- Someone who has just signed up is a person in PrePenny from now on: a
  -- nickname is all that's kept, empty until they choose one (brief 7.2).
  insert into public.people (id) values (auth.uid()) on conflict (id) do nothing;
  insert into public.plans (id, nation) values (plan, coalesce(nation, 'england-and-wales'));
exception when unique_violation then
  -- Someone else's plan has this id: as if not found.
  perform app.refuse('not-found', '42501');
end;
$$;

-- Removes the person's own plan and everything in it, for good, when they
-- choose to keep the plan on their phone instead (step 3c). Only the owner,
-- only while nobody else is in it (a shared plan is left in step 3g, never
-- removed from under the other person), and only while signed in.
create function public.remove_plan(plan uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if plan is null or not app.session_ok()
    or not exists (select 1 from app.my_owned_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  if exists (select 1 from public.plan_members m
      where m.plan_id = plan and m.left_at is null and m.person_id <> auth.uid()) then
    perform app.refuse('shared-plan');
  end if;
  delete from public.plans p where p.id = plan;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The rules for the live nudges (D295): a person hears "plan:<id>" for
-- each plan they're in now, and "plan:<id>:<their id>" for their own private
-- changes. Nobody can send on them: only save_edit does, through app.nudge.

create function app.may_hear(topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select topic is not null and exists (
    select 1 from app.my_plans() p
    where topic = 'plan:' || p or topic = 'plan:' || p || ':' || auth.uid()
  )
$$;

create policy prepenny_hear_own_plans on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select app.may_hear(realtime.topic())));

-- ---------------------------------------------------------------------------
-- Who can use which function, as at the end of every migration that adds to
-- `app` (00-every-table.test.sql): everything taken back, then only what the
-- rules and these steps call given to signed-in people.

revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on function public.save_edit(uuid, uuid, text, text, jsonb),
  public.plan_changes(uuid, bigint, bigint), public.start_plan(uuid, text), public.remove_plan(uuid)
  from public, anon;
grant execute on function
  app.session_id(), app.session_ok(), app.my_plans(), app.my_edit_plans(),
  app.my_owned_plans(), app.my_partners(), app.my_own_pay(), app.refuse(text, text),
  app.from_a_person(), app.check_chosen_privacy(uuid, uuid, text, uuid, uuid),
  app.check_link(uuid, boolean, uuid), app.account_privacy(uuid, uuid),
  app.family_problem(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid),
  app.record_tables(), app.begin_edit(uuid, uuid, text, text), app.nudge(uuid, boolean),
  app.send_nudge(text), app.family_rules_problem(uuid, uuid[]), app.sent_columns(text), app.may_hear(text)
  to authenticated;
grant execute on function public.save_edit(uuid, uuid, text, text, jsonb),
  public.plan_changes(uuid, bigint, bigint), public.start_plan(uuid, text), public.remove_plan(uuid)
  to authenticated;
