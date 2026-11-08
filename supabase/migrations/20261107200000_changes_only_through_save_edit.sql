-- Step 3c, from the owner's reviewer: every change a person makes goes
-- through save_edit (D345).
--
-- Signed-in people have insert and update on the record tables and on the
-- plan's own row, so they could still be written straight through the Data
-- API (REST and GraphQL). The privacy rules held, but such a change skipped
-- save_edit: no edit in the history, no family rules, no nudge, and so a
-- partner who can edit could change shared records and leave no history
-- (Activity, step 3g). Now:
-- 1. a person's insert or update on any record table, or on the plan's own
--    row, is refused with "use-save-edit" unless save_edit is saving it.
--    start_plan still makes a plan. The database's own helpers and the
--    tests' set-up aren't a person, and aren't refused;
-- 2. save_edit takes its mark off once its records are written, so nothing
--    after it in the same request counts as part of it;
-- 3. start_plan marks the one plan it's making, for that one insert.
--
-- The refusal holds no record, amount or name: only its code (CLAUDE.md).

-- ---------------------------------------------------------------------------
-- 1. The guard. It runs as whoever is writing, so it sees their role: the
-- Data API's roles are a person's own rights; inside a helper with the
-- database's own rights, the role is the database's. It reads its two marks
-- itself, so a person needs no right to any function for it to run.

create function app.only_through_save_edit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
    and coalesce(current_setting('prepenny.edit', true), '') = ''
    and not (tg_table_name = 'plans' and tg_op = 'INSERT'
      and coalesce(current_setting('prepenny.starting', true), '') = new.id::text) then
    raise exception using errcode = '42501', message = 'use-save-edit';
  end if;
  return new;
end;
$$;

-- First of each table's checks (they run in order of name), so a write from
-- outside save_edit is refused the same way whatever it holds.
do $$
declare
  t text;
begin
  for t in select unnest(app.record_tables() || array['plans']) loop
    execute format('create trigger a0_only_through_save_edit before insert or update on public.%I
      for each row execute function app.only_through_save_edit()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. save_edit, as before, taking its mark off once every record is written.

create or replace function public.save_edit(plan uuid, edit uuid, made_at text, kind text, writes jsonb)
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

  -- Every record is written: from here nothing more is, so the mark goes. A
  -- person can't follow save_edit with a write of their own in the same
  -- request, as one GraphQL request with two steps could (D345).
  perform set_config('prepenny.edit', '', true);

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
-- 3. start_plan, as before, marking the plan it makes for that one insert.

create or replace function public.start_plan(plan uuid, nation text) returns void
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
  perform set_config('prepenny.starting', plan::text, true);
  insert into public.plans (id, nation) values (plan, coalesce(nation, 'england-and-wales'));
  perform set_config('prepenny.starting', '', true);
exception when unique_violation then
  -- Someone else's plan has this id: as if not found. The mark goes with
  -- everything else this step did.
  perform app.refuse('not-found', '42501');
end;
$$;

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
