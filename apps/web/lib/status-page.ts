// PrePenny's status page (step 4k, brief 4.16, D643): at UptimeRobot, so it
// keeps working when PrePenny doesn't. Its address is the GitHub variable
// STATUS_PAGE_URL, given to the build as NEXT_PUBLIC_STATUS_PAGE_URL
// (.github/workflows/deploy.yml). Until it's set, nothing links to a status
// page, and the note in the app says the rest without the link.

const GIVEN = process.env.NEXT_PUBLIC_STATUS_PAGE_URL;

/** The status page's address, or null when none is set, or it isn't a plain https address. */
export function statusPageUrl(given: string | undefined = GIVEN): string | null {
  if (given === undefined) return null;
  const address = given.trim();
  if (
    address.length > 200 ||
    !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[A-Za-z0-9._~/-]*)?$/.test(address)
  ) {
    return null;
  }
  return address;
}
