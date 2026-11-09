-- Step 3e-2, from the owner's report: the "Someone asked to get into your
-- account" notice must reach every signed-in device on its own, within a
-- minute (D391, D404).
--
-- `hello` gave the open request to get back in only to an app built for
-- this very database. In the minutes after an update, every phone still on
-- the version before was told "update-needed" and no notice, until it had
-- loaded the new version, which it does only at a safe moment (D386). The
-- notice is about the person's own account and holds no plan data: when it
-- was asked for and when it could finish. So now any version whose sign-in
-- stands is told, as the stop link in the email already works from any
-- version. Plan data still goes only to the version this database is.

create or replace function public.hello() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  standing text;
  problem text := app.version_problem();
  open_one app.get_back_in;
  asked jsonb;
begin
  if not exists (
    select 1 from auth.sessions s
    where s.id = app.session_id() and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  ) then
    standing := 'ended';
  elsif app.two_step_on(auth.uid()) and not app.second_step_passed() then
    standing := 'second-step';
  else
    standing := 'ok';
    if problem is null then
      insert into app.devices as d (session_id, person_id, last_used_at)
      values (app.session_id(), auth.uid(), now())
      on conflict (session_id) do update set last_used_at = now()
        where d.last_used_at < now() - interval '1 minute';
    end if;
    open_one := app.open_get_back_in(auth.uid());
    if open_one.id is not null and open_one.finishing_at is null then
      asked := jsonb_build_object('started_at', app.utc_words(open_one.started_at),
        'ready_at', app.utc_words(app.ready_at(open_one)));
    end if;
  end if;
  return jsonb_build_object('sign_in', standing, 'version', coalesce(problem, 'ok'),
    'now', app.server_time(), 'get_back_in', asked);
end;
$$;
