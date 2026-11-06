-- Step 3a: a table for every kind of record the phone keeps (ARCHITECTURE.md
-- 3.3 to 3.5, and what was added since: budgets, spends, usual weeks, pay
-- profiles and pay adjustments, settings and practice changes).
--
-- Payments themselves are never stored, only the series, the one-off changes
-- and the ticks (brief 5.2). Each column matches a field of the engine's own
-- record (packages/engine), so a plan comes back exactly as it was left.
-- Column names follow ARCHITECTURE.md 3.3 and 3.4.

-- ---------------------------------------------------------------------------
-- The sync fields every plan record has (ARCHITECTURE.md 3.1). The database
-- fills in all of them except `id`, `plan_id`, `private_to` where a person
-- chooses it, `list_order`, `edit_id` and `deleted` (D288).
create table app.sync_fields (
  -- Made on the phone (UUID version 7), so records can be made offline.
  id uuid not null,
  plan_id uuid not null,
  -- Empty: everyone in the plan can see it. Set: only that person, ever (D16).
  private_to uuid,
  -- Goes up by 1 on every save. A clash is a save on a version that has moved on (ARCHITECTURE.md 3.5).
  version integer not null default 1,
  -- The plan's change number when it was last saved: phones ask for "everything after N".
  seq bigint not null default 0,
  -- Its place among its kind, so lists come back in the order they were made (D168).
  list_order bigint not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  -- "Changed by Tom, 2 hours ago" (brief 4.14). Set by the database, never by a phone.
  changed_at timestamptz not null default now(),
  changed_by uuid,
  -- The edit that last saved it, for Activity and undo (ARCHITECTURE.md 3.5).
  edit_id uuid,
  -- Removed records stay for 90 days so every phone hears about it.
  deleted boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Money records (ARCHITECTURE.md 3.3).

-- An account. Its balance is its latest balance update.
create table public.accounts (
  like app.sync_fields including defaults,
  name text,
  kind text not null check (kind in ('current', 'savings', 'joint')),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  overdraft_limit app.pence not null default 0 check (overdraft_limit >= 0),
  -- Strictly under this is Tight (D10). Can be below zero, near an overdraft floor.
  warning_level app.pence not null,
  -- Whose money it is, for "From Jess" (D16). Empty for a joint account.
  belongs_to uuid references public.people (id),
  closed boolean not null default false,
  primary key (id)
);

-- What the bank showed, typed in with Update balance (D33).
create table public.balance_updates (
  like app.sync_fields including defaults,
  account_id uuid not null references public.accounts (id),
  balance app.pence not null,
  checked_on date not null,
  checked_at app.utc_time not null,
  -- What the plan expected, kept for the history ("The plan expected £604.53").
  expected app.pence,
  -- Always "typed" for now; "bank" is ready for bank connections (ARCHITECTURE.md 3.10).
  source text not null default 'typed' check (source in ('typed', 'bank')),
  primary key (id)
);

-- A debt (brief 4.6). Shared, or private to the person it belongs to (D65).
create table public.debts (
  like app.sync_fields including defaults,
  name text not null,
  kind text not null
    check (kind in ('pay-later', 'credit-card', 'loan', 'overdraft', 'owed-to-a-person')),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  -- Units of the debt's currency per £1, "1.1612": needed for any currency but pounds (D98).
  rate app.decimal_text,
  -- In the debt's own minor units: €1,400.57 is 140057.
  balance app.pence not null,
  balance_on date not null,
  balance_at app.utc_time not null,
  starting_balance app.pence not null,
  interest_rate app.decimal_text,
  zero_interest_until date,
  statement_day smallint check (statement_day between 1 and 31),
  -- {"kind":"typed","amount":…} or {"kind":"rule","percent":"1","atLeast":500} (D101).
  minimum_rule jsonb check (minimum_rule is null or minimum_rule ->> 'kind' in ('typed', 'rule')),
  belongs_to uuid references public.people (id),
  closed boolean not null default false,
  primary key (id),
  check ((currency = 'GBP') = (rate is null)),
  -- Only a credit card has interest, a statement day or a minimum (D98).
  check (kind = 'credit-card' or (interest_rate is null and zero_interest_until is null
    and statement_day is null and minimum_rule is null))
);

-- A pay profile: one job's tax settings and the last payslip's figures (brief 4.15).
create table public.pay_profiles (
  like app.sync_fields including defaults,
  belongs_to uuid references public.people (id),
  name text,
  frequency text not null check (frequency in ('weekly', 'two-weekly', 'four-weekly', 'monthly')),
  tax_code text not null,
  basis text not null check (basis in ('cumulative', 'week-one')),
  ni_category text check (ni_category ~ '^[A-Z]$'),
  pension_percent app.decimal_text,
  pension_lower app.pence check (pension_lower >= 0),
  pension_upper app.pence check (pension_upper >= 0),
  pension_when text check (pension_when in ('before-tax', 'after-tax')),
  student_loans text[]
    check (student_loans <@ array['plan-1', 'plan-2', 'plan-4', 'plan-5', 'postgraduate']),
  -- [{"name":"Union","amount":250}]
  other_deductions jsonb check (other_deductions is null or jsonb_typeof(other_deductions) = 'array'),
  -- From the last payslip (D124): all four, or none.
  so_far_tax_year app.tax_year,
  so_far_period smallint check (so_far_period between 1 and 56),
  gross_so_far app.pence,
  tax_so_far app.pence,
  overtime_rate app.decimal_text,
  -- The last day of work each payday pays for (D131, D142).
  covered_to jsonb
    check (covered_to is null or covered_to ->> 'kind' in ('day-of-month', 'last-day', 'days-before')),
  primary key (id),
  check ((pension_percent is null) = (pension_when is null)),
  check (pension_percent is not null or (pension_lower is null and pension_upper is null)),
  check (num_nulls(so_far_tax_year, so_far_period, gross_so_far, tax_so_far) in (0, 4))
);

-- A usual week: the usual pay lines of one kind of week, such as "3-shift week" (D5, D281).
create table public.pay_weeks (
  like app.sync_fields including defaults,
  pay_profile_id uuid not null references public.pay_profiles (id),
  name text,
  -- [{"name":"Basic","kind":"basic","hours":"34.5","rate":"12.71"}]
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  -- [{"name":"Shift premium","amount":11469}]
  fixed jsonb check (fixed is null or jsonb_typeof(fixed) = 'array'),
  primary key (id)
);

-- A savings goal (brief 4.7). Shared, or private to the person it belongs to (D65).
create table public.goals (
  like app.sync_fields including defaults,
  name text not null,
  target app.pence not null check (target > 0),
  target_date date,
  account_id uuid not null references public.accounts (id),
  starting_amount app.pence not null default 0 check (starting_amount >= 0),
  belongs_to uuid references public.people (id),
  closed boolean not null default false,
  primary key (id)
);

-- A budget (brief 4.5): food £200 a month, travel £25 a week.
create table public.budgets (
  like app.sync_fields including defaults,
  account_id uuid not null references public.accounts (id),
  name text not null,
  amount app.pence not null check (amount > 0),
  -- The amounts it had before a change, for periods that had ended (D152): [{"until":"2026-10-22","amount":2500}]
  amounts_before jsonb check (amounts_before is null or jsonb_typeof(amounts_before) = 'array'),
  every text not null check (every in ('week', 'month')),
  leaves text not null check (leaves in ('at-start', 'spread', 'pay-later')),
  roll_over boolean not null default false,
  roll_over_from date,
  starts_on date not null,
  ends_on date,
  bill_day smallint check (bill_day between 1 and 31),
  statement_day smallint check (statement_day between 1 and 31),
  -- When the phone made it, for the same-day order (D12, D107).
  made_at app.utc_time not null,
  primary key (id),
  -- A pay-later bill comes once a month, on its bill day (D107, D111).
  check ((leaves = 'pay-later') = (bill_day is not null)),
  check (leaves = 'pay-later' or statement_day is null),
  check (leaves <> 'pay-later' or every = 'month')
);

-- A series: anything that happens once or repeats (brief 5.2, ARCHITECTURE.md 3.3).
create table public.series (
  like app.sync_fields including defaults,
  account_id uuid not null references public.accounts (id),
  to_account_id uuid references public.accounts (id),
  name text not null,
  direction text not null check (direction in ('in', 'out', 'transfer')),
  type text not null check (type in ('pay', 'benefits', 'rent', 'bills', 'debt',
    'spending-money', 'savings', 'other')),
  amount app.pence not null check (amount >= 0),
  -- "My pay changes in a pattern": up to 8 amounts (brief 4.1).
  amount_cycle app.pence[] check (cardinality(amount_cycle) between 1 and 8),
  cycle_offset integer,
  -- The usual week for each step of the pattern (D5).
  cycle_pay_weeks uuid[] check (cardinality(cycle_pay_weeks) between 1 and 8),
  start_date date not null,
  -- {"kind":"monthly","every":1,"on":{"kind":"day","day":1}} and the like (ARCHITECTURE.md 3.3).
  schedule jsonb not null
    check (schedule ->> 'kind' in ('once', 'weekly', 'monthly', 'dates', 'irregular')),
  -- {"kind":"never"}, {"kind":"after","payments":3} or {"kind":"on","date":"2027-01-31"}.
  end_rule jsonb not null check (end_rule ->> 'kind' in ('never', 'after', 'on')),
  last_amount app.pence check (last_amount >= 0),
  holiday_rule text not null
    check (holiday_rule in ('keep', 'working-day-before', 'working-day-after')),
  debt_id uuid references public.debts (id),
  -- Kept empty for now: linking a payment to a budget is left for later (D160).
  budget_id uuid references public.budgets (id) check (budget_id is null),
  goal_id uuid references public.goals (id),
  -- Money coming in only: part of each payment moved to another account the same day (D64).
  set_aside_percent app.decimal_text,
  set_aside_account_id uuid references public.accounts (id),
  is_estimate boolean not null default false,
  note text,
  pay_profile_id uuid references public.pay_profiles (id),
  split_from uuid,
  -- The first series in its chain of splits (D49), and when that family was made (D12).
  family_id uuid not null,
  family_created_at app.utc_time not null,
  -- The payment number it starts at, counted from the original series (ARCHITECTURE.md 2.3).
  first_number integer check (first_number between 0 and 100000),
  -- On the private half of a private transfer: the shared half that mirrors it,
  -- "From Jess" on the joint account (D16, D94). The shared half names nothing
  -- private, so this link lives on the private side (D291).
  mirrored_by uuid references public.series (id),
  -- Only this person can change it: the shared half "From Jess" (D16).
  locked_to uuid references public.people (id),
  primary key (id),
  check ((direction = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id),
  check ((set_aside_percent is null) = (set_aside_account_id is null)),
  check (set_aside_percent is null or direction = 'in')
);

-- A change to one payment, found by its series (or a pay-later budget, for
-- its bill, D111) and the payment's original date (brief 5.2).
create table public.payment_changes (
  like app.sync_fields including defaults,
  series_id uuid references public.series (id),
  budget_id uuid references public.budgets (id),
  original_date date not null,
  -- The payment number, so a later undo can check it's still the same payment (PLAN.md item 4).
  payment_number integer check (payment_number between 0 and 100000),
  new_date date,
  amount app.pence check (amount >= 0),
  name text,
  note text,
  is_estimate boolean,
  skipped boolean,
  -- Follows its series, so a locked shared half's changes are locked too (D293).
  locked_to uuid references public.people (id),
  primary key (id),
  check (num_nonnulls(series_id, budget_id) = 1),
  check (series_id is null or payment_number is not null)
);

-- One change per payment: a series' payment, or a pay-later bill. A change can
-- only be on a payment in its own plan, so nobody can take a payment's place
-- from another plan.
create unique index payment_changes_one_per_payment
  on public.payment_changes (series_id, original_date) where series_id is not null and not deleted;
create unique index payment_changes_one_per_bill
  on public.payment_changes (budget_id, original_date) where budget_id is not null and not deleted;

-- A paid tick, its own record (D48). Unticking marks it deleted.
create table public.ticks (
  like app.sync_fields including defaults,
  series_id uuid references public.series (id),
  budget_id uuid references public.budgets (id),
  original_date date not null,
  payment_number integer check (payment_number between 0 and 100000),
  -- The tick of the money set aside from this payment, ticked on its own (D116).
  set_aside boolean not null default false,
  paid_on date not null,
  ticked_at app.utc_time not null,
  in_balance_update uuid references public.balance_updates (id),
  in_debt_update uuid references public.debts (id),
  -- Who ticked it (brief 4.14). Set by the database.
  ticked_by uuid references public.people (id),
  source text not null default 'typed' check (source in ('typed', 'bank')),
  locked_to uuid references public.people (id),
  primary key (id),
  check (num_nonnulls(series_id, budget_id) = 1),
  check (series_id is null or payment_number is not null)
);

-- One tick per payment, and one for its money set aside (D116).
create unique index ticks_one_per_payment
  on public.ticks (series_id, original_date, set_aside) where series_id is not null and not deleted;
create unique index ticks_one_per_bill
  on public.ticks (budget_id, original_date, set_aside) where budget_id is not null and not deleted;

-- "I spent" (brief 4.5).
create table public.spends (
  like app.sync_fields including defaults,
  budget_id uuid not null references public.budgets (id),
  amount app.pence not null check (amount > 0),
  spent_on date not null,
  recorded_at app.utc_time not null,
  -- Who recorded it. Set by the database.
  recorded_by uuid references public.people (id),
  note text,
  primary key (id)
);

-- ---------------------------------------------------------------------------
-- Pay adjustments (ARCHITECTURE.md 3.4): "I did overtime" and "I missed a shift".

create table public.pay_adjustments (
  like app.sync_fields including defaults,
  -- The pay series' family and the payday's number, so a split never loses it (D123).
  family_id uuid not null,
  payment_number integer not null check (payment_number between 0 and 100000),
  kind text not null check (kind in ('overtime', 'missed-shift')),
  worked_on date not null,
  hours app.decimal_text not null,
  rate app.decimal_text not null,
  extras app.pence check (extras > 0),
  change app.pence not null,
  tax_year app.tax_year not null,
  primary key (id)
);

-- ---------------------------------------------------------------------------
-- Each person's own records in a plan, always private to them.

-- Each person's settings for a plan: their main pay (D14, D155) and how far
-- their first-time setup has got (step 2e). The plan's nation is on `plans`.
create table public.settings (
  like app.sync_fields including defaults,
  main_pay_family_id uuid,
  setup jsonb,
  primary key (id)
);

create unique index settings_one_per_person on public.settings (plan_id, private_to)
  where not deleted;

-- What if's practice changes (brief 4.10, D135, D264): the commands one
-- sheet made and the words it shows, one row each (D294).
create table public.practice_changes (
  like app.sync_fields including defaults,
  commands jsonb not null check (jsonb_typeof(commands) = 'array' and jsonb_array_length(commands) > 0),
  message text not null,
  primary key (id)
);

-- A link from a shared payment to something private, kept so only its
-- person can read it (D65, D291, PLAN.md item 5). Jess's payment to her own
-- credit card from the joint account is shared; the link to the card is here,
-- so Tom's copy of the payment names no debt at all.
create table public.private_links (
  like app.sync_fields including defaults,
  -- A shared payment's family: its debt or savings goal, for every series in
  -- the family, as a split keeps the link (D49).
  family_id uuid,
  debt_id uuid references public.debts (id),
  goal_id uuid references public.goals (id),
  -- A shared tick made inside a private debt's Update from statement (D62, D103).
  tick_id uuid references public.ticks (id),
  in_debt_update uuid references public.debts (id),
  primary key (id),
  check (
    (family_id is not null and tick_id is null and in_debt_update is null
      and num_nonnulls(debt_id, goal_id) = 1)
    or (tick_id is not null and family_id is null and debt_id is null and goal_id is null
      and in_debt_update is not null)
  )
);

-- ---------------------------------------------------------------------------
-- History (ARCHITECTURE.md 3.5). Written by the server's save step in 3c.

-- One undoable change: the change history and Activity (D50).
create table public.edits (
  id uuid primary key,
  plan_id uuid not null references public.plans (id) on delete cascade,
  -- Set when it touched anything private, so a partner never sees it.
  private_to uuid references public.people (id),
  person_id uuid not null references public.people (id),
  made_at app.utc_time not null,
  saved_at timestamptz not null default now(),
  kind text not null,
  summary jsonb,
  undo jsonb,
  undone_by uuid references public.edits (id),
  seq bigint not null default 0
);

-- A message for one person: a clash, a partner's change or a shared warning.
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  for_person uuid not null references public.people (id) on delete cascade,
  kind text not null check (kind in ('clash', 'partner-change', 'shared-warning')),
  edit_id uuid references public.edits (id),
  data jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- ---------------------------------------------------------------------------
-- The links every plan record has: its plan, its people and its edit.

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'balance_updates', 'debts', 'pay_profiles', 'pay_weeks', 'goals',
    'budgets', 'series', 'payment_changes', 'ticks', 'spends', 'pay_adjustments',
    'settings', 'practice_changes', 'private_links'
  ] loop
    execute format('alter table public.%I
      add foreign key (plan_id) references public.plans (id) on delete cascade,
      add foreign key (private_to) references public.people (id),
      add foreign key (created_by) references public.people (id),
      add foreign key (changed_by) references public.people (id),
      add foreign key (edit_id) references public.edits (id)', t);
    execute format('create index on public.%I (plan_id, seq)', t);
  end loop;
end;
$$;

-- The template has done its job.
drop table app.sync_fields;

-- Settings and practice changes always belong to one person.
alter table public.settings add check (private_to is not null);
alter table public.practice_changes add check (private_to is not null);
alter table public.private_links add check (private_to is not null);

-- The list of every plan record table, for the triggers and rules that every
-- one of them gets, and for the tests.
create function app.record_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'accounts', 'balance_updates', 'debts', 'pay_profiles', 'pay_weeks', 'goals',
    'budgets', 'series', 'payment_changes', 'ticks', 'spends', 'pay_adjustments',
    'settings', 'practice_changes', 'private_links'
  ]
$$;
