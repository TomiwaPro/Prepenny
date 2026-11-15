-- Step 4c: bank holidays (D57, D536, PLAN.md item 9).
--
-- Each plan keeps the copy of GOV.UK's bank holiday list its dates are
-- worked out from, so every phone in a shared plan gives the same dates,
-- whichever phone fetched a new list first (D536). A phone with a newer
-- list, from PrePenny's own site or built into a newer app, sends it here;
-- the other phone gets it with the plan's next look, through the live nudge.
--
-- 1. The plan's list: one row per plan, everyone in the plan reads it, only
--    use_bank_holidays writes it.
-- 2. use_bank_holidays: takes a list only when it's newer than the plan's,
--    and only from someone who can change the plan (D51).
-- 3. plan_changes: brings the list down with the plan's other records,
--    in the same one read (D521).
--
-- The list is GOV.UK's, never anything a person typed, so it isn't a
-- change of theirs: it keeps no history and shows in no Activity.
--
-- Checks: supabase/tests/database/34-bank-holidays.test.sql.

-- ---------------------------------------------------------------------------
-- 1. The plan's list.

create table public.bank_holidays (
  -- Worked out from the plan: one row per plan.
  id uuid primary key,
  plan_id uuid not null unique references public.plans (id) on delete cascade,
  version integer not null default 1,
  -- A shared record's change number: phones ask for everything after theirs.
  seq bigint not null default 0,
  changed_at timestamptz not null default now(),
  deleted boolean not null default false,
  -- "YYYY-MM-DD:" and the list's SHA-256 checksum: the day it was
  -- downloaded from GOV.UK, and what's in it (D536).
  list_version text not null check (list_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9a-f]{64}$'),
  -- GOV.UK's list, in the shape of https://www.gov.uk/bank-holidays.json.
  list jsonb not null
);

create index bank_holidays_by_plan on public.bank_holidays (plan_id, seq);

comment on table public.bank_holidays is
  'The bank holiday list a plan''s dates are worked out from (D536). Written by use_bank_holidays alone.';

alter table public.bank_holidays enable row level security;
revoke all on public.bank_holidays from anon, authenticated, public;
grant select on public.bank_holidays to authenticated;
-- Everyone in the plan, while their sign-in session exists (app.my_plans).
create policy read on public.bank_holidays for select to authenticated
  using (plan_id in (select app.my_plans()));

-- ---------------------------------------------------------------------------
-- 2. A newer list for a plan.

-- What's wrong with a list, or null when it's GOV.UK's shape: an object
-- with each nation's events, each with a real date and a title. Never
-- bigger than about ten times GOV.UK's own file.
create function app.bank_holiday_list_problem(list jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  nation text;
  events jsonb;
  event jsonb;
begin
  if list is null or jsonb_typeof(list) <> 'object' or octet_length(list::text) > 250000 then
    return 'bad-list';
  end if;
  foreach nation in array array['england-and-wales', 'scotland', 'northern-ireland'] loop
    events := list -> nation -> 'events';
    if events is null or jsonb_typeof(events) <> 'array' or jsonb_array_length(events) = 0
        or jsonb_array_length(events) > 1000 then
      return 'bad-list';
    end if;
    for event in select e from jsonb_array_elements(events) as t(e) loop
      if jsonb_typeof(event) <> 'object'
          or jsonb_typeof(event -> 'date') is distinct from 'string'
          or (event ->> 'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          or jsonb_typeof(event -> 'title') is distinct from 'string'
          or length(event ->> 'title') > 200
          or (event ? 'notes' and (jsonb_typeof(event -> 'notes') <> 'string'
            or length(event ->> 'notes') > 200)) then
        return 'bad-list';
      end if;
      begin
        perform (event ->> 'date')::date;
      exception when others then
        return 'bad-list';
      end;
    end loop;
  end loop;
  return null;
end;
$$;

-- True when `candidate` is a newer list than `than` (D536), exactly as the
-- engine's isNewerBankHolidayVersion: a different list, downloaded on a
-- later day, or on the same day with the larger checksum.
create function app.bank_holidays_newer(candidate text, than text) returns boolean
language sql immutable set search_path = '' as $$
  select than is null or (
    split_part(candidate, ':', 2) <> split_part(than, ':', 2)
    and (split_part(candidate, ':', 1) collate "C" > split_part(than, ':', 1) collate "C"
      or (split_part(candidate, ':', 1) = split_part(than, ':', 1)
        and split_part(candidate, ':', 2) collate "C" > split_part(than, ':', 2) collate "C")))
$$;

-- A newer bank holiday list for a plan (D536). Only someone who can change
-- the plan (D51); a list no newer than the plan's changes nothing and says
-- which the plan has. A day downloaded after tomorrow can't be real.
-- Answers {saved, list_version} or {kept, list_version}.
create function public.use_bank_holidays(plan uuid, list_version text, list jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  stored public.bank_holidays;
  had boolean;
  next_seq bigint;
begin
  if plan is null or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  if not exists (select 1 from app.my_edit_plans() p where p = plan) then
    perform app.refuse('view-only', '42501');
  end if;
  if list_version is null or list_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9a-f]{64}$' then
    perform app.refuse('bad-list');
  end if;
  begin
    if split_part(list_version, ':', 1)::date > (now() at time zone 'Europe/London')::date + 1 then
      perform app.refuse('bad-list');
    end if;
  exception when sqlstate 'P0001' then
    raise;
  when others then
    perform app.refuse('bad-list');
  end;
  if app.bank_holiday_list_problem(list) is not null then
    perform app.refuse('bad-list');
  end if;
  -- The plan's shared change counter first, as every save of a shared
  -- record takes it first (D522), so two lists at once go one at a time.
  insert into app.plan_counters (plan_id, counts_for, last_seq)
    values (plan, app.shared_count(), 0) on conflict (plan_id, counts_for) do nothing;
  perform 1 from app.plan_counters c
    where c.plan_id = plan and c.counts_for = app.shared_count() for update;
  select * into stored from public.bank_holidays b where b.plan_id = plan for update;
  had := found;
  if had and not app.bank_holidays_newer(list_version, stored.list_version) then
    return jsonb_build_object('kept', stored.list_version);
  end if;
  next_seq := app.next_seq(plan, null);
  if not had then
    insert into public.bank_holidays (id, plan_id, seq, list_version, list)
      values (app.derived_id(plan, 'bank-holidays', 'list'), plan, next_seq, list_version, list);
  else
    update public.bank_holidays b set list_version = list_version, list = list,
        version = b.version + 1, seq = next_seq, changed_at = now()
      where b.plan_id = plan;
  end if;
  perform app.send_nudge('plan:' || plan);
  return jsonb_build_object('saved', list_version);
end;
$$;

revoke all on function app.bank_holiday_list_problem(jsonb), app.bank_holidays_newer(text, text)
  from public, anon, authenticated;
revoke all on function public.use_bank_holidays(uuid, text, jsonb) from public, anon;
grant execute on function public.use_bank_holidays(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. What's new since a phone last looked: as step 4a made it (D521), with
-- the plan's bank holiday list after the paydays, in the same one read.

create or replace function public.plan_changes(plan uuid, shared_after bigint, mine_after bigint)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  all_rows jsonb;
  the_plan jsonb;
  found_notices jsonb;
  every_table text;
begin
  if plan is null or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'edit', n.edit_id, 'data', n.data)
      order by n.created_at), '[]'::jsonb)
    into found_notices
    from public.notices n
    where n.plan_id = plan and n.for_person = auth.uid() and n.kind = 'clash' and n.read_at is null
      and n.created_at > now() - interval '30 days';
  select jsonb_build_object('id', p.id, 'nation', p.nation, 'owner', p.owner, 'version', p.version,
      'seq', p.seq, 'changed_at', p.changed_at, 'edit_id', p.edit_id,
      'edit_made_at', e.made_at, 'edit_saved_at', app.utc_exact(e.saved_at),
      'edit_by', e.person_id, 'edit_kind', e.kind)
    into the_plan from public.plans p
    left join public.edits e on e.id = p.edit_id and e.plan_id = p.id
    where p.id = plan;
  -- Every kind of record, in the same order as before, then the paydays
  -- and the bank holiday list (shared, so they count with the shared
  -- records), in one query.
  select string_agg(format($q$
      select %s as kind_order, r.seq, jsonb_build_object('table', %L,
          'row', to_jsonb(r) - 'plan_id' - 'created_at',
          'edit_made_at', e.made_at, 'edit_saved_at', app.utc_exact(e.saved_at),
          'edit_by', e.person_id, 'edit_kind', e.kind) as one
      from public.%I r
      left join public.edits e on e.id = r.edit_id and e.plan_id = r.plan_id
      where r.plan_id = $1
        and ((r.private_to is null and r.seq > $2) or (r.private_to = auth.uid() and r.seq > $3))$q$,
      t.n, t.name, t.name), ' union all ' order by t.n)
    into every_table
    from unnest(app.record_tables()) with ordinality as t(name, n);
  execute format($q$
      select coalesce(jsonb_agg(x.one order by x.kind_order, x.seq), '[]'::jsonb) from (
        %s
        union all
        select 1000, r.seq, jsonb_build_object('table', 'paydays', 'row', to_jsonb(r) - 'plan_id')
        from public.paydays r
        where r.plan_id = $1 and r.seq > $2
        union all
        select 1001, r.seq, jsonb_build_object('table', 'bank_holidays', 'row', to_jsonb(r) - 'plan_id')
        from public.bank_holidays r
        where r.plan_id = $1 and r.seq > $2
      ) x$q$, every_table)
    into all_rows using plan, coalesce(shared_after, 0), coalesce(mine_after, 0);
  return jsonb_build_object('plan', the_plan, 'rows', all_rows,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('person', m.person_id, 'role', m.role,
        'nickname', coalesce(p.nickname, ''))), '[]'::jsonb)
      from public.plan_members m left join public.people p on p.id = m.person_id
      where m.plan_id = plan and m.left_at is null),
    'notices', found_notices,
    'now', app.server_time());
end;
$$;
