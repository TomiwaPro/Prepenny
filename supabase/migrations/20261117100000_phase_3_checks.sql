-- Step 3i: Phase 3 checks. What the outside review of everything Phase 3
-- added found, fixed (D488 to D493). Each has its checks in
-- supabase/tests/database/31-phase-3-review.test.sql.
--
-- 1. Forgetting someone (D482) took their id out of each record's text, so a
--    partner could plant text in a name or note that broke it, and stop the
--    other person ever deleting their account (D488).
-- 2. Joining with a plan (D426) left its history behind (D489).
-- 3. A plan brought in carried the changes of someone who had left it, who
--    then could never delete their account (D490).
-- 4. Forgetting someone left their id on history copies they could read (D491).
-- 5. Activity, History and "Changed by" went by the time a phone said it made
--    a change, which a phone can set as far back as it likes (D492).
-- 6. A name could be set straight through the Data API, past its checks (D493).

-- ---------------------------------------------------------------------------
-- 1. Taking a person off a record, a copy, a summary or a notice: wherever
-- their id is a whole value, it's empty instead. Words people type (a name,
-- a note) are never touched, so nothing typed can break it or be lost
-- (D488). It replaces step 3h's, which replaced the id inside the text of the
-- whole record.

create or replace function app.without_person(value jsonb, person uuid) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  id text := person::text;
begin
  if value is null then
    return null;
  end if;
  case jsonb_typeof(value)
    when 'string' then
      return case when value #>> '{}' = id then 'null'::jsonb else value end;
    when 'array' then
      return (select coalesce(jsonb_agg(app.without_person(e, person) order by n), '[]'::jsonb)
        from jsonb_array_elements(value) with ordinality as x(e, n));
    when 'object' then
      return (select coalesce(jsonb_object_agg(k,
          case when k in ('name', 'note', 'nickname') then v else app.without_person(v, person) end),
          '{}'::jsonb)
        from jsonb_each(value) as x(k, v));
    else
      return value;
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3 and 4. Forgetting someone: as step 3h, in every plan they've been in that
-- isn't their own, and now also in any plan that has a change of theirs
-- without them having been in it (a plan brought in from one they'd left,
-- from before D490). Their id comes off the history's own record of who
-- could read each copy too (D491): a copy only they could read is emptied
-- first, so nothing private to them becomes anyone else's to see.

create or replace function app.forget_person(me uuid, addresses text[]) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  plans uuid[];
  t text;
  claims text := current_setting('request.jwt.claims', true);
  pattern text := '%' || me::text || '%';
begin
  select coalesce(array_agg(distinct plan_id), '{}') into plans from (
    select m.plan_id from public.plan_members m where m.person_id = me
    union
    select e.plan_id from public.edits e where e.person_id = me
  ) found
  where exists (select 1 from public.plans p where p.id = found.plan_id and p.owner <> me);
  if cardinality(plans) = 0 then
    return;
  end if;
  -- As the database itself, not as the person, who is no longer in them.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('prepenny.forgetting', me::text, true);
  for t in select unnest(app.record_tables()) loop
    execute format('update public.%I r set id = r.id where r.plan_id = any ($1) and to_jsonb(r)::text like $2', t)
      using plans, pattern;
  end loop;
  update public.plans p set id = p.id where p.id = any (plans) and to_jsonb(p)::text like pattern;
  perform set_config('prepenny.forgetting', '', true);

  delete from app.edit_devices d
    where d.edit_id in (select e.id from public.edits e where e.plan_id = any (plans) and e.person_id = me);
  update public.edits e
    set person_id = nullif(e.person_id, me), summary = app.without_person(e.summary, me)
    where e.plan_id = any (plans) and (e.person_id = me or e.summary::text like pattern);
  -- A copy only they could read after the change: leaving already took it
  -- out (D473); any left is taken out now.
  delete from app.edit_records r where r.plan_id = any (plans) and r.after_private = me;
  update app.edit_records r
    set before = case when r.before_private = me then null else app.without_person(r.before, me) end,
      before_private = nullif(r.before_private, me),
      after = app.without_person(r.after, me),
      context = app.without_person(r.context, me)
    where r.plan_id = any (plans)
      and (r.before_private = me or r.before::text like pattern or r.after::text like pattern
        or r.context::text like pattern);
  update public.notices n set data = app.without_person(n.data - 'from', me)
    where n.plan_id = any (plans) and n.data ->> 'by' = me::text;
  update public.notices n set data = app.without_person(n.data, me)
    where n.plan_id = any (plans) and n.data::text like pattern;
  update public.invites i
    set created_by = nullif(i.created_by, me), accepted_by = nullif(i.accepted_by, me),
      asked_by = nullif(i.asked_by, me),
      email = case when lower(i.email) = any (addresses) then null else i.email end
    where i.plan_id = any (plans);
  delete from app.plan_counters c where c.plan_id = any (plans) and c.counts_for = me;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 and 3. Joining with a plan (D426): as step 3f-2, and now its history
-- comes too, with every record it kept, private to the person bringing it
-- (D489). Changes made in it by someone who has left it are by "someone who
-- has left" in the plan it joins, where that person never was (D490).

create or replace function app.move_plan(old uuid, target uuid, me uuid) returns uuid[]
language plpgsql volatile set search_path = '' as $$
declare
  t text;
  taken jsonb := '{}'::jsonb;
  got jsonb;
  one jsonb;
  link jsonb;
  gone uuid;
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

  -- Anyone else who was in the old plan has left it (nobody else can be in
  -- it now, D426): their changes come as by "someone who has left" (D490).
  for gone in select distinct m.person_id from public.plan_members m
      where m.plan_id = old and m.person_id <> me loop
    delete from app.edit_devices d
      where d.edit_id in (select e.id from public.edits e where e.plan_id = old and e.person_id = gone);
    update public.edits e
      set person_id = nullif(e.person_id, gone), summary = app.without_person(e.summary, gone)
      where e.plan_id = old and (e.person_id = gone or e.summary::text like '%' || gone::text || '%');
    update app.edit_records r
      set before = app.without_person(r.before, gone), after = app.without_person(r.after, gone),
        context = app.without_person(r.context, gone),
        before_private = nullif(r.before_private, gone), after_private = nullif(r.after_private, gone)
      where r.plan_id = old;
  end loop;

  -- The history of changes comes too, private to its person, with the
  -- records each kept (D489). A one-off change's, a tick's, an overtime's
  -- details' and the settings' ids are worked out from the plan they're in,
  -- so their copies take the ids they have in the new plan, as below.
  update public.edits e set plan_id = target, private_to = me where e.plan_id = old;
  update app.edit_records r
    set plan_id = target,
      before_private = case when r.before is null then null else me end,
      after_private = me,
      record_id = moved.id,
      before = case when r.before is null then null else r.before || jsonb_build_object('id', moved.id) end,
      after = r.after || jsonb_build_object('id', moved.id)
    from (
      select x.edit_id, x.record_table, x.record_id,
        case x.record_table
          when 'payment_changes' then app.derived_id(target, 'payment_changes',
            coalesce(c ->> 'series_id', c ->> 'budget_id'), c ->> 'original_date', '')
          when 'ticks' then app.derived_id(target, 'ticks',
            coalesce(c ->> 'series_id', c ->> 'budget_id'), c ->> 'original_date',
            case when (c ->> 'set_aside')::boolean then 'set-aside' else '' end)
          when 'pay_adjustment_details' then app.derived_id(target, 'pay-adjustment-details',
            c ->> 'adjustment_id')
          when 'settings' then app.derived_id(target, 'settings', me::text)
          else x.record_id end as id
      from app.edit_records x
      cross join lateral (select coalesce(x.after, x.before) as c) copy
      where x.plan_id = old
    ) moved
    where r.plan_id = old and r.edit_id = moved.edit_id and r.record_table = moved.record_table
      and r.record_id = moved.record_id;

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

-- Plans already brought in before this: a change by someone who was never
-- in the plan it's in now is by "someone who has left" there (D490), and
-- history copies naming someone whose account is gone name nobody (D491).
do $$
declare
  found record;
begin
  for found in select distinct e.plan_id, e.person_id from public.edits e
      where e.person_id is not null
        and not exists (select 1 from public.plan_members m
          where m.plan_id = e.plan_id and m.person_id = e.person_id) loop
    delete from app.edit_devices d where d.edit_id in (select e.id from public.edits e
      where e.plan_id = found.plan_id and e.person_id = found.person_id);
    update public.edits e set person_id = null, summary = app.without_person(e.summary, found.person_id)
      where e.plan_id = found.plan_id and e.person_id = found.person_id;
    update app.edit_records r
      set before = app.without_person(r.before, found.person_id),
        after = app.without_person(r.after, found.person_id),
        context = app.without_person(r.context, found.person_id)
      where r.plan_id = found.plan_id;
  end loop;
  delete from app.edit_records r
    where r.after_private is not null and not exists (select 1 from auth.users u where u.id = r.after_private);
  update app.edit_records r set before = null, before_private = null
    where r.before_private is not null and not exists (select 1 from auth.users u where u.id = r.before_private);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. When a change reached the account, by the server's own clock (D492).
-- A phone says when it made a change, which settles which of two changes is
-- newer when they clash (D365, D366), and it can't say a time later than the
-- server's. But it can say one as far back as it likes. So Activity, History
-- and "Changed by" now go by when the change reached the account, which no
-- phone can set: each change has `saved_at` too, and plan_changes gives each
-- record's `edit_saved_at`.

-- A moment as UTC text, to the microsecond, as the phone writes its own.
create function app.utc_exact(moment timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(moment at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

create or replace function public.plan_activity(plan uuid, older_than text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  one public.edits;
  copies jsonb;
  found_edits jsonb := '[]'::jsonb;
  shown integer := 0;
  more boolean := false;
  undoer public.edits;
begin
  if plan is null or not app.session_ok() or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  if older_than is not null then
    perform app.check_made_at(older_than);
  end if;
  for one in
    select * from public.edits e
    where e.plan_id = plan
      and (e.private_to is null or e.private_to = me)
      and e.kind not in ('first-copy', 'join-with-plan')
      and (older_than is null or e.saved_at < older_than::timestamptz)
    order by e.saved_at desc, e.id desc
  loop
    select coalesce(jsonb_agg(jsonb_build_object('table', r.record_table, 'id', r.record_id,
        'before', case when r.before_private is null or r.before_private = me then r.before end,
        'after', case when r.after_private is null or r.after_private = me then r.after end,
        'context', case when r.after_private is null or r.after_private = me then r.context end) order by r.n), '[]'::jsonb)
      into copies
      from app.edit_records r
      where r.edit_id = one.id
        and (r.after_private is null or r.after_private = me or r.before_private is null or r.before_private = me)
        and app.readable_now(plan, r.record_table, r.record_id);
    if jsonb_array_length(copies) = 0 and one.kind not in ('change-role', 'make-private', 'share-record', 'leave') then
      continue;
    end if;
    if shown = 50 then
      more := true;
      exit;
    end if;
    shown := shown + 1;
    undoer := null;
    if one.undone_by is not null then
      select * into undoer from public.edits u where u.id = one.undone_by;
    end if;
    found_edits := found_edits || jsonb_build_object(
      'id', one.id,
      'by', one.person_id,
      'made_at', one.made_at,
      'saved_at', app.utc_exact(one.saved_at),
      'kind', one.kind,
      'mine', one.person_id = me,
      'undone', undoer.id is not null and undoer.undone_by is null,
      'undoes', case when one.kind = 'undo' then one.summary ->> 'undoes' end,
      'can_undo', one.person_id = me and app.undo_problem(plan, one.id) is null,
      'summary', case when one.kind in ('change-role', 'make-private', 'share-record', 'leave') then one.summary end,
      'records', copies);
  end loop;
  return jsonb_build_object('edits', found_edits, 'more', more, 'people', app.names_in(plan),
    'now', app.server_time());
end;
$$;

create or replace function public.payment_history(plan uuid, family uuid, original_date date) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  found_edits jsonb := '[]'::jsonb;
  one public.edits;
  copies jsonb;
  in_family text[];
begin
  if plan is null or family is null or original_date is null or not app.session_ok()
    or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  -- Only a payment the person can read now.
  if not exists (select 1 from public.series s where s.plan_id = plan and s.family_id = family
      and (s.private_to is null or s.private_to = me)) then
    perform app.refuse('not-found', '42501');
  end if;
  select array_agg(s.id::text) into in_family from public.series s where s.plan_id = plan and s.family_id = family;
  for one in
    select e.* from public.edits e
    where e.plan_id = plan and (e.private_to is null or e.private_to = me)
      and e.kind not in ('first-copy', 'join-with-plan')
      and exists (select 1 from app.edit_records r where r.edit_id = e.id
        and ((r.record_table = 'series' and coalesce(r.after ->> 'family_id', r.before ->> 'family_id') = family::text)
          or (r.record_table in ('payment_changes', 'ticks')
            and coalesce(r.after ->> 'original_date', r.before ->> 'original_date') = original_date::text
            and coalesce(r.after ->> 'series_id', r.before ->> 'series_id') = any (in_family))))
    order by e.saved_at desc, e.id desc
  loop
    select coalesce(jsonb_agg(jsonb_build_object('table', r.record_table, 'id', r.record_id,
        'before', case when r.before_private is null or r.before_private = me then r.before end,
        'after', case when r.after_private is null or r.after_private = me then r.after end,
        'context', case when r.after_private is null or r.after_private = me then r.context end) order by r.n), '[]'::jsonb)
      into copies
      from app.edit_records r
      where r.edit_id = one.id
        and (r.after_private is null or r.after_private = me or r.before_private is null or r.before_private = me)
        and app.readable_now(plan, r.record_table, r.record_id)
        and ((r.record_table = 'series' and coalesce(r.after ->> 'family_id', r.before ->> 'family_id') = family::text)
          or (r.record_table in ('payment_changes', 'ticks')
            and coalesce(r.after ->> 'original_date', r.before ->> 'original_date') = original_date::text
            and coalesce(r.after ->> 'series_id', r.before ->> 'series_id') = any (in_family)));
    continue when jsonb_array_length(copies) = 0;
    found_edits := found_edits || jsonb_build_object('id', one.id, 'by', one.person_id, 'made_at', one.made_at,
      'saved_at', app.utc_exact(one.saved_at),
      'kind', one.kind, 'mine', one.person_id = me, 'undone', app.is_undone(one), 'records', copies);
  end loop;
  return jsonb_build_object('edits', found_edits, 'people', app.names_in(plan), 'now', app.server_time());
end;
$$;

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
      'seq', p.seq, 'changed_at', p.changed_at, 'edit_id', p.edit_id,
      'edit_made_at', e.made_at, 'edit_saved_at', app.utc_exact(e.saved_at),
      'edit_by', e.person_id, 'edit_kind', e.kind)
    into the_plan from public.plans p
    left join public.edits e on e.id = p.edit_id and e.plan_id = p.id
    where p.id = plan;
  for t in select unnest(app.record_tables()) loop
    execute format($q$
      select coalesce(jsonb_agg(jsonb_build_object('table', %L,
          'row', to_jsonb(r) - 'plan_id' - 'created_at',
          'edit_made_at', e.made_at, 'edit_saved_at', app.utc_exact(e.saved_at),
          'edit_by', e.person_id, 'edit_kind', e.kind) order by r.seq), '[]'::jsonb)
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
-- 6. A name is checked wherever it's saved (D493): 1 to 30 characters, with
-- no control characters and none of the invisible ones that change which
-- way words run or hide letters, so "Changed by Tom" always says what it
-- seems to. Nothing on the phone writes a name straight to the table, so
-- that's taken away; signing up still adds the person with no name yet.

create or replace function app.nickname(typed text) returns text
language plpgsql volatile set search_path = '' as $$
declare
  name text := btrim(coalesce(typed, ''));
begin
  if name = '' or char_length(name) > 30 or name ~ '[[:cntrl:]]'
    or name ~ '[­؜ᅟᅠ᠎​-‏‪-‮⁠-⁯ㅤ﻿ﾠ]' then
    perform app.refuse('needs-name');
  end if;
  return name;
end;
$$;

create function app.check_nickname() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.nickname is distinct from '' then
    new.nickname := app.nickname(new.nickname);
  end if;
  return new;
end;
$$;

create trigger checked_nickname before insert or update of nickname on public.people
  for each row execute function app.check_nickname();

revoke update on public.people from authenticated;

-- ---------------------------------------------------------------------------
-- Who can use which function, as at the end of every migration that adds to
-- `app` (00-every-table.test.sql): everything taken back, then only what the
-- rules and these steps call given to signed-in people.

revoke execute on all functions in schema app from public, anon, authenticated;
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
  app.server_kind(text), app.others_in(uuid), app.check_made_at(text), app.leaving_now(),
  app.utc_exact(timestamptz)
  to authenticated;
revoke execute on function public.plan_activity(uuid, text), public.payment_history(uuid, uuid, date),
  public.plan_changes(uuid, bigint, bigint)
  from public, anon;
grant execute on function public.plan_activity(uuid, text), public.payment_history(uuid, uuid, date),
  public.plan_changes(uuid, bigint, bigint)
  to authenticated;
