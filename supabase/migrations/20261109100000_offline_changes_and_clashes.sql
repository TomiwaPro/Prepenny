-- Step 3d: offline changes and clashes (D59, ARCHITECTURE.md 3.5, PLAN.md
-- item 32).
--
-- A phone keeps the changes made with no signal in a queue and sends them
-- one at a time when the signal is back (step 3c). When the same thing was
-- changed on two phones, the newest change wins: newest by when it was
-- made, not when it arrived (D59). The phone works out what clashed and
-- which change is newest, from what it can read. The server adds four things:
--
-- 1. The server's own time in every answer from save_edit and plan_changes,
--    so a phone with the wrong time can correct its clock, and a time "made
--    at" that's later than the server's own is saved as the server's time,
--    so a phone with a fast clock can't make its changes look newer than
--    they are.
-- 2. plan_changes says, for each record, which edit last saved it, when that
--    edit was made and by whom. The edit is one the person can read anyway:
--    a shared record never names a private edit (D291).
-- 3. A change that wins a clash on records someone else saved last says so
--    (`overrides`): save_edit then leaves a notice for the person whose
--    change it replaced, naming only the records it replaced, which they
--    saved themselves and so can read. Their phone puts the words together
--    from its own records: the notice holds ids and a time, never an
--    amount, a name or a note (CLAUDE.md).
-- 4. plan_changes gives a person their own notices not read yet, and the
--    nickname of each person in the plan, for "Tom changed Rent".
--
-- Everything else save_edit does is as it was (D330, D331, D345).

-- ---------------------------------------------------------------------------
-- 1. The server's time, written as a phone writes times.

create function app.server_time() returns text
language sql volatile set search_path = '' as $$
  select to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- A time a phone says a change was made, never later than the server's own
-- time: a phone with a fast clock can't win clashes it shouldn't (D59).
create function app.no_later_than_now(made text) returns text
language sql volatile set search_path = '' as $$
  select case when made::timestamptz > clock_timestamp() then app.server_time() else made end
$$;

-- Starts saving an edit, as before, with its time "made at" no later than now.
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

-- ---------------------------------------------------------------------------
-- 3. Telling the person whose change a newer one replaced.

-- Leaves a notice for each person whose edit this one replaced, on the
-- records it replaced (`lost`: a list of {edit, table, id}, worked out by
-- save_edit as it wrote them). Only while save_edit is saving this edit, for
-- its own person; only for an edit in this plan made no later than this one
-- (the newest change wins, D59); never for this edit itself.
create function app.tell_clashes(plan uuid, edit uuid, lost jsonb) returns void
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
      jsonb_build_object('lost', e.id, 'by', winner.person_id, 'made_at', winner.made_at, 'rows', one.rows)
    from public.edits e
    where e.id = one.lost_edit and e.plan_id = plan and e.id <> edit
      and e.made_at::timestamptz <= winner.made_at::timestamptz;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_edit, as before (D330, D331, D345), with the server's time in its
-- answer and the records it replaced for the edits named in `overrides`.

drop function public.save_edit(uuid, uuid, text, text, jsonb);

create function public.save_edit(plan uuid, edit uuid, made_at text, kind text, writes jsonb,
  overrides uuid[] default null)
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
  old_edit uuid;
  results jsonb := '[]'::jsonb;
  changed jsonb := '[]'::jsonb;
  lost jsonb := '[]'::jsonb;
  families uuid[] := '{}'::uuid[];
  shared boolean := false;
  mine boolean := false;
  problem text;
begin
  if plan is null or edit is null or writes is null or jsonb_typeof(writes) <> 'array'
    or jsonb_array_length(writes) > 1000
    or kind is null or kind !~ '^[a-z][a-z-]{0,39}$'
    or made_at is null
    or made_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$'
    or coalesce(cardinality(overrides), 0) > 1000 then
    perform app.refuse('bad-edit');
  end if;

  -- Only someone in the plan, while their sign-in lasts (D21).
  if app.begin_edit(plan, edit, made_at, kind) = 'already' then
    -- Sent before and saved: nothing changes, and nobody is told twice. The
    -- phone gets each record's version as it is now, as far as it can read it.
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
    return jsonb_build_object('saved', 'already', 'rows', results, 'now', app.server_time());
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

      -- The edit that saved this record last, when this one may replace it
      -- after a clash (step 3d). Read as the person, under the privacy rules.
      old_edit := null;
      if base is not null and coalesce(cardinality(overrides), 0) > 0 then
        if t = 'plans' then
          select p.edit_id into old_edit from public.plans p where p.id = plan and p.version = base;
        elsif t = any (app.record_tables()) then
          execute format('select edit_id from public.%I where id = $1 and plan_id = $2 and version = $3', t)
            into old_edit using record_id, plan, base;
        end if;
      end if;

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
            -- the plan: changed since (a clash).
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

      -- A record a newer change has replaced, from an edit the phone named.
      if old_edit is not null and old_edit <> edit and old_edit = any (overrides) then
        lost := lost || jsonb_build_object('edit', old_edit, 'table', t, 'id', record_id);
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

    -- The people whose changes this one replaced are told (step 3d), while
    -- the mark still says which edit is being saved.
    if jsonb_array_length(lost) > 0 then
      perform app.tell_clashes(plan, edit, lost);
    end if;
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
  -- nothing of it is saved, notices included, and the phone hears which
  -- records, then looks at what's new and works out the clash (step 3d).
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
  return jsonb_build_object('saved', 'new', 'rows', results, 'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 and 4. Bringing a plan down, as before (step 3c), with each record's
-- last edit (its id, when it was made and by whom), the person's own
-- notices not read yet, each person's nickname and the server's time.

create or replace function public.plan_changes(plan uuid, shared_after bigint, mine_after bigint)
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
    -- The edit is read as the person too: a shared record names only a
    -- shared edit (D291), and their own records their own.
    execute format($q$
      select coalesce(jsonb_agg(jsonb_build_object('table', %L,
          'row', to_jsonb(r) - 'plan_id' - 'created_at' - 'created_by',
          'edit_made_at', e.made_at, 'edit_by', e.person_id) order by r.seq), '[]'::jsonb)
      from public.%I r
      left join public.edits e on e.id = r.edit_id and e.plan_id = r.plan_id
      where r.plan_id = $1
        and ((r.private_to is null and r.seq > $2) or (r.private_to = auth.uid() and r.seq > $3))
    $q$, t, t) into found_rows using plan, coalesce(shared_after, 0), coalesce(mine_after, 0);
    all_rows := all_rows || found_rows;
  end loop;
  return jsonb_build_object('plan', the_plan, 'rows', all_rows,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('person', m.person_id, 'role', m.role,
        'nickname', coalesce(p.nickname, ''))), '[]'::jsonb)
      from public.plan_members m left join public.people p on p.id = m.person_id
      where m.plan_id = plan and m.left_at is null),
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'edit', n.edit_id, 'data', n.data)
        order by n.created_at), '[]'::jsonb)
      from public.notices n
      where n.plan_id = plan and n.for_person = auth.uid() and n.kind = 'clash' and n.read_at is null
        and n.created_at > now() - interval '30 days'),
    'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can use which function, as at the end of every migration that adds to
-- `app` (00-every-table.test.sql): everything taken back, then only what the
-- rules and these steps call given to signed-in people.

revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on function public.save_edit(uuid, uuid, text, text, jsonb, uuid[]),
  public.plan_changes(uuid, bigint, bigint), public.start_plan(uuid, text), public.remove_plan(uuid)
  from public, anon;
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
grant execute on function public.save_edit(uuid, uuid, text, text, jsonb, uuid[]),
  public.plan_changes(uuid, bigint, bigint), public.start_plan(uuid, text), public.remove_plan(uuid)
  to authenticated;
