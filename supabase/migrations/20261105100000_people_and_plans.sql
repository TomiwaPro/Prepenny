-- Step 3a: people, plans and who is in each plan (ARCHITECTURE.md 3.2), with
-- the checks every privacy rule uses (ARCHITECTURE.md 3.6, D21, D51).
--
-- Every table starts with everything refused. Someone who isn't signed in
-- gets nothing at all; a signed-in person gets only what the policies here
-- and in the later files allow. Nothing in this file holds an amount, a
-- payment name or a note.

-- The checks live in their own schema, which the app's web address never
-- shows, so they can only be used by the privacy rules themselves.
create schema app;
revoke all on schema app from public;
grant usage on schema app to authenticated;
alter default privileges in schema app revoke execute on functions from public;

-- Supabase gives every role everything on new tables in `public`. PrePenny
-- takes that back and grants each table only what its rules need.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Types shared by every table.

-- Whole pence (or a debt's own minor units), within what a phone can count
-- exactly (Number.isSafeInteger). Never floating point (CLAUDE.md).
create domain app.pence as bigint
  check (value between -9007199254740991 and 9007199254740991);

-- An exact number written as text: a rate, a percentage or hours, such as
-- "1.1612", "25" or "34.5" (ARCHITECTURE.md 3, D9).
create domain app.decimal_text as text
  check (value ~ '^[0-9]{1,9}(\.[0-9]{1,9})?$');

-- A moment as the phone wrote it, in UTC, such as "2026-10-30T09:14:05Z".
-- Kept as the phone's own text, so a plan comes back exactly as it was left:
-- the engine compares these times as they're written (D33, D288).
create domain app.utc_time as text
  check (value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$');

-- A tax year, such as "2026-27".
create domain app.tax_year as text
  check (value ~ '^[0-9]{4}-[0-9]{2}$');

-- ---------------------------------------------------------------------------
-- People.

-- A person: the same id as their sign-in. A nickname is enough (brief 7.2).
-- Email addresses and sign-in methods stay in Supabase's own sign-in tables.
create table public.people (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '',
  created_at timestamptz not null default now()
);

-- A plan (ARCHITECTURE.md 3.2). Its nation decides the bank holidays for
-- everyone in it (D155). Each person's main pay is in `settings`, private to
-- them (D289).
create table public.plans (
  id uuid primary key,
  name text not null default '',
  nation text not null default 'england-and-wales'
    check (nation in ('england-and-wales', 'scotland', 'northern-ireland')),
  is_example boolean not null default false,
  -- 2 for now (brief 4.14). Raising it is how housemates join later (ARCHITECTURE.md 3.10).
  max_members smallint not null default 2 check (max_members between 1 and 2),
  owner uuid not null references public.people (id),
  version integer not null default 1,
  seq bigint not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.people (id),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.people (id),
  edit_id uuid
);

-- The plan's change number: it goes up by 1 with every save in the plan, and
-- each saved row keeps the number it got (`seq`, ARCHITECTURE.md 3.1), so a
-- phone can ask for everything after the number it has. Kept apart from the
-- plan's own row, so a tick doesn't count as a change to the plan itself.
create table app.plan_counters (
  plan_id uuid primary key references public.plans (id) on delete cascade,
  last_seq bigint not null
);

-- Who is in a plan, and what they may do: "Can edit" is editor, "Can view
-- only" is viewer (brief 4.14, ARCHITECTURE.md 3.6).
create table public.plan_members (
  plan_id uuid not null references public.plans (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  -- Set when they leave. They then see nothing more of the plan (brief 4.14).
  left_at timestamptz,
  primary key (plan_id, person_id)
);

create unique index plan_members_one_owner on public.plan_members (plan_id)
  where role = 'owner' and left_at is null;
create index plan_members_person on public.plan_members (person_id);

-- An invite to a shared plan (ARCHITECTURE.md 3.2). Only a scrambled copy of
-- the link's secret is kept. Invites are made and accepted in step 3f.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  email text,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.people (id),
  expires_at timestamptz not null default now() + interval '7 days',
  cancelled_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references public.people (id)
);

-- ---------------------------------------------------------------------------
-- The checks. Each answers only about the person asking, so calling one
-- tells nobody anything about anyone else.

-- The sign-in session id inside the person's token, or nothing.
create function app.session_id() returns uuid
language sql stable set search_path = '' as $$
  select case
    when auth.jwt() ->> 'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() ->> 'session_id')::uuid
  end
$$;

-- True while the sign-in session in the person's token still exists (D21).
-- Ending a session, or "Sign out everywhere", refuses that token's very next
-- request, even though the token itself hasn't run out yet.
create function app.session_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = app.session_id()
      and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  )
$$;

-- The plans the person is a current member of, while their session exists.
create function app.my_plans() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.plan_id from public.plan_members m
  where m.person_id = auth.uid() and m.left_at is null and app.session_ok()
$$;

-- The plans the person can change shared records in: owner or editor (D51).
create function app.my_edit_plans() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.plan_id from public.plan_members m
  where m.person_id = auth.uid() and m.left_at is null
    and m.role in ('owner', 'editor') and app.session_ok()
$$;

-- The plans the person owns.
create function app.my_owned_plans() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.plan_id from public.plan_members m
  where m.person_id = auth.uid() and m.left_at is null
    and m.role = 'owner' and app.session_ok()
$$;

-- The people in the person's current plans, themselves included, so a
-- partner's nickname can show as "Changed by Tom" (brief 4.14).
create function app.my_partners() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct other.person_id
  from public.plan_members mine
  join public.plan_members other on other.plan_id = mine.plan_id and other.left_at is null
  where mine.person_id = auth.uid() and mine.left_at is null and app.session_ok()
$$;

-- Refuses with a short code and no data (D87): never an amount, a name or a
-- note. "42501" is the same code the privacy rules use, so "not yours" and
-- "not there" can't be told apart.
create function app.refuse(code text, state text default 'P0001') returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = state, message = code;
end;
$$;

-- The plan's next change number. Saves in one plan wait for each other here,
-- one at a time, so two phones never get the same number (ARCHITECTURE.md 7).
create function app.next_seq(plan uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  number bigint;
begin
  update app.plan_counters set last_seq = last_seq + 1 where plan_id = plan
    returning last_seq into number;
  if number is null then
    perform app.refuse('not-found', '42501');
  end if;
  return number;
end;
$$;

grant execute on function
  app.session_id(), app.session_ok(), app.my_plans(), app.my_edit_plans(),
  app.my_owned_plans(), app.my_partners(), app.refuse(text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- What happens when a plan is made or changed.

-- The person making a plan is its owner and its first member.
create function app.before_plan() returns trigger
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
    new.seq := app.next_seq(new.id);
  end if;
  new.changed_at := now();
  new.changed_by := auth.uid();
  return new;
end;
$$;

create trigger before_write before insert or update on public.plans
  for each row execute function app.before_plan();

create function app.after_plan_made() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into app.plan_counters (plan_id, last_seq) values (new.id, 1);
  insert into public.plan_members (plan_id, person_id, role) values (new.id, new.owner, 'owner');
  return null;
end;
$$;

create trigger after_made after insert on public.plans
  for each row execute function app.after_plan_made();

-- ---------------------------------------------------------------------------
-- The rules for these tables.

alter table public.people enable row level security;
alter table public.plans enable row level security;
alter table public.plan_members enable row level security;
alter table public.invites enable row level security;

revoke all on public.people, public.plans, public.plan_members, public.invites
  from anon, authenticated, public;

-- A person sees themselves and the people they share a plan with. Only
-- their own nickname is theirs to change.
grant select, insert on public.people to authenticated;
grant update (nickname) on public.people to authenticated;

create policy read on public.people for select to authenticated
  using (id in (select app.my_partners()) or (id = (select auth.uid()) and (select app.session_ok())));

create policy add_myself on public.people for insert to authenticated
  with check (id = (select auth.uid()) and (select app.session_ok()));

create policy change_myself on public.people for update to authenticated
  using (id = (select auth.uid()) and (select app.session_ok()))
  with check (id = (select auth.uid()));

-- A plan is seen by its current members. Anyone signed in can make one, and
-- becomes its owner. Owners and editors change its nation; only the owner
-- renames it.
grant select on public.plans to authenticated;
grant insert (id, name, nation, is_example, edit_id) on public.plans to authenticated;
grant update (name, nation, edit_id) on public.plans to authenticated;

create policy read on public.plans for select to authenticated
  using (id in (select app.my_plans()));

create policy make on public.plans for insert to authenticated
  with check (owner = (select auth.uid()) and (select app.session_ok()));

create policy change on public.plans for update to authenticated
  using (id in (select app.my_edit_plans()))
  with check (id in (select app.my_edit_plans()));

-- Members see who else is in their plan and their role. Joining, leaving and
-- changing a role go through the server's own steps in steps 3f and 3g, so
-- nobody can add themselves to a plan or make themselves an editor.
grant select on public.plan_members to authenticated;

create policy read on public.plan_members for select to authenticated
  using (plan_id in (select app.my_plans()));

-- Only the plan's owner sees its invites, which can hold an email address.
grant select on public.invites to authenticated;

create policy read on public.invites for select to authenticated
  using (plan_id in (select app.my_owned_plans()));
