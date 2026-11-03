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
    weekdaysLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    /** "9:14am", "12:05pm". */
    time: (hour: number, minutes: string, morning: boolean) =>
      `${hour}:${minutes}${morning ? 'am' : 'pm'}`,
    /** "1st", "2nd", "13th", "22nd". */
    ordinal: (day: number) => {
      const tens = day % 100;
      if (tens >= 11 && tens <= 13) return `${day}th`;
      const unit = day % 10;
      if (unit === 1) return `${day}st`;
      if (unit === 2) return `${day}nd`;
      if (unit === 3) return `${day}rd`;
      return `${day}th`;
    },
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
    updated: 'PrePenny has been updated. Tap to reload.',
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
    back: 'Back',
    next: 'Next',
    done: 'Done',
    save: 'Save',
    stepOf: (step: number, of: number) => `Step ${step} of ${of}`,
    working: 'Working it out.',
  },

  /** Shared by the sheets' boxes. */
  form: {
    pound: '£',
    amountError: 'Type an amount, for example 25.',
    dateError: 'Choose a date.',
    optional: (label: string) => `${label}, if any`,
  },

  /** Update balance (brief 4.2, D33, D46, D87, D197). */
  updateBalance: {
    title: 'Update balance',
    whichAccount: 'Which account',
    typeWhatBankShows: 'Type what your bank shows now',
    overdrawn: "It's overdrawn, below £0.00",
    amountError: 'Type what your bank shows, for example 237.54.',
    expected: (amount: string) => `The plan expected ${amount} by the end of today.`,
    bankShows: (amount: string) => `Your bank shows ${amount}.`,
    match: 'They match.',
    less: (amount: string) => `That's ${amount} less.`,
    more: (amount: string) => `That's ${amount} more.`,
    tickHeading: 'Tick anything from today or earlier that has gone out or come in',
    tickIntro: 'Anything you leave unticked is still to come off, or come in.',
    nothingToTick: 'Nothing from today or earlier is waiting to be ticked.',
    tickAll: 'Tick all',
    untickAll: 'Untick all',
    tickLabel: (date: string, name: string, amount: string) => `${date}, ${name}, ${amount}`,
    updated: 'Balance updated',
    updatedAt: (amount: string, date: string, time: string) => `${amount}, ${date}, ${time}`,
    ticked: (count: number) =>
      count === 1 ? '1 payment ticked as paid.' : `${count} payments ticked as paid.`,
    lowestPointAhead: 'Lowest point ahead',
  },

  /** I spent (brief 4.5, D2, D115, D119, D198). */
  spent: {
    title: 'I spent',
    noBudgets:
      "There's no budget to spend from yet. Budgets, such as Travel at £25 a week, are added on the Budgets screen in More.",
    whichBudget: 'Which budget',
    amount: 'How much',
    day: 'When',
    dayError: 'Choose today or an earlier day.',
    thisWeek: (end: string) => `This week, to ${end}`,
    thisMonth: (end: string) => `This month, to ${end}`,
    spentSoFar: 'Spent',
    left: 'Left',
    withThis: (spent: string, left: string) => `With this: ${spent} spent, ${left} left.`,
    earlier: "This goes in an earlier week or month, so it doesn't change this one.",
    rolledOver: (base: string, rolled: string) => `${base} + ${rolled} from last time`,
  },

  /** Add a payment (brief 4.3, 4.4, D86, D150, D160, D199). */
  addPayment: {
    title: 'Add a payment',
    kind: 'What kind',
    out: 'Going out',
    in: 'Coming in',
    transfer: 'Between accounts',
    name: 'Name',
    nameError: 'Type a name, for example Car MOT.',
    amount: 'Amount',
    from: 'From',
    into: 'Into',
    to: 'To',
    sameAccount: 'Choose two different accounts.',
    nextPayment: 'Next payment',
    beforeToday: "Pick today or a later date. If it's already gone, update your balance instead.",
    howOften: 'How often',
    once: 'Once',
    weekly: 'Every week, or every few weeks',
    monthly: 'Every month, or every few months',
    dates: 'On chosen dates',
    weeksApart: 'How many weeks apart',
    weeksApartHint: '1 is every week, 2 is every 2 weeks.',
    weeksError: 'Type a number from 1 to 52.',
    everyWeeks: (every: number, weekday: string) =>
      every === 1 ? `Every ${weekday}.` : `Every ${every} weeks, on a ${weekday}.`,
    monthsApart: 'How many months apart',
    monthsApartHint: '1 is every month, 3 is every 3 months, 12 is once a year.',
    monthsError: 'Type a number from 1 to 12.',
    onWhichDay: 'On',
    onDay: (day: string) => `The ${day} of the month`,
    onLastDay: 'The last day of the month',
    onLastWorkingDay: 'The last working day of the month',
    onWeekday: (position: string, weekday: string) => `The ${position} ${weekday} of the month`,
    positions: ['first', 'second', 'third', 'fourth'],
    last: 'last',
    leaveOut: 'Leave out some months',
    leaveOutLegend: 'Months to leave out',
    leaveOutError: 'Leave at least one month in.',
    chosenDates: 'The dates after that',
    addDate: 'Add a date',
    removeDate: (date: string) => `Remove ${date}`,
    laterDate: (number: number) => `Date ${number}`,
    datesError: 'Choose dates after the next payment, each one once.',
    ends: 'When it ends',
    never: "It doesn't end",
    after: 'After a number of payments',
    onDate: 'On a date',
    howMany: 'How many payments',
    howManyError: 'Type how many payments, for example 3.',
    lastDate: 'Last date',
    lastDateError: 'Choose a date on or after the next payment.',
    differentLast: 'The last payment is a different amount',
    lastAmount: 'Last amount',
    weekend: 'On a weekend or bank holiday',
    keep: 'Keep the date',
    before: 'Move to the working day before',
    afterDay: 'Move to the working day after',
    type: 'Type',
    linked: 'Paying off a debt, or saving towards a goal',
    nothing: 'Neither',
    debt: (name: string) => `Debt: ${name}`,
    goal: (name: string) => `Savings goal: ${name}`,
    isEstimate: 'This is an estimate',
    note: 'Note',
    save: 'Add payment',
  },

  /** I did overtime and I missed a shift (brief 4.3, D5, D124, D129 to D131, D140, D200). */
  overtime: {
    titleOvertime: 'I did overtime',
    titleMissed: 'I missed a shift',
    what: 'What happened',
    overtime: 'Overtime',
    missed: 'Missed a shift',
    noPay:
      'PrePenny needs your pay details to work this out. They come with the pay calculator, which is still being built.',
    whichPay: 'Which pay',
    dayOvertime: 'Day of the overtime',
    dayMissed: 'Day of the shift',
    hours: 'Hours',
    hoursError: 'Type the hours, for example 11.5.',
    atRate: (rate: string) => `At ${rate} an hour.`,
    changeRate: 'Change the rate',
    rate: 'Rate an hour',
    rateError: 'Type the rate, for example 19.07.',
    extrasOvertime: 'Extras it adds, such as shift premium, if any',
    extrasMissed: 'Extras it loses, such as shift premium, if any',
    extrasHint: 'Leave it empty if the extras stay the same.',
    landsOn: (date: string, change: string, total: string) =>
      `This goes on your pay on ${date}: ${change}, making it ${total}.`,
    comesOff: (date: string, change: string, total: string) =>
      `This comes off your pay on ${date}: ${change}, making it ${total}.`,
    changesBy: (change: string) => `This changes your pay by ${change}.`,
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
    balanceUpdated: (account: string) => `${account} balance updated.`,
    balanceUpdatedTicked: (account: string, count: number) =>
      count === 1
        ? `${account} balance updated, and 1 payment ticked.`
        : `${account} balance updated, and ${count} payments ticked.`,
    spent: (amount: string, budget: string) => `${amount} spent on ${budget}.`,
    spentWeek: (amount: string, budget: string, spent: string, left: string) =>
      `${amount} spent on ${budget}. This week: ${spent} spent, ${left} left.`,
    spentMonth: (amount: string, budget: string, spent: string, left: string) =>
      `${amount} spent on ${budget}. This month: ${spent} spent, ${left} left.`,
    added: (name: string) => `${name} added.`,
    overtimeAdded: (date: string, change: string) => `Overtime added to ${date}: ${change}.`,
    missedTakenOff: (date: string, change: string) => `Missed shift taken off ${date}: ${change}.`,
    overtimeAddedNoDay: (change: string) => `Overtime added: ${change}.`,
    missedTakenOffNoDay: (change: string) => `Missed shift taken off: ${change}.`,
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
    'payment-before-today':
      "Pick today or a later date. If it's already gone, update your balance instead.",
    'spend-after-today': 'Choose today or an earlier day.',
    'same-account': 'Choose two different accounts.',
    'needs-name': 'Type a name, for example Car MOT.',
    'payday-not-estimate': 'That payday already has its real pay typed in, so it stays as it is.',
    'no-payday': "There's no payday in the plan that pays for work on that day.",
    'no-pay-week':
      "PrePenny doesn't know your usual week for that payday yet, so it can't work this out.",
    'no-pay-profile': 'PrePenny needs your pay details to work this out.',
    'no-covered-to': 'PrePenny needs to know which days of work each payday pays for.',
    'no-rate': 'Type the rate for these hours, for example 19.07.',
    'no-extras': 'That payday has no extras, such as a shift premium, to change.',
    'too-much-extras': "That's more than the extras on that payday. Type a smaller amount.",
    'same-time-balances': 'Wait a moment, then try again.',
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
    showUpTo: (date: string) => `Show the plan up to ${date}`,
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
