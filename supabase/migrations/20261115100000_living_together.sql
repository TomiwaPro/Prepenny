-- Step 3g: shared plans, living together (brief 4.12 and 4.14, D50, D53,
-- D65, D114, D425, D454 to D466).
--
-- 1. History. Every record an edit saves is kept as it was before and after
--    the edit, with the privacy it had at each moment. Only the database's
--    own steps read it: nobody can reach it through the Data API.
-- 2. Activity: who changed what and when. A person sees their own changes,
--    and their partner's shared ones, and of each only the records they
--    could read at the time and can still read now. So nothing private
--    shows, before or after an account was shared or made private again.
-- 3. Undo for older changes, of one's own only: the records go back to how
--    they were before, as a new change, and only while nothing it changed
--    has been changed again since.
-- 4. "Changed by": each record's last edit says what kind it was, so a
--    payment shared all at once doesn't say a person changed it.
-- 5. Roles: the plan's owner changes their partner's role, and the server
--    goes by it from that moment.
-- 6. Making a shared account, debt or goal private again, and sharing a
--    debt or goal: the server's own steps, each changing the record and
--    everything that hangs on it in one go, or nothing.
-- 7. Money from someone's own account into a shared savings goal ("From
--    Jess") can count towards the goal, so the goal shows what each person
--    has put in (D114).
--
-- Every step here checks who's asking itself. Refusals are short codes, with
-- record ids at most: never an amount, a name, a note or an email address
-- (D87, CLAUDE.md).

-- ---------------------------------------------------------------------------
-- 1. History (D50, D455).

-- One row for each record an edit saved: how it was before (null when the
-- edit made it), how it was after, and who could read each then (its
-- privacy). In the database's own part, which the Data API never shows, so
-- only the steps below read it, each for the person asking.
create table app.edit_records (
  edit_id uuid not null references public.edits (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete cascade,
  record_table text not null,
  record_id uuid not null,
  -- The order the edit saved its records in, so an undo puts them back in turn.
  n bigint generated always as identity,
  before jsonb,
  before_private uuid,
  before_version integer,
  after jsonb not null,
  after_private uuid,
  after_version integer not null,
  primary key (edit_id, record_table, record_id)
);

create index edit_records_by_record on app.edit_records (plan_id, record_table, record_id);

alter table app.edit_records enable row level security;
revoke all on app.edit_records from anon, authenticated, public;

-- A record as the history keeps it: its own columns, its version, whether it
-- was removed and its privacy, without the fields the database fills in
-- about the plan and the moment.
create function app.history_copy(row_value jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select row_value - 'plan_id' - 'created_at' - 'created_by' - 'changed_at' - 'changed_by'
    - 'seq' - 'edit_id' - 'owner'
$$;

-- Keeps each record an edit saves, before and after. Only inside an edit
-- (save_edit and the server's own steps mark it, D345). A plan's first copy,
-- and a plan brought into another (D426), save the whole plan at once and
-- change nothing anyone made: they keep no history.
create function app.keep_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  edit uuid := app.current_edit();
  what text;
  plan uuid;
  private_now uuid;
  private_then uuid;
begin
  if edit is null then
    return null;
  end if;
  select e.kind into what from public.edits e where e.id = edit;
  if what is null or what in ('first-copy', 'join-with-plan') then
    return null;
  end if;
  if tg_table_name = 'plans' then
    plan := new.id;
  else
    plan := new.plan_id;
    private_now := new.private_to;
    if tg_op = 'UPDATE' then
      private_then := old.private_to;
    end if;
  end if;
  insert into app.edit_records as r (edit_id, plan_id, record_table, record_id,
    before, before_private, before_version, after, after_private, after_version)
  values (edit, plan, tg_table_name, new.id,
    case when tg_op = 'UPDATE' then app.history_copy(to_jsonb(old)) end, private_then,
    case when tg_op = 'UPDATE' then old.version end,
    app.history_copy(to_jsonb(new)), private_now, new.version)
  -- Saved twice in one edit (a server's own step can): the first "before"
  -- and the last "after".
  on conflict (edit_id, record_table, record_id) do update
    set after = excluded.after, after_private = excluded.after_private, after_version = excluded.after_version;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array app.record_tables() || array['plans'] loop
    execute format('create trigger z_keep_history after insert or update on public.%I
      for each row execute function app.keep_history()', t);
  end loop;
end;
$$;

-- Whether the person asking can read a record now: it's still in the plan,
-- and shared or private to them. The plan's own row is everyone's in it.
create function app.readable_now(plan uuid, t text, record uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  private uuid;
  seen boolean;
begin
  if t = 'plans' then
    return record = plan;
  end if;
  if not (t = any (app.record_tables())) then
    return false;
  end if;
  execute format('select true, private_to from public.%I where id = $1 and plan_id = $2', t)
    into seen, private using record, plan;
  return coalesce(seen, false) and (private is null or private = auth.uid());
end;
$$;

-- The version a record has now, or null when it's gone.
create function app.version_now(plan uuid, t text, record uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  found_version integer;
begin
  if t = 'plans' then
    select p.version into found_version from public.plans p where p.id = plan and record = plan;
    return found_version;
  end if;
  if not (t = any (app.record_tables())) then
    return null;
  end if;
  execute format('select version from public.%I where id = $1 and plan_id = $2', t)
    into found_version using record, plan;
  return found_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 and 3. Activity, and undo for one's own older changes (D456, D457).

-- Kinds of change that can't be undone from Activity: the plan saved in the
-- account for the first time or brought into another, and the server's own
-- steps about who sees what or who can do what, which each have their own
-- way back. Everything made with the engine's commands can, an undo too
-- (which puts the change back, D87).
create function app.undoable(kind text) returns boolean
language sql immutable set search_path = '' as $$
  select kind not in ('first-copy', 'join-with-plan', 'share-accounts', 'claim-pay', 'make-private',
    'share-record', 'change-role')
$$;

-- Whether one of the person's own changes is undone now: undone, and that
-- undo not undone in turn.
create function app.is_undone(edit public.edits) returns boolean
language sql stable security definer set search_path = '' as $$
  select edit.undone_by is not null and exists (select 1 from public.edits u
    where u.id = edit.undone_by and u.undone_by is null)
$$;

-- Why a change can't be undone by the person asking, or null when it can:
-- not theirs (as if it weren't there), a kind that can't be, undone already,
-- or something it changed has been changed again since.
create function app.undo_problem(plan uuid, edit uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  found_edit public.edits;
  one record;
begin
  select * into found_edit from public.edits e where e.id = edit and e.plan_id = plan;
  if not found or found_edit.person_id is distinct from auth.uid() then
    return 'not-found';
  end if;
  if not app.undoable(found_edit.kind) then
    return 'cant-undo';
  end if;
  if app.is_undone(found_edit) then
    return 'undone-already';
  end if;
  if not exists (select 1 from app.edit_records r where r.edit_id = edit) then
    return 'cant-undo';
  end if;
  for one in select r.record_table, r.record_id, r.after_version from app.edit_records r where r.edit_id = edit loop
    if app.version_now(plan, one.record_table, one.record_id) is distinct from one.after_version then
      return 'changed-since';
    end if;
  end loop;
  return null;
end;
$$;

-- "Activity" (brief 4.12, 4.14): the plan's changes the person may see,
-- newest first, up to 12 months back (D50), 50 at a time; `older_than` is
-- the time of the last one already shown, for "Show older changes".
--
-- Each change says who made it, when, what kind it was, whether it's been
-- undone and whether the person can undo it now, and the records it saved:
-- each as it was before and after, but only a copy the person could read at
-- that moment, of a record they can still read now. A change with no such
-- record isn't shown at all, except the server's own about who sees what,
-- which hold no money (D458, D460).
create function public.plan_activity(plan uuid, older_than text default null) returns jsonb
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
  if older_than is not null and older_than !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' then
    perform app.refuse('bad-edit');
  end if;
  for one in
    select * from public.edits e
    where e.plan_id = plan
      and (e.private_to is null or e.private_to = me)
      and e.kind not in ('first-copy', 'join-with-plan')
      and e.made_at::timestamptz > now() - interval '12 months'
      and (older_than is null or e.made_at::timestamptz < older_than::timestamptz)
    order by e.made_at::timestamptz desc, e.saved_at desc
  loop
    select coalesce(jsonb_agg(jsonb_build_object('table', r.record_table, 'id', r.record_id,
        'before', case when r.before_private is null or r.before_private = me then r.before end,
        'after', case when r.after_private is null or r.after_private = me then r.after end) order by r.n), '[]'::jsonb)
      into copies
      from app.edit_records r
      where r.edit_id = one.id
        and (r.after_private is null or r.after_private = me or r.before_private is null or r.before_private = me)
        and app.readable_now(plan, r.record_table, r.record_id);
    if jsonb_array_length(copies) = 0 and one.kind not in ('change-role', 'make-private', 'share-record') then
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
      'kind', one.kind,
      'mine', one.person_id = me,
      'undone', undoer.id is not null and undoer.undone_by is null,
      'undoes', case when one.kind = 'undo' then one.summary ->> 'undoes' end,
      'can_undo', one.person_id = me and app.undo_problem(plan, one.id) is null,
      'summary', case when one.kind in ('change-role', 'make-private', 'share-record') then one.summary end,
      'records', copies);
  end loop;
  return jsonb_build_object('edits', found_edits, 'more', more, 'now', app.server_time());
end;
$$;

-- The writes that undo one of the person's own changes: each record it
-- saved back as it was before, at the version the change left it, so
-- save_edit refuses the lot if anything has been changed again since.
create function app.undo_writes(plan uuid, edit uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  problem text;
  writes jsonb;
begin
  if not app.session_ok() or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  problem := app.undo_problem(plan, edit);
  if problem = 'not-found' then
    perform app.refuse('not-found', '42501');
  end if;
  if problem = 'changed-since' then
    raise exception using errcode = 'P0001', message = 'changed-since', detail = '[]';
  end if;
  if problem is not null then
    perform app.refuse(problem);
  end if;
  select jsonb_agg(jsonb_build_object(
      'table', r.record_table,
      'id', r.record_id,
      'version', r.after_version,
      'row', case when r.before is null or coalesce((r.before ->> 'deleted')::boolean, false) then null
        else r.before - 'id' - 'version' - 'deleted' - 'private_to' end) order by r.n)
    into writes
    from app.edit_records r where r.edit_id = edit;
  return writes;
end;
$$;

-- Notes that a change is undone by an undo just saved by the same person.
create function app.mark_undone(plan uuid, undone uuid, edit uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.edits e where e.id = edit and e.plan_id = plan
      and e.person_id = auth.uid() and e.kind = 'undo')
    or not exists (select 1 from public.edits e where e.id = undone and e.plan_id = plan
      and e.person_id = auth.uid()) then
    perform app.refuse('not-found', '42501');
  end if;
  update public.edits set undone_by = edit where id = undone;
  update public.edits set summary = jsonb_build_object('undoes', undone) where id = edit;
end;
$$;

-- "Undo" in Activity: one of the person's own changes, undone as a new
-- change of theirs, through save_edit, so every privacy rule and role
-- applies as to any change (D457). Refused for anyone else's change exactly
-- as for one that isn't there ("not-found"), and with "changed-since" when
-- something it changed has been changed again since, by anyone. Sent twice,
-- it changes nothing the second time.
create function public.undo_change(plan uuid, undone uuid, edit uuid, made_at text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  writes jsonb;
  answer jsonb;
begin
  if plan is null or undone is null or edit is null or undone = edit then
    perform app.refuse('bad-edit');
  end if;
  if exists (select 1 from public.edits e where e.id = edit and e.plan_id = plan and e.person_id = auth.uid()) then
    return jsonb_build_object('saved', 'already', 'rows', '[]'::jsonb, 'now', app.server_time());
  end if;
  writes := app.undo_writes(plan, undone);
  answer := public.save_edit(plan, edit, made_at, 'undo', writes);
  perform app.mark_undone(plan, undone, edit);
  return answer;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. "Changed by": what kind of edit last saved each record, as well as who
-- and when (step 3d), so sharing an account doesn't show as a change to
-- every payment in it (D459). Otherwise as step 3d.

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
      'edit_made_at', e.made_at, 'edit_by', e.person_id, 'edit_kind', e.kind)
    into the_plan from public.plans p
    left join public.edits e on e.id = p.edit_id and e.plan_id = p.id
    where p.id = plan;
  for t in select unnest(app.record_tables()) loop
    execute format($q$
      select coalesce(jsonb_agg(jsonb_build_object('table', %L,
          'row', to_jsonb(r) - 'plan_id' - 'created_at' - 'created_by',
          'edit_made_at', e.made_at, 'edit_by', e.person_id, 'edit_kind', e.kind) order by r.seq), '[]'::jsonb)
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
-- 5. Roles (brief 4.14, D51, D461).

-- "Change what Tom can do": the plan's owner changes their partner's role
-- to "Can edit" or "Can view only". Every rule reads the role on every
-- request (app.my_edit_plans), so the server goes by it from this moment:
-- a change sent afterwards by someone who can now only view is refused,
-- whenever it was made. It's in Activity for both of them, and nudges both
-- phones to look again.
create function public.change_role(plan uuid, person uuid, role text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  me uuid := auth.uid();
  was text;
begin
  if plan is null or person is null or not app.session_ok()
    or not exists (select 1 from app.my_owned_plans() p where p = plan) or person = me then
    perform app.refuse('not-found', '42501');
  end if;
  if role is null or role not in ('editor', 'viewer') then
    perform app.refuse('bad-role');
  end if;
  select m.role into was from public.plan_members m
    where m.plan_id = plan and m.person_id = person and m.left_at is null for update;
  if not found then
    perform app.refuse('not-found', '42501');
  end if;
  if was = role then
    return jsonb_build_object('saved', 'already', 'now', app.server_time());
  end if;
  update public.plan_members m set role = role where m.plan_id = plan and m.person_id = person;
  insert into public.edits (id, plan_id, private_to, person_id, made_at, kind, summary)
  values (gen_random_uuid(), plan, null, me, app.server_time(), 'change-role',
    jsonb_build_object('person', person, 'role', role));
  perform app.send_nudge('plan:' || plan);
  return jsonb_build_object('saved', 'new', 'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Who sees a record: making one private again, or sharing a debt or a
-- goal (D65, D425, D462, D463).

-- The records whose privacy the server's own step is changing now, in this
-- transaction only. Set only by share_accounts (step 3f), make_private and
-- share_record; nothing a person can reach sets it.
create or replace function app.sharing_now() returns uuid[]
language sql stable set search_path = '' as $$
  select case when coalesce(current_setting('prepenny.sharing', true), '') = '' then '{}'::uuid[]
    else string_to_array(current_setting('prepenny.sharing', true), ',')::uuid[] end
$$;

-- Whether this change of a record's privacy is one the server's own step is
-- making for the person asking: their own private record becoming shared,
-- or a shared one they made becoming private to them.
create function app.privacy_step(record uuid, made_by uuid, was uuid, now_private uuid) returns boolean
language sql stable set search_path = '' as $$
  select record = any (app.sharing_now()) and auth.uid() is not null
    and ((was = auth.uid() and now_private is null)
      or (was is null and now_private = auth.uid() and made_by = auth.uid()))
$$;

-- Accounts, debts and pay profiles, as before, with the server's own steps
-- that share or unshare them.
create or replace function app.check_owned_record() returns trigger
language plpgsql set search_path = '' as $$
declare
  was uuid := case when tg_op = 'UPDATE' then old.private_to end;
begin
  if tg_op = 'UPDATE' and tg_table_name in ('accounts', 'debts')
    and app.privacy_step(new.id, old.created_by, old.private_to, new.private_to) then
    was := new.private_to;
  end if;
  perform app.check_chosen_privacy(new.private_to, was,
    tg_op, new.belongs_to, case when tg_op = 'UPDATE' then old.belongs_to end);
  return new;
end;
$$;

-- A goal, as before (D65), with the server's own steps that share or
-- unshare it. A goal kept in a private account is still private to the same
-- person.
create or replace function app.check_goal() returns trigger
language plpgsql set search_path = '' as $$
declare
  account record;
  was uuid := case when tg_op = 'UPDATE' then old.private_to end;
begin
  account := app.account_privacy(new.account_id, new.plan_id);
  if account.seen is not true then
    perform app.refuse('not-found', '42501');
  end if;
  if tg_op = 'INSERT' and account.private is not null then
    new.private_to := account.private;
  end if;
  if account.private is not null and new.private_to is distinct from account.private then
    perform app.refuse('sharing-comes-later');
  end if;
  if tg_op = 'UPDATE' and app.privacy_step(new.id, old.created_by, old.private_to, new.private_to) then
    was := new.private_to;
  end if;
  perform app.check_chosen_privacy(new.private_to, was,
    tg_op, new.belongs_to, case when tg_op = 'UPDATE' then old.belongs_to end);
  return new;
end;
$$;

-- Puts each link to a debt or goal where the phone keeps it (apps/web/lib/
-- sync-rows.ts): on the payment itself when everyone who reads the payment
-- can read what it names, or else in its person's private links (D291). So
-- after a debt or goal is shared, or a record made private, the plan on the
-- server is exactly the one the phone would send, and no phone sends a
-- change just to put a link back.
create function app.put_links_back(plan uuid, me uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Links kept apart that a payment can now hold itself.
  update public.series s set debt_id = l.debt_id
    from public.private_links l
    where l.plan_id = plan and l.private_to = me and not l.deleted and l.debt_id is not null
      and s.plan_id = plan and s.family_id = l.family_id and not s.deleted and s.debt_id is null
      and exists (select 1 from public.debts d where d.id = l.debt_id
        and (d.private_to is null or d.private_to is not distinct from s.private_to));
  update public.private_links l set deleted = true
    where l.plan_id = plan and l.private_to = me and not l.deleted and l.debt_id is not null
      and exists (select 1 from public.debts d where d.id = l.debt_id and d.private_to is null);
  update public.series s set goal_id = l.goal_id
    from public.private_links l
    where l.plan_id = plan and l.private_to = me and not l.deleted and l.goal_id is not null
      and s.plan_id = plan and s.family_id = l.family_id and not s.deleted and s.goal_id is null
      and exists (select 1 from public.goals g where g.id = l.goal_id
        and (g.private_to is null or g.private_to is not distinct from s.private_to));
  update public.private_links l set deleted = true
    where l.plan_id = plan and l.private_to = me and not l.deleted and l.goal_id is not null
      and exists (select 1 from public.goals g where g.id = l.goal_id and g.private_to is null);
  update public.ticks t set in_debt_update = l.in_debt_update
    from public.private_links l
    where l.plan_id = plan and l.private_to = me and not l.deleted and l.in_debt_update is not null
      and t.id = l.tick_id and not t.deleted and t.in_debt_update is null
      and exists (select 1 from public.debts d where d.id = l.in_debt_update and d.private_to is null);
  update public.private_links l set deleted = true
    where l.plan_id = plan and l.private_to = me and not l.deleted and l.in_debt_update is not null
      and exists (select 1 from public.debts d where d.id = l.in_debt_update and d.private_to is null);
  -- Links on a payment that only its person reads now, folded back on.
  update public.series s set debt_id = l.debt_id
    from public.private_links l
    where l.plan_id = plan and l.private_to = me and not l.deleted and l.debt_id is not null
      and s.plan_id = plan and s.family_id = l.family_id and not s.deleted and s.private_to = me;
  update public.series s set goal_id = l.goal_id
    from public.private_links l
    where l.plan_id = plan and l.private_to = me and not l.deleted and l.goal_id is not null
      and s.plan_id = plan and s.family_id = l.family_id and not s.deleted and s.private_to = me;
  update public.series s set pay_profile_id = l.pay_profile_id, cycle_pay_weeks = l.cycle_pay_weeks
    from public.private_links l
    where l.plan_id = plan and l.private_to = me and not l.deleted and l.series_id is not null
      and s.id = l.series_id and s.plan_id = plan and not s.deleted and s.private_to = me;
  update public.ticks t set in_debt_update = l.in_debt_update
    from public.private_links l
    where l.plan_id = plan and l.private_to = me and not l.deleted and l.in_debt_update is not null
      and t.id = l.tick_id and not t.deleted and t.private_to = me;
  update public.private_links l set deleted = true
    where l.plan_id = plan and l.private_to = me and not l.deleted
      and ((l.family_id is not null and exists (select 1 from public.series s
          where s.plan_id = plan and s.family_id = l.family_id and not s.deleted and s.private_to = me))
        or (l.series_id is not null and exists (select 1 from public.series s
          where s.id = l.series_id and not s.deleted and s.private_to = me))
        or (l.tick_id is not null and exists (select 1 from public.ticks t
          where t.id = l.tick_id and not t.deleted and t.private_to = me)));
end;
$$;

-- The opposite: links on shared payments to a debt or goal that's private
-- to the person now go into their private links, with the ids the phone
-- works out (lib/sync-ids.ts), and come off the payments.
create function app.keep_links_apart(plan uuid, debt uuid, goal uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.private_links (id, plan_id, family_id, debt_id)
  select distinct app.derived_id(plan, 'family-debt', s.family_id::text), plan, s.family_id, s.debt_id
    from public.series s
    where s.plan_id = plan and s.debt_id = debt and s.private_to is null and not s.deleted
  on conflict (id) do update set debt_id = excluded.debt_id, deleted = false;
  update public.series s set debt_id = null
    where s.plan_id = plan and s.debt_id = debt and s.private_to is null and not s.deleted;
  insert into public.private_links (id, plan_id, tick_id, in_debt_update)
  select app.derived_id(plan, 'tick-debt', t.id::text), plan, t.id, t.in_debt_update
    from public.ticks t
    where t.plan_id = plan and t.in_debt_update = debt and t.private_to is null and not t.deleted
  on conflict (id) do update set in_debt_update = excluded.in_debt_update, deleted = false;
  update public.ticks t set in_debt_update = null
    where t.plan_id = plan and t.in_debt_update = debt and t.private_to is null and not t.deleted;
  insert into public.private_links (id, plan_id, family_id, goal_id)
  select distinct app.derived_id(plan, 'family-goal', s.family_id::text), plan, s.family_id, s.goal_id
    from public.series s
    where s.plan_id = plan and s.goal_id = goal and s.private_to is null and not s.deleted
  on conflict (id) do update set goal_id = excluded.goal_id, deleted = false;
  update public.series s set goal_id = null
    where s.plan_id = plan and s.goal_id = goal and s.private_to is null and not s.deleted;
end;
$$;

-- "Make it private": a shared account, debt or goal the person made becomes
-- theirs alone again, with everything on it, in one step or nothing.
--
-- Only the person who made it, whatever their role: it was theirs to share,
-- and it's theirs to take back (D462). Refused, with only shared record ids:
-- - "not-yours" when someone else made it;
-- - "partner-things" when the other person has their own things on it or
--   linked to it: payments or budgets they added, their pay, or money kept
--   as theirs ("From Tom"). Those stay theirs to see, so it stays shared;
-- - "goal-here" when a shared savings goal is kept in the account;
-- - "move-together" when money moves between it and another shared account;
-- - "share-has-halves" when money kept as "From Jess" is in it (D413).
-- Records removed before stay as they were. The other person is told only
-- that a shared account, debt or goal was made private, without its name.
create function public.make_private(plan uuid, what text, record uuid, edit uuid, made_at text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  me uuid := auth.uid();
  found_one record;
  ids uuid[];
begin
  if plan is null or record is null or edit is null or not app.session_ok()
    or not exists (select 1 from app.my_plans() p where p = plan) or what not in ('account', 'debt', 'goal') then
    perform app.refuse('not-found', '42501');
  end if;
  if exists (select 1 from public.edits e where e.id = edit and e.plan_id = plan and e.person_id = me) then
    return jsonb_build_object('saved', 'already', 'now', app.server_time());
  end if;
  if what = 'account' then
    select a.private_to, a.created_by, a.deleted into found_one from public.accounts a where a.id = record and a.plan_id = plan;
  elsif what = 'debt' then
    select d.private_to, d.created_by, d.deleted into found_one from public.debts d where d.id = record and d.plan_id = plan;
  else
    select g.private_to, g.created_by, g.deleted into found_one from public.goals g where g.id = record and g.plan_id = plan;
  end if;
  if found_one.deleted is distinct from false or found_one.private_to is not null then
    perform app.refuse('not-found', '42501');
  end if;
  if found_one.created_by is distinct from me then
    perform app.refuse('not-yours');
  end if;

  if what = 'account' then
    -- The other person's own things on it: payments whose family they
    -- started, their pay, money kept as theirs, and budgets they added.
    select array_agg(distinct s.id) into ids from public.series s
      where s.plan_id = plan and not s.deleted and s.private_to is null
        and (s.account_id = record or s.to_account_id = record or s.set_aside_account_id = record)
        and ((s.locked_to is not null and s.locked_to <> me) or (s.paid_to is not null and s.paid_to <> me)
          or exists (select 1 from public.series first where first.id = s.family_id and first.created_by <> me));
    ids := coalesce(ids, '{}') || coalesce((select array_agg(b.id) from public.budgets b
      where b.plan_id = plan and not b.deleted and b.account_id = record and b.created_by <> me), '{}');
    -- A goal of the other person's own kept in it: not named, as it's theirs alone.
    if cardinality(ids) > 0 or exists (select 1 from public.goals g where g.plan_id = plan and not g.deleted
        and g.account_id = record and g.private_to is not null and g.private_to <> me) then
      raise exception using errcode = 'P0001', message = 'partner-things', detail = to_jsonb(ids)::text;
    end if;
    select array_agg(g.id) into ids from public.goals g
      where g.plan_id = plan and not g.deleted and g.account_id = record and g.private_to is null;
    if ids is not null then
      raise exception using errcode = 'P0001', message = 'goal-here', detail = to_jsonb(ids)::text;
    end if;
    select array_agg(distinct other.id) into ids
      from public.series s
      join public.accounts other on other.plan_id = plan
        and other.id in (s.account_id, s.to_account_id, s.set_aside_account_id)
      where s.plan_id = plan and not s.deleted
        and (s.account_id = record or s.to_account_id = record or s.set_aside_account_id = record)
        and other.private_to is null and other.id <> record;
    if ids is not null then
      raise exception using errcode = 'P0001', message = 'move-together', detail = to_jsonb(ids)::text;
    end if;
    select array_agg(s.id) into ids from public.series s
      where s.plan_id = plan and not s.deleted and s.account_id = record and s.locked_to = me;
    if ids is not null then
      raise exception using errcode = 'P0001', message = 'share-has-halves', detail = to_jsonb(ids)::text;
    end if;
  else
    -- Payments linked to it that are the other person's: shared ones they
    -- started, or their pay or money, or any of their own private ones,
    -- which aren't named.
    select array_agg(distinct s.id) into ids from public.series s
      where s.plan_id = plan and not s.deleted
        and ((what = 'debt' and s.debt_id = record) or (what = 'goal' and s.goal_id = record))
        and (s.private_to is not null and s.private_to <> me
          or (s.locked_to is not null and s.locked_to <> me) or (s.paid_to is not null and s.paid_to <> me)
          or exists (select 1 from public.series first where first.id = s.family_id and first.created_by <> me));
    if ids is not null then
      raise exception using errcode = 'P0001', message = 'partner-things', detail = (select to_jsonb(coalesce(array_agg(s.id), '{}'))::text
        from public.series s where s.id = any (ids) and s.private_to is null);
    end if;
  end if;

  if app.begin_edit(plan, edit, made_at, 'make-private') = 'already' then
    return jsonb_build_object('saved', 'already', 'now', app.server_time());
  end if;
  perform set_config('prepenny.sharing', record::text, true);
  perform set_config('prepenny.edit', edit::text, true);
  begin
    if what = 'account' then
      update public.accounts set private_to = me, belongs_to = me where id = record and plan_id = plan;
      -- Everything on it saved again, so the database fills in its privacy
      -- from the account. Records removed before stay as they were.
      update public.balance_updates set deleted = false where plan_id = plan and account_id = record and not deleted;
      update public.budgets set deleted = false where plan_id = plan and account_id = record and not deleted;
      update public.series s set deleted = false where s.plan_id = plan and s.account_id = record and not s.deleted;
      update public.payment_changes c set deleted = false
        where c.plan_id = plan and not c.deleted
          and (c.series_id in (select s.id from public.series s where s.plan_id = plan and s.account_id = record)
            or c.budget_id in (select b.id from public.budgets b where b.plan_id = plan and b.account_id = record));
      update public.ticks t set deleted = false
        where t.plan_id = plan and not t.deleted
          and (t.series_id in (select s.id from public.series s where s.plan_id = plan and s.account_id = record)
            or t.budget_id in (select b.id from public.budgets b where b.plan_id = plan and b.account_id = record));
      update public.spends p set deleted = false
        where p.plan_id = plan and not p.deleted
          and p.budget_id in (select b.id from public.budgets b where b.plan_id = plan and b.account_id = record);
      update public.pay_adjustments a set deleted = false
        where a.plan_id = plan and not a.deleted
          and a.family_id in (select s.family_id from public.series s where s.plan_id = plan and s.account_id = record);
      perform app.put_links_back(plan, me);
    elsif what = 'debt' then
      update public.debts set private_to = me, belongs_to = me where id = record and plan_id = plan;
      perform app.keep_links_apart(plan, record, null);
    else
      update public.goals set private_to = me, belongs_to = me where id = record and plan_id = plan;
      perform app.keep_links_apart(plan, null, record);
    end if;
  exception
    when sqlstate 'P0001' or insufficient_privilege then
      raise;
    when others then
      perform app.refuse('bad-record');
  end;
  perform set_config('prepenny.sharing', '', true);
  -- The other person sees that something shared was made private, and nothing
  -- else about it (D458): the edit is shared, with what kind it was only.
  update public.edits set private_to = null, summary = jsonb_build_object('made_private', what) where id = edit;
  perform set_config('prepenny.edit', '', true);
  if what = 'account' and app.family_rules_problem(plan, (select array_agg(distinct s.family_id) from public.series s
      where s.plan_id = plan and s.account_id = record)) is not null then
    perform app.refuse('family-broken');
  end if;
  perform app.send_nudge('plan:' || plan);
  perform app.send_nudge('plan:' || plan || ':' || me);
  return jsonb_build_object('saved', 'new', 'now', app.server_time());
end;
$$;

-- "Share it": a debt or savings goal of the person's own becomes shared, so
-- their partner sees it and what's left on it, or what's saved (D65, D463).
-- Only someone who can edit, as it makes a shared record, and a goal only
-- when it's kept in a shared account ("goal-in-private-account"). Links kept
-- apart on shared payments are put back on them.
create function public.share_record(plan uuid, what text, record uuid, edit uuid, made_at text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  me uuid := auth.uid();
  found_one record;
begin
  if plan is null or record is null or edit is null or not app.session_ok()
    or not exists (select 1 from app.my_plans() p where p = plan) or what not in ('debt', 'goal') then
    perform app.refuse('not-found', '42501');
  end if;
  if exists (select 1 from public.edits e where e.id = edit and e.plan_id = plan and e.person_id = me) then
    return jsonb_build_object('saved', 'already', 'now', app.server_time());
  end if;
  if not exists (select 1 from app.my_edit_plans() p where p = plan) then
    perform app.refuse('view-only', '42501');
  end if;
  if what = 'debt' then
    select d.private_to, d.deleted, null::uuid as account into found_one
      from public.debts d where d.id = record and d.plan_id = plan;
  else
    select g.private_to, g.deleted, g.account_id as account into found_one
      from public.goals g where g.id = record and g.plan_id = plan;
  end if;
  if found_one.deleted is distinct from false or found_one.private_to is distinct from me then
    perform app.refuse('not-found', '42501');
  end if;
  if what = 'goal' and (select a.private_to from public.accounts a where a.id = found_one.account) is not null then
    perform app.refuse('goal-in-private-account');
  end if;
  if app.begin_edit(plan, edit, made_at, 'share-record') = 'already' then
    return jsonb_build_object('saved', 'already', 'now', app.server_time());
  end if;
  perform set_config('prepenny.sharing', record::text, true);
  perform set_config('prepenny.edit', edit::text, true);
  begin
    if what = 'debt' then
      update public.debts set private_to = null, belongs_to = null where id = record and plan_id = plan;
    else
      update public.goals set private_to = null, belongs_to = null where id = record and plan_id = plan;
    end if;
    perform app.put_links_back(plan, me);
  exception
    when sqlstate 'P0001' or insufficient_privilege then
      raise;
    when others then
      perform app.refuse('bad-record');
  end;
  perform set_config('prepenny.sharing', '', true);
  update public.edits set summary = jsonb_build_object('shared', what) where id = edit;
  perform set_config('prepenny.edit', '', true);
  perform app.send_nudge('plan:' || plan);
  perform app.send_nudge('plan:' || plan || ':' || me);
  return jsonb_build_object('saved', 'new', 'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. "From Jess" into a shared savings goal (D114, D464).
--
-- The shared half of money from someone's own account may name a shared
-- goal, so the goal counts it and shows it as theirs. It still names
-- nothing private: no note, debt, job, money set aside or anything else.
-- Otherwise exactly as step 3f's check.
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
    -- A shared goal is the one link it may hold (D464); check_link above has
    -- made sure it's shared, as the half is.
    if new.note is not null or new.debt_id is not null
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

-- ---------------------------------------------------------------------------
-- Who can use which function, as at the end of every migration that adds to
-- `app` (00-every-table.test.sql): everything taken back, then only what the
-- rules and these steps call given to signed-in people.

revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on function public.plan_activity(uuid, text), public.undo_change(uuid, uuid, uuid, text),
  public.change_role(uuid, uuid, text), public.make_private(uuid, text, uuid, uuid, text),
  public.share_record(uuid, text, uuid, uuid, text)
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
  app.undo_writes(uuid, uuid), app.mark_undone(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.plan_activity(uuid, text), public.undo_change(uuid, uuid, uuid, text),
  public.change_role(uuid, uuid, text), public.make_private(uuid, text, uuid, uuid, text),
  public.share_record(uuid, text, uuid, uuid, text)
  to authenticated;
