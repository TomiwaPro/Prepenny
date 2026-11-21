-- Step 4k, fix 2: "Opened PrePenny" on the support dashboard counts what a
-- signed-in phone really does when someone opens PrePenny (D646).
--
-- Checked against a real phone on the local Supabase: opening PrePenny asks
-- the server `hello`, which notes when that phone was last used
-- (app.devices), and a phone whose hour-long sign-in has run out renews it
-- first (auth.sessions). app.people_opened counts both. Two things didn't
-- match:
--
-- - A phone on an older version wasn't counted. `hello` noted the phone only
--   when it was on the very version the database is. After every update,
--   and Phase 4 updates PrePenny most days, the first time a phone opens
--   PrePenny it's on the version before: it isn't counted until the new
--   version has downloaded and loaded, which takes over a minute on a weak
--   signal (D594). Someone who looks for less than that isn't counted at
--   all, unless their sign-in happened to renew. Being counted gives an old
--   version nothing, so it's noted whatever the version, as long as the
--   sign-in stands. Plan data still goes only to the version the database
--   is (D386).
-- - A phone with PrePenny open in the background was counted as opening it.
--   PrePenny asks `hello` every minute even when it's not on screen, so a
--   sign-in ended on another phone removes the plan within a minute (D21,
--   D404). Each of those noted the phone as used, so a laptop with PrePenny
--   left open in a tab counted every day, whether anyone looked or not. Now
--   the phone says whether PrePenny is on screen, and only a look while it
--   is counts. A phone from before this step says nothing, and is noted as
--   before.
--
-- The same "last used" is what Signed-in devices shows (step 3e), which is
-- now right in the same two ways.

drop function public.hello();

create function public.hello(on_screen boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  standing text;
  problem text := app.version_problem();
  open_one app.get_back_in;
  asked jsonb;
  requests jsonb;
  joining jsonb;
  wait app.two_step_waits;
  two_step_off jsonb;
begin
  if auth.uid() is not null and not exists (select 1 from auth.users u where u.id = auth.uid()) then
    standing := 'deleted';
  elsif not exists (
    select 1 from auth.sessions s
    where s.id = app.session_id() and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  ) then
    standing := 'ended';
  elsif app.two_step_on(auth.uid()) and not app.second_step_passed() then
    standing := 'second-step';
  else
    standing := 'ok';
    -- Someone looking at PrePenny, on any version (D646).
    if coalesce(on_screen, true) then
      insert into app.devices as d (session_id, person_id, last_used_at)
      values (app.session_id(), auth.uid(), now())
      on conflict (session_id) do update set last_used_at = now()
        where d.last_used_at < now() - interval '1 minute';
    end if;
    if problem is null then
      requests := app.join_requests();
      joining := app.my_joining();
    end if;
    open_one := app.open_get_back_in(auth.uid());
    if open_one.id is not null and open_one.finishing_at is null then
      asked := jsonb_build_object('started_at', app.utc_words(open_one.started_at),
        'ready_at', app.utc_words(app.ready_at(open_one)));
    end if;
    -- Step 4j (D638): PrePenny support's 7-day wait to turn off two-step
    -- sign-in, so every signed-in device shows its notice with "Stop it".
    wait := app.open_two_step_wait(auth.uid());
    if wait.id is not null then
      two_step_off := jsonb_build_object('started_at', app.utc_words(wait.started_at),
        'ends_at', app.utc_words(wait.started_at + app.two_step_wait()));
    end if;
  end if;
  return jsonb_build_object('sign_in', standing, 'version', coalesce(problem, 'ok'),
    'now', app.server_time(), 'get_back_in', asked, 'join_requests', coalesce(requests, '[]'::jsonb),
    'joining', coalesce(joining, '[]'::jsonb), 'two_step_off', two_step_off,
    -- Support's own account, which the app shows nothing for but a line
    -- saying so (D640).
    'support_account', auth.uid() is not null and app.is_support_address(auth.uid()));
end;
$$;

revoke execute on function public.hello(boolean) from public, anon;
grant execute on function public.hello(boolean) to authenticated;
