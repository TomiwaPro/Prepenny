-- Step 3b: nobody can plant a password on someone else's account (D313).
--
-- Supabase lets anyone sign up with an email address and a password. Until
-- the address is confirmed, the password can't be used. But on the version
-- of Supabase's sign-in service PrePenny runs (2.197.0), when the address's
-- real owner then signs in with a code, the account is confirmed and the
-- stranger's password starts to work. The sign-in tests showed it.
--
-- So the database keeps no password on an account until its email address
-- is confirmed, and removes any password at the moment it's confirmed:
-- whoever set it hadn't shown they own the address. PrePenny signs people in
-- with codes and Google only (D20), so nobody loses anything. When "add a
-- password" comes (brief 4.13), it's set by someone already signed in, on a
-- confirmed account, and kept.

create function app.no_planted_password() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is null then
    -- Not confirmed yet: nobody has shown they own the address.
    new.encrypted_password := '';
  elsif tg_op = 'UPDATE' and old.email_confirmed_at is null then
    -- Confirmed just now: a password from before was set by someone who hadn't.
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;

revoke execute on function app.no_planted_password() from public, anon, authenticated;

create trigger prepenny_no_planted_password before insert or update on auth.users
  for each row execute function app.no_planted_password();
