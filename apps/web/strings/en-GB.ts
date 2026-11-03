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
    monthsLong: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
  },

  /** The eight payment types (D79). */
  types: {
    pay: 'Pay',
    benefits: 'Benefits',
    rent: 'Rent or mortgage',
    bills: 'Bills',
    debt: 'Debt',
    'spending-money': 'Spending money',
    savings: 'Savings',
    other: 'Other',
  },

  /** A row's second line: its date, and whether it's an estimate or paid. */
  rows: {
    estimate: (date: string) => `${date}, estimate`,
    paid: (date: string) => `${date}, paid`,
    estimatePaid: (date: string) => `${date}, estimate, paid`,
    lowestPoint: 'Lowest point ahead',
    left: (amount: string) => `${amount} left`,
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
    undone: 'Change undone.',
    notKept: "This phone couldn't save it, so it will go when PrePenny closes.",
    changedJustThisOne: (name: string) => `${name} changed for just this one.`,
    changedThisAndLater: (name: string) => `${name} changed for this and all later ones.`,
    markedPaid: (name: string) => `${name} marked as paid.`,
    markedNotPaid: (name: string) => `${name} marked as not paid.`,
    moved: (name: string, date: string) => `${name} moved to ${date}.`,
    skipped: (name: string) => `${name} skipped.`,
    removedJustThisOne: (name: string) => `${name} removed for just this one.`,
    removedThisAndLater: (name: string) => `${name} removed for this and all later ones.`,
  },

  /** What the edit sheet says when the engine can't make a change (D87). Never the code itself. */
  refusals: {
    ticked: 'One of these payments is ticked as paid. Untick it first.',
    'already-ticked': 'This payment is already ticked as paid.',
    'not-ticked': "This payment isn't ticked as paid.",
    'already-removed': 'This payment is already removed.',
    'no-main-pay': "There's no main pay in the plan, so there's no next payday to move it to.",
    'no-next-payday':
      "There's no payday after this one in the plan, so it can't move to the next payday.",
    'date-before-earlier-payment': 'Choose a date after the payment before this one.',
    'date-after-later-payment': 'Choose a date before the next payment.',
    'date-not-in-schedule': 'Choose a date that fits how often it repeats.',
    'dates-dont-fit': 'Choose a date that fits how often it repeats.',
    'changed-since':
      "This can't be undone, because something it changed has been changed again since.",
    'budget-bills': 'This is a pay-later card bill. To change later bills, change the budget.',
    'shared-half': 'This half of a transfer has no name or note of its own.',
    'no-pattern': "This pay doesn't follow a pattern. Choose every payday from now.",
    'patterns-differ':
      'The pay pattern has changed part of the way along. Choose every payday from now.',
    'nothing-to-undo': "There's nothing to undo.",
    'not-last-change':
      'A newer change has been made since, so this one can no longer be undone here.',
    'not-ready': 'Your plan is still being worked out. Try again in a moment.',
    other: "That change couldn't be made, so nothing was changed. Try again.",
  },

  plan: {
    heading: 'Plan',
    showBy: 'Show the plan by',
    payPeriods: 'Pay periods',
    months: 'Months',
    account: 'Account',
    filters: 'Filters',
    filtersOn: (count: number) => `Filters: ${count} on`,
    filteredBy: (what: string) => `Showing only: ${what}.`,
    clearFilters: 'Clear filters',
    lowestPointAhead: 'Lowest point ahead',
    lowestOnAfter: (amount: string, date: string, name: string) =>
      `${amount} on ${date}, after ${name}`,
    lowestOn: (amount: string, date: string) => `${amount} on ${date}`,
    notTickedYet: 'Not ticked yet',
    notTickedYetIntro: 'These were due before today. Tap each one to mark it as paid or change it.',
    fromToday: (end: string) => `Today to ${end}`,
    period: (start: string, end: string) => `${start} to ${end}`,
    cameIn: 'Came in',
    leftAtEnd: 'Left at the end',
    nothingPlanned: 'Nothing planned.',
    nothingMatches: 'Nothing here matches the filters.',
    showAnotherMonth: 'Show another month',
    showingMost: 'This is as far ahead as the plan goes: 24 months.',
    loading: 'Working out your plan.',
    filtersSheet: {
      title: 'Filters',
      show: 'Show',
      everything: 'Everything',
      stillToPay: 'Still to pay',
      moneyIn: 'Money in',
      debts: 'Debt payments',
      type: 'Type',
      allTypes: 'All types',
      done: 'Show the plan',
    },
  },

  edit: {
    where: (date: string, account: string) => `${date}, ${account}`,
    whereTransfer: (date: string, from: string, to: string) => `${date}, ${from} to ${to}`,
    markAsPaid: 'Mark as paid',
    markAsNotPaid: 'Mark as not paid',
    moveToNextPayday: 'Move to next payday',
    movesItTo: (date: string) => `Moves it to ${date}`,
    skipThisOne: 'Skip this one',
    changeHeading: 'Change it',
    amount: 'Amount',
    pound: '£',
    date: 'Date',
    name: 'Name',
    note: 'Note',
    isEstimate: 'This is an estimate',
    moreThanEstimate: (amount: string) => `${amount} more than the estimate.`,
    lessThanEstimate: (amount: string) => `${amount} less than the estimate.`,
    change: 'Change',
    justThisOne: 'Just this one',
    thisAndLater: 'This and all later ones',
    whichPaydays: 'Which paydays get the new amount',
    everyPayday: 'Every payday from now',
    onlyThisWeek: 'Only this week of the pattern',
    save: 'Save',
    nothingChanged: 'Change something first, then save.',
    remove: 'Remove',
    removeHeading: 'Remove it',
    removeJustThisOne: 'Remove just this one',
    removeThisAndLater: 'Remove this and all later ones',
    keep: "Don't remove it",
    billRow: 'This is a pay-later card bill. To change later bills, change the budget.',
    setAsideRow:
      'This is money set aside from pay. It moves with its pay, and is ticked on its own.',
    budgetRow:
      'This is spending money from a budget. Budgets will be changed on their own screen, which is still being built.',
    amountError: 'Type an amount, for example 25.',
    dateError: 'Choose a date.',
    nameError: 'Type a name, for example Rent.',
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
    example: 'Example plan',
    exampleLine: 'You can change the example to try things out. Your changes stay on this phone.',
    startAgain: 'Start again with the example',
    startAgainCheck: 'Your changes to the example will go, and it goes back to how it started.',
    startAgainConfirm: 'Start again',
    keepChanges: 'Keep my changes',
    startedAgain: 'The example is back to how it started.',
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
