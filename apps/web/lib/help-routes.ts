// Where the help centre's pages are (step 4g, D587): the same articles in
// the app, with its bottom navigation, and on the website, for anyone,
// signed in or not, such as someone who can't sign in.

/** "Help when money is tight" (D58), which Home's card opens (D584). */
export const MONEY_TIGHT_SLUG = 'money-is-tight';

export const HELP_ROUTES = {
  app: {
    index: '/app/help/',
    article: (slug: string) => `/app/help/${slug}/`,
  },
  site: {
    index: '/help/',
    article: (slug: string) => `/help/${slug}/`,
  },
} as const;

/** In the app, or on the website. */
export type HelpPlace = keyof typeof HELP_ROUTES;

/** In Home's address, from More, Help: start the tour of Home (step 4h, D597). After a "#", so the offline helper serves Home for it with no signal. */
export const TOUR_HASH = '#tour';
export const TOUR_ROUTE = `/app/${TOUR_HASH}`;
