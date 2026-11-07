-- The shape of the rules, for every table at once (ARCHITECTURE.md 3.6). A
-- table added later without its rules fails here before anyone can use it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

select is_empty(
  $$ select tablename from pg_tables where schemaname = 'public' and not rowsecurity $$,
  'Every table has its privacy rules switched on'
);

select is_empty(
  $$ select table_name from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon', 'PUBLIC')
     union
     select table_name from information_schema.role_column_grants
     where table_schema = 'public' and grantee in ('anon', 'PUBLIC') $$,
  'Someone who isn''t signed in is granted nothing on any table'
);

select is_empty(
  $$ select table_name || ' ' || privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'authenticated'
       and privilege_type not in ('SELECT', 'INSERT', 'UPDATE') $$,
  'A signed-in person can never delete a row, empty a table or change its triggers'
);

select set_eq(
  $$ select t from tests.every_table() t
     where t not in ('people', 'plans', 'plan_members', 'invites', 'edits', 'notices') $$,
  $$ select unnest(app.record_tables()) $$,
  'Every other table is a plan record table, with the same rules as the rest'
);

select is_empty(
  $$ select t || '.' || c
     from unnest(app.record_tables()) t,
          unnest(array['id', 'plan_id', 'private_to', 'version', 'seq', 'list_order', 'created_at',
            'created_by', 'changed_at', 'changed_by', 'edit_id', 'deleted']) c
     where not exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = c) $$,
  'Every plan record has the sync fields from ARCHITECTURE.md 3.1'
);

select is_empty(
  $$ select t from unnest(app.record_tables()) t
     where (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t) <> 3 $$,
  'Every plan record table has exactly three rules: read, add and change'
);

-- What if's practice changes stay on the phone only (D264, D301).
select hasnt_table('public', 'practice_changes',
  'Practice changes have no table: they stay on the phone');

select is_empty(
  $$ select 'ticks and changes' where not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'ticks' and column_name = 'payment_number')
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'payment_changes' and column_name = 'payment_number') $$,
  'Each tick and each change keeps its payment number (PLAN.md item 4)'
);

-- The only functions a signed-in person can use are the checks the rules
-- call, each answering only about the person asking, and from step 3c the
-- four steps the phone calls and what they call in turn (D324).
select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'app') and has_function_privilege('authenticated', p.oid, 'execute') $$,
  array['session_id', 'session_ok', 'my_plans', 'my_edit_plans', 'my_owned_plans', 'my_partners', 'my_own_pay',
    'refuse', 'from_a_person', 'check_chosen_privacy', 'check_link', 'account_privacy', 'family_problem',
    'record_tables', 'begin_edit', 'nudge', 'send_nudge', 'family_rules_problem', 'sent_columns', 'may_hear',
    'save_edit', 'plan_changes', 'start_plan', 'remove_plan'],
  'A signed-in person can use only the checks the privacy rules call, and the steps the phone calls'
);

-- Of those, only the four steps are in the part the Data API shows.
select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') $$,
  array['save_edit', 'plan_changes', 'start_plan', 'remove_plan'],
  'The Data API''s part holds only the four steps the phone calls'
);

select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'app') and has_function_privilege('anon', p.oid, 'execute') $$,
  'Someone who isn''t signed in can use no function at all'
);

select * from finish();
rollback;
