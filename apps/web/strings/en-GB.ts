// Every word people read in the app, in British English (docs/VOICE.md). One
// file, so the app can be translated later. Amounts and dates come in already
// formatted by lib/money.ts and lib/dates.ts.
//
// `pnpm lint` runs scripts/check-voice.ts over this file: it fails on any
// banned word from VOICE.md, a long dash, an exclamation mark or an emoji.

export const strings = {
  app: {
    name: 'PrePenny',
    tagline: 'Plan every penny before payday.',
    description:
      "See what's left after every payment, the lowest point ahead and when each debt is paid off.",
    title: (page: string) => `${page}, PrePenny`,
  },

  welcome: {
    lookAtExample: 'Look at an example plan',
  },

  dates: {
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },

  nav: {
    label: 'Main',
    home: 'Home',
    plan: 'Plan',
    debts: 'Debts',
    more: 'More',
  },

  banners: {
    example: 'This is an example plan. Nothing here is yours.',
    offline: "You're offline. PrePenny keeps working with what's on this phone.",
  },

  status: {
    tight: 'Tight',
    short: 'Short',
  },

  loading: {
    plan: 'Working out your plan.',
  },

  errors: {
    plan: "Your plan couldn't be worked out. Close PrePenny and open it again.",
    screenHeading: "This screen couldn't be shown",
    screen: 'Try again. If it happens again, close PrePenny and open it again.',
    tryAgain: 'Try again',
  },

  home: {
    heading: 'Home',
    checkedToday: (date: string) => `Checked today, ${date}`,
    checked: (date: string) => `Checked ${date}`,
    leftToSpendUntil: (date: string) => `Left to spend until ${date}`,
    leftToSpendTo: (date: string) => `Left to spend to ${date}`,
    spendNoMoreThan: (amount: string, warning: string, date: string) =>
      `Spend no more than ${amount} to keep at least ${warning} until ${date}.`,
    underEvenSpendingNothing: (warning: string, date: string) =>
      `You'll go under ${warning} on ${date}, even if you spend nothing.`,
    payLaterLeft: (amount: string, date: string) =>
      `On the pay-later card: ${amount} left until ${date}.`,
    mainPayEnded: 'Your main pay has no more paydays planned. Choose another to plan by payday.',
    lowestPointAhead: 'Lowest point ahead',
    lowestOnAfter: (date: string, name: string) => `${date}, after ${name}`,
    underWarningFrom: (warning: string, date: string) => `Under ${warning} from ${date}.`,
    shortOn: (amount: string, date: string) => `${amount} short on ${date}.`,
    thisPayHasToCover: 'This pay has to cover',
    goingOutBy: (date: string) => `Going out by ${date}`,
    comingIn: 'Coming in',
    nextDue: 'Next due',
    seeThePlan: 'See the plan',
    nothingDue: (date: string) => `Nothing is due up to ${date}.`,
    left: (amount: string) => `${amount} left`,
    withEstimate: (date: string) => `${date}, estimate`,
  },

  actions: {
    label: 'Quick actions',
    updateBalance: 'Update balance',
    addPayment: 'Add a payment',
    spent: 'I spent',
    overtime: 'I did overtime',
  },

  sheet: {
    close: 'Close',
    stillBeingBuilt: 'This part is still being built.',
  },

  undo: {
    undo: 'Undo',
  },

  plan: {
    heading: 'Plan',
    stillBeingBuilt: 'The plan, payday by payday, is still being built.',
  },

  debts: {
    heading: 'Debts',
    stillBeingBuilt: 'Your debts, with the date each is paid off, are still being built.',
  },

  more: {
    heading: 'More',
    stillBeingBuilt: 'Settings, help and your account are still being built.',
    colours: 'Colours',
    coloursHint: 'Dark colours are easier on the eyes at night.',
    matchPhone: 'Match this phone',
    light: 'Light',
    dark: 'Dark',
  },

  parts: {
    heading: 'Parts',
    intro: 'Every part of the app, filled in with the example plan, for checking the look.',
    whenShort: (amount: string, date: string) =>
      `The same plan with ${amount} less pay on ${date}, as What if will show it:`,
    loading: 'While the plan is worked out:',
    messages: 'Messages that can appear on any screen:',
    openSheet: 'Open a sheet',
    sheetTitle: 'Rent',
    undoMessage: 'Rent changed for this and all later ones.',
  },

  notFound: {
    heading: "This page isn't here",
    goHome: 'Go to Home',
  },
} as const;
