// Where PrePenny signs people in (step 3b): the Supabase project's address and
// its publishable key. Both are public: they're in the app every phone
// downloads, and the database's privacy rules decide what each person can do
// (ARCHITECTURE.md 3.6).
//
// The Deploy workflow gives the real project's (README.md, "Signing in"),
// empty until the owner has set them up, which switches signing in off. With
// nothing given at all, as on a computer running the tests, it's the local
// Supabase that `supabase start` runs, whose key is the same for everyone.
//
// Also read by scripts/write-headers.ts, so the security policy allows
// exactly this one address and no other (PLAN.md item 20).

/** The local Supabase of `supabase start` (supabase/config.toml). */
export const LOCAL_SUPABASE = {
  url: 'http://127.0.0.1:54321',
  key: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
} as const;

export interface SignInConfig {
  /** "https://abcdefghijklmnopqrst.supabase.co", with no slash at the end. */
  readonly url: string;
  readonly key: string;
}

/** The project to sign in with, or null when signing in is switched off. */
export function signInConfig(): SignInConfig | null {
  // Written out in full, so Next.js puts the values into the app when it builds it.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (url === undefined && key === undefined) return LOCAL_SUPABASE;
  if (url === undefined || key === undefined || url === '' || key === '') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1') return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}
