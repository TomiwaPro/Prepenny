-- Test 1: every table refuses everything to someone who isn't signed in.

begin;
create extension if not exists pgtap with schema extensions;

select plan((select count(*)::integer * 4 + 2 from tests.every_table()));

select tests.make_jess_and_tom();

select tests.as_nobody();

select throws_ok(format('select * from public.%I', t), '42501', null,
  format('Not signed in: can''t read %s', t))
from tests.every_table() t;

select throws_ok(format('insert into public.%I default values', t), '42501', null,
  format('Not signed in: can''t add to %s', t))
from tests.every_table() t;

-- Each table's first column, from Postgres's own list: the usual list hides
-- the columns of a table the person has no rights on.
select throws_ok(
  format('update public.%I set %I = %I', t, c.attname, c.attname), '42501', null,
  format('Not signed in: can''t change %s', t))
from tests.every_table() t
cross join lateral (
  select attname from pg_attribute
  where attrelid = ('public.' || t)::regclass and attnum > 0 and not attisdropped
  order by attnum limit 1
) c;

select throws_ok(format('delete from public.%I', t), '42501', null,
  format('Not signed in: can''t remove anything from %s', t))
from tests.every_table() t;

-- A request that has the signed-in role but no token at all reads nothing
-- and can't make a plan.
select tests.as_test();
select set_config('role', 'authenticated', true);

select is_empty($$ select * from tests.readable_rows() $$,
  'With no token, nothing in any table can be read');

select throws_ok($$ insert into public.plans (id, name) values (gen_random_uuid(), 'Mine') $$, null, null,
  'With no token, no plan can be made');

select * from finish();
rollback;
