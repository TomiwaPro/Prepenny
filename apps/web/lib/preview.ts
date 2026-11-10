// A pull request's preview (step 3e-2, D403): built by the Deploy workflow
// with the preview Supabase project, which never holds real people's data,
// and NEXT_PUBLIC_PREVIEW=true, so every page says it's a test version.

/** True in a pull request's preview, never in the live app or the tests' own build. */
export function isPreview(): boolean {
  // Written out in full, so Next.js puts the value into the app when it builds it.
  return process.env.NEXT_PUBLIC_PREVIEW === 'true';
}
