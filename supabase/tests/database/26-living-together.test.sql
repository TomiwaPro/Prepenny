-- Step 3g: shared plans, living together (brief 4.12, 4.14, 8.7 test 3,
-- D454 to D466).
--
-- Proves what the owner asked:
-- - Activity never shows a partner anything private, including from before
--   an account was shared, and nothing of an account made private again;
-- - nobody can undo someone else's change, by any way the Data API offers;
-- - changing a role takes effect straight away on the server.
-- And the rest of the step: one's own older changes undone, and not when
-- they've been changed since; "Changed by" knowing what kind of change it
-- was; making a shared account, debt or goal private again, and sharing a
-- debt or goal; and "From Jess" counting towards a shared goal.

begin;
create extension if not exists pgtap with schema extensions;

select plan(88);

select tests.make_jess_alone();

-- A refusal's code and the ids it names, as the phone gets them.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
  ids text;
begin
  execute statement;
  return 'no refusal';
exception when others then
  get stacked diagnostics code = message_text, ids = pg_exception_detail;
  return code || coalesce(' ' || nullif(ids, ''), '');
end;
$$;
grant execute on function pg_temp.refusal(text) to authenticated;

-- What the person acting now sees in Activity, as text, to look inside.
create function pg_temp.activity() returns jsonb language sql as $$
  select public.plan_activity(tests.id('plan'))
$$;
grant execute on function pg_temp.activity() to authenticated;

-- A change of a person's, as their phone sends one: one edit with its records.
create temporary table kept (name text primary key, value text);
grant all on kept to authenticated;
create function pg_temp.change(person text, label text, statement text) returns void language plpgsql as $$
begin
  perform tests.in_an_edit(person);
  execute statement;
  insert into kept values (label, current_setting('prepenny.edit'))
    on conflict (name) do update set value = excluded.value;
  perform tests.as_test();
end;
$$;
create function pg_temp.edit(label text) returns uuid language sql as $$
  select value::uuid from kept where name = label
$$;
grant execute on function pg_temp.edit(text) to authenticated;

-- Tom joins Jess's plan through an invite, with "Can edit".
select tests.as_person('jess');
insert into kept select 'link', public.make_invite(tests.id('plan'), 'editor', 'Jess', null) ->> 'token';
select tests.as_person('tom');
select public.ask_to_join((select value from kept where name = 'link'), 'Tom');
select tests.as_person('jess');
select public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), true);
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 1. Before an account is shared: Jess changes things privately.

-- Rent on the joint account, still private to her: she calls it "Secret
-- rent" at £1,234.56 for a while, then puts it back.
select pg_temp.change('jess', 'secret',
  $$ update public.series set name = 'Secret rent', amount = 123456 where id = tests.id('rent') $$);
select pg_temp.change('jess', 'unsecret',
  $$ update public.series set name = 'Rent', amount = 110000 where id = tests.id('rent') $$);
-- And her own current account, which stays private.
select pg_temp.change('jess', 'own-account',
  $$ update public.accounts set warning_level = 3333 where id = tests.id('jess-current') $$);

select tests.as_test();
select is((select count(*) from app.edit_records r where r.edit_id = pg_temp.edit('secret')), 1::bigint,
  'The history keeps each record an edit saves');
select is((select r.before ->> 'amount' from app.edit_records r where r.edit_id = pg_temp.edit('secret')), '110000',
  'with how it was before');
select is((select r.after ->> 'name' from app.edit_records r where r.edit_id = pg_temp.edit('secret')), 'Secret rent',
  'and how it was after');

select tests.as_person('tom');
select is(jsonb_array_length(pg_temp.activity() -> 'edits'), 0,
  'Before Jess shares anything, Tom''s Activity is empty');
select tests.as_person('jess');
select ok((select bool_and(e ->> 'mine' = 'true') from jsonb_array_elements(pg_temp.activity() -> 'edits') e)
    and jsonb_array_length(pg_temp.activity() -> 'edits') = 3,
  'Jess sees her own three changes');

-- She shares the joint account.
select tests.as_person('jess');
insert into kept values ('share', gen_random_uuid()::text);
select public.share_accounts(tests.id('plan'), array[tests.id('joint')], pg_temp.edit('share'), '2026-11-07T11:00:00Z');

-- ---------------------------------------------------------------------------
-- 2. Activity never shows a partner anything private.

select tests.as_test();
create temporary table private_ids as select unnest(tests.private_ids('jess')) as id;
grant select on private_ids to authenticated;

select tests.as_person('tom');
select is((select count(*) from jsonb_array_elements(pg_temp.activity() -> 'edits') e
    where (e ->> 'id')::uuid in (pg_temp.edit('secret'), pg_temp.edit('unsecret'), pg_temp.edit('own-account'))), 0::bigint,
  'Once the account is shared, Tom still sees none of the changes Jess made to it before');
select is(position('Secret rent' in pg_temp.activity()::text), 0,
  'nor the name she gave Rent while it was private');
select is(position('123456' in pg_temp.activity()::text), 0,
  'nor the amount it had then');
select is((select count(*) from jsonb_array_elements(pg_temp.activity() -> 'edits') e
    where (e ->> 'id')::uuid = pg_temp.edit('share')), 1::bigint,
  'He sees that she shared it');
select is((select count(*) from jsonb_array_elements(pg_temp.activity() -> 'edits') e,
      jsonb_array_elements(e -> 'records') r
    where (e ->> 'id')::uuid = pg_temp.edit('share') and r -> 'before' <> 'null'::jsonb), 0::bigint,
  'with each record only as it is now shared, never as it was while private');
select is((select count(*) from jsonb_array_elements(pg_temp.activity() -> 'edits') e,
      jsonb_array_elements(e -> 'records') r
    where (r ->> 'id') in (select id::text from private_ids)), 0::bigint,
  'No record in his Activity is one private to Jess');
select is(position('Jess current' in pg_temp.activity()::text), 0,
  'and her private account''s name is nowhere in it');

-- After sharing, Jess changes Rent (shared) and her own pay (private), in one change.
select pg_temp.change('jess', 'rent-and-pay', $$
  update public.series set amount = 115000 where id = tests.id('rent');
  update public.series set amount = 220000 where id = tests.id('jess-pay') $$);
select tests.as_person('tom');
select is((select count(*) from jsonb_array_elements(pg_temp.activity() -> 'edits') e,
      jsonb_array_elements(e -> 'records') r
    where (e ->> 'id')::uuid = pg_temp.edit('rent-and-pay')), 1::bigint,
  'A change of Jess''s to Rent and her own pay shows Tom Rent only');
select is((select r -> 'after' ->> 'amount' from jsonb_array_elements(pg_temp.activity() -> 'edits') e,
      jsonb_array_elements(e -> 'records') r
    where (e ->> 'id')::uuid = pg_temp.edit('rent-and-pay')), '115000',
  'with Rent''s new amount');
select is(position('220000' in pg_temp.activity()::text), 0, 'and nothing of her pay');
select is((select e ->> 'mine' from jsonb_array_elements(pg_temp.activity() -> 'edits') e
    where (e ->> 'id')::uuid = pg_temp.edit('rent-and-pay')), 'false', 'It''s Jess''s, not his');
select tests.as_person('alex');
select is(pg_temp.refusal($$ select public.plan_activity(tests.id('plan')) $$), 'not-found',
  'Someone outside the plan gets no Activity');
select tests.as_nobody();
select is(pg_temp.refusal($$ select public.plan_activity(tests.id('plan')) $$), 'permission denied for function plan_activity',
  'nor does someone not signed in');
select tests.as_person('tom');
select is(pg_temp.refusal($$ select count(*) from app.edit_records $$), 'permission denied for table edit_records',
  'Nobody reads the history directly');

-- "Changed by" knows who changed each record last, when and in what kind of change.
select is((select r ->> 'edit_kind' from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r -> 'row' ->> 'id' = tests.id('rent')::text), 'test',
  'Each record brought down says what kind of change saved it last');
select is((select r ->> 'edit_kind' from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r -> 'row' ->> 'id' = tests.id('joint')::text), 'share-accounts',
  'so a record last saved by sharing the account says so');

-- ---------------------------------------------------------------------------
-- 3. Nobody can undo someone else's change.

select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.undo_change(tests.id('plan'), pg_temp.edit('rent-and-pay'),
    gen_random_uuid(), '2026-11-07T12:00:00Z') $$), 'not-found',
  'Tom can''t undo Jess''s shared change');
select is(pg_temp.refusal($$ select public.undo_change(tests.id('plan'), pg_temp.edit('own-account'),
    gen_random_uuid(), '2026-11-07T12:00:00Z') $$), 'not-found',
  'nor her private one');
select is(pg_temp.refusal($$ select public.undo_change(tests.id('plan'), gen_random_uuid(),
    gen_random_uuid(), '2026-11-07T12:00:00Z') $$), 'not-found',
  'exactly as for a change that doesn''t exist');
select is(pg_temp.refusal($$ select app.undo_writes(tests.id('plan'), pg_temp.edit('rent-and-pay')) $$), 'not-found',
  'He can''t get the records that would undo it');
select is(pg_temp.refusal($$ select app.mark_undone(tests.id('plan'), pg_temp.edit('rent-and-pay'), gen_random_uuid()) $$),
  'not-found', 'nor mark it undone');
select is(pg_temp.refusal($$ update public.edits set undone_by = id where id = pg_temp.edit('rent-and-pay') $$),
  'permission denied for table edits', 'nor change the history himself');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('plan'), pg_temp.edit('rent-and-pay'), '2026-11-07T12:00:00Z',
    'undo', '[]'::jsonb) $$), 'not-found',
  'nor save a change under Jess''s change''s id');
-- A change of Jess's to shared records only, which Tom could otherwise make himself.
select pg_temp.change('jess', 'rent-only', $$ update public.series set amount = 114000 where id = tests.id('rent') $$);
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.undo_change(tests.id('plan'), pg_temp.edit('rent-only'),
    gen_random_uuid(), '2026-11-07T12:00:00Z') $$), 'not-found',
  'He can''t undo her change to Rent alone, which he could change himself');
select tests.as_test();
select is((select amount::bigint from public.series where id = tests.id('rent')), 114000::bigint, 'Rent is as she made it');
select pg_temp.change('jess', 'rent-back', $$ update public.series set amount = 115000 where id = tests.id('rent') $$);
select tests.as_person('alex');
select is(pg_temp.refusal($$ select public.undo_change(tests.id('plan'), pg_temp.edit('rent-and-pay'),
    gen_random_uuid(), '2026-11-07T12:00:00Z') $$), 'not-found',
  'Someone outside the plan can''t either');
select tests.as_test();
select is((select undone_by from public.edits where id = pg_temp.edit('rent-and-pay')), null,
  'Jess''s change is still not undone');
select is((select amount::bigint from public.series where id = tests.id('rent')), 115000::bigint, 'and Rent is as she left it');
select tests.as_person('tom');
select is((select e ->> 'can_undo' from jsonb_array_elements(pg_temp.activity() -> 'edits') e
    where (e ->> 'id')::uuid = pg_temp.edit('rent-and-pay')), 'false',
  'Tom''s Activity offers no undo on Jess''s change');

-- ---------------------------------------------------------------------------
-- 4. Undoing one's own change.

select pg_temp.change('tom', 'tom-note',
  $$ update public.series set note = 'Due on the 1st' where id = tests.id('rent') $$);
select tests.as_person('tom');
select is((select e ->> 'can_undo' from jsonb_array_elements(pg_temp.activity() -> 'edits') e
    where (e ->> 'id')::uuid = pg_temp.edit('tom-note')), 'true', 'Tom can undo his own change');
insert into kept values ('tom-undo', gen_random_uuid()::text);
select is(public.undo_change(tests.id('plan'), pg_temp.edit('tom-note'), pg_temp.edit('tom-undo'),
    '2026-11-07T12:05:00Z') ->> 'saved', 'new', 'and does');
select is((select note from public.series where id = tests.id('rent')), null, 'Rent''s note is gone again');
select is((select amount::bigint from public.series where id = tests.id('rent')), 115000::bigint,
  'and Jess''s amount, from before his change, is kept');
select is((select e ->> 'undone' from jsonb_array_elements(pg_temp.activity() -> 'edits') e
    where (e ->> 'id')::uuid = pg_temp.edit('tom-note')), 'true', 'His Activity shows it undone');
select is((select e ->> 'undoes' from jsonb_array_elements(pg_temp.activity() -> 'edits') e
    where (e ->> 'id')::uuid = pg_temp.edit('tom-undo')), pg_temp.edit('tom-note')::text,
  'and the undo says which change it undid');
select is(public.undo_change(tests.id('plan'), pg_temp.edit('tom-note'), pg_temp.edit('tom-undo'),
    '2026-11-07T12:05:00Z') ->> 'saved', 'already', 'Sent twice, the undo changes nothing the second time');
select is(pg_temp.refusal($$ select public.undo_change(tests.id('plan'), pg_temp.edit('tom-note'), gen_random_uuid(),
    '2026-11-07T12:06:00Z') $$), 'undone-already', 'A change undone already can''t be undone again');
insert into kept values ('tom-redo', gen_random_uuid()::text);
select is(public.undo_change(tests.id('plan'), pg_temp.edit('tom-undo'), pg_temp.edit('tom-redo'),
    '2026-11-07T12:07:00Z') ->> 'saved', 'new', 'Undoing the undo puts the change back (D87)');
select is((select note from public.series where id = tests.id('rent')), 'Due on the 1st', 'with its note');

-- Jess's change to Rent, changed by Tom since, can't be undone.
select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.undo_change(tests.id('plan'), pg_temp.edit('rent-and-pay'), gen_random_uuid(),
    '2026-11-07T12:10:00Z') $$), 'changed-since []',
  'A change whose record someone has changed since can''t be undone, so no later change is lost');
select is((select e ->> 'can_undo' from jsonb_array_elements(pg_temp.activity() -> 'edits') e
    where (e ->> 'id')::uuid = pg_temp.edit('rent-and-pay')), 'false', 'and her Activity doesn''t offer it');
select is(pg_temp.refusal($$ select public.undo_change(tests.id('plan'), pg_temp.edit('share'), gen_random_uuid(),
    '2026-11-07T12:10:00Z') $$), 'cant-undo', 'Sharing an account isn''t undone from Activity');

-- ---------------------------------------------------------------------------
-- 5. Changing a role takes effect straight away on the server (brief 8.7 test 3).

select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.change_role(tests.id('plan'), tests.id('tom'), 'editor') $$), 'not-found',
  'Tom can''t change his own role');
select is(pg_temp.refusal($$ select public.change_role(tests.id('plan'), tests.id('jess'), 'viewer') $$), 'not-found',
  'nor Jess''s, as he didn''t make the plan');
select is(pg_temp.refusal($$ update public.plan_members set role = 'owner' where person_id = tests.id('tom') $$),
  'permission denied for table plan_members', 'nor write a role himself');
select tests.as_person('alex');
select is(pg_temp.refusal($$ select public.change_role(tests.id('plan'), tests.id('tom'), 'viewer') $$), 'not-found',
  'Someone outside the plan can''t change anyone''s');

select tests.as_person('jess');
select is(public.change_role(tests.id('plan'), tests.id('tom'), 'viewer') ->> 'saved', 'new',
  'Jess changes Tom to "Can view only"');
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('plan'), gen_random_uuid(), '2026-11-07T12:20:00Z',
    'just-this-one', jsonb_build_array(jsonb_build_object('table', 'series', 'id', tests.id('rent'),
      'version', (select version from public.series where id = tests.id('rent')), 'row', '{"amount": 999}'::jsonb))) $$),
  'not-allowed', 'From that moment, the server refuses his change to Rent');
select tests.in_an_edit('tom');
select is(tests.rows_changed($$ update public.series set amount = 999 where id = tests.id('rent') $$), 0::bigint,
  'and the privacy rules change nothing for him, however it''s asked');
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.undo_change(tests.id('plan'), pg_temp.edit('tom-redo'), gen_random_uuid(),
    '2026-11-07T12:20:00Z') $$), 'not-allowed', 'and his undo of his own shared change');
select tests.as_person('tom');
select is((select m ->> 'role' from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'members') m
    where m ->> 'person' = tests.id('tom')::text), 'viewer', 'His phone hears his new role');
select is((select count(*) from jsonb_array_elements(pg_temp.activity() -> 'edits') e
    where e ->> 'kind' = 'change-role' and e -> 'summary' ->> 'role' = 'viewer'), 1::bigint,
  'and his Activity says what changed');
select tests.as_person('jess');
select public.change_role(tests.id('plan'), tests.id('tom'), 'editor');
select tests.as_person('tom');
select lives_ok($$ select tests.in_an_edit('tom'); update public.series set amount = 116000 where id = tests.id('rent') $$,
  'Changed back to "Can edit", his change is saved again at once');
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 6. Making a shared account private again (D462).

select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.make_private(tests.id('plan'), 'account', tests.id('joint'),
    gen_random_uuid(), '2026-11-07T13:00:00Z') $$), 'not-yours',
  'Tom can''t make the joint account private: Jess shared it');

select tests.in_an_edit('tom');
select set_config('prepenny.sharing', tests.id('joint')::text, true);
select is(pg_temp.refusal($$ update public.accounts set private_to = tests.id('tom'), belongs_to = tests.id('tom')
    where id = tests.id('joint') $$), 'sharing-comes-later',
  'Even inside the server''s own step, the database never makes Jess''s account private to Tom');
select set_config('prepenny.sharing', '', true);
select tests.as_test();

-- Tom has his own payment in it: it stays shared until that's gone.
select pg_temp.change('tom', 'tom-bill', $$
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule,
    end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('tom-bill'), tests.id('plan'), tests.id('joint'), 'Gym', 'out', 'bills', 2500, '2026-11-20',
    '{"kind":"monthly","every":1,"on":{"kind":"day","day":20}}', '{"kind":"never"}', 'keep',
    tests.id('tom-bill'), '2026-11-07T13:00:00Z') $$);
select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.make_private(tests.id('plan'), 'account', tests.id('joint'),
    gen_random_uuid(), '2026-11-07T13:00:00Z') $$), format('partner-things ["%s"]', tests.id('tom-bill')),
  'Jess can''t make it private while Tom has his own payment in it');
select pg_temp.change('tom', 'tom-bill-gone', $$ update public.series set deleted = true where id = tests.id('tom-bill') $$);

select tests.as_person('jess');
insert into kept values ('private', gen_random_uuid()::text);
select is(public.make_private(tests.id('plan'), 'account', tests.id('joint'), pg_temp.edit('private'),
    '2026-11-07T13:05:00Z') ->> 'saved', 'new', 'Once it''s gone, she can');
select tests.as_test();
select is((select count(*) from public.series s where s.account_id = tests.id('joint') and not s.deleted
    and s.private_to is distinct from tests.id('jess')), 0::bigint,
  'Every payment on it is private to her again');
select tests.as_person('tom');
select is((select count(*) from tests.readable_rows() r where r like 'accounts:%' and r like '%' || tests.id('joint')::text), 0::bigint,
  'Tom no longer reads the account');
select is((select count(*) from jsonb_array_elements(pg_temp.activity() -> 'edits') e,
      jsonb_array_elements(e -> 'records') r
    where (r ->> 'id')::uuid = tests.id('rent') or (r ->> 'id')::uuid = tests.id('joint')), 0::bigint,
  'and his Activity no longer has anything of it, even changes from while it was shared');
select is((select e -> 'summary' ->> 'made_private' from jsonb_array_elements(pg_temp.activity() -> 'edits') e
    where (e ->> 'id')::uuid = pg_temp.edit('private')), 'account',
  'It says only that Jess made a shared account private');
select is(position('Joint' in (pg_temp.activity())::text), 0, 'without its name');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('plan'), gen_random_uuid(), '2026-11-07T13:10:00Z',
    'just-this-one', jsonb_build_array(jsonb_build_object('table', 'series', 'id', tests.id('rent'),
      'version', 1, 'row', '{"amount": 1}'::jsonb))) $$),
  'not-found', 'He can''t change anything on it');
select tests.as_person('jess');
select is((select count(*) from jsonb_array_elements(pg_temp.activity() -> 'edits') e,
      jsonb_array_elements(e -> 'records') r
    where (r ->> 'id')::uuid = tests.id('rent')) > 0, true, 'Jess still sees its history');

-- ---------------------------------------------------------------------------
-- 7. Sharing a debt or a goal, and making it private again (D65, D463).

-- Her card becomes shared: Tom sees it, and the payment to it from her own
-- account still names it.
select tests.as_person('tom');
select is(tests.readable('debts'), 0::bigint, 'Tom sees none of Jess''s debts');
select is(pg_temp.refusal($$ select public.share_record(tests.id('plan'), 'debt', tests.id('jess-card'),
    gen_random_uuid(), '2026-11-07T14:00:00Z') $$), 'not-found', 'and can''t share her card');
select tests.as_person('jess');
select is(public.share_record(tests.id('plan'), 'debt', tests.id('jess-card'), gen_random_uuid(),
    '2026-11-07T14:00:00Z') ->> 'saved', 'new', 'Jess shares her card');
select tests.as_person('tom');
select is(tests.readable('debts'), 1::bigint, 'and Tom sees it');
select is(pg_temp.refusal($$ select public.make_private(tests.id('plan'), 'debt', tests.id('jess-card'),
    gen_random_uuid(), '2026-11-07T14:00:00Z') $$), 'not-yours', 'He can''t make it private');
select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.share_record(tests.id('plan'), 'goal', tests.id('jess-goal'),
    gen_random_uuid(), '2026-11-07T14:00:00Z') $$), 'goal-in-private-account',
  'A goal kept in a private account can''t be shared');
select is(public.make_private(tests.id('plan'), 'debt', tests.id('jess-card'), gen_random_uuid(),
    '2026-11-07T14:05:00Z') ->> 'saved', 'new', 'She makes her card private again');
select tests.as_person('tom');
select is((select count(*) from public.debts where not deleted), 0::bigint, 'Tom no longer sees her card');
select is(position('Jess card' in pg_temp.activity()::text), 0, 'and nothing of it is in his Activity');

-- A goal kept in a shared account: her savings, shared with her ISA (money
-- moves between them).
select tests.as_person('jess');
select public.share_accounts(tests.id('plan'), array[tests.id('jess-savings'), tests.id('jess-isa')],
  gen_random_uuid(), '2026-11-07T15:00:00Z');
select pg_temp.change('jess', 'goal', $$
  insert into public.goals (id, plan_id, private_to, name, target, account_id, belongs_to)
  values (tests.id('holiday'), tests.id('plan'), tests.id('jess'), 'Holiday', 100000, tests.id('jess-savings'),
    tests.id('jess')) $$);
select tests.as_person('tom');
select is(tests.readable('goals'), 0::bigint, 'Her new goal is hers until she shares it');
select tests.as_person('jess');
select public.share_record(tests.id('plan'), 'goal', tests.id('holiday'), gen_random_uuid(), '2026-11-07T15:05:00Z');
select tests.as_person('tom');
select is(tests.readable('goals'), 1::bigint, 'Shared, Tom sees it');

-- "From Jess" into the shared goal counts towards it (D464), and still names nothing private.
select tests.as_person('jess');
select lives_ok($$ select tests.in_an_edit('jess');
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule,
    end_rule, holiday_rule, family_id, family_created_at, locked_to, goal_id)
  values (tests.id('from-jess-holiday'), tests.id('plan'), tests.id('jess-savings'), 'From Jess', 'in', 'savings', 5000,
    '2026-11-20', '{"kind":"monthly","every":1,"on":{"kind":"day","day":20}}', '{"kind":"never"}', 'keep',
    tests.id('from-jess-holiday'), '2026-11-07T15:10:00Z', tests.id('jess'), tests.id('holiday')) $$,
  'Money kept as "From Jess" can go towards a shared goal');
select is(pg_temp.refusal($$ select tests.in_an_edit('jess');
  update public.series set note = 'For the flights' where id = tests.id('from-jess-holiday') $$), 'shared-half',
  'but still carries no note');
select is(pg_temp.refusal($$ select tests.in_an_edit('jess');
  update public.series set goal_id = tests.id('jess-goal') where id = tests.id('from-jess-holiday') $$), 'link-to-private',
  'and never names a goal of hers alone');

-- Tom puts money into it too: it stays shared until that's gone.
select pg_temp.change('tom', 'tom-saving', $$
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule,
    end_rule, holiday_rule, family_id, family_created_at, goal_id)
  values (tests.id('tom-saving'), tests.id('plan'), tests.id('jess-savings'), 'Birthday money', 'in', 'savings', 2000,
    '2026-11-25', '{"kind":"once","date":"2026-11-25"}', '{"kind":"never"}', 'keep',
    tests.id('tom-saving'), '2026-11-07T15:20:00Z', tests.id('holiday')) $$);
select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.make_private(tests.id('plan'), 'goal', tests.id('holiday'),
    gen_random_uuid(), '2026-11-07T15:30:00Z') $$), format('partner-things ["%s"]', tests.id('tom-saving')),
  'Jess can''t make the goal private while Tom''s money goes into it');
select pg_temp.change('tom', 'tom-saving-gone', $$ update public.series set deleted = true where id = tests.id('tom-saving') $$);
select tests.as_person('jess');
select is(public.make_private(tests.id('plan'), 'goal', tests.id('holiday'), gen_random_uuid(),
    '2026-11-07T15:35:00Z') ->> 'saved', 'new', 'Once it''s gone, she can');
select tests.as_test();
select is((select goal_id from public.series where id = tests.id('from-jess-holiday')), null,
  'Her shared payment no longer names the goal');
select is((select count(*) from public.private_links l where l.goal_id = tests.id('holiday') and not l.deleted
    and l.private_to = tests.id('jess')), 1::bigint, 'the link is kept in her private links instead (D291)');
select tests.as_person('tom');
select is(tests.readable('goals'), 0::bigint, 'and Tom no longer sees the goal');

select * from finish();
rollback;
