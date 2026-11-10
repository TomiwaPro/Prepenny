-- Step 3f-2: joining with a plan of your own brings it with you (D426), and
-- a person is never in two plans (D427).
--
-- The owner's story is Sam, with a plan of his own, joining Jess's. Here the
-- fixture's names play it: Jess has a plan full of everything a plan can
-- hold (tests.make_jess_alone), and Tom, with a plan of his own, invites her
-- into his. Proves, as the owner asked:
-- - nothing private of hers reaches Tom until she shares it: every record
--   moves private to her, and no row Tom can read names any of them;
-- - it's all or nothing: a record refused part-way leaves her plan, Tom's
--   plan and the invite exactly as they were;
-- - nobody can move someone else's plan: only the person who asked, only
--   once it's allowed, and Tom's "Allow" moves nothing itself;
-- - a person never ends up in two plans;
-- - refusals are short codes: no amount, name, note or email address.

begin;
create extension if not exists pgtap with schema extensions;

select plan(59);

select tests.make_jess_alone();
create temporary table kept (name text primary key, value text);
grant all on kept to authenticated, anon;

-- A refusal's code and anything it names, exactly as the phone gets them.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
  said text;
  detail text;
begin
  execute statement;
  return 'no refusal';
exception when others then
  get stacked diagnostics code = message_text, detail = pg_exception_detail, said = pg_exception_hint;
  return code || coalesce(' ' || nullif(detail, ''), '') || coalesce(' ' || nullif(said, ''), '');
end;
$$;
grant execute on function pg_temp.refusal(text) to authenticated;

-- Every record of a plan, with what decides where it is: its table, id,
-- privacy and whether it's removed. Reads past the privacy rules on purpose.
create function pg_temp.records_of(plan uuid) returns table (t text, id uuid, private uuid, removed boolean)
language plpgsql as $$
declare
  one text;
begin
  foreach one in array tests.record_tables() loop
    return query execute format('select %L, r.id, r.private_to, r.deleted from public.%I r where r.plan_id = $1',
      one, one) using plan;
  end loop;
end;
$$;

-- The phone's id for a row worked out from what it's for (lib/sync-ids.ts).
-- The same sum as the phone's: apps/web/test/unit/sync-ids.test.ts checks
-- this exact one gives the same id on the phone.
select is(app.derived_id('00000000-0000-0000-0000-000000000001', 'ticks', 'series-1', '2026-11-01', ''),
  'cf3d9097-5a3a-8576-a553-461f2d754e45'::uuid, 'The server works out a row''s id exactly as the phone does');

-- ---------------------------------------------------------------------------
-- Before joining: Jess's own plan, with an account she shared before anyone
-- joined, holding a payment to her private card and money kept as "From
-- Jess" (D16), so the move has every kind of record to carry.

select tests.in_an_edit('jess');
insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
  holiday_rule, family_id, family_created_at, debt_id)
values (tests.id('joint-card'), tests.id('plan'), tests.id('joint'), 'Card from joint', 'out', 'debt', 3000,
  date '2026-11-15', '{"kind":"monthly","every":1,"on":{"kind":"day","day":15}}', '{"kind":"never"}', 'keep',
  tests.id('joint-card'), '2026-11-07T10:00:00Z', tests.id('jess-card'));
select tests.as_person('jess');
select is(public.share_accounts(tests.id('plan'), array[tests.id('joint')], gen_random_uuid(),
  '2026-11-08T10:00:00Z') ->> 'saved', 'new', 'Jess shares her joint account in her own plan, before anyone joins');
select tests.in_an_edit('jess');
insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
  holiday_rule, family_id, family_created_at, locked_to)
values (tests.id('from-jess'), tests.id('plan'), tests.id('joint'), 'From Jess', 'in', 'savings', 60000,
  date '2026-11-28', '{"kind":"monthly","every":1,"on":{"kind":"day","day":28}}', '{"kind":"never"}', 'keep',
  tests.id('from-jess'), '2026-11-08T11:00:00Z', tests.id('jess'));
insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
  holiday_rule, family_id, family_created_at, mirrored_by)
values (tests.id('to-joint'), tests.id('plan'), tests.id('jess-savings'), 'To joint', 'out', 'savings', 60000,
  date '2026-11-28', '{"kind":"monthly","every":1,"on":{"kind":"day","day":28}}', '{"kind":"never"}', 'keep',
  tests.id('to-joint'), '2026-11-08T11:00:00Z', tests.id('from-jess'));
select tests.as_test();
select ok((select count(*) from public.private_links where plan_id = tests.id('plan')) > 0
  and (select count(*) from pg_temp.records_of(tests.id('plan')) where private is null) > 0,
  'So her plan has shared records, and private links that keep her card apart (D291)');
create temporary table before as select * from pg_temp.records_of(tests.id('plan'));
create temporary table edits_before as select id from public.edits where plan_id = tests.id('plan');
grant select on before, edits_before to authenticated;

-- Tom's plan: Scotland's bank holidays, his shared account with rent, and a
-- private account of his own.
select tests.as_person('tom');
select public.start_plan(tests.id('tom-plan'), 'scotland');
select tests.in_an_edit('tom', 'tom-plan');
insert into public.accounts (id, plan_id, private_to, name, kind, warning_level, belongs_to)
values (tests.id('tom-joint'), tests.id('tom-plan'), null, 'Our bills', 'joint', 2000, null),
  (tests.id('tom-current'), tests.id('tom-plan'), tests.id('tom'), 'Tom current', 'current', 2000, tests.id('tom'));
insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date, schedule, end_rule,
  holiday_rule, family_id, family_created_at)
values (tests.id('tom-rent'), tests.id('tom-plan'), tests.id('tom-joint'), 'Rent', 'out', 'rent', 90000,
  date '2026-12-01', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}', '{"kind":"never"}', 'keep',
  tests.id('tom-rent'), '2026-11-08T12:00:00Z');
select tests.as_person('tom');
insert into kept select 'link', public.make_invite(tests.id('tom-plan'), 'editor', 'Tom', null) ->> 'token';

-- ---------------------------------------------------------------------------
-- Asking: told what comes with her, and what the bank holidays change.

select tests.as_person('jess');
select is(public.look_at_invite((select value from kept where name = 'link')) - 'expires_at' - 'now',
  jsonb_build_object('state', 'open', 'role', 'editor', 'inviter', 'Tom', 'brings', true,
    'nation', 'scotland', 'own_nation', 'england-and-wales'),
  'Jess opens the link: she can ask, her plan comes with her, and his plan uses Scotland''s bank holidays');
select is(public.ask_to_join((select value from kept where name = 'link'), 'Jess') ->> 'state', 'waiting',
  'She asks to join');
insert into kept select 'invite', public.look_at_invite((select value from kept where name = 'link')) ->> 'invite';
select is(pg_temp.refusal(format($$ select public.join_with_my_plan(%L, 'scotland', gen_random_uuid(),
    '2026-11-10T10:00:00Z') $$, (select value from kept where name = 'invite'))), 'waiting',
  'Before Tom answers, her plan can''t move');

select tests.as_person('tom');
select is(public.answer_join((select value::uuid from kept where name = 'invite'), true) ->> 'state', 'allowed',
  'Tom allows it: she has a plan of her own, so it waits for her phone to bring it');
select tests.as_test();
select is((select count(*) from public.plan_members where plan_id = tests.id('tom-plan') and person_id = tests.id('jess')),
  0::bigint, 'Allowing moves nothing: she isn''t in his plan yet');
select set_eq($$ select t, id, private, removed from pg_temp.records_of(tests.id('plan')) $$,
  $$ select t, id, private, removed from before $$, 'and her plan is exactly as it was');
select tests.as_person('jess');
select is(public.hello() -> 'joining', jsonb_build_array(jsonb_build_object(
    'invite', (select value from kept where name = 'invite'), 'inviter', 'Tom')),
  'Her phones are told she''s been let in, to finish joining on any screen');
select is(public.look_at_my_invite((select value::uuid from kept where name = 'invite')) ->> 'state', 'allowed',
  'and can look at the invite by its id, with no link to hand');
select tests.as_person('tom');
select is(public.look_at_my_invite((select value::uuid from kept where name = 'invite')) ->> 'state', 'not-found',
  'Nobody but her can look at it that way');
select is(pg_temp.refusal($$ select public.make_invite(tests.id('tom-plan'), 'editor', 'Tom', null) $$), 'full',
  'Her place is kept: Tom can''t invite someone else meanwhile');

-- ---------------------------------------------------------------------------
-- Nobody can move someone else's plan.

select is(pg_temp.refusal(format($$ select public.join_with_my_plan(%L, 'scotland', gen_random_uuid(),
    '2026-11-10T10:00:00Z') $$, (select value from kept where name = 'invite'))), 'not-found',
  'Tom can''t bring Jess''s plan into his');
select tests.as_person('alex');
select is(pg_temp.refusal(format($$ select public.join_with_my_plan(%L, 'scotland', gen_random_uuid(),
    '2026-11-10T10:00:00Z') $$, (select value from kept where name = 'invite'))), 'not-found',
  'Nor can anyone else, with the invite''s id');
select tests.as_nobody();
select throws_ok(format($$ select public.join_with_my_plan(%L, 'scotland', gen_random_uuid(),
    '2026-11-10T10:00:00Z') $$, (select value from kept where name = 'invite')), '42501', null,
  'Someone not signed in can''t even ask');
select tests.as_person('jess');
select is(pg_temp.refusal(format($$ select public.join_with_my_plan(%L, 'england-and-wales', gen_random_uuid(),
    '2026-11-10T10:00:00Z') $$, (select value from kept where name = 'invite'))), 'nation-changed',
  'Jess bringing it with other bank holidays than she was shown is refused, so she''s told again');

-- ---------------------------------------------------------------------------
-- All or nothing: a record the database refuses part-way takes everything back.

select tests.as_test();
create function pg_temp.refuse_a_tick() returns trigger language plpgsql as $$
begin
  raise exception using errcode = '23514', message = 'Jess card 25.00 ' || new.id;
end;
$$;
create trigger zz_refuse_a_tick before insert on public.ticks
  for each row when (new.plan_id = tests.id('tom-plan') and new.in_debt_update is not null)
  execute function pg_temp.refuse_a_tick();
select tests.as_person('jess');
select is(pg_temp.refusal(format($$ select public.join_with_my_plan(%L, 'scotland', gen_random_uuid(),
    '2026-11-10T10:00:00Z') $$, (select value from kept where name = 'invite'))), 'bad-record',
  'A record refused part-way stops it, with a short code and nothing of what the record holds');
select tests.as_test();
drop trigger zz_refuse_a_tick on public.ticks;
select set_eq($$ select t, id, private, removed from pg_temp.records_of(tests.id('plan')) $$,
  $$ select t, id, private, removed from before $$, 'Her plan is exactly as it was, every record of it');
select is((select count(*) from pg_temp.records_of(tests.id('tom-plan')) where private = tests.id('jess')), 0::bigint,
  'and nothing of hers is in Tom''s');
select is((select array_agg(plan_id::text) from public.plan_members where left_at is null
    and person_id = tests.id('jess')), array[tests.id('plan')::text],
  'She''s in her own plan only');
select set_eq($$ select id from public.edits where plan_id = tests.id('plan') $$, $$ select id from edits_before $$,
  'Her history is where it was');
select is((select app.invite_state(i) from public.invites i where i.id = (select value::uuid from kept where name = 'invite')),
  'allowed', 'and the invite can still be used');

-- ---------------------------------------------------------------------------
-- Joining, with her plan.

select tests.as_person('jess');
insert into kept select 'joined', public.join_with_my_plan((select value::uuid from kept where name = 'invite'),
  'scotland', tests.id('join-edit'), '2026-11-10T10:05:00Z')::text;
select is((select value::jsonb from kept where name = 'joined') - 'now', '{"state": "joined", "saved": "new", "brought": true}'::jsonb,
  'Jess joins, and her plan comes with her');

select tests.as_test();
select is((select role from public.plan_members where plan_id = tests.id('tom-plan') and person_id = tests.id('jess')),
  'editor', 'She''s in Tom''s plan, with the invite''s "Can edit"');
select is((select count(*) from public.plans where id = tests.id('plan')), 0::bigint, 'Her old plan is gone');
select is((select count(*) from public.plan_members where person_id = tests.id('jess') and left_at is null), 1::bigint,
  'She''s in one plan');
select set_eq(
  $$ select t, id from pg_temp.records_of(tests.id('tom-plan'))
     where private = tests.id('jess') and t not in ('payment_changes', 'ticks', 'pay_adjustment_details', 'settings') $$,
  $$ select t, id from before where t not in ('payment_changes', 'ticks', 'pay_adjustment_details', 'settings', 'private_links') $$,
  'Every record of hers moved, removed ones too, each with its own id');
select set_eq(
  $$ select t, count(*) from pg_temp.records_of(tests.id('tom-plan'))
     where private = tests.id('jess') and t in ('payment_changes', 'ticks', 'pay_adjustment_details', 'settings')
     group by t $$,
  $$ select t, count(*) from before where t in ('payment_changes', 'ticks', 'pay_adjustment_details', 'settings')
     group by t $$,
  'and every one-off change, tick, overtime detail and her settings, none lost');
select is((select count(*) from pg_temp.records_of(tests.id('tom-plan')) r
    where r.private is null and r.id in (select id from before)), 0::bigint,
  'Everything she brought is private to her, the account she''d shared included');
select is((select count(*) from public.ticks t where t.plan_id = tests.id('tom-plan')
    and t.private_to = tests.id('jess')
    and t.id <> app.derived_id(tests.id('tom-plan'), 'ticks', coalesce(t.series_id, t.budget_id)::text,
      t.original_date::text, case when t.set_aside then 'set-aside' else '' end)), 0::bigint,
  'Each tick has the id the phone works out for Tom''s plan');
select is((select id from public.settings where plan_id = tests.id('tom-plan') and private_to = tests.id('jess')),
  app.derived_id(tests.id('tom-plan'), 'settings', tests.id('jess')::text),
  'and so do her settings');
select is((select main_pay_family_id from public.settings where plan_id = tests.id('tom-plan')
    and private_to = tests.id('jess')), tests.id('jess-pay'), 'Her main pay is still her pay');
select is((select amount::bigint || ' ' || start_date || ' ' || coalesce(pay_profile_id::text, '') from public.series
    where id = tests.id('jess-pay')), '210000 2026-11-01 ' || tests.id('jess-job'),
  'Her pay keeps its amount, date and job');
select is((select debt_id from public.series where id = tests.id('joint-card')), tests.id('jess-card'),
  'The payment from the account she''d shared names her card again, now both are hers alone');
select is((select count(*) from public.private_links where plan_id = tests.id('tom-plan')), 0::bigint,
  'so no private link is needed');
select is((select name || ' ' || amount::bigint || ' ' || coalesce(locked_to::text, 'free') || ' '
    || coalesce(private_to::text, '') from public.series where id = tests.id('from-jess')),
  'From Jess 60000 free ' || tests.id('jess'),
  '"From Jess" in the account she''d shared is a private payment of hers now, with its amount');
select is((select mirrored_by from public.series where id = tests.id('to-joint')), null::uuid,
  'and the money out of her savings is its own payment too');
select set_eq($$ select id from public.edits where plan_id = tests.id('tom-plan') and private_to = tests.id('jess')
    and id <> tests.id('join-edit') $$,
  $$ select id from edits_before $$, 'Her history came with her, private to her');
select is((select kind || ' ' || private_to from public.edits where id = tests.id('join-edit')),
  'join-with-plan ' || tests.id('jess'), 'and the move is one edit of hers, private to her');

-- ---------------------------------------------------------------------------
-- Nothing private of hers reaches Tom.

select tests.as_person('tom');
select is_empty($$ select * from tests.rows_naming(array(select id::text from before)) $$,
  'No row Tom can read is, or names, anything she brought');
select is((select count(*) from jsonb_array_elements(public.plan_changes(tests.id('tom-plan'), 0, 0) -> 'rows') r
    where r ->> 'row' like any (select '%' || id || '%' from before)), 0::bigint,
  'and bringing his plan down gives him none of it');
select is((public.plan_changes(tests.id('tom-plan'), 0, 0) -> 'rows') @> jsonb_build_array(
    jsonb_build_object('table', 'series', 'row', jsonb_build_object('id', tests.id('tom-rent')))), true,
  'His own shared rent is still there for him');
select is((select jsonb_agg(m ->> 'nickname' order by m ->> 'nickname') from jsonb_array_elements(
    public.sharing(tests.id('tom-plan')) -> 'members') m), '["Jess", "Tom"]'::jsonb,
  'What he sees is that Jess has joined, by the name she gave');

select tests.as_person('jess');
select ok((select count(*) from jsonb_array_elements(public.plan_changes(tests.id('tom-plan'), 0, 0) -> 'rows') r
    where r ->> 'row' like '%' || tests.id('tom-rent') || '%') = 1
  and (select count(*) from jsonb_array_elements(public.plan_changes(tests.id('tom-plan'), 0, 0) -> 'rows') r
    where r ->> 'row' like '%' || tests.id('jess-pay') || '%') > 0
  and (select count(*) from jsonb_array_elements(public.plan_changes(tests.id('tom-plan'), 0, 0) -> 'rows') r
    where r ->> 'row' like '%' || tests.id('tom-current') || '%') = 0,
  'Jess''s phone brings down his shared rent and everything of hers, and nothing of Tom''s own');

-- ---------------------------------------------------------------------------
-- Sent twice, and never in two plans.

select is(public.join_with_my_plan((select value::uuid from kept where name = 'invite'), 'scotland',
    tests.id('join-edit'), '2026-11-10T10:05:00Z') ->> 'saved', 'already',
  'Sent again, it changes nothing');
select is(pg_temp.refusal($$ select public.start_plan(gen_random_uuid(), null) $$), 'has-a-plan',
  'In Tom''s plan, Jess can''t make another of her own');
select tests.as_person('alex');
select public.start_plan(tests.id('alex-plan'), null);
insert into kept select 'alex-link', public.make_invite(tests.id('alex-plan'), 'editor', 'Alex', null) ->> 'token';
select tests.as_person('jess');
select is(public.look_at_invite((select value from kept where name = 'alex-link')) ->> 'state', 'has-a-plan',
  'and can''t ask to join Alex''s plan as well');
select tests.as_person('tom');
select is(public.look_at_invite((select value from kept where name = 'alex-link')) ->> 'state', 'has-a-plan',
  'Nor can Tom, whose plan has her in it, bring his');

-- Someone let in with a plan, who then joins another meanwhile, isn't in two.
select tests.as_test();
select tests.make_person('sam');
select tests.make_person('priya');
select tests.as_person('priya');
select public.start_plan(tests.id('priya-plan'), null);
insert into kept select 'priya-link', public.make_invite(tests.id('priya-plan'), 'viewer', 'Priya', null) ->> 'token';
select tests.as_person('sam');
select public.start_plan(tests.id('sam-plan'), null);
select public.ask_to_join((select value from kept where name = 'priya-link'), 'Sam');
select public.ask_to_join((select value from kept where name = 'alex-link'), 'Sam');
insert into kept select 'sam-priya', public.look_at_invite((select value from kept where name = 'priya-link')) ->> 'invite';
insert into kept select 'sam-alex', public.look_at_invite((select value from kept where name = 'alex-link')) ->> 'invite';
select tests.as_person('priya');
select public.answer_join((select value::uuid from kept where name = 'sam-priya'), true);
select tests.as_person('alex');
select public.answer_join((select value::uuid from kept where name = 'sam-alex'), true);
select tests.as_person('sam');
select is(public.join_with_my_plan((select value::uuid from kept where name = 'sam-priya'), 'england-and-wales',
  gen_random_uuid(), '2026-11-10T11:00:00Z') ->> 'state', 'joined', 'Sam, let in by two, joins Priya''s with his plan');
select is(pg_temp.refusal(format($$ select public.join_with_my_plan(%L, 'england-and-wales', gen_random_uuid(),
    '2026-11-10T11:00:00Z') $$, (select value from kept where name = 'sam-alex'))), 'cancelled',
  'and can''t then join Alex''s as well: joining one withdrew his other ask');
select is(public.hello() -> 'joining', '[]'::jsonb, 'so no "Finish joining" is left behind');
select tests.as_test();
select is((select count(*) from public.plan_members where person_id = tests.id('sam') and left_at is null), 1::bigint,
  'He''s in one plan');
select tests.as_person('alex');
select is(public.sharing(tests.id('alex-plan')) -> 'invite' ->> 'state', 'cancelled',
  'Alex sees his invite cancelled, and his place isn''t kept for Sam');
select is(pg_temp.refusal(format($$ select public.cancel_invite(%L) $$,
    (select value from kept where name = 'sam-priya'))), 'not-found',
  'Only an invite''s own plan''s owner can cancel it');
select tests.as_person('priya');
select is(public.cancel_invite((select value::uuid from kept where name = 'sam-priya')) ->> 'state', 'joined',
  'and cancelling one someone has joined with says so, rather than "cancelled"');

-- Someone who lets a person into their own plan, while that person is still
-- bringing theirs, can't bring their own plan anywhere meanwhile.
select tests.as_test();
select tests.make_person('kofi');
select tests.make_person('ali');
select tests.as_person('kofi');
select public.start_plan(tests.id('kofi-plan'), null);
insert into kept select 'kofi-link', public.make_invite(tests.id('kofi-plan'), 'editor', 'Kofi', null) ->> 'token';
select tests.as_person('ali');
select public.start_plan(tests.id('ali-plan'), null);
select public.ask_to_join((select value from kept where name = 'kofi-link'), 'Ali');
select tests.as_person('kofi');
select public.answer_join((select (public.hello() -> 'join_requests' -> 0 ->> 'invite')::uuid), true);
select tests.as_test();
select is(app.plan_to_bring(tests.id('kofi')), null::uuid,
  'Kofi, with Ali let into his plan and still bringing hers, has no plan he could bring meanwhile');

-- An invite the owner cancels after allowing can't be used.
select tests.as_test();
select tests.make_person('dee');
select tests.as_person('dee');
select public.start_plan(tests.id('dee-plan'), null);
select tests.as_person('alex');
select public.cancel_invite((select value::uuid from kept where name = 'sam-alex'));
insert into kept select 'alex-link-2', public.make_invite(tests.id('alex-plan'), 'editor', 'Alex', null) ->> 'token';
select tests.as_person('dee');
select public.ask_to_join((select value from kept where name = 'alex-link-2'), 'Dee');
insert into kept select 'dee-alex', public.look_at_invite((select value from kept where name = 'alex-link-2')) ->> 'invite';
select tests.as_person('alex');
select public.answer_join((select value::uuid from kept where name = 'dee-alex'), true);
select public.cancel_invite((select value::uuid from kept where name = 'dee-alex'));
select tests.as_person('dee');
select is(pg_temp.refusal(format($$ select public.join_with_my_plan(%L, 'england-and-wales', gen_random_uuid(),
    '2026-11-10T12:00:00Z') $$, (select value from kept where name = 'dee-alex'))), 'cancelled',
  'An invite cancelled after it was allowed can''t be used');
select tests.as_test();
select is((select owner from public.plans where id = tests.id('dee-plan')), tests.id('dee'), 'and Dee keeps her plan');

select * from finish();
rollback;
