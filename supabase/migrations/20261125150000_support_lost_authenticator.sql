-- Step 4k, fix 3: if support's authenticator app is lost (D648).
--
-- The support dashboard opens only for support's own account with two-step
-- sign-in on and passed (D619, D640). If the phone with its authenticator app
-- is lost, nobody can open the dashboard, and the database rightly refuses to
-- remove an authenticator app without a code typed in the last 5 minutes
-- (D382), even in Supabase's SQL Editor. People in that place have support's
-- 7-day wait (D631), which support itself can't start without the dashboard.
--
-- So the owner, in the SQL Editor, which only the Supabase project's own
-- members can open, runs `select app.turn_off_support_two_step();`. It finds
-- support's account from the database's own record of who support is (the
-- address kept only scrambled, D619), so no address is typed or written
-- anywhere; removes its authenticator apps; and ends every sign-in of it, so
-- the dashboard asks to sign in again and to set up two-step sign-in afresh,
-- as the first time. It never touches anyone else's account, and nobody
-- signed in, signed out or with Supabase's own key can run it.

-- The database's rule from step 3e, with one more way through: this step,
-- for support's own account only, while it runs.
create or replace function app.fresh_second_step_to_turn_off() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'verified'
    and exists (select 1 from auth.users u where u.id = old.user_id)
    and not exists (
      select 1 from auth.mfa_amr_claims c join auth.sessions s on s.id = c.session_id
      where s.user_id = old.user_id and c.authentication_method = 'totp'
        and c.updated_at > now() - interval '5 minutes'
    )
    and not exists (
      select 1 from app.two_step_waits w
      where w.person_id = old.user_id and w.stopped_at is null and w.done_at is null
        and w.started_at <= now() - app.two_step_wait()
    )
    -- Support's lost app, removed by app.turn_off_support_two_step (D648).
    and coalesce(current_setting('prepenny.support_app_lost', true), '') <> old.user_id::text then
    perform app.refuse('second-step-needed', '42501');
  end if;
  return old;
end;
$$;

-- What the owner runs in the SQL Editor. Its answer is what they read there.
create function app.turn_off_support_two_step() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  support uuid;
  removed integer;
begin
  select u.id into support from auth.users u
  where app.is_support_address(u.id)
  limit 1;
  if support is null then
    return 'Nobody is PrePenny support in this database yet. Check the GitHub secret SUPPORT_EMAIL, '
      || 'then run the Database workflow again. Nothing was changed.';
  end if;
  perform set_config('prepenny.support_app_lost', support::text, true);
  delete from auth.mfa_factors f where f.user_id = support;
  get diagnostics removed = row_count;
  perform set_config('prepenny.support_app_lost', '', true);
  -- Every sign-in of support's ends: the dashboard asks to sign in again,
  -- then to set up two-step sign-in, as the first time. Its refresh tokens
  -- and second-step records go with each sign-in.
  delete from auth.sessions s where s.user_id = support;
  if removed = 0 then
    return 'Two-step sign-in was already off for PrePenny support''s account. '
      || 'It has been signed out everywhere. Sign in to the support dashboard again to set it up.';
  end if;
  return 'Two-step sign-in is off for PrePenny support''s account, and it has been signed out everywhere. '
    || 'Sign in to the support dashboard again, and set up two-step sign-in with your new phone.';
end;
$$;

-- Only the database's administrator, as in the SQL Editor: nobody signed in
-- or out, and not Supabase's own key.
revoke execute on function app.turn_off_support_two_step() from public, anon, authenticated, service_role;
