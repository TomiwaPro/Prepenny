// Every word people read in the app, in British English (docs/VOICE.md). One
// file, so the app can be translated later. Amounts and dates come in already
// formatted by lib/money.ts and lib/dates.ts.
//
// `pnpm lint` runs scripts/check-voice.ts over this file: it fails on any
// banned word from VOICE.md, a long dash, an exclamation mark or an emoji.

/** "1 account", "2 accounts", "no savings goals". */
function count(n: number, one: string, many: string): string {
  if (n === 0) return `no ${many}`;
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

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
    /** The welcome's buttons (step 2e). */
    makeMyPlan: 'Make my plan',
    /** Said before setup starts (D356). */
    once: 'Set it up once, about 5 minutes. After that, just keep it up to date.',
    carryOn: 'Carry on making my plan',
    goToMyPlan: 'Go to my plan',
    loading: 'Getting PrePenny ready.',
  },

  /** First-time setup (brief 4.1, D163, step 2e). */
  setup: {
    pageTitle: 'Make your plan',
    /** The top of each screen: "Part 2 of 3: Money out" (D356). */
    partOf: (part: number, of: number, name: string) => `Part ${part} of ${of}: ${name}`,
    parts: {
      'money-in': 'Money in',
      'money-out': 'Money out',
      'your-plan': 'Your plan',
    },
    skip: 'Skip this step',
    next: 'Next',
    back: 'Back',
    remove: 'Remove',
    removeNamed: (name: string) => `Remove ${name}`,
    cantRemove: 'Something added after this uses it. Remove that first.',
    notSaved: "This phone couldn't save your plan, so it will go when PrePenny closes.",
    problem: "That couldn't be saved, so nothing was changed. Try again.",
    beforeToday: "Pick today or a later date. If it's already gone, update your balance instead.",
    startBeforeToday: 'Pick today or a later date.',
    dateError: 'Choose a date.',
    nameError: 'Type a name.',
    amountError: 'Type an amount, for example 25.',
    sameAccount: 'Choose two different accounts.',
    which: (name: string) => `Which ${name}`,
    added: 'Added so far',
    account: {
      title: 'Your account',
      intro: 'Start with what your bank shows today, so PrePenny can work forward from it.',
      name: 'Name of the account',
      firstName: 'Current account',
      nameError: 'Type a name, for example Current account.',
      kind: 'What kind of account',
      current: 'Current account',
      savings: 'Savings',
      joint: 'Joint account',
      balance: 'Type what your bank shows today',
      overdrawn: "It's overdrawn, below £0.00",
      balanceError: 'Type what your bank shows, for example 237.54.',
      overdraft: 'Overdraft limit, if you have one',
      overdraftHint: "Leave it empty if you don't have one.",
      overdraftError: 'Type your overdraft limit, for example 500, or leave it empty.',
      warning: 'Warn me when it goes under',
      warningHint: 'PrePenny marks the days your balance will be under this as Tight.',
      warningError: 'Type an amount, for example 20.',
      addAnother: 'Add another account',
      anotherHeading: 'Another account',
      removeForm: 'Remove this account',
      nation: 'Which part of the UK do you live in?',
      nationHint: 'For bank holidays, when banks move payments.',
      nations: {
        'england-and-wales': 'England and Wales',
        scotland: 'Scotland',
        'northern-ireland': 'Northern Ireland',
      },
      card: (balance: string, warning: string) => `${balance} today. Tight under ${warning}.`,
      cardOverdraft: (balance: string, overdraft: string, warning: string) =>
        `${balance} today, with a ${overdraft} overdraft. Tight under ${warning}.`,
    },
    pay: {
      title: "How you're paid",
      /** From the public calculator's "Start a free plan with this pay" (step 2g). */
      fromCalculator:
        'Your take-home pay from the calculator is filled in below, as an estimate. Check it, and change anything that is different.',
      intro: 'Tell PrePenny when money comes in, so it can plan from one payday to the next.',
      name: 'Name',
      firstName: 'Pay',
      nameError: 'Type a name, for example Pay.',
      kind: 'What kind of money',
      kinds: {
        pay: 'Pay from work',
        benefits: 'Benefits, such as Universal Credit',
        other: 'Something else, such as a student loan',
      },
      often: 'How often',
      oftens: {
        weekly: 'Every week',
        'two-weekly': 'Every 2 weeks',
        'four-weekly': 'Every 4 weeks',
        monthly: 'Monthly, on a date',
        'last-working-day': 'On the last working day of the month',
        dates: 'On chosen dates, such as a student loan',
        irregular: 'It changes: plan with a weekly estimate',
      },
      nextPayday: 'Next payday',
      nextPayment: 'Next payment',
      notLastWorkingDay: (date: string) => `Choose a month's last working day, such as ${date}.`,
      amount: 'How much comes in, after tax',
      amountWeekly: 'About how much comes in each week',
      irregularHint: 'It is planned as an estimate, every week on that day.',
      pattern: 'My pay changes in a pattern',
      patternHint: 'For pay that goes round, such as a 4-week rota. Up to 8 paydays.',
      patternAmount: (number: number) => `Payday ${number}`,
      patternAmountOn: (number: number, date: string) => `Payday ${number}, ${date}`,
      patternError: 'Type an amount for each payday, for example 452.17.',
      addPayday: 'Add a payday',
      removePayday: 'Remove the last payday',
      into: 'Into',
      isEstimate: 'This is an estimate',
      setAside: 'Put part of it aside, such as for tax',
      percent: 'How much, as a percentage',
      percentHint: 'Moved on the same day it comes in.',
      percentError: 'Type a percentage from 1 to 100, for example 25.',
      setAsideTo: 'Move it to',
      addAnother: 'Add another income',
      anotherHeading: 'Another income',
      removeForm: 'Remove this income',
      mainPay: 'Which is your main pay?',
      mainPayHint: 'Your plan runs from one main payday to the next.',
      mainPayError: 'Choose your main pay.',
      card: (amount: string, often: string) => `${amount}, ${often}`,
      mainPayLabel: 'Main pay',
      extraHours: 'Do you ever work extra hours or miss shifts?',
      yes: 'Yes',
      no: 'No',
      whichPay: 'Which pay are they paid in',
      overtimeRate: 'Overtime rate an hour',
      overtimeRateHint: 'From your payslip, for example 19.07.',
      rateError: 'Type the rate, for example 19.07.',
      taxCode: 'Tax code',
      taxCodeHint: 'It is on your payslip. Most people have 1257L.',
      taxCodeError: 'Type the tax code as it is on your payslip, for example 1257L.',
      coveredTo: (date: string) => `${date} pays for work up to`,
      coveredToHint: 'The last day of work this pay covers, from your payslip or rota.',
      coveredToError: 'Choose the last day of work this payday pays for.',
      coveredToTooFar: 'Choose a day on or before the payday, within the last 8 weeks.',
      usual: 'Your usual week',
      usualHint: 'PrePenny uses it to work out what extra hours or a missed shift do to your pay.',
      usualNow: 'Save my usual week now',
      usualLater: 'Do this later',
      rate: 'Usual rate an hour',
      hours: 'Hours',
      hoursFor: (payday: string) => `Hours for ${payday}`,
      extrasFor: (payday: string) => `Extras for ${payday}, such as shift premium, if any`,
      extras: 'Extras, such as shift premium, if any',
      hoursError: 'Type the hours for each week, for example 34.5.',
      extrasError: 'Type the extras as an amount, for example 114.69, or leave it empty.',
      weekName: (step: number, of: number) =>
        of === 1 ? 'Usual week' : `Payday ${step} of the pattern`,
      basicLine: 'Basic',
      extrasLine: 'Extras',
      details: 'Extra hours and missed shifts',
      detailsCard: (pay: string, rate: string) => `${pay}, overtime at ${rate} an hour`,
    },
    /** Screen 3: rent or mortgage at the top, then the bills, on one screen (D356). */
    homeBills: {
      title: 'Home and bills',
      intro:
        'Start with your rent or mortgage, then tick the bills you pay, so none of them comes as a surprise.',
    },
    rent: {
      heading: 'Rent or mortgage',
      which: 'Which do you pay',
      rent: 'Rent',
      mortgage: 'Mortgage',
      none: "I don't pay rent or a mortgage",
      /** Leaves rent out for now, as Skip on the old rent step did (D356). */
      later: "I'll add it later",
      amount: 'Amount',
      amountError: "Type the amount, for example 550. Or choose I'll add it later.",
      from: 'From',
      card: (amount: string, often: string) => `${amount}, ${often}`,
    },
    bills: {
      tick: 'Tick the ones you pay',
      names: {
        'council-tax': 'Council tax',
        energy: 'Energy',
        water: 'Water',
        phone: 'Phone',
        broadband: 'Broadband',
        'tv-licence': 'TV licence',
        insurance: 'Insurance',
        subscriptions: 'Subscriptions',
      },
      name: 'Name',
      amount: 'Amount',
      from: 'From',
      isEstimate: 'This is an estimate',
      tenMonths: '10 payments, April to January',
      tenMonthsHint: 'Nothing in February or March.',
      tenMonthsDate:
        'The 10 payments leave out February and March. Choose a date in another month.',
      addAnother: 'Add another bill',
      anotherHeading: 'Another bill',
      removeBill: 'Remove this bill',
      card: (amount: string, often: string) => `${amount}, ${often}`,
    },
    debts: {
      title: 'Debts',
      intro: "Add anything you're paying off, to see the date each one is paid off.",
      add: 'Add a debt',
      addKinds: 'Pay-later plan, credit card, loan, overdraft, or money owed to a person.',
      none: 'I have no debts',
      heading: 'A debt',
      name: 'Name',
      nameError: 'Type a name, for example Sofa finance.',
      kind: 'What kind',
      kinds: {
        'pay-later': 'Pay-later plan',
        'credit-card': 'Credit card',
        loan: 'Loan',
        overdraft: 'Overdraft',
        'owed-to-a-person': 'Money owed to a person',
      },
      currency: 'Currency',
      currencies: { GBP: 'Pounds (£)', EUR: 'Euros (€)', USD: 'US dollars ($)' },
      /** The sign in front of an amount in each currency. */
      signs: { GBP: '£', EUR: '€', USD: '$' },
      removeForm: 'Remove this debt',
      rate: (code: string) => `How many ${code} to £1`,
      rateHint: 'The rate you want to plan with, for example 1.1612.',
      rateError: 'Type the rate, for example 1.1612.',
      owed: 'What you owe now',
      owedError: 'Type what you owe, for example 453.77.',
      started: 'What it started at, if you know',
      startedHint: 'For the progress bar. Leave it empty to start from what you owe now.',
      startedError: 'Type an amount, for example 600, or leave it empty.',
      interest: 'Interest rate a year, if any',
      interestHint: 'As a percentage, for example 24.9.',
      interestError: 'Type the rate as a percentage, for example 24.9.',
      statementDay: 'Statement day of the month',
      statementDayHint: 'Needed with an interest rate. A number from 1 to 31.',
      statementDayError: 'Type the statement day, a number from 1 to 31.',
      payments: 'How you pay it',
      payment: 'Each payment',
      noPayments: "I don't have payments planned for it yet",
      from: 'From',
      isEstimate: 'This is an estimate',
      card: (owed: string, kind: string) => `${owed} owed, ${kind}`,
      cardPayment: (amount: string, often: string) => `${amount}, ${often}`,
      save: 'Add this debt',
    },
    spending: {
      title: 'Spending money',
      intro:
        'Plan money for everyday things like food and travel, to see what you have left to spend.',
      food: 'Food',
      travel: 'Travel',
      name: 'Name',
      amount: 'Amount',
      every: 'Every',
      week: 'Week',
      month: 'Month',
      leaves: (name: string) => `How ${name} leaves your account`,
      leavesNoName: 'How it leaves your account',
      atStart: 'All at the start of the week or month (safest)',
      spread: 'Spread across the days',
      payLater: 'As one pay-later bill each month',
      payLaterHint: 'A pay-later bill comes once a month.',
      billDay: 'Day of the month the bill is paid',
      billDayError: 'Type the bill day, a number from 1 to 31.',
      from: 'From',
      /** A budget in setup starts this week or month (D230). */
      startsWeek: (start: string, end: string) => `It starts this week, ${start} to ${end}.`,
      startsMonth: (start: string, end: string) => `It starts this month, ${start} to ${end}.`,
      startsPayLater: 'It starts with the card bill for this month.',
      alreadySpentWeek: 'Already spent this week',
      alreadySpentMonth: 'Already spent this month',
      alreadySpentHint:
        "What you've spent from it so far. Your bank balance already shows it. If you're not sure, leave it empty and all of it is planned to go today.",
      alreadySpentError: 'Type an amount, for example 6, or leave it empty.',
      addAnother: 'Add another budget',
      anotherHeading: 'Another budget',
      removeBudget: 'Remove this budget',
      card: (amount: string, every: string) => `${amount} ${every}`,
      aWeek: 'a week',
      aMonth: 'a month',
    },
    /** A savings goal's boxes, in the goal sheet that "Add a goal" and More open (D356). */
    savings: {
      name: 'What are you saving for?',
      nameError: 'Type a name, for example Holiday.',
      target: 'Target',
      targetError: 'Type the target, for example 1200.',
      targetDate: 'By, if you have a date',
      targetDateError: 'Pick today or a later date, or leave it empty.',
      keptIn: 'Kept in',
      newAccount: 'A new savings account',
      newName: 'Name of the savings account',
      newNameError: 'Type a name, for example Savings.',
      newBalance: 'What it has in it today',
      saved: 'Already saved towards it',
      savedHint: "Leave it empty if you're starting from nothing.",
      savedError: 'Type an amount, for example 300, or leave it empty.',
      move: 'Move into it',
      moveHint: 'Leave it empty to plan no moves for now.',
      moveError: 'Type an amount, for example 50, or leave it empty.',
      moveOften: 'How often',
      eachPayday: (date: string) => `Each payday, from ${date}`,
      ownWhen: 'Another way',
      from: 'From',
      moveName: (goal: string) => `Saving for ${goal}`,
      card: (target: string, account: string) => `${target} target, kept in ${account}`,
    },
    plan: {
      title: "Here's your plan",
      intro:
        'This is what PrePenny worked out from what you typed. You can change any of it later.',
      lowestPoint: 'Lowest point ahead',
      lowestOn: (date: string) => date,
      lowestOnAfter: (date: string, name: string) => `${date}, after ${name}`,
      inAccount: (account: string) => `In ${account}, looking 12 months ahead.`,
      leftToSpendUntil: (date: string) => `Left to spend until ${date}`,
      leftToSpendTo: (date: string) => `Left to spend to ${date}`,
      firstDebt: 'First debt paid off',
      firstGoal: 'First savings goal reached',
      onDate: (name: string, date: string) => `${name}, ${date}`,
      onDateEstimate: (name: string, date: string) => `${name}, ${date}, estimate`,
      paidOffOn: (date: string) => `Paid off on ${date}`,
      reachedOn: (date: string) => `Reached on ${date}`,
      goToMyPlan: 'Go to my plan',
      working: 'Working out your plan.',
      /** The plan's last words (D356). */
      fromNow:
        'From now on: update your balance when you check your bank, and tick payments as they go out.',
      /** Savings left setup: this card opens the savings goal form (D356). */
      goalAsk: 'Saving for something?',
      goalLine:
        "Set a target and see the date you'll get there. You can also add one later from More, under Savings goals.",
      addGoal: 'Add a goal',
      addAnotherGoal: 'Add another goal',
      goalAdded: (name: string) => `${name} added.`,
      goalRemoved: (name: string) => `${name} removed.`,
    },
    often: {
      once: (date: string) => `once, on ${date}`,
      weekly: (weekday: string) => `every ${weekday}`,
      everyWeeks: (every: number, weekday: string) => `every ${every} weeks, on a ${weekday}`,
      monthlyDay: (day: string) => `monthly on the ${day}`,
      everyMonthsDay: (every: number, day: string) => `every ${every} months on the ${day}`,
      monthlyLastDay: 'on the last day of the month',
      monthlyLastWorkingDay: 'on the last working day of the month',
      monthlyWeekday: (position: string, weekday: string) =>
        `monthly on the ${position} ${weekday}`,
      dates: (dates: string) => `on ${dates}`,
      irregular: (weekday: string) => `about every ${weekday}, an estimate`,
      leaveOut: (months: string) => `, not in ${months}`,
      next: (often: string, date: string) => `${often}, next ${date}`,
    },
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
    /** Money coming in, once it's ticked (D278). */
    arrived: (date: string) => `${date}, arrived`,
    estimateArrived: (date: string) => `${date}, estimate, arrived`,
    lowestPoint: 'Lowest point ahead',
    left: (amount: string) => `${amount} left`,
  },

  nav: {
    label: 'Main',
    home: 'Home',
    comingUp: 'Coming up',
    debts: 'Debts',
    more: 'More',
  },

  banners: {
    example: 'This is an example plan. Nothing here is yours.',
    /** The example banner's button (step 2e). */
    backToMyPlan: 'Go back to my plan',
    backToMakingMyPlan: 'Go back to making my plan',
    makeMyPlan: 'Make my plan',
    offline: "You're offline. PrePenny keeps working with what's on this phone.",
    /** Signed in, from step 3c, when changes are sent to the account (D174). */
    offlineSending:
      "You're offline. Changes are saved on this phone and will be sent when you're back online.",
    /** Signed in, with a signal, when the server can't take changes for now (ARCHITECTURE.md 4.5). */
    cantSend: "Changes can't be sent right now. They're saved on this phone.",
    updated: 'PrePenny has been updated. Tap to reload.',
  },

  /** On every page of a pull request's preview, never the live app (step 3e-2, D407). */
  preview: {
    line: "Test version: don't use real details.",
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
    /** What Home is for, in one plain sentence (D213). */
    purpose: "How much you have, how much you can spend, and what's due next.",
    checkedToday: (date: string) => `Checked today, ${date}`,
    checked: (date: string) => `Checked ${date}`,
    /**
     * Sam's example, in place of "Checked today, Sun 25 Oct", whatever the
     * real date (D133, D440): "Example plan, as on Sun 25 Oct 2026".
     */
    exampleAsOn: (date: string) => `Example plan, as on ${date}`,
    /**
     * The big figure when money has moved since the bank was checked (D430):
     * "About £237.54 now", with these two words smaller around the figure.
     */
    about: 'About',
    now: 'now',
    /**
     * Under it, short enough for one line at 320px (D450): "Bank: £267.54
     * today" or "Bank: £500.00 on Sun 8 Nov"; in Sam's example "Bank:
     * £267.54", with the example's day on the next line (D440).
     */
    bankShowed: 'Bank:',
    bankShowedToday: 'today',
    bankShowedOn: (date: string) => `on ${date}`,
    /** Under the four buttons: opens the same form as More, Accounts (D431, D442). */
    addAccount: '+ Add an account',
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
    /** On payday, once the pay is ticked (D206). */
    payCameInToday: (amount: string) => `Pay ${amount}, came in today`,
    /** On payday, before the pay is ticked (D206). */
    payComingInToday: (amount: string) => `Pay ${amount}, coming in today`,
    goingOutBy: (date: string) => `Going out by ${date}`,
    comingIn: 'Coming in',
    nextDue: 'Next due',
    seeComingUp: 'See everything coming up',
    nothingDue: (date: string) => `Nothing is due up to ${date}.`,
  },

  actions: {
    label: 'Quick actions',
    updateBalance: 'Update balance',
    addPayment: 'Add a payment',
    spent: 'I spent',
    /** Opens "What happened?", with extra hours or a missed shift (D282, D441). */
    overtime: 'Overtime or missed shift',
  },

  sheet: {
    close: 'Close',
    /** A sheet that asks before a change, such as "Close this debt", so its two buttons don't both say Close. */
    goBack: 'Go back',
    stillBeingBuilt: 'This part is still being built.',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    save: 'Save',
    stepOf: (step: number, of: number) => `Step ${step} of ${of}`,
    working: 'Working it out.',
    yes: 'Yes',
    no: 'No',
    chooseYesOrNo: 'Choose Yes or No first.',
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
    intro:
      'Tell PrePenny what your bank shows now, so everything ahead starts from the right amount.',
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
    lowestOnAfter: (amount: string, date: string, name: string) =>
      `${amount} on ${date}, after ${name}`,
    lowestOn: (amount: string, date: string) => `${amount} on ${date}`,
  },

  /** I spent (brief 4.5, D2, D115, D119, D198). */
  spent: {
    title: 'I spent',
    intro: "Write down what you've spent from a budget, to see what's left in it.",
    noBudgets:
      "There's no budget to spend from yet. Add one, such as Travel at £25 a week, then write down what you spend from it.",
    addBudget: 'Add a budget',
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
    intro: "Add a payment that's coming up, once or every so often.",
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
    leaveOutNext: "Keep the next payment's month in.",
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
    intro: 'Tell PrePenny about extra hours or a missed shift, and it works out your new pay.',
    /** A choice with two clear answers, not a switch (D213). */
    what: 'What happened?',
    overtime: 'I worked extra hours',
    missed: 'I missed a shift',
    noPay:
      'PrePenny needs your job details to work this out. Save your usual week with Save as a usual week in the Pay calculator, under More.',
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
    adds: (amount: string, date: string, total: string) =>
      `This adds ${amount} to your pay on ${date}, making it ${total}.`,
    takesOff: (amount: string, date: string, total: string) =>
      `This takes ${amount} off your pay on ${date}, making it ${total}.`,
    addsNoDay: (amount: string) => `This adds ${amount} to your pay.`,
    takesOffNoDay: (amount: string) => `This takes ${amount} off your pay.`,
  },

  undo: {
    undo: 'Undo',
    undone: 'Change undone.',
    notKept: "This phone couldn't save it, so it will go when PrePenny closes.",
    changedJustThisOne: (name: string) => `${name} changed for just this one.`,
    changedThisAndLater: (name: string) => `${name} changed for this and all later ones.`,
    markedPaid: (name: string) => `${name} marked as paid.`,
    markedNotPaid: (name: string) => `${name} marked as not paid.`,
    markedArrived: (name: string) => `${name} marked as arrived.`,
    markedNotArrived: (name: string) => `${name} marked as not arrived.`,
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
    overtimeAdded: 'Overtime added.',
    missedAdded: 'Missed shift added.',
    payUp: (what: string, date: string, amount: string) =>
      `${what} Your pay on ${date} goes up by ${amount}.`,
    payDown: (what: string, date: string, amount: string) =>
      `${what} Your pay on ${date} goes down by ${amount}.`,
    payUpNoDay: (what: string, amount: string) => `${what} Your pay goes up by ${amount}.`,
    payDownNoDay: (what: string, amount: string) => `${what} Your pay goes down by ${amount}.`,
    /**
     * Shorter words for very large text, so the bar and the navigation never
     * cover half the screen (D284). Each says what changed, without the rest.
     */
    short: {
      changed: (name: string) => `${name} changed.`,
      removed: (name: string) => `${name} removed.`,
      updated: (name: string) => `${name} updated.`,
      closed: (name: string) => `${name} closed.`,
      balanceUpdated: 'Balance updated.',
      jobChanged: 'Job details changed.',
      usualWeekSaved: 'Usual week saved.',
      payChanged: (date: string) => `Pay on ${date} changed.`,
      kept: 'Kept in your plan.',
      notKept: 'Not saved on this phone.',
      cantUndo: "This can't be undone now.",
    },
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
      "PrePenny doesn't know your usual week for that payday yet. Save one with Save as a usual week in the Pay calculator, under More.",
    'no-pay-profile':
      'PrePenny needs your job details to work this out. Save your usual week with Save as a usual week in the Pay calculator, under More.',
    'no-covered-to':
      'PrePenny needs to know which days of work each payday pays for. Add it in Your job, under More.',
    'shifts-saved':
      'Overtime or a missed shift you added for a payday still to come would move to another payday. Remove it, save this change, then add it again.',
    'covered-to-not-for-frequency':
      "That last day doesn't fit how often this job is paid. Choose it again.",
    'bad-tax-code': 'Type the tax code as it is on your payslip, for example 1257L.',
    'bad-year-so-far':
      "The figures from your last payslip don't fit your next payday. Check the tax week you typed from that payslip.",
    'no-rate': 'Type the rate for these hours, for example 19.07.',
    'no-extras': 'That payday has no extras, such as a shift premium, to change.',
    'too-much-extras': "That's more than the extras on that payday. Type a smaller amount.",
    'same-time-balances': 'Wait a moment, then try again.',
    'account-has-money':
      "This account doesn't show £0.00 at the end of today yet. Move its money first.",
    'account-in-use':
      'Payments, a budget or a savings goal still use this account. Remove them, or move them to another account, first.',
    'account-closed': 'This account is closed, so nothing new can use it.',
    'debt-closed': 'This debt is closed, so nothing new can be linked to it.',
    'goal-closed': 'This goal is closed, so nothing new can be linked to it.',
    'budget-ended': 'This budget has ended, so it stays as it was.',
    'budget-zero': 'Type an amount above £0.00, for example 25.',
    'budget-has-history':
      'This budget already has spending or bills, so it can only change that way as a new budget. End this one and add another.',
    'bill-before-today': 'That would put a card bill on a day before today. Choose another day.',
    'starts-before-today': 'Pick today or a later date.',
    'ends-before-today': 'Pick today or a later date.',
    'ends-before-start': 'Pick a day on or after the day it starts.',
    'target-zero': 'Type a target above £0.00, for example 1200.',
    'target-date-before-today': 'Pick today or a later date, or leave it empty.',
    'bad-goal-link':
      "Its payments move money into another account, so it can't move. Change those payments first.",
    'needs-statement-day': 'Type the statement day, a number from 1 to 31. Interest needs it.',
    'statement-not-newer': 'Wait a moment, then try again.',
    'balance-after-today': 'Pick today or an earlier date.',
    'currency-not-in-hundredths': "That currency can't be used yet.",
    other: "That change couldn't be made, so nothing was changed. Try again.",
  },

  /** The Coming up page (brief 4.8, D208 to D212). */
  comingUp: {
    heading: 'Coming up',
    /** What the page is for, in one plain sentence (D209, D213). */
    purpose:
      "Your bank shows money that's gone. This shows money that's going to go, and what you'll have left each time.",
    howToRead: 'How to read this',
    /** The button beside the heading, in words, after a "?" mark (D212, D216). */
    howToReadButton: 'How to read this',
    /** The mark before the button's words. Screen readers skip it. */
    helpMark: '?',
    howToReadPay: [
      'This pay shows every payment from today until the day before your next payday.',
      'Each line under Next paydays is one later pay. Tap it to see its payments.',
    ],
    howToReadMonths: [
      'This month shows every payment from today until the end of the month.',
      'Each line under Next months is one later month. Tap it to see its payments.',
    ],
    howToReadAll: [
      'A minus (−£30.00) is money going out. A plus (+£500.00) is money coming in.',
      '"Left" is what will be in your account after that payment.',
      '"Tight" means under the amount you want to keep. "Short" means you\'d run out of money.',
      'Tap any payment to change it, move it or skip it.',
    ],
    gotIt: 'Got it',
    checkedToday: (amount: string) => `${amount}, checked today`,
    checked: (amount: string, date: string) => `${amount}, checked ${date}`,
    /** Sam's example, which never says "today" (D448): "£267.54, as on Sun 25 Oct 2026". */
    asOn: (amount: string, date: string) => `${amount}, as on ${date}`,
    switchAccount: 'Switch account',
    switchIntro: 'Choose which account to see.',
    showingNow: 'Showing now',
    /** The button that opens the View sheet (D277). */
    view: 'Change view',
    /** "By payday, showing everything". */
    showing: (group: string, what: string) => `${group}, ${what}`,
    byPayday: 'By payday',
    byMonth: 'By calendar month',
    showingEverything: 'showing everything',
    showingStillToPay: "showing only what's still to pay",
    showingMoneyIn: 'showing only money coming in',
    showingDebts: 'showing only debt payments',
    showingType: (type: string) => `showing only ${type}`,
    viewSheet: {
      title: 'View',
      intro: 'Choose how payments are grouped, and which ones to show.',
      group: 'Group payments',
      /** "Fri to Thu", beside By payday. */
      payWeek: (from: string, to: string) => `${from} to ${to}`,
      needsMainPay: 'By payday needs a main pay, so payments are grouped by calendar month.',
      show: 'Show',
      everything: 'Everything',
      stillToPay: 'Still to pay',
      moneyIn: 'Money coming in',
      debts: 'Debt payments',
      oneType: 'One type, such as Bills',
      whichType: 'Which type',
    },
    lowestOnAfter: (amount: string, date: string, name: string) =>
      `Lowest point: ${amount} on ${date}, after ${name}`,
    lowestOn: (amount: string, date: string) => `Lowest point: ${amount} on ${date}`,
    /** What tapping the lowest point does (D209, D213). */
    openBelow: (when: string) => `Open ${when} below`,
    seeInThisPay: 'See it below, in this pay',
    seeInThisMonth: 'See it below, in this month',
    showUpTo: (date: string) => `Show everything up to ${date}`,
    notTickedYet: 'Not ticked yet',
    notTickedYetIntro: 'These were due before today. Tap each one to mark it as paid or change it.',
    thisPay: (end: string) => `This pay, until ${end}`,
    thisMonth: (end: string) => `This month, until ${end}`,
    nextPaydays: 'Next paydays',
    nextMonths: 'Next months',
    tapOne: 'Tap one to see every payment in it.',
    payIn: (amount: string) => `Pay ${amount} in`,
    moneyIn: (amount: string) => `${amount} coming in`,
    nothingIn: 'Nothing coming in',
    lowest: (amount: string) => `Lowest ${amount}`,
    leftAtEnd: 'Left at the end',
    nothingPlanned: 'Nothing planned.',
    nothingMatches: 'Nothing here matches what you chose to show.',
    showAnotherMonth: 'Show another month',
    showingMost: 'This is as far ahead as the plan goes: 24 months.',
    /** The way into What if (brief 4.10, step 2g). */
    whatIfLine: 'Try changes in practice, then keep them or throw them away.',
    /** Opens What if (D277). */
    whatIf: 'Try a change',
    loading: 'Working out your plan.',
  },

  edit: {
    /** What the sheet is for, in one plain sentence (D213). */
    intro: 'Change this payment, move it or skip it.',
    introSetAside: 'Mark this as paid once the money has moved.',
    introSetAsideIn: 'Mark this as arrived once the money has moved.',
    where: (date: string, account: string) => `${date}, ${account}`,
    whereTransfer: (date: string, from: string, to: string) => `${date}, ${from} to ${to}`,
    markAsPaid: 'Mark as paid',
    markAsNotPaid: 'Mark as not paid',
    /** On money coming in, so it never reads as paying your own pay (D278). */
    markAsArrived: 'Mark as arrived',
    markAsNotArrived: 'Mark as not arrived',
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
    /** For pay that isn't weekly (D280). */
    onlyThisPayday: 'Only this payday of the pattern',
    save: 'Save',
    nothingChanged: 'Change something first, then save.',
    remove: 'Remove',
    removeHeading: 'Remove it',
    removeJustThisOne: 'Remove just this one',
    removeThisAndLater: 'Remove this and all later ones',
    keep: "Don't remove it",
    billRow: 'This is a pay-later card bill. To change later bills, change the budget.',
    setAsideRow:
      'This is money set aside from pay. It moves with its pay, and you tick it as paid separately.',
    budgetRow: 'This is spending money from a budget. Change it on the Budgets screen, under More.',
    goToBudgets: 'Go to Budgets',
    changeOften: 'Change how often it repeats',
    changeOftenHint:
      'This changes it from this payment on, starting on the date above. If it was set to end on a date, it now ends after the same number of payments instead.',
    amountError: 'Type an amount, for example 25.',
    dateError: 'Choose a date.',
    nameError: 'Type a name, for example Rent.',
  },

  debts: {
    heading: 'Debts',
    purpose: 'What you owe, and the date each debt will be paid off.',
    loading: 'Working out your debts.',
    owedNow: 'Owed now',
    estimate: 'Estimate',
    count: (count: number) => (count === 1 ? '1 debt.' : `${count} debts.`),
    countedAt: (name: string, rate: string) => `${name} is counted at ${rate} to £1.`,
    eachDebt: 'Each debt',
    eachDebtIntro: "In the order they're paid off. Tap one to see its payments.",
    noDebts: 'No debts',
    noDebtsLine: 'Nothing to pay off. Add a debt to see the date it will be paid off.',
    add: 'Add a debt',
    about: (pounds: string) => `about ${pounds}`,
    paidOffOn: (date: string) => `Paid off on ${date}`,
    paidOff: 'Paid off',
    stillLeft: (amount: string, date: string) => `${amount} still left on ${date}`,
    percentPaid: (percent: number) => `${percent}% paid`,
    closedHeading: 'Closed debts',
    closedLine: 'Closed. Not counted in Owed now.',
  },

  /** One debt (brief 4.6, the "One debt" sketch in ARCHITECTURE.md 4.6). */
  debt: {
    back: 'Back to Debts',
    purpose: "What's left on this debt, and each payment that pays it off.",
    notFound: "This debt isn't in your plan any more.",
    kind: (kind: string, currency: string) => `${kind}, in ${currency}`,
    currencyNames: { GBP: 'pounds', EUR: 'euros', USD: 'US dollars' },
    leftNow: 'Left now',
    aboutAt: (pounds: string, rate: string) => `About ${pounds} at ${rate} per £1`,
    interestIncluded: (amount: string) =>
      `Includes ${amount} of interest added since your last update, an estimate.`,
    interestNotIncluded: 'No interest added, because no rate is saved',
    paidOfStarted: (paid: string, started: string) => `${paid} paid of ${started}`,
    card: 'Interest and minimum payment',
    rateAYear: (rate: string) => `${rate}% a year`,
    noRate: 'No interest rate. Add one with Change its details.',
    zeroUntil: (date: string) => `0% until ${date}`,
    statementDay: (day: string) => `Statement on the ${day} of each month`,
    minimumRule: (percent: string, atLeast: string) =>
      `Minimum: interest plus ${percent}% of what you owe, at least ${atLeast}`,
    minimumTyped: (amount: string) => `Minimum: ${amount}, from your statement`,
    nextStatement: (date: string, interest: string) =>
      `Next statement, ${date}: about ${interest} of interest, an estimate.`,
    nextMinimum: (amount: string) => `Its minimum: about ${amount}, an estimate.`,
    payments: 'Payments',
    paymentsIntro: 'What comes off the debt each time, and what is left after it.',
    noPayments: "No payments are planned for it yet. Add one to see the date it's paid off.",
    toChange: 'Tap a payment to change it, move it or skip it.',
    secondForeign: (date: string, amount: string) => `${date}, ${amount}`,
    interestRow: 'Interest, estimate',
    minimumRow: (amount: string) => `Minimum about ${amount}`,
    left: (amount: string) => `${amount} left`,
    moreThanLeft: (amount: string) => `${amount} more than what's left`,
    fix: (amount: string) => `Make it ${amount} and stop after it`,
    /** What else "stop after it" removes, said before the tap (step 2g). */
    alsoRemoves: (name: string, count: number, continues: boolean) => {
      if (continues)
        return `This also removes every later payment to ${name}. Undo puts them back.`;
      if (count === 0) return `No other payment to ${name} is planned, so nothing else changes.`;
      if (count === 1) return `This also removes 1 later payment to ${name}. Undo puts it back.`;
      return `This also removes ${count} later payments to ${name}. Undo puts them back.`;
    },
    fixed: (name: string, amount: string) =>
      `${name} made ${amount}, and later payments to it removed.`,
    actions: 'Change this debt',
    updateFromStatement: 'Update from statement',
    changeRate: 'Change the rate',
    addPayment: 'Add a payment',
    changeDetails: 'Change its details',
    close: 'Close this debt',
    closedNote: 'This debt is closed, so it is not counted in Owed now.',
  },

  /** The take-home pay calculator (brief 4.15, D120 to D128, step 2g), in the app and as a public page. */
  pay: {
    heading: 'Pay calculator',
    publicHeading: 'Take-home pay calculator',
    purpose:
      'Work out the pay that lands in your bank from your hours, after tax, National Insurance and anything else that comes off.',
    publicPurpose:
      'Work out the pay that lands in your bank from your hours, after tax, National Insurance and anything else that comes off. It all happens on this phone: nothing you type is sent anywhere.',
    notAdvice: 'An estimate, not tax advice.',
    back: 'Back to More',
    loading: 'Working out your pay details.',
    homeLink: 'PrePenny',
    startFrom: 'Start from a usual week',
    startFromIntro: 'Fill in the pay lines from one of your usual weeks.',
    weekButton: (name: string) => `Use ${name}`,
    weekFilled: (name: string) => `${name} is filled in below.`,
    payHeading: 'Pay',
    payIntro: 'Each kind of hours with its rate, and any fixed amounts.',
    line: (number: number) => `Line ${number}`,
    kind: 'Kind of hours',
    kinds: {
      basic: 'Basic',
      overtime: 'Overtime',
      nights: 'Nights',
      weekends: 'Weekends',
      holiday: 'Holiday',
    },
    hours: 'Hours',
    rate: 'Pay an hour',
    removeLine: 'Remove this line',
    addLine: 'Add another kind of hours',
    extraLegend: (number: number) => `Fixed amount ${number}`,
    deductionLegend: (number: number) => `Deduction ${number}`,
    extraName: "What it's for",
    extraAmount: 'Amount',
    removeExtra: 'Remove this amount',
    addExtra: 'Add a fixed amount, such as a shift premium',
    taxHeading: 'Tax and deductions',
    payday: 'Payday',
    inTaxWeek: (week: number, year: string) => `That's tax week ${week} of the ${year} tax year.`,
    inTaxMonth: (month: number, year: string) =>
      `That's tax month ${month} of the ${year} tax year.`,
    taxYearWords: (year: string) => year.replace('-', ' to 20'),
    often: "How often you're paid",
    frequencies: {
      weekly: 'Every week',
      'two-weekly': 'Every 2 weeks',
      'four-weekly': 'Every 4 weeks',
      monthly: 'Every month',
    },
    taxCode: 'Tax code',
    taxCodeHint: 'As it is on your payslip, for example 1257L.',
    basis: 'How your tax is worked out',
    cumulative: 'The usual way, with all your pay so far this tax year',
    weekOne: 'Each pay taxed on its own: week 1 or month 1, W1, M1 or X on a payslip',
    pension: 'I pay into a workplace pension',
    pensionPercent: 'Percentage that comes off',
    pensionLower: (period: string) => `Pension starts on pay over, each ${period}`,
    pensionUpper: (period: string) => `And stops at, each ${period}`,
    pensionBandHint:
      'Some pensions come off only part of your pay. Leave the next two boxes empty if it comes off all of it.',
    pensionWhen: 'When it comes off',
    beforeTax: 'Before tax',
    afterTax: 'After tax',
    periodWords: {
      weekly: 'week',
      'two-weekly': '2 weeks',
      'four-weekly': '4 weeks',
      monthly: 'month',
    },
    studentLoan: 'Student loan',
    noLoan: 'None',
    plans: { 'plan-1': 'Plan 1', 'plan-2': 'Plan 2', 'plan-4': 'Plan 4', 'plan-5': 'Plan 5' },
    postgraduate: 'And a Postgraduate loan',
    loanHint:
      "Your payslip shows which plan, if any. A Postgraduate loan is for a master's or doctoral degree.",
    deductionName: "What it's for",
    deductionAmount: 'Amount',
    removeDeduction: 'Remove this deduction',
    addDeduction: 'Add another deduction, such as union fees',
    soFarHeading: 'From your last payslip',
    soFarIntro:
      'For exact tax, type these from your last payslip. Leave them empty and the result is an estimate.',
    soFarWeek: 'The tax week on it',
    soFarMonth: 'The tax month on it',
    soFarWeekHint:
      'The tax year starts on 6 April, and its weeks are numbered from then. Your payslip shows the number, often as Tax week or Period.',
    soFarFiguresHint:
      'Your payslip may call them Gross for tax TD and Tax TD, or Taxable pay to date and Tax to date.',
    grossSoFar: 'Taxable pay so far this tax year',
    taxSoFar: 'Tax paid so far this tax year',
    workOut: 'Work out take-home pay',
    resultHeading: 'Take-home pay',
    gross: (amount: string) => `Gross pay ${amount}`,
    tax: (amount: string) => `Tax ${amount}`,
    refund: (amount: string) => `Tax refund ${amount}`,
    nationalInsurance: (amount: string) => `National Insurance ${amount}`,
    pensionAmount: (amount: string) => `Pension ${amount}`,
    studentLoanAmount: (amount: string) => `Student loan ${amount}`,
    postgraduateAmount: (amount: string) => `Postgraduate loan ${amount}`,
    otherAmount: (name: string, amount: string) => `${name} ${amount}`,
    estimateNoSoFar: 'Without the figures from your last payslip, this is an estimate.',
    estimateEarlier: (table: 'week' | 'month', payslip: number, from: number, to: number) => {
      const unit = table === 'week' ? 'week' : 'month';
      const between = from === to ? `${unit} ${from} is` : `${unit}s ${from} to ${to} are`;
      return `Your last payslip is from tax ${unit} ${payslip}, so ${between} counted as the same pay as this one. That makes it an estimate.`;
    },
    estimateLastYear: 'Your last payslip is from the tax year before, so this is an estimate.',
    heldBack: (amount: string) =>
      `Tax can't take more than half of one payday's pay, so ${amount} is taken later.`,
    changedSince: 'You changed something, so work it out again.',
    mistakes: {
      dateError: 'Choose a date.',
      noTaxYear: (from: string, to: string) =>
        `PrePenny has the tax figures from ${from} to ${to}. Choose a payday in that time.`,
      taxCodeError: 'Type the tax code as it is on your payslip, for example 1257L.',
      percentError: 'Type a percentage, for example 4.',
      amountError: 'Type an amount, for example 25.',
      bandError: 'Type an amount the same as the first one or more.',
      periodError: 'Type the tax week on that payslip, for example 25.',
      periodErrorMonth: 'Type the tax month on that payslip, for example 6.',
      periodAfter: (period: number) =>
        `Type a tax week before this payday's, which is week ${period}.`,
      periodAfterMonth: (period: number) =>
        `Type a tax month before this payday's, which is month ${period}.`,
      soFarBoth: 'Type both figures from your last payslip, or leave both empty.',
      linesError: 'Type the hours and pay an hour for at least one line, or a fixed amount.',
      hoursError: 'Type the hours, for example 34.5.',
      rateError: 'Type the pay an hour, for example 12.71.',
      nameError: "Type what it's for, for example Shift premium.",
      fixTheBoxes: 'Some boxes need a change first. Each one says what to do.',
    },
    refused: {
      'bad-year-so-far':
        "The figures from your last payslip don't fit this payday. Check the tax week you typed from that payslip.",
      'bad-student-loan': 'Choose one student loan plan, as on your payslip.',
      other: "That couldn't be worked out. Check the boxes and try again.",
    },
    addToPlan: (date: string) => `Add to plan as the ${date} estimate`,
    addHint: (amount: string, date: string) =>
      `Puts ${amount} in your plan as your pay on ${date}, marked as an estimate.`,
    addHintOvertime: (amount: string, extra: string, date: string) =>
      `Puts ${amount} in your plan as your pay on ${date}, marked as an estimate. Overtime you've already added for that payday, ${extra}, stays on top.`,
    added: (date: string, amount: string) => `Pay on ${date} is now ${amount}, an estimate.`,
    alreadyReal: (date: string, amount: string) =>
      `Your pay on ${date} already has its real amount, ${amount}, so it stays as it is.`,
    notAPayday: (date: string) =>
      `To add it to your plan, choose one of your paydays as the payday above, such as ${date}.`,
    noPay: 'There are no paydays in your plan to add it to yet.',
    saveWeek: 'Save as a usual week',
    saveWeekIntro:
      'Save these hours and rates as a usual week. You can start from it again here, and "Overtime or missed shift" uses it to work out your pay.',
    saveWeekName: 'Name this week',
    saveWeekDefault: 'Usual week',
    saveWeekNameError: 'Type a name, for example 3-shift week.',
    saveWeekSave: 'Save usual week',
    savedWeek: (name: string) => `${name} saved as a usual week.`,
    /**
     * Which paydays a usual week is for (D5, step 2h): every payday, or one
     * step of the pattern (D283). For pay that isn't weekly, a step is a
     * payday, not a week (D280).
     */
    saveWeekFor: 'Which paydays is it for?',
    saveWeekEvery: 'Every payday',
    saveWeekEveryHint:
      'Every payday uses it from now on, in place of the usual weeks they use now.',
    saveWeekOne: (weekly: boolean) =>
      weekly ? 'One week of the pattern' : 'One payday of the pattern',
    saveWeekOneHint: (weekly: boolean) =>
      weekly
        ? 'Only the paydays on that week of your pay pattern use it.'
        : 'Only that payday of your pay pattern uses it, each time it comes round.',
    saveWeekOnlyEvery: "It's for every payday.",
    saveWeekOneLater: (weekly: boolean) =>
      `Once every payday has a usual week, you can save one for a single ${weekly ? 'week' : 'payday'} of your pay pattern.`,
    saveWeekWhich: (weekly: boolean) =>
      weekly ? 'Which week of the pattern?' : 'Which payday of the pattern?',
    saveWeekStep: (step: number, of: number, date: string, weekly: boolean) =>
      `${weekly ? 'Week' : 'Payday'} ${step} of ${of}, next on ${date}`,
    saveWeekStepNow: (name: string) => `Uses ${name} now. Saving replaces it.`,
    saveWeekStepNone: 'Has no usual week yet.',
    savedWeekEvery: (name: string) => `${name} saved as the usual week for every payday.`,
    savedWeekStep: (name: string, step: number, weekly: boolean) =>
      `${name} saved as the usual week for ${weekly ? 'week' : 'payday'} ${step} of your pay pattern.`,
    startPlan: 'Start a free plan with this pay',
    startPlanHint: (amount: string) =>
      `Opens PrePenny's setup with ${amount} filled in as your pay, an estimate.`,
    check: 'Check my payslip',
    checkIntro:
      "Type the figures from a payslip with the pay lines and settings above. Leave out any it doesn't show.",
    checkBoxes: {
      gross: 'Gross pay',
      pension: 'Pension',
      tax: 'Tax',
      nationalInsurance: 'National Insurance',
      studentLoan: 'Student loan',
      postgraduateLoan: 'Postgraduate loan',
      takeHome: 'Take-home pay',
      grossForTaxSoFar: 'Gross for tax so far',
      taxPaidSoFar: 'Tax paid so far',
    },
    checkButton: 'Check these figures',
    checkNone: 'Type at least one figure from the payslip.',
    checkSame: 'Every figure you typed is what PrePenny worked out.',
    checkDiffer: 'These are different from what PrePenny worked out:',
    checkLine: (figure: string, onPayslip: string, expected: string) =>
      `${figure}: ${onPayslip} on your payslip, ${expected} worked out by PrePenny.`,
    checkMore: (amount: string) => `That's ${amount} more on your payslip.`,
    checkLess: (amount: string) => `That's ${amount} less on your payslip.`,
    askPayroll: 'Ask your payroll team.',
  },

  /** Your job, under More (step 2h, brief 4.15, D154): the details from the payslip. */
  job: {
    heading: 'Your job',
    purpose:
      'The details from your payslip that PrePenny uses to work out your pay when you do overtime or miss a shift.',
    back: 'Back to More',
    loading: 'Working out your job details.',
    noJobTitle: 'No job details yet',
    noJob:
      'Setup saves them when you say you work extra hours or miss shifts. Or work out your pay in the Pay calculator and tap Save as a usual week.',
    toCalculator: 'Go to the Pay calculator',
    forPay: (names: string) => `In your plan as ${names}.`,
    often: 'Paid',
    taxCode: 'Tax code',
    taxCodeLine: (code: string, weekOne: boolean) =>
      weekOne ? `${code}, each payday taxed on its own` : `${code}, worked out the usual way`,
    pension: 'Workplace pension',
    pensionLine: (percent: string, band: string | null, beforeTax: boolean) =>
      `${percent}% of ${band === null ? 'all your pay' : band}, ${beforeTax ? 'before tax' : 'after tax'}`,
    pensionBand: (from: string | null, to: string | null, period: string) =>
      from !== null && to !== null
        ? `your pay from ${from} to ${to} a ${period}`
        : from !== null
          ? `your pay over ${from} a ${period}`
          : `your pay up to ${to ?? ''} a ${period}`,
    studentLoan: 'Student loan',
    loanAndPostgraduate: (plan: string) => `${plan} and a Postgraduate loan`,
    postgraduateOnly: 'A Postgraduate loan',
    deductions: 'Other deductions',
    deduction: (name: string, amount: string) => `${name} ${amount}`,
    none: 'None',
    soFar: 'From your last payslip',
    soFarLine: (
      table: 'week' | 'month',
      period: number,
      year: string,
      gross: string,
      tax: string,
    ) => `Tax ${table} ${period} of ${year}. Taxable pay so far ${gross}, tax paid so far ${tax}`,
    soFarNone: 'Not typed in, so the tax on overtime is an estimate',
    overtimeRate: 'Overtime rate',
    overtimeRateLine: (rate: string) => `${rate} an hour`,
    notSet: 'Not set',
    covered: 'Which days of work each payday pays for',
    coveredLine: (payday: string, upTo: string) => `${payday} pays for work up to ${upTo}`,
    weeks: 'Usual weeks',
    weeksIntro: 'Overtime and missed shifts are worked out from these.',
    weekEvery: 'Every payday',
    weekSteps: (steps: string, many: boolean, of: number, weekly: boolean) =>
      `${weekly ? (many ? 'Weeks' : 'Week') : many ? 'Paydays' : 'Payday'} ${steps} of ${of} in your pay pattern`,
    weekKept: 'Kept to start from in the Pay calculator',
    weekUntil: (date: string) => `Used by your paydays up to ${date}, before a change you made`,
    noTaxYear:
      "PrePenny doesn't have the tax figures for your next payday yet, so these details can't be checked. They're added before each new tax year.",
    weeksNone: 'No usual week is saved yet. Save one from the Pay calculator.',
    shiftsAhead: (count: number) =>
      count === 1
        ? 'Overtime or a missed shift is saved for a payday still to come. Changing these details works out that pay again.'
        : `${count} changes for overtime or missed shifts are saved for paydays still to come. Changing these details works out that pay again.`,
    change: 'Change these details',
    /** The button's name for screen readers, so two jobs' buttons sound different. */
    changeFor: (name: string) =>
      name === '' ? 'Change these details' : `Change these details for ${name}`,
    sheetTitle: 'Your job details',
    overtimeHeading: 'Overtime and missed shifts',
    sheetIntro: "Change anything that's different on your latest payslip.",
    soFarIntro:
      "For exact tax on overtime, type these from your last payslip. Leave them empty and it's an estimate.",
    reworkHint:
      'Overtime and missed shifts saved for paydays still to come are worked out again with these details.',
    overtimeHint: 'From your payslip, for example 19.07. Leave it empty if you never do overtime.',
    coveredHint: 'The last day of work this pay covers, from your payslip or rota.',
    save: 'Save these details',
    nothingChanged: 'Change something first, then save.',
    saved: 'Your job details changed.',
    savedPayday: (date: string, amount: string) => `Your pay on ${date} is now ${amount}.`,
    savedMore: (count: number) =>
      count === 1 ? 'And 1 more payday.' : `And ${count} more paydays.`,
    mistakes: {
      rateError: 'Type the rate, for example 19.07, or leave it empty.',
      coveredToError: 'Choose the last day of work this payday pays for.',
      coveredToTooFar: 'Choose a day on or before the payday, within the last 8 weeks.',
    },
  },

  /** What if (brief 4.10, D135, step 2g): practice changes beside the real plan. */
  whatIf: {
    heading: 'What if',
    purpose: "Practice mode. Try changes here. Your real plan doesn't change unless you keep them.",
    backToMore: 'Back to More',
    backToComingUp: 'Back to Coming up',
    loading: 'Working out your practice plan.',
    yourChanges: 'Your practice changes',
    noChanges: 'No practice changes yet. Make one below.',
    takeBack: 'Take back the last change',
    takenBack: 'The last practice change is taken back.',
    keep: 'Keep these changes',
    keepHint: 'They go into your real plan as one change, and one Undo takes them all back.',
    throwAway: 'Throw them away',
    throwAwayHint: 'Your real plan stays exactly as it was.',
    /** Asked before throwing them away (step 2h). */
    throwAwayCheck: (count: number) =>
      `Throw away ${count === 1 ? '1 practice change' : `${count} practice changes`}? Your real plan stays exactly as it was.`,
    keepPractising: 'Keep practising',
    /** Under the accounts side by side, when some aren't shown (step 2h). */
    otherAccounts: "Your other accounts don't change.",
    kept: (count: number) =>
      count === 1
        ? 'Your practice change is now in your plan.'
        : `Your ${count} practice changes are now in your plan.`,
    thrownAway: 'Practice changes thrown away. Your real plan is exactly as it was.',
    nothingToKeep:
      'Your practice changes cancel each other out, so there was nothing to keep. Your real plan is exactly as it was.',
    cantMakeAgain:
      "Your plan has changed since, so your practice changes couldn't be made again. They're thrown away.",
    sideBySide: 'Your real plan and practice, side by side',
    real: 'Your real plan',
    practice: 'Practice',
    lowestPoint: 'Lowest point ahead',
    onAfter: (date: string, name: string) => `${date}, after ${name}`,
    practiceShort: (amount: string, date: string) =>
      `In practice, you'd be ${amount} short on ${date}.`,
    realShort: (amount: string, date: string) => `Your real plan is ${amount} short on ${date}.`,
    couldMoveTo: (date: string) => `Moving one of these payments to ${date} would fix it.`,
    couldMove: 'Moving one of these payments would fix it.',
    noneFixes: "Moving one payment to the next payday wouldn't fix it on its own.",
    showAll: (count: number) => `Show all ${count}`,
    paidOffOn: 'Paid off on',
    paidOffIntro: 'Each debt, looking 24 months ahead.',
    leftOn: (amount: string, date: string) => `${amount} left on ${date}`,
    estimate: (words: string) => `${words}, an estimate`,
    goalsReached: 'Savings goals reached on',
    notReached: (amount: string, date: string) => `Not reached: ${amount} saved by ${date}`,
    makeChange: 'Make a practice change',
    makeChangeIntro: 'Tap a payment below to change it, move it or skip it, or use one of these.',
    payments: 'Payments, with your practice changes',
  },

  /** Compare ways to pay a credit card (brief 4.6, D102). Numbers only (brief Part 3, principle 10). */
  compare: {
    heading: 'Compare ways to pay',
    intro:
      'How many payments it takes to clear the card, and the interest on the way, for three ways to pay.',
    fixed: 'A fixed amount each month',
    fixedError: 'Type an amount, for example 25.',
    paysOn: 'Day of the month you pay',
    paysOnError: 'Type a day, a number from 1 to 31.',
    minimum: 'Paying the minimum each month',
    fixedEach: (amount: string) => `Paying ${amount} each month`,
    full: 'Paying all you owe each month',
    result: (payments: number, interest: string) =>
      payments === 1
        ? `1 payment, ${interest} interest`
        : `${payments} payments, ${interest} interest`,
    never: 'It never clears: the interest is more than the payment.',
    noMinimum: 'Not known: later minimums need a rule, such as interest plus 1% of what you owe.',
    estimates:
      "Estimates from the card's interest rate. PrePenny shows the numbers, not which to choose.",
    working: 'Working it out.',
  },

  /** Add or change a debt (brief 4.6, D98, D101, D106, D153). */
  debtSheet: {
    addTitle: 'Add a debt',
    addIntro: "Add something you're paying off, to see the date it's paid off.",
    changeTitle: 'Change this debt',
    changeIntro: "Change this debt's details. To change what you owe, use Update from statement.",
    currencyFixed: (currency: string) =>
      `It's in ${currency}. That stays as it is, so what's owed doesn't change.`,
    zeroUntil: '0% until, if it has an offer',
    zeroUntilHint: 'Leave it empty if it has no 0% offer.',
    minimum: 'Minimum payment',
    minimumNone: "I don't know it",
    minimumTyped: 'As on my statement',
    minimumRule: 'A rule, such as interest plus 1%',
    minimumAmount: 'Minimum from the statement',
    minimumPercent: 'Interest plus this percentage of what you owe',
    minimumPercentHint: 'Most cards use 1.',
    minimumAtLeast: 'At least',
    minimumError: 'Type an amount, for example 25.',
    percentError: 'Type a percentage, for example 1.',
    statementDayNeeded: 'Type the statement day, a number from 1 to 31. A rule needs it.',
    save: 'Add this debt',
    saveChanges: 'Save',
    nothingChanged: 'Change something first, then save.',
    added: (name: string) => `${name} added.`,
    changed: (name: string) => `${name} changed.`,
  },

  /** Update from statement (brief 4.6, D62, D103). */
  statement: {
    title: 'Update from statement',
    intro:
      'Type what your latest statement says you owe, so the date it is paid off is worked out from the right amount.',
    amount: 'What the statement shows now',
    amountError: 'Type what the statement shows, for example 420.99.',
    tickHeading: 'Tick any payment to it that has already gone',
    tickIntro: 'The statement shows these already, so they come off the debt once.',
    tickLabel: (date: string, name: string, amount: string) => `${date}, ${name}, ${amount}`,
    save: "Update what's owed",
    updated: (name: string) => `${name} updated from its statement.`,
    updatedTicked: (name: string, count: number) =>
      count === 1
        ? `${name} updated from its statement, and 1 payment ticked.`
        : `${name} updated from its statement, and ${count} payments ticked.`,
  },

  /** Change the rate of a debt in another currency (brief 4.6). */
  rate: {
    title: 'Change the rate',
    intro: (currency: string) =>
      `Set how many ${currency} make £1, so PrePenny can show this debt in pounds too.`,
    saved: (name: string) => `${name}'s rate changed.`,
  },

  /** Closing a debt, a goal or an account. */
  closing: {
    debtTitle: 'Close this debt',
    debtIntro: 'Closing it stops it counting in Owed now, on Debts.',
    /** Closing a debt can also remove its payments still to come (step 2g). */
    alsoRemove: (count: number, continues: boolean) => {
      if (continues) return 'Also remove every payment planned to it?';
      if (count === 1) return 'Also remove its planned payment?';
      return `Also remove its ${count} planned payments?`;
    },
    /** The answers say what they do (D279). */
    removeYes: (one: boolean) => (one ? 'Yes, remove it' : 'Yes, remove them'),
    removeNo: (one: boolean) => (one ? 'No, keep it' : 'No, keep them'),
    debtConfirm: 'Close this debt',
    goalTitle: 'Close this goal',
    goalIntro:
      'Closing it takes it off this list. Its payments stay in your plan until you remove them.',
    goalConfirm: 'Close this goal',
    keep: 'Keep it open',
    debtClosed: (name: string) => `${name} closed.`,
    debtClosedAndRemoved: (name: string) => `${name} closed, and its planned payments removed.`,
    goalClosed: (name: string) => `${name} closed.`,
  },

  /** Budgets (brief 4.5, D29, D30, D31, D32, D152, D161). */
  budgets: {
    heading: 'Budgets',
    back: 'Back to More',
    purpose:
      "Money for everyday things, such as food and travel, with what's spent and left this week or month.",
    loading: 'Working out your budgets.',
    none: 'No budgets yet',
    noneLine: 'A budget, such as Travel at £25 a week, plans money for everyday spending.',
    add: 'Add a budget',
    aWeek: (amount: string, account: string) => `${amount} a week, from ${account}`,
    aMonth: (amount: string, account: string) => `${amount} a month, from ${account}`,
    atStart: 'All leaves at the start of the week or month.',
    spread: (amount: string) => `Spread across the days: ${amount} a day.`,
    spreadNoDay: 'Spread across the days.',
    payLater: (day: string) => `On a pay-later card, with the bill on the ${day} of each month.`,
    rollOverOn: "What's left moves to the next week or month.",
    thisWeek: (end: string) => `This week, to ${end}`,
    thisMonth: (end: string) => `This month, to ${end}`,
    startsOn: (date: string) => `Starts ${date}`,
    spent: 'Spent',
    left: 'Left',
    rolledOverWeek: (base: string, rolled: string) => `${base} + ${rolled} from last week`,
    rolledOverMonth: (base: string, rolled: string) => `${base} + ${rolled} from last month`,
    payLaterLeft: (amount: string, date: string) =>
      `On the pay-later card: ${amount} left until ${date}.`,
    bill: (date: string, amount: string) => `Bill on ${date}: ${amount}.`,
    billEstimate: (date: string, amount: string) => `Bill on ${date}: ${amount}, an estimate.`,
    change: (name: string) => `Change ${name}`,
  },

  /** Add, change or end a budget (brief 4.5, D152, D161). */
  budgetSheet: {
    addTitle: 'Add a budget',
    addIntro: 'Plan money for everyday things, such as food or travel, each week or month.',
    changeTitle: 'Change this budget',
    changeIntro:
      'Change it from this week or month on. Weeks and months that have ended stay as they were.',
    staysPayLater:
      'It stays on the pay-later card. To plan it another way, end it and add a new budget.',
    noPayLaterSwitch:
      'To move it to a pay-later card, end it and add a new monthly budget, because a card bill comes once a month and starts afresh.',
    amountFromWeek: 'From this week on.',
    amountFromMonth: 'From this month on.',
    statementDay: "The card's statement day, if you know it",
    statementDayHint: 'Leave it empty and each bill covers spending up to the day before it.',
    statementDayError: 'Type a day, a number from 1 to 31, or leave it empty.',
    starts: 'Starts',
    startsHint: 'Its first week or month is the one with this day in it.',
    rollOver: "Carry what's left over to the next week or month",
    save: 'Add budget',
    saveChanges: 'Save',
    nothingChanged: 'Change something first, then save.',
    added: (name: string) => `${name} added.`,
    changed: (name: string) => `${name} changed.`,
    endHeading: 'End this budget',
    endIntro: 'It stops after the week or month with this day in it.',
    endOn: 'Its last week or month has this day in it',
    endError: 'Pick today or a later date.',
    end: 'End this budget',
    ended: (name: string, date: string) => `${name} ends after the week or month with ${date}.`,
  },

  /** Savings goals (brief 4.7, D114, D139, D153). */
  goals: {
    heading: 'Savings goals',
    back: 'Back to More',
    purpose: "What you're saving for, how much is saved, and the date you'll get there.",
    loading: 'Working out your savings goals.',
    none: 'No savings goals yet',
    noneLine: "Save towards something, such as a holiday, and see the date you'll get there.",
    add: 'Add a savings goal',
    savedOf: (saved: string, target: string) => `${saved} saved of ${target}`,
    percentSaved: (percent: number) => `${percent}% saved`,
    reached: 'Reached',
    reachedOn: (date: string) => `Reached on ${date}`,
    reachedOnEstimate: (date: string) => `Reached on ${date}, an estimate`,
    notReached: (amount: string, date: string) =>
      `Not reached in the next 24 months: ${amount} saved by ${date}.`,
    yourDate: (date: string) => `Your date: ${date}.`,
    beforeDate: "That's on time for your date.",
    afterDate: "That's after your date.",
    keptIn: (account: string) => `Kept in ${account}`,
    noMoves: 'No money is planned to move into it yet.',
    addMove: (name: string) => `Add a payment into ${name}`,
    change: (name: string) => `Change ${name}`,
    close: (name: string) => `Close ${name}`,
    closedHeading: 'Closed goals',
    closedLine: 'Closed.',
  },

  /** Add or change a savings goal (brief 4.7, D153). */
  goalSheet: {
    addTitle: 'Add a savings goal',
    addIntro: "Save towards something, and see the date you'll get there.",
    changeTitle: 'Change this goal',
    changeIntro: 'Change what you are saving for, the target or the date.',
    save: 'Add goal',
    saveChanges: 'Save',
    nothingChanged: 'Change something first, then save.',
    added: (name: string) => `${name} added.`,
    changed: (name: string) => `${name} changed.`,
    close: 'Close this goal',
  },

  /** Accounts (brief 4.2, D151, D158, D181). */
  accounts: {
    heading: 'Accounts',
    back: 'Back to More',
    purpose: 'Each account PrePenny plans for, with what the bank showed and when.',
    loading: 'Working out your accounts.',
    add: 'Add an account',
    kinds: { current: 'Current account', savings: 'Savings', joint: 'Joint account' },
    checkedToday: (amount: string) => `${amount}, checked today`,
    checked: (amount: string, date: string) => `${amount}, checked ${date}`,
    /** Sam's example, which never says "today" (D448): "£267.54, as on Sun 25 Oct 2026". */
    asOn: (amount: string, date: string) => `${amount}, as on ${date}`,
    noOverdraft: 'No overdraft',
    overdraft: (amount: string) => `Overdraft limit ${amount}`,
    warning: (amount: string) => `Tight under ${amount}`,
    change: (name: string) => `Change ${name}`,
    closedHeading: 'Closed accounts',
    closedLine: 'Closed. Kept for its history.',
    holidays: 'Bank holidays',
    holidaysLine: (nation: string) => `Payments that move on bank holidays follow ${nation}.`,
    changeNation: 'Change where you live',
  },

  /** Add or change an account, and close it (brief 4.2, D151, D158, D181). */
  accountSheet: {
    addTitle: 'Add an account',
    addIntro: 'Add an account with what its bank shows today, so PrePenny can plan for it.',
    changeTitle: 'Change this account',
    changeIntro: "Change its name, its overdraft limit or when it warns you it's getting low.",
    save: 'Add account',
    saveChanges: 'Save',
    nothingChanged: 'Change something first, then save.',
    added: (name: string) => `${name} added.`,
    changed: (name: string) => `${name} changed.`,
    closeHeading: 'Close this account',
    closeIntro: 'Closing it keeps its history, and nothing new can use it.',
    close: 'Close this account',
    closed: (name: string) => `${name} closed.`,
    moneyLeft: (amount: string) =>
      `It has ${amount} in it at the end of today, so that has to move first.`,
    overdrawn: (amount: string) =>
      `It's ${amount} overdrawn at the end of today, so that has to be paid in first.`,
    moveTo: 'Move it to',
    moveFrom: 'Move it from',
    moveOut: (amount: string) => `Move ${amount} to another account first`,
    moveIn: (amount: string) => `Move ${amount} into it from another account first`,
    moveHintTo: (account: string) =>
      `This adds a move to ${account} today, marked as done. Make the same move in your banking app.`,
    moveHintFrom: (account: string) =>
      `This adds a move from ${account} today, marked as done. Make the same move in your banking app.`,
    /** Said once the move is added, ticked (step 2g). */
    nowMove: (amount: string) => `Now move ${amount} in your banking app too.`,
    moveName: (from: string, to: string) => `From ${from} to ${to}`,
    moved: (amount: string, from: string, to: string) => `${amount} moved from ${from} to ${to}.`,
    noOther: "There's no other account to move it to. Add one first.",
    inUse:
      'Payments, a budget or a savings goal still use this account. Remove them, or move them to another account, first.',
  },

  /** Where you live, for bank holidays (brief 4.3, 5.7, D155). */
  nation: {
    title: 'Where you live',
    intro:
      'Banks move payments that fall on a bank holiday. Choose your part of the UK, so PrePenny uses the right ones.',
    save: 'Save',
    saved: (nation: string) => `Bank holidays now follow ${nation}.`,
  },

  more: {
    heading: 'More',
    purpose:
      'Your accounts, budgets, savings goals and pay, and settings for PrePenny on this phone.',
    stillBeingBuilt: 'Help is still being built.',
    yourPlan: 'Your plan',
    accounts: 'Accounts',
    accountsLine: 'Balances, overdrafts and bank holidays',
    budgets: 'Budgets',
    budgetsLine: "Spending money, with what's spent and left",
    goals: 'Savings goals',
    goalsLine: "What you're saving for, and when you'll get there",
    whatIf: 'What if',
    whatIfLine: 'Try changes in practice before you make them',
    payCalculator: 'Pay calculator',
    payCalculatorLine: 'Work out take-home pay from your hours, or check a payslip',
    job: 'Your job',
    jobLine: 'Tax code, pension and overtime rate, from your payslip',
    colours: 'Colours',
    coloursHint: 'Dark colours are easier on the eyes at night.',
    matchPhone: 'Match this phone',
    light: 'Light',
    dark: 'Dark',
    example: 'Example plan',
    exampleLine: 'You can change the example to try things out. Your changes stay on this phone.',
    startAgain: 'Start again with the example',
    /** With the person's own plan showing (step 2e). */
    lookLine: 'See how PrePenny works with a made-up plan. Your own plan stays as it is.',
    lookAtExample: 'Look at the example plan',
    startAgainCheck: 'Your changes to the example will go, and it goes back to how it started.',
    startAgainConfirm: 'Start again',
    keepChanges: 'Keep my changes',
    startedAgain: 'The example is back to how it started.',
  },

  /**
   * The same thing changed on two phones, or a change the account couldn't
   * take (step 3d, D59, PLAN.md item 32). One at a time, oldest first.
   */
  clash: {
    title: 'Changed on two phones',
    purpose:
      "The same thing was changed on two phones. PrePenny keeps the newest change, and tells you when yours wasn't kept.",
    refusedTitle: "A change wasn't saved",
    refusedPurpose:
      "Your account couldn't take a change made on this phone, so it was taken off. Changes made after it are still sent.",
    /** Who made the other change. */
    otherPhone: 'Your other phone',
    partner: 'Your partner',
    /** "Tom's", "Your other phone's". */
    whose: (who: string) => `${who}'s`,
    /** What the other change did, with what it was about. */
    theirs: {
      amount: (name: string, on: string | null, amount: string) =>
        on === null ? `changed ${name} to ${amount}` : `changed ${name} on ${on} to ${amount}`,
      moved: (name: string, on: string | null, to: string) =>
        on === null ? `moved ${name} to ${to}` : `moved ${name} on ${on} to ${to}`,
      removed: (name: string, on: string | null) =>
        on === null ? `removed ${name}` : `removed ${name} on ${on}`,
      paid: (name: string, on: string | null) =>
        on === null ? `marked ${name} as paid` : `marked ${name} on ${on} as paid`,
      notPaid: (name: string, on: string | null) =>
        on === null ? `marked ${name} as not paid` : `marked ${name} on ${on} as not paid`,
      changed: (name: string, on: string | null) =>
        on === null ? `changed ${name}` : `changed ${name} on ${on}`,
    },
    /** What this person's change did. */
    ours: {
      amount: (amount: string) => `changed it to ${amount}`,
      moved: (to: string) => `moved it to ${to}`,
      removed: 'removed it',
      paid: 'marked it as paid',
      notPaid: 'marked it as not paid',
      changed: 'changed it',
    },
    /** "Tom changed Rent on Tue 1 Dec to £650 after you changed it to £640." */
    sentence: (who: string, theirs: string, ours: string, here: boolean) =>
      `${who} ${theirs} after you ${ours}${here ? ' on this phone' : ''}.`,
    kept: (whose: string) => `${whose} change is kept.`,
    cant: "Yours can't be made on the plan as it is now, so it wasn't saved.",
    /** The other phone removed the payment: it can't be changed, whichever came first. */
    cantRemoved: (who: string, what: string) =>
      `${who} removed ${what}, so your change to it can't be made. Make it again if you still want it.`,
    /**
     * A change made on another of the person's devices, told on this one once
     * that device has signed out (step 3e, PLAN.md item 39): "Tom changed Rent
     * on Tue 1 Dec after you changed it on Chrome on an Android phone."
     */
    elsewhere: (who: string, what: string, device: string) =>
      `${who} changed ${what} after you changed it on ${device}.`,
    anotherDevice: 'another phone or computer',
    /** When a record has no name of its own. */
    unnamed: 'your plan',
    putBack: 'Put mine back',
    /** "Keep Tom's change", "Keep your other phone's change". */
    keepTheirs: (whose: string) => `Keep ${whose} change`,
    gotIt: 'Got it',
    putBackDone: 'Your change is back.',
    putBackFailed:
      "Your change can't be put back on the plan as it is now. Make it again if you still want it.",
    refused: (what: string) =>
      `Your change to ${what} wasn't saved in your account, so it has been taken off this phone.`,
    refusedOn: (name: string, on: string) => `${name} on ${on}`,
    /** Why, when the server's code says. */
    notAllowed: 'You can look at this plan but not change it.',
    makeAgain: 'Make it again if you still want it.',
  },

  /** "Your account" on More, and signing out (brief 4.13, step 3b). */
  account: {
    heading: 'Your account',
    checking: "Checking whether you're signed in.",
    signedOutLine: 'Sign up so your plan is yours. No password needed.',
    signUp: 'Sign up or sign in',
    signedInAs: (email: string) => `Signed in as ${email}`,
    /** Under "Signed in as" (step 3c): where the plan is kept. */
    savedInAccount: 'Your plan is saved in your account.',
    notSavedYet:
      "Your plan hasn't been saved in your account yet. It's on this phone, and will be sent when PrePenny can reach its server.",
    /** How many changes are waiting to be sent (step 3d). */
    unsent: (count: number) =>
      count === 1
        ? "1 change is waiting to be sent to your account. It's saved on this phone, and goes when there's a signal."
        : `${count} changes are waiting to be sent to your account. They're saved on this phone, and go when there's a signal.`,
    off: "Signing in isn't switched on yet. Your plan stays on this phone.",
    signOut: 'Sign out',
    signOutIntro:
      "Signing out removes your plan from this phone only. It's saved in your account, and comes back when you sign in again.",
    /** Before signing out, when something on this phone hasn't been sent yet (step 3c). */
    signOutUnsent: (count: number) =>
      count === 1
        ? "1 change hasn't been sent to your account yet. If you sign out now, it will be lost."
        : `${count} changes haven't been sent to your account yet. If you sign out now, they'll be lost.`,
    signOutNotSaved:
      "Your plan hasn't been saved in your account yet. If you sign out now, it will be lost.",
    /** `one` when it's one change, or the plan itself; otherwise there are several changes. */
    signOutWhenSent: (one: boolean) =>
      one ? 'Sign out once it has been sent' : 'Sign out once they have been sent',
    signOutWhenSentHint: (one: boolean) =>
      one
        ? "You stay signed in until then, and it's sent as soon as there's a signal."
        : "You stay signed in until then, and they're sent as soon as there's a signal.",
    signOutAnyway: (one: boolean) =>
      one ? 'Sign out now and lose it' : 'Sign out now and lose them',
    waitingToSend: "Sending to your account. You'll be signed out once everything has gone.",
    waitingForSignal:
      "Waiting for a signal to send to your account. You'll be signed out once everything has gone.",
    signOutConfirm: 'Sign out',
    staySignedIn: 'Stay signed in',
    signingOut: 'Signing out.',
    /** On the welcome, after signing out. */
    signedOut: "You're signed out. Nothing of yours is left on this phone.",
    /** When a sign-in ended by itself, as after "Sign out of all other devices" on another phone (step 3c, PLAN.md item 29). */
    signInEnded:
      "Your sign-in has ended, so your plan was removed from this phone. It's saved in your account: sign in to bring it back.",
    /** Signed out by another phone, with a change here not sent yet (D348, step 3e). */
    endedUnsent: (count: number) =>
      count === 1
        ? "Your sign-in has ended. 1 change on this phone hasn't been sent to your account yet: sign in again to send it."
        : `Your sign-in has ended. ${count} changes on this phone haven't been sent to your account yet: sign in again to send them.`,
    /** On the welcome. */
    haveAccount: 'Already have an account?',
    signIn: 'Sign in',
    signedInWelcome: (email: string) => `Signed in as ${email}.`,
  },

  /** Signing up and signing in (brief 4.13, D20, step 3b). */
  signIn: {
    signInHeading: 'Sign in',
    signUpHeading: 'Sign up',
    signInPurpose: 'Sign in with your email address or Google. No password needed.',
    signUpPurpose:
      'Make an account with your email address or Google. No password needed. If you already have one, this signs you in.',
    planBecomesYours:
      'The plan you made on this phone becomes yours, and is saved in your account.',
    saving: 'Saving your plan in your account.',
    /** A plan on this phone and another in the account: which to keep (step 3c, D324). */
    chooseHeading: 'Choose which plan to keep',
    choosePurpose:
      'Your account already has a saved plan, and this phone has a plan of its own. You can keep one of them.',
    chooseLegend: 'Which plan do you want to keep?',
    savedPlan: (changed: string) => `Your saved plan, last changed ${changed}`,
    savedPlanHint: 'The one in your account, as you last left it.',
    phonePlan: (started: string) => `The plan on this phone, started ${started}`,
    phonePlanHint: 'The one on this phone now, as you left it.',
    /** The plan on this phone is still part-way through setup (D351). */
    phonePlanUnfinishedHint: "The one on this phone now. It isn't finished yet.",
    /** "started today", "last changed today". */
    today: 'today',
    keepThisPlan: 'Keep this plan',
    chooseFirst: 'Choose a plan to keep.',
    keepSavedTitle: 'Keep your saved plan',
    keepSavedIntro: "The plan on this phone will be removed. This can't be undone.",
    keepPhoneTitle: 'Keep the plan on this phone',
    keepPhoneIntro: "Your saved plan will be removed from your account. This can't be undone.",
    removeIt: 'Yes, remove it',
    goBack: 'No, go back',
    keeping: 'Keeping the plan you chose.',
    couldNotKeep:
      "PrePenny couldn't reach its server, so nothing was removed. Try again in a minute.",
    backToMore: 'Back to More',
    emailLabel: 'Email address',
    emailHint: "We'll email you a 6-digit code.",
    sendCode: 'Send me a code',
    sending: 'Sending your code.',
    or: 'Or',
    google: 'Continue with Google',
    googleHint: 'Opens Google to choose your account, then comes back here.',
    openingGoogle: 'Opening Google.',
    codeHeading: 'Type your code',
    sentTo: (email: string) => `We've sent a 6-digit code to ${email}. It lasts 10 minutes.`,
    newCodeSentTo: (email: string) => `We've sent a new code to ${email}. It lasts 10 minutes.`,
    codeLabel: '6-digit code',
    codeHint:
      "It's in an email from PrePenny. If it isn't there, look in your junk or spam folder.",
    linkHint: 'Or tap the link in the email, on this phone.',
    finishSignIn: 'Sign in',
    finishSignUp: 'Sign up',
    checking: 'Signing you in.',
    sendNewCode: 'Send a new code',
    otherEmail: 'Use a different email address',
    checkingLink: 'Checking your link.',
    /** The email's link opens this first, so a service checking links can't use it up (D312). */
    linkHeading: 'Finish signing in',
    linkPurpose:
      'You opened the sign-in link from your email. Tap the button to sign in on this phone.',
    finishLink: 'Finish signing in',
    anotherWay: 'Sign in another way',
    googleOff: "Google sign-in isn't switched on yet. Use your email address instead.",
    emailMissing: 'Type your email address, for example sam@example.com.',
    codeMissing: 'Type the 6 numbers from the email, for example 123456.',
    codeWrong:
      "That code doesn't match. Check the 6 numbers in the email from PrePenny, or tap Send a new code.",
    codeRanOut: "This code has run out. Tap Send a new code and we'll email you another.",
    linkRanOut:
      'This link has run out or has been used already. Type your email address to get a new code.',
    wait: (seconds: number) =>
      seconds === 1
        ? 'You can ask for a new code in 1 second.'
        : `You can ask for a new code in ${seconds} seconds.`,
    tooManyEmails:
      'Too many codes have been sent in the last hour. Try again in an hour, or continue with Google.',
    tooManyTries: 'Too many tries from this phone. Wait 5 minutes, then try again.',
    emailRefused:
      "That email address can't get emails from PrePenny. Check it, or use another one.",
    offline: "You're offline. Connect to the internet, then try again.",
    server: "PrePenny couldn't reach its server. Try again in a minute.",
    off: "Signing in isn't switched on yet. Your plan stays on this phone.",
    googleCancelled: "Google sign-in didn't finish. Try again, or use your email address instead.",
    someoneElsesPlan:
      'This phone has a plan from another account. To sign in with yours, remove that plan from this phone first.',
    removeOther: "Remove the other account's plan",
    removeOtherTitle: "Remove the other account's plan",
    removeOtherSaved:
      "It's removed from this phone only. It's saved in that account, so nothing of it is lost.",
    removeOtherNotSaved:
      "It's removed from this phone. Some of it hasn't been saved in that account, and that part will be lost.",
  },

  /** Keeping the account safe, on More (brief 4.13, step 3e). */
  security: {
    heading: 'Security',
    /** The first line of the card (D213). */
    purpose: 'Keep your account and this phone safe.',
    lock: 'App lock',
    lockOn: 'On. PrePenny asks for your PIN when it opens.',
    lockOff: 'Ask for a PIN when PrePenny opens on this phone',
    devices: 'Signed-in devices',
    devicesLine: "See where you're signed in, and sign out of any of them",
    twoStep: 'Two-step sign-in',
    twoStepOn: 'On. Signing in needs a code from your authenticator app.',
    twoStepOff: 'Ask for a code from an authenticator app when you sign in',
    emails: 'Email addresses',
    emailsLine: 'Change the address you sign in with, or add a backup',
    backToMore: 'Back to More',
    /** A code from the authenticator app, asked for before something that needs the second step just now. */
    appCodeLabel: 'Code from your authenticator app',
    appCodeHint: 'Open your authenticator app and type the 6-digit code it shows for PrePenny.',
    appCodeMissing: 'Type the 6 numbers from your authenticator app, for example 123456.',
    appCodeWrong:
      "That code doesn't match. The code changes every 30 seconds: type the one your authenticator app shows now.",
    emailCodeMissing: 'Type the 6 numbers from the email, for example 123456.',
    emailCodeWrong: "That code doesn't match. Check the 6 numbers in the email from PrePenny.",
    emailCodeRanOut: 'This code has run out. Start again to get a new one.',
    offline: "You're offline. Connect to the internet, then try again.",
    server: "PrePenny couldn't reach its server. Try again in a minute.",
    tooMany: 'Too many codes have been sent. Wait an hour, then try again.',
    wait: (seconds: number) =>
      seconds === 1
        ? 'You can ask for a new code in 1 second.'
        : `You can ask for a new code in ${seconds} seconds.`,
    emailOff: "Emails from PrePenny aren't switched on yet, so this can't be done for now.",
  },

  /** The list of signed-in devices (brief 4.13, D21, step 3e). */
  devices: {
    heading: 'Signed-in devices',
    purpose:
      "Every phone and computer signed in to your account. Sign out of any you don't use or don't know.",
    loading: 'Finding your signed-in devices.',
    browsers: {
      chrome: 'Chrome',
      safari: 'Safari',
      firefox: 'Firefox',
      edge: 'Edge',
      samsung: 'Samsung Internet',
      opera: 'Opera',
    } as Record<string, string>,
    kinds: {
      iphone: 'an iPhone',
      ipad: 'an iPad',
      'android-phone': 'an Android phone',
      'android-tablet': 'an Android tablet',
      chromebook: 'a Chromebook',
      windows: 'a Windows computer',
      mac: 'a Mac',
      linux: 'a Linux computer',
    } as Record<string, string>,
    someDevice: 'a phone or computer',
    /** "Chrome on an Android phone". */
    browserOn: (browser: string, kind: string) => `${browser} on ${kind}`,
    thisDevice: 'This device',
    lastUsedToday: 'Last used today',
    lastUsedYesterday: 'Last used yesterday',
    lastUsedOn: (day: string) => `Last used ${day}`,
    signOutOfIt: 'Sign out of this device',
    /** For screen readers: which device the button signs out (WCAG 2.5.3: the words on it first). */
    signOutOfItLabel: (name: string) => `Sign out of this device: ${name}`,
    endTitle: (name: string) => `Sign out of ${name}`,
    endIntro:
      "It gets nothing more from your account straight away, and removes your plan within a minute. It's saved in your account, so nothing is lost.",
    endYes: 'Yes, sign it out',
    endNo: 'No, keep it signed in',
    ended: (name: string) => `${name} is signed out.`,
    /** "Sign out of all other devices" (step 3e hardening): this one stays signed in. */
    others: 'Sign out of all other devices',
    othersLine:
      'Signs out every phone and computer but this one, and each removes your plan within a minute. This one stays signed in.',
    othersTitle: 'Sign out of all other devices',
    othersIntro:
      'Every other phone and computer signed in to your account is signed out, and each removes your plan within a minute. This one stays signed in. Your plan is saved in your account, so nothing is lost.',
    othersCodeIntro:
      'Every other phone and computer signed in to your account is signed out. This one stays signed in. Type the code from your authenticator app first.',
    othersYes: 'Sign them out',
    othersNo: 'Keep them signed in',
    othersDone: (count: number) =>
      count === 0
        ? 'No other phone or computer was signed in.'
        : count === 1
          ? '1 other phone or computer is signed out.'
          : `${count} other phones and computers are signed out.`,
    none: 'No devices are signed in.',
    couldNotLoad:
      "PrePenny couldn't reach its server, so the list can't be shown. Try again in a minute.",
    tryAgain: 'Try again',
  },

  /**
   * "Share with my partner" (brief 4.14, step 3f): who's in the plan, which
   * accounts are shared, and the invite, by link or by email.
   */
  share: {
    moreLink: 'Share with my partner',
    moreLine: 'Plan together, each on your own phone',
    heading: 'Share with my partner',
    purpose:
      'Plan money together, each on your own phone. You choose which accounts your partner sees, and the rest stay private.',
    backToMore: 'Back to More',
    signInFirst: 'Sign in first, so your plan is kept in your account. Then you can share it.',
    signIn: 'Sign up or sign in',
    onExample: "This is the example plan, which can't be shared. Go back to your own plan first.",
    loading: "Finding who's in your plan.",
    couldNotLoad:
      "PrePenny couldn't reach its server, so this can't be shown. Try again in a minute.",
    tryAgain: 'Try again',
    whoHeading: "Who's in this plan",
    /** "You (Tom)" for this person. */
    you: (name: string) => (name === '' ? 'You' : `You (${name})`),
    someone: 'Your partner',
    roles: {
      owner: 'Made this plan',
      editor: 'Can edit',
      viewer: 'Can view only',
    } as Record<string, string>,
    accountsHeading: 'Shared accounts',
    accountsNone: 'No accounts are shared yet, so your partner sees nothing of your money.',
    accountsShared: (names: string) => `Shared: ${names}.`,
    accountsPrivate: (names: string) => `Only you see: ${names}.`,
    chooseAccounts: 'Choose shared accounts',
    inviteHeading: 'Invite your partner',
    full: 'Two people are in this plan, so nobody else can join.',
    notOwner: (name: string) => `Only ${name} can invite someone, as they made this plan.`,
    nameLabel: 'Your name, as your partner will see it',
    nameHint: 'A first name or nickname is enough.',
    nameError: 'Type a name, for example Jess.',
    nameTooLong: 'Keep it to 30 letters or fewer.',
    roleLegend: 'What can your partner do?',
    canEdit: 'Can edit',
    canEditHint: 'See and change everything shared, and tick payments.',
    canView: 'Can view only',
    canViewHint:
      'See everything shared, but change nothing. They can still keep their own pay up to date.',
    howLegend: 'How do you want to send it?',
    byLink: 'A link I send myself',
    byLinkHint: 'Send it in a message, on WhatsApp or by text.',
    byEmail: 'An email from PrePenny',
    emailLabel: "Your partner's email address",
    emailError: 'Type an email address, for example jess@example.com.',
    makeLink: 'Make the invite link',
    sendEmail: 'Send the invite',
    making: 'Making the invite.',
    linkHeading: 'Your invite link',
    linkLine: 'Send this link to your partner. It lasts 7 days and works once.',
    linkLabel: 'Invite link',
    copy: 'Copy the link',
    copied: 'Link copied.',
    shareLink: 'Share the link',
    shareText: 'Join my plan in PrePenny',
    emailSent: (address: string) => `Invite sent to ${address}. It lasts 7 days and works once.`,
    /** The invite made earlier, still open: "Can edit, until 3:14pm on Tue 17 Nov." */
    openInvite: (role: string, until: string) => `Invite open: ${role}, until ${until}.`,
    openInviteTo: (address: string, role: string, until: string) =>
      `Invite sent to ${address}: ${role}, until ${until}.`,
    afterAsk:
      'When someone opens it and asks to join, PrePenny asks you to allow it first. Nobody joins without you.',
    cancel: 'Cancel this invite',
    cancelled: 'The invite is cancelled. Nobody can use it now.',
    tooManyEmails:
      'PrePenny has sent 3 invite emails for your plan today. Make an invite link instead, or try again tomorrow.',
    problem: "PrePenny couldn't reach its server, so nothing was made. Try again in a minute.",
    offline: "You're offline. Connect to the internet to invite your partner.",
    /** Someone asked to join (step 3f): what the owner sees, on any screen and here. */
    requestTitle: (name: string) => `${name} wants to join your plan`,
    requestIntro:
      "Someone opened your invite and asked to join. Only allow it if you know it's your partner.",
    requestEmail: (email: string) => `Signed in as ${email}`,
    requestAsked: (when: string) => `Asked at ${when}`,
    requestCanEdit:
      'If you allow it, they can see and change everything shared, and tick payments.',
    requestCanView: 'If you allow it, they can see everything shared, but not change it.',
    allow: 'Allow',
    dontAllow: "Don't allow",
    answering: 'Saving your answer.',
    allowed: (name: string) => `${name} has joined your plan.`,
    /** Allowed someone with a plan of their own, which their phone brings in (D426). */
    allowedBringing: (name: string) =>
      `${name} can join now. It finishes on ${name}'s phone, as soon as PrePenny is open there.`,
    notAllowed: (name: string) => `${name} wasn't let in. The invite can't be used again.`,
    answerRanOut: 'This invite has run out, so nobody can join with it. Make a new one.',
    answerHasAPlan: (name: string) =>
      `${name} is in another shared plan now, so they can't join yours.`,
    answerGone: 'This has been answered already.',
    gotIt: 'Got it',
    /** "Choose shared accounts" (PLAN.md items 26 and 34). */
    accountsTitle: 'Choose shared accounts',
    accountsPurpose:
      "Your partner sees each account you share: its balance and every payment in it. The ones you don't share stay private.",
    backToShare: 'Back to Share with my partner',
    accountsLegend: 'Which accounts do you want to share?',
    alreadyShared: 'Already shared',
    noPrivate: 'You have no private accounts left to share.',
    shareThese: 'Share these accounts',
    chooseOne: 'Tick at least one account to share.',
    confirmTitle: (names: string) => `Share ${names}?`,
    confirmIntro: (partner: string) =>
      `${partner} will see the balance and every payment in each one. Your savings goals, debts and job details stay private. You can make a shared account private again later.`,
    partnerFallback: 'Your partner',
    confirmYes: 'Yes, share',
    confirmNo: 'No, go back',
    sharing: 'Sharing.',
    sharedDone: (names: string) => `Shared: ${names}.`,
    shareTogether: (names: string) =>
      `Money moves between these and ${names}, which you're keeping private. Tick ${names} too, or leave them all private.`,
    shareHalves: (names: string) =>
      `${names} is kept as money from you in a shared account. Remove it first, share this account, then add it again.`,
    viewOnly: "You can view this plan only, so you can't share accounts in it.",
    waitingToSend:
      "Some changes on this phone haven't been sent to your account yet. Try again once they have.",
    /** The shared half of money between a private account and a shared one (D16, D52). */
    fromPerson: (name: string) => `From ${name}`,
    toPerson: (name: string) => `To ${name}`,
    /** In "From your partner" when this person hasn't given a name yet. */
    yourPartner: 'your partner',
    /** On a payment locked to someone else, such as "From Jess". */
    lockedTo: (name: string) =>
      `Only ${name} can change this. It's money between ${name}'s own account and this one.`,
    /** Shared pay someone else added (D418). */
    paidBy: (name: string) => `${name} added this as their pay.`,
    claim: 'This is my pay',
    claimLine: 'Then you can change it, and add overtime or a missed shift to it.',
    claimed: "It's your pay now.",
    claimHasDetails: (name: string) =>
      `${name} has overtime or job details on it, so it can't be made yours. Ask ${name} to take them off first.`,
  },

  /** The page an invite link opens (brief 4.14, step 3f). */
  join: {
    heading: 'Join a shared plan',
    purpose:
      'Someone has invited you to share their plan in PrePenny, so you can plan money together, each on your own phone.',
    signInFirst: 'Sign in or sign up to see the invite and ask to join.',
    signIn: 'Sign up or sign in',
    off: "Signing in isn't switched on here, so invites can't be used.",
    noLink: "There's no invite here. Open the link from your invite again.",
    loading: 'Looking at the invite.',
    couldNotLoad:
      "PrePenny couldn't reach its server, so the invite can't be shown. Try again in a minute.",
    tryAgain: 'Try again',
    invitedBy: (name: string) => `${name} has invited you to share their plan.`,
    canEdit: "You'll be able to see and change everything they share, and tick payments.",
    canView:
      "You'll be able to see everything they share, but not change it. You can still keep your own pay up to date.",
    privateLine: 'Accounts you add yourself stay private unless you choose to share them.',
    nameLabel: (name: string) => `Your name, as ${name} will see it`,
    seesEmail: (name: string) =>
      `${name} will see this name and the email address you signed in with, then choose whether to let you in.`,
    ask: 'Ask to join',
    asking: 'Asking.',
    waiting: (name: string) =>
      `Waiting for ${name} to allow it. Keep this page open, or come back later: the plan comes to this phone as soon as ${name} allows it.`,
    joined: (name: string) => `${name} let you in. Bringing the plan to this phone.`,
    goToPlan: 'Go to the plan',
    notAllowed: (name: string) =>
      `${name} didn't let you in, so you haven't joined. Ask ${name} for a new invite if this was a mistake.`,
    used: 'This invite has been used already. Each invite works once. Ask the person who sent it for a new one.',
    ranOut:
      'This invite has run out. Invites last 7 days. Ask the person who sent it for a new one.',
    cancelled: 'This invite was cancelled. Ask the person who sent it for a new one.',
    notFound: "This invite link doesn't work. Check you have the whole link, or ask for a new one.",
    yours: 'This is your own invite. Send it to your partner, so they can ask to join.',
    member: "You're already in this plan.",
    hasAPlan: (name: string) =>
      `You're already in a shared plan in PrePenny, so you can't join ${name}'s plan as well. PrePenny keeps one plan for each person.`,
    /** Joining with a plan of one's own (step 3f-2, D426). */
    bringsLine: (name: string) =>
      `You have a plan of your own, and it comes with you: your accounts and everything on them move into ${name}'s plan, private to you.`,
    bringsPrivate: (name: string) =>
      `${name} sees none of it until you choose to share an account. Nothing has to be typed again, and you'll have one plan: ${name}'s, with yours in it.`,
    /** When the two plans use different bank holidays: "England and Wales", "Scotland" or "Northern Ireland". */
    nationDiffers: (name: string, theirs: string, yours: string) =>
      `Bank holidays: ${name}'s plan uses ${theirs}, and yours uses ${yours}. Once you join, a payment set to move for a bank holiday follows ${theirs}, so it may move to a different day.`,
    notSavedYet:
      "Your plan on this phone hasn't been saved in your account yet. Stay online, then try again: it comes with you once it's saved.",
    saving: 'Saving your plan in your account first.',
    bringing: (name: string) => `${name} let you in. Bringing your plan into ${name}'s plan.`,
    letYouIn: (name: string) => `${name} let you in.`,
    bringAndJoin: 'Bring my plan and join',
    couldNotMove:
      "Your plan couldn't be moved, so nothing has changed: you're still in your own plan. Write to hello@prepenny.co.uk and we'll look into it.",
    notSentYet:
      "Some changes on this phone haven't been sent to your account yet. Stay online, then try again: your plan comes with you once they have.",
    someone: 'Your partner',
    full: (name: string) => `${name}'s plan already has two people in it, so nobody else can join.`,
    goHome: 'Go to my plan',
  },

  /** Two-step sign-in with an authenticator app (brief 4.13, step 3e). */
  twoStep: {
    heading: 'Two-step sign-in',
    purpose:
      "When it's on, signing in needs a code from an authenticator app on your phone as well as the code by email, so someone who gets into your email still can't get into PrePenny.",
    isOff: 'Two-step sign-in is off.',
    isOn: 'Two-step sign-in is on.',
    checking: 'Checking whether two-step sign-in is on.',
    turnOn: 'Turn on two-step sign-in',
    getApp:
      "1. Get an authenticator app from your phone's app store, if you haven't one already, such as Google Authenticator or Microsoft Authenticator.",
    addToApp: '2. Add PrePenny to it.',
    openApp: 'Add PrePenny to my authenticator app',
    openAppHint: 'Opens the authenticator app on this phone, with PrePenny ready to add.',
    orScan: 'Or, with the app on another phone, scan this picture with it:',
    qrAlt: 'A picture for an authenticator app to scan',
    orType: 'Or type this key into the app:',
    typeCode: '3. Type the 6-digit code the app now shows for PrePenny.',
    otherDevices:
      'Turning it on signs you out of your other phones and computers. Each needs a code from the app to sign in again.',
    finish: 'Turn on',
    starting: 'Getting PrePenny ready for your authenticator app.',
    turningOn: 'Turning on two-step sign-in.',
    turnedOn:
      'Two-step sign-in is on. From now on, signing in needs a code from your authenticator app.',
    turnOff: 'Turn off two-step sign-in',
    turnOffTitle: 'Turn off two-step sign-in',
    turnOffIntro:
      'Signing in will need only the code by email again. Type the code from your authenticator app to turn it off.',
    turnOffConfirm: 'Turn it off',
    turnOffKeep: 'Keep it on',
    turnedOff: 'Two-step sign-in is off.',
    lostApp:
      "If you lose the phone with your authenticator app, you can't sign in. Keep the key somewhere safe, or turn two-step sign-in off before you change phones.",
  },

  /** The email address you sign in with, and a backup (brief 4.13, step 3e). */
  emails: {
    heading: 'Email addresses',
    purpose:
      "The address you sign in with, and a backup address to get back in if you can't get into it.",
    signInHeading: 'Sign-in email',
    signInIs: (email: string) => `You sign in with ${email}.`,
    google: 'If you sign in with Google, this is the address PrePenny has for you.',
    change: 'Change email address',
    newLabel: 'New email address',
    newHint: 'We email a code to it, and another to the address you sign in with now.',
    newMissing: 'Type the new email address, for example sam@example.com.',
    sameAsNow: "That's the address you sign in with now. Type a different one.",
    sendCodes: 'Send the codes',
    sending: 'Sending the codes.',
    codesSent: (now: string, next: string) =>
      `We've sent a 6-digit code to ${now} and another to ${next}. Each lasts 10 minutes. Type both to change your address.`,
    currentCodeLabel: (email: string) => `Code sent to ${email}`,
    newCodeLabel: (email: string) => `Code sent to ${email}`,
    finishChange: 'Change email address',
    changing: 'Changing your email address.',
    changed: (email: string) => `Your sign-in email is now ${email}.`,
    cancel: 'Keep my address',
    inUse: 'That address is already used for another PrePenny account. Use a different one.',
    backupHeading: 'Backup email',
    backupNone:
      "You haven't added a backup email. It lets you get back in if you can't get into the address you sign in with.",
    backupIs: (email: string) => `Your backup email is ${email}.`,
    backupAdd: 'Add a backup email',
    backupChange: 'Change backup email',
    backupLabel: 'Backup email address',
    backupHint: "Use one only you can get into, that isn't the address you sign in with.",
    backupMissing: 'Type the backup email address, for example sam@example.com.',
    backupSameAsSignIn: "That's the address you sign in with. Use a different one for your backup.",
    backupSend: 'Send me a code',
    backupSending: 'Sending your code.',
    backupSent: (email: string) => `We've sent a 6-digit code to ${email}. It lasts 10 minutes.`,
    backupCodeLabel: '6-digit code',
    backupFinish: 'Add backup email',
    backupAdding: 'Adding your backup email.',
    backupAdded: (email: string) => `${email} is your backup email.`,
    backupInUse:
      "That address is already used for another PrePenny account, so it can't be your backup. Use a different one.",
    backupRemove: 'Remove backup email',
    backupRemoveTitle: 'Remove backup email',
    backupRemoveIntro:
      "You won't be able to use it to get back in. You can add another at any time.",
    backupRemoveCodeIntro:
      "You won't be able to use it to get back in. Type the code from your authenticator app to remove it.",
    backupRemoveYes: 'Yes, remove it',
    backupRemoveNo: 'No, keep it',
    backupRemoved: 'Your backup email is removed.',
    couldNotLoad:
      "PrePenny couldn't reach its server, so your addresses can't be shown. Try again in a minute.",
  },

  /**
   * Getting back in with the backup email, signed out (brief 4.13, step 3e),
   * with a 24-hour wait and a way to stop it (step 3e hardening).
   */
  getBackIn: {
    heading: 'Get back in with your backup email',
    purpose:
      "If you can't get into the email address you sign in with, use the backup email you added in PrePenny.",
    link: "Can't get into your email? Use your backup email",
    emailLabel: 'Backup email address',
    emailHint:
      "We'll email it a 6-digit code, if it's the backup for a PrePenny account. We can send 3 codes a day to one address.",
    emailMissing: 'Type your backup email address, for example sam@example.com.',
    send: 'Send me a code',
    sending: 'Sending your code.',
    sent: (email: string) =>
      `If ${email} is the backup for a PrePenny account, we've sent it a 6-digit code. It lasts 10 minutes.`,
    codeLabel: '6-digit code',
    codeHint:
      "It's in an email from PrePenny. If it isn't there, look in your junk or spam folder.",
    whatHappens:
      'For your safety, getting back in takes 24 hours. Your first code starts the wait, and we tell the address you sign in with now. After 24 hours, a new code finishes it.',
    /** Under the code box, once the 24 hours have passed. */
    finishWhatHappens:
      'Once you type it, your backup email becomes the address you sign in with. Every phone and computer signed in to your account is signed out, and any Google sign-in is removed.',
    useCode: 'Use this code',
    checking: 'Checking your code.',
    codeWrong:
      "That code doesn't match. Check the 6 numbers in the email from PrePenny, or tap Send a new code.",
    codeRanOut: "This code has run out. Tap Send a new code and we'll email you another.",
    newCodeNeeded:
      "It's been 24 hours, so you can finish now, with a new code. Tap Send a new code and we'll email you one to finish.",
    inUse:
      "That address now signs in to another PrePenny account, so it can't become yours. Write to hello@prepenny.co.uk and we'll help.",
    sendNew: 'Send a new code',
    otherEmail: 'Use a different email address',
    /** The wait, after the first code (step 3e hardening). */
    waitingHeading: "You've asked to get back in",
    waitingPurpose: 'For your safety, nothing changes on your account for 24 hours.',
    finishFrom: (when: string) => `You can finish from ${when}.`,
    finishNow: 'You can finish now.',
    thenWhat: (email: string) =>
      `Then come back to this page, and we'll send a new code to ${email} to finish. From then on, you sign in with ${email}.`,
    told: "We've told the address you sign in with now. If it wasn't you who asked, it can be stopped from there, or on any phone or computer signed in to your account.",
    sendFinishCode: 'Send me a code to finish',
    /** "2:05pm on Tue 10 Nov". */
    when: (time: string, day: string) => `${time} on ${day}`,
    signInNow:
      'Your backup email is now the address you sign in with. We sent a sign-in code to it. For your safety, any Google sign-in was removed: to use Google again, choose Continue with Google with a Google account that has this address.',
    noBackup:
      'No backup email? Write to hello@prepenny.co.uk from any address, and say which address you signed up with.',
    backToSignIn: 'Back to signing in',
  },

  /**
   * The notice on every signed-in device while someone is getting back in
   * with the backup email (step 3e hardening).
   */
  /** "Finish joining" on any screen, for someone let in whose plan is still to come (step 3f-2, D426). */
  joining: {
    heading: (name: string) => `${name} has let you into their plan`,
    line: 'Finish joining to bring your plan into it. It moves in one go, private to you.',
    finish: 'Finish joining',
  },

  /** The live app's old address, for a phone holding something not saved in an account yet (D428). */
  oldAddress: {
    line: "PrePenny's address is now prepenny.co.uk. This phone has a plan or changes that aren't saved in an account yet, so they stay here for now. Sign in from More and stay online until they're sent, then open prepenny.co.uk.",
  },

  getBackInNotice: {
    heading: 'Someone asked to get into your account',
    waiting: (when: string) =>
      `They used your backup email. Unless it's stopped, from ${when} they can sign in with it, and every phone and computer will be signed out.`,
    ready:
      "They used your backup email. Unless it's stopped, they can now sign in with it, and every phone and computer will be signed out.",
    whatToDo: "If it wasn't you, stop it now. If it was you, you don't need to do anything.",
    stop: 'Stop it',
    stopping: 'Stopping it.',
    stopped:
      "It's stopped. Nothing on your account changed, and we've told your backup email. If you don't know who has your backup email, change it: More, then Email addresses.",
    notStopped:
      "There was nothing to stop: it had already ended, or was just finishing. If you're signed out in the next minute, write to hello@prepenny.co.uk.",
    gotIt: 'Got it',
  },

  /** The page the stop link in the email opens (step 3e hardening). */
  stopGetBackIn: {
    heading: 'Stop someone getting into your account',
    purpose:
      "Someone asked to get into your PrePenny account with your backup email. If it wasn't you, stop it here.",
    stop: 'Stop it',
    stopping: 'Stopping it.',
    stoppedHeading: "It's stopped",
    stopped:
      "Nobody can use that request to get in, and this link doesn't work any more. We've told your backup email.",
    changeBackup:
      "If you don't know who has your backup email, sign in and change it: More, then Email addresses.",
    notStopped:
      "This link has been used already, or the request it was for has ended, so there's nothing to stop. If you think someone got into your account, write to hello@prepenny.co.uk.",
    noLink:
      'This page needs the whole link from the email. Open the link in the email from PrePenny again.',
    goToPrePenny: 'Go to PrePenny',
  },

  /** Signing in with two-step sign-in on (step 3e). */
  secondStep: {
    heading: 'Type the code from your authenticator app',
    purpose:
      'Two-step sign-in is on for this account. Open your authenticator app and type the 6-digit code it shows for PrePenny.',
    finish: 'Sign in',
    checking: 'Checking your code.',
  },

  /** The optional app lock: "Open with your PIN" (brief 4.13, D35, step 3e). */
  lock: {
    heading: 'App lock',
    purpose:
      'Ask for a PIN each time PrePenny opens, and after 5 minutes away, so nobody else can see your plan on this phone.',
    isOff: 'App lock is off.',
    isOn: 'App lock is on. PrePenny asks for your PIN when it opens, and after 5 minutes away.',
    turnOn: 'Turn on Open with your PIN',
    pinLabel: 'Choose a PIN',
    pinHint: '4 to 8 numbers. Only this phone keeps it, scrambled.',
    againLabel: 'Type it again',
    pinMissing: 'Type 4 to 8 numbers, for example 2580.',
    pinsDiffer: "The two PINs don't match. Type the same numbers in both.",
    finishOn: 'Turn on',
    turnedOn: 'App lock is on.',
    turnOff: 'Turn off app lock',
    turnOffTitle: 'Turn off app lock',
    turnOffIntro: 'Type your PIN to turn it off.',
    turnOffConfirm: 'Turn it off',
    turnedOff: 'App lock is off.',
    changePin: 'Change PIN',
    changeTitle: 'Change PIN',
    changeIntro: 'Type your PIN now, then the new one.',
    currentLabel: 'Your PIN now',
    newLabel: 'New PIN',
    finishChange: 'Change PIN',
    changed: 'Your PIN is changed.',
    preview:
      'When you switch apps, PrePenny covers your plan, but your phone may still show an older picture of it. Phone apps from the app stores will hide it fully.',
    /** The lock screen (D35: "Open with your PIN", never "unlock"). */
    screenHeading: 'Open with your PIN',
    screenPurpose: 'Type your PIN to see your plan.',
    screenLabel: 'PIN',
    open: 'Open',
    wrong: "That PIN doesn't match. Try again.",
    waitTries: (seconds: number) => `Too many tries. Wait ${seconds} seconds, then try again.`,
    forgot: 'Forgot your PIN?',
    forgotSignedIn:
      'Sign out to remove PrePenny from this phone, then sign in again. Your plan comes back from your account, and the lock is off.',
    forgotLocal:
      "Your plan is only on this phone, so removing PrePenny from this phone removes your plan too. If you have the PIN, it's kept as it is.",
    removeEverything: 'Remove everything from this phone',
    removeTitle: 'Remove everything from this phone',
    removeIntro:
      "Your plan, and everything else PrePenny keeps on this phone, goes for good. This can't be undone.",
    removeYes: 'Yes, remove everything',
    removeNo: 'No, go back',
    covered: 'PrePenny is hidden while you are away.',
  },

  /** Living together (step 3g): "Changed by Tom", Activity, roles, and who sees what. */
  together: {
    /** On a payment (brief 4.14): "Changed by Tom, 2 hours ago". */
    /** Inside a sentence, someone whose account has been deleted (D482). */
    someoneWhoLeft: 'someone who has left',
    changedBy: (who: string, when: string) => `Changed by ${who}, ${when}`,
    addedBy: (who: string, when: string) => `Added by ${who}, ${when}`,
    sharedBy: (who: string, when: string) => `Shared by ${who}, ${when}`,
    you: 'you',
    yourPartner: 'your partner',
    justNow: 'just now',
    minutesAgo: (count: number) => (count === 1 ? '1 minute ago' : `${count} minutes ago`),
    hoursAgo: (count: number) => (count === 1 ? '1 hour ago' : `${count} hours ago`),
    yesterday: 'yesterday',

    /** Activity, under More (brief 4.12, 4.14). */
    activityLink: 'Activity',
    activityLine: 'Every change, and undo for your own',
    heading: 'Activity',
    purpose: 'Every change to your plan, newest first. You can undo your own.',
    purposeShared: (partner: string) =>
      `Every change you and ${partner} made, newest first. You can undo your own changes, but not ${partner}'s.`,
    back: 'Back to More',
    signInFirst:
      'Activity shows the changes saved in your account. Sign in first, so your plan is kept there.',
    signIn: 'Sign up or sign in',
    onExample: 'This is the example plan, which has no Activity. Go back to your own plan first.',
    loading: 'Finding the changes.',
    couldNotLoad:
      "PrePenny couldn't reach its server, so the changes can't be shown. Try again in a minute.",
    offline: "You're offline. Connect to the internet to see Activity.",
    tryAgain: 'Try again',
    empty: 'No changes yet.',
    today: 'Today',
    yesterdayHeading: 'Yesterday',
    /** One change: "Tom changed Rent on Tue 1 Dec to £560.", with the time under it. */
    sentence: (who: string, what: string) => `${who} ${what}.`,
    You: 'You',
    YourPartner: 'Your partner',
    /** Someone whose account has been deleted (D482): their changes stay, with no name. */
    SomeoneWhoLeft: 'Someone who has left',
    /** "Someone left the plan.", for someone who left and then deleted their account (D482). */
    someoneLeft: 'Someone left the plan.',
    at: (time: string) => `At ${time}`,
    undone: 'Undone',
    undo: 'Undo this change',
    undoing: 'Undoing the change.',
    undoneDone: 'Change undone.',
    undoChangedSince:
      "This can't be undone, because something it changed has been changed again since.",
    undoViewOnly: "You can look at this plan but not change it, so this can't be undone.",
    undoProblem:
      "PrePenny couldn't reach its server, so nothing was undone. Try again in a minute.",
    undoWaiting:
      "Some changes on this phone haven't been sent to your account yet. Try again once they have.",
    showOlder: 'Show older changes',
    showingOlder: 'Finding older changes.',

    /** What a change did, after who made it. */
    what: {
      markedPaid: (name: string, date: string) => `marked ${name} on ${date} as paid`,
      markedArrived: (name: string, date: string) => `marked ${name} on ${date} as arrived`,
      markedNotPaid: (name: string, date: string) => `marked ${name} on ${date} as not paid`,
      markedNotArrived: (name: string, date: string) => `marked ${name} on ${date} as not arrived`,
      ticked: (count: number) => (count === 1 ? 'ticked 1 payment' : `ticked ${count} payments`),
      changedOneTo: (name: string, date: string, amount: string) =>
        `changed ${name} on ${date} to ${amount}`,
      changedOneFromTo: (name: string, date: string, from: string, to: string) =>
        `changed ${name} on ${date} from ${from} to ${to}`,
      changedOne: (name: string, date: string) => `changed ${name} on ${date}`,
      movedOne: (name: string, date: string, to: string) => `moved ${name} on ${date} to ${to}`,
      removedOne: (name: string, date: string) => `removed ${name} on ${date}`,
      changedLaterTo: (name: string, amount: string, from: string) =>
        `changed ${name} to ${amount} from ${from}`,
      changedLater: (name: string, from: string) => `changed ${name} from ${from}`,
      changedAllTo: (name: string, amount: string) => `changed ${name} to ${amount}`,
      changedLaterFromTo: (name: string, from: string, to: string, date: string) =>
        `changed ${name} from ${from} to ${to}, starting ${date}`,
      changedAllFromTo: (name: string, from: string, to: string) =>
        `changed ${name} from ${from} to ${to}`,
      removedLater: (name: string) => `removed ${name} for this and all later ones`,
      addedOnce: (name: string, amount: string, date: string) =>
        `added ${name}, ${amount} on ${date}`,
      addedFrom: (name: string, amount: string, date: string) =>
        `added ${name}, ${amount} from ${date}`,
      removed: (name: string) => `removed ${name}`,
      balance: (account: string, amount: string) => `updated the ${account} balance to ${amount}`,
      balanceTicked: (account: string, amount: string, count: number) =>
        count === 1
          ? `updated the ${account} balance to ${amount}, and ticked 1 payment`
          : `updated the ${account} balance to ${amount}, and ticked ${count} payments`,
      spent: (amount: string, budget: string) => `spent ${amount} on ${budget}`,
      changedSpend: (budget: string, amount: string) => `changed a spend on ${budget} to ${amount}`,
      changedSpendFromTo: (budget: string, from: string, to: string) =>
        `changed a spend on ${budget} from ${from} to ${to}`,
      budgetFromTo: (name: string, from: string, to: string) =>
        `changed the budget ${name} from ${from} to ${to}`,
      removedSpend: (amount: string, budget: string) => `removed a spend of ${amount} on ${budget}`,
      added: (thing: string) => `added ${thing}`,
      changed: (thing: string) => `changed ${thing}`,
      closed: (thing: string) => `closed ${thing}`,
      ended: (thing: string) => `ended ${thing}`,
      account: (name: string) => `the account ${name}`,
      debt: (name: string) => `the debt ${name}`,
      goal: (name: string) => `the savings goal ${name}`,
      budget: (name: string) => `the budget ${name}`,
      statement: (name: string) => `updated ${name} from its statement`,
      overtime: (date: string) => `added overtime worked on ${date}`,
      missedShift: (date: string) => `added a missed shift on ${date}`,
      removedShift: 'removed overtime or a missed shift',
      theirPay: 'changed their pay for overtime or a missed shift',
      nation: (where: string) => `changed the bank holidays to ${where}`,
      job: 'changed job details',
      mainPay: 'chose which pay is the main pay',
      sharedAccounts: (names: string) => `shared ${names}`,
      sharedRecord: (thing: string) => `shared ${thing}`,
      madePrivate: (thing: string) => `made ${thing} private`,
      madeSomethingPrivate: (kind: string) =>
        `made a shared ${kind} private, so you no longer see it`,
      claimedMine: (name: string) => `said ${name} is your pay`,
      claimedTheirs: (name: string) => `said ${name} is their pay`,
      role: (whose: string, role: string) => `changed what ${whose} can do to ${role}`,
      undid: (names: string) => `undid a change to ${names}`,
      undidSomething: 'undid a change',
      changedNames: (names: string) => `changed ${names}`,
      madeAChange: 'made a change',
      /** Leaving (D468): in the plan left, and in the leaver's new plan. */
      left: 'left the plan',
      leftOwn: 'left the shared plan',
      leftOwnCopy: 'left the shared plan, and took a copy of the shared accounts',
      kinds: { account: 'account', debt: 'debt', goal: 'savings goal' } as Record<string, string>,
    },

    /** Roles (brief 4.14, D461), on Share with my partner. */
    youCanEdit: 'You can see and change everything shared.',
    youCanView: (owner: string) =>
      `You can see everything shared, but change nothing. Only ${owner} can change that.`,
    changeRole: (name: string) => `Change what ${name} can do`,
    roleTitle: (name: string) => `Change what ${name} can do`,
    roleIntro: (name: string) =>
      `${name}'s phone follows the change straight away. Either of you can still keep your own pay up to date.`,
    roleLegend: (name: string) => `What can ${name} do?`,
    saveRole: 'Save',
    savingRole: 'Saving.',
    roleSavedEdit: (name: string) => `${name} can edit now.`,
    roleSavedView: (name: string) => `${name} can view only now.`,
    roleProblem: "PrePenny couldn't reach its server, so nothing changed. Try again in a minute.",
    roleOffline: "You're offline. Connect to the internet to change this.",
    close: 'Close',

    /** Making a shared account private again (D462), on Choose shared accounts. */
    sharedHeading: 'Shared accounts',
    sharedLine: (partner: string) => `${partner} sees these, and everything in them.`,
    makePrivate: (name: string) => `Make ${name} private again`,
    onlyTheyCan: (name: string) => `Only ${name} can make this private again, as they shared it.`,
    privateTitle: (name: string) => `Make ${name} private?`,
    privateIntro: (name: string, partner: string) =>
      `${partner} will no longer see ${name} or anything in it, and its changes leave ${partner}'s Activity. You can share it again later.`,
    privateYes: 'Yes, make it private',
    privateNo: 'No, keep it shared',
    makingPrivate: 'Making it private.',
    privateDone: (name: string) => `${name} is private now. Only you see it.`,
    partnerThings: (partner: string, account: string, names: string) =>
      `${partner} has payments of their own in ${account}: ${names}. While they're there, it stays shared. ${partner} can remove them or move them to an account of their own.`,
    partnerThingsUnnamed: (partner: string, account: string) =>
      `${partner} has things of their own in ${account}, so it stays shared for now.`,
    goalHere: (names: string, account: string) =>
      `${names} is a shared savings goal kept in ${account}. Make the goal private first, or keep ${account} shared.`,
    moveTogether: (account: string, names: string) =>
      `Money moves between ${account} and ${names}, which stays shared. Remove those payments first, or keep ${account} shared.`,
    hasHalves: (names: string, account: string) =>
      `${names} is money from your own account into ${account}. Remove it first, make ${account} private, then add it again.`,
    notYours: (owner: string, name: string) =>
      `Only ${owner} can make ${name} private, as they shared it.`,
    privacyProblem:
      "PrePenny couldn't reach its server, so nothing changed. Try again in a minute.",

    /** Debts and savings goals, shared or one person's (D65, D463). */
    whoSeesHeading: 'Who sees it',
    sharedWith: (partner: string) => `Shared with ${partner}`,
    sharedByThem: (owner: string) => `Shared by ${owner}. Only ${owner} can make it private.`,
    onlyYou: 'Only you see this',
    shareDebt: (partner: string) => `Share this debt with ${partner}`,
    shareGoal: (partner: string) => `Share this goal with ${partner}`,
    makeItPrivate: 'Make it private',
    goalStaysPrivate: (account: string) =>
      `It's kept in ${account}, which only you see, so it stays private.`,
    shareDebtTitle: (name: string, partner: string) => `Share ${name} with ${partner}?`,
    shareDebtIntro: (name: string, partner: string) =>
      `${partner} will see ${name}, what's left on it and when it's paid off. You can make it private again later.`,
    shareGoalTitle: (name: string, partner: string) => `Share ${name} with ${partner}?`,
    shareGoalIntro: (name: string, partner: string) =>
      `${partner} will see ${name}, what's saved and when it's reached, and can put money into it. You can make it private again later.`,
    shareYes: 'Yes, share it',
    shareNo: 'No, keep it private',
    recordPrivateTitle: (name: string) => `Make ${name} private?`,
    debtPrivateIntro: (name: string, partner: string) =>
      `${partner} will no longer see ${name} or what's left on it. Payments to it from shared accounts still show, without the debt.`,
    goalPrivateIntro: (name: string, partner: string) =>
      `${partner} will no longer see ${name} or what's saved. Money into it from shared accounts still shows, without the goal.`,
    sharing: 'Sharing.',
    sharedDone: (name: string) => `${name} is shared now.`,
    recordPartnerThings: (partner: string, name: string) =>
      `${partner} puts money towards ${name}, so it stays shared. ${partner} can remove those payments first.`,
    viewOnlyShare: "You can view this plan only, so you can't share anything in it.",
    goalInPrivateAccount: (account: string) =>
      `It's kept in ${account}, which only you see. Share ${account} first, or keep the goal private.`,

    /** What each person has put into a shared goal (brief 4.14, D114, D465). */
    putInHeading: 'What each of you has put in',
    putInLine: 'Saved so far, by where the money came from.',
    putInYou: 'You',
    putInFrom: (account: string) => `From ${account}`,
    putInStart: 'Already saved when it was made',
    putInOther: 'Other money in',
    putInOut: 'Taken out',

    /** A payment's history, in its edit sheet (D469): "Tom changed it from £550.00 to £560.00, Tue 10 Nov, 2:05pm". */
    history: {
      heading: 'History',
      intro: 'Every change to this payment, newest first, and who made it.',
      show: 'Show its history',
      hide: 'Hide its history',
      loading: 'Finding its history.',
      empty: 'No changes to this payment yet.',
      problem:
        "PrePenny couldn't reach its server, so the history can't be shown. Try again in a minute.",
      offline: "You're offline. Connect to the internet to see its history.",
      line: (who: string, what: string, day: string, time: string) =>
        `${who} ${what}, ${day}, ${time}`,
      undone: 'Undone since',
      added: 'added it',
      changedFromTo: (from: string, to: string) => `changed it from ${from} to ${to}`,
      changedTo: (to: string) => `changed it to ${to}`,
      moved: (date: string) => `moved it to ${date}`,
      removed: 'removed it',
      putBack: 'put it back',
      renamed: (name: string) => `renamed it ${name}`,
      note: 'changed its note',
      changed: 'changed it',
      markedPaid: 'marked it as paid',
      markedArrived: 'marked it as arrived',
      markedNotPaid: 'marked it as not paid',
      markedNotArrived: 'marked it as not arrived',
      laterFromTo: (from: string, to: string) =>
        `changed this one and all later ones from ${from} to ${to}`,
      laterChanged: 'changed this one and all later ones',
      laterRemoved: 'removed this one and all later ones',
      undid: 'undid a change to it',
    },

    /** Leaving a shared plan (brief 4.14, D468), from Share with my partner. */
    leave: {
      link: 'Leave this plan',
      linkLine: (partner: string) =>
        `Stop sharing with ${partner}, and take your own things with you`,
      heading: 'Leave this plan',
      purpose: (partner: string) =>
        `Stop sharing a plan with ${partner}. Your own things come with you into a plan of your own. Nobody has to agree.`,
      back: 'Back to Share with my partner',
      comesHeading: 'What comes with you',
      comes:
        'Everything only you see: your own accounts, payments, debts, savings goals and job details, with their history.',
      staysHeading: (partner: string) => `What stays with ${partner}`,
      staysShared: 'Every shared account, with everything in it, as it is now.',
      staysChanges: (partner: string) =>
        `Your changes to shared things stay in ${partner}'s Activity, with your name.`,
      staysMoney: (partner: string) =>
        `Money you put into a shared account, and your pay into one, stay there as amounts ${partner} can change.`,
      ownerPasses: (partner: string) => `${partner} will own the plan once you've left.`,
      copyLegend: 'Take a copy of the shared accounts?',
      copyYes: 'Yes, take a copy',
      copyYesHint: (partner: string) =>
        `Each shared account as it is today, with its payments, just for you. It won't change when ${partner} changes something.`,
      copyNo: 'No, just my own things',
      copyError: 'Choose whether to take a copy of the shared accounts.',
      goalComes: (goal: string, account: string) =>
        `${goal} saves into ${account}, so a copy of ${account} comes with you either way.`,
      leave: 'Leave this plan',
      stay: 'Stay in the plan',
      confirmTitle: 'Leave this plan?',
      confirmIntro: (partner: string) =>
        `You'll stop seeing the shared accounts, and ${partner} will stop seeing anything of yours. This can't be undone, but ${partner} can invite you again.`,
      confirmYes: 'Yes, leave',
      confirmNo: 'No, stay',
      leaving: 'Leaving the plan.',
      done: 'Your own things are in a plan of your own now.',
      doneCopy:
        'Your own things are in a plan of your own now, with a copy of the shared accounts as they were today.',
      doneNoCopy:
        "Your own things are in a plan of your own now. The copy of the shared accounts couldn't be made, so it didn't come with you.",
      doneNote: (words: string) => `You've left the plan. ${words}`,
      gotIt: 'Got it',
      offline: "You're offline. Connect to the internet to leave the plan.",
      problem:
        "PrePenny couldn't reach its server, so you're still in the plan. Try again in a minute.",
      alone: "Nobody else is in this plan now, so there's nothing to leave.",
      waiting:
        "Some changes on this phone haven't been sent to your account yet. Try again once they have.",
    },
  },

  /**
   * Download my data, import a backup and delete my account (brief 4.12,
   * 4.13, 7.2, step 3h).
   */
  yourData: {
    /** The card on More. */
    heading: 'Your data',
    purpose: 'Keep a copy of your plan, bring one back, or delete everything.',
    download: 'Download my data',
    downloadLine: 'Your plan as a spreadsheet and as a backup file',
    import: 'Import a backup',
    importLine: 'Put a backup file in place of your plan',
    delete: 'Delete my account and all my data',
    deleteLine: 'Delete your account and everything in it for good',
    deleteLineHere: 'Remove your plan and everything else from this phone',
    backToMore: 'Back to More',

    /** Download my data. */
    downloadPurpose:
      'Save a copy of everything PrePenny keeps for you, to keep or to look at in a spreadsheet.',
    spreadsheetHeading: 'A spreadsheet file (CSV)',
    spreadsheetLine:
      "Opens in Excel, Numbers or Google Sheets. It has your accounts, payments, debts, budgets, spending and goals, the next 12 months with what's left after each payment, and your history.",
    downloadSpreadsheet: 'Download the spreadsheet',
    backupHeading: 'A backup file (JSON)',
    backupLine:
      'Everything in your plan, in a file PrePenny can read back with Import a backup on any phone.',
    downloadBackup: 'Download the backup',
    whatsInHeading: "What's in the files",
    whatsInPlan:
      'Your plan: every account, payment, debt, budget, spend and savings goal, and your job details.',
    whatsInAccount:
      'Your account: the email addresses you sign in with and get back in with, your signed-in devices, and every change in Activity.',
    whatsInShared: (name: string) =>
      `Everything shared with ${name}, and everything of your own. Nothing that only ${name} sees.`,
    whatsInHere: "You're not signed in, so the files have the plan on this phone.",
    keepSafe:
      "The files aren't locked. Keep them somewhere only you can open, as you would a bank statement.",
    noPlan: "You haven't made a plan of your own yet, so there's nothing to download.",
    preparing: 'Getting your data ready.',
    saved: (file: string) => `Saved as ${file}. Look in your phone's downloads.`,
    planOnly:
      "Your account and its history couldn't be fetched, so the file has your plan only. Try again with a signal to download everything.",
    /** The first line of the spreadsheet. */
    csvTitle: (when: string) => `PrePenny: your data, downloaded at ${when}`,
    /** The sentence at the top of the backup file, for anyone who opens it. */
    backupAbout:
      'A backup of a PrePenny plan. To use it, open PrePenny, then More, then Import a backup.',

    /** The spreadsheet's parts and columns. */
    csv: {
      account: 'Your account',
      email: 'Email address',
      signedUp: 'Signed up',
      name: 'Name your partner sees',
      backupEmail: 'Backup email',
      twoStep: 'Two-step sign-in',
      google: 'Continue with Google',
      devices: 'Signed-in devices',
      device: 'Device',
      signedIn: 'Signed in',
      lastUsed: 'Last used',
      thisDevice: 'This device',
      people: "Who's in the plan",
      person: 'Name',
      role: 'Can',
      roles: { owner: 'Owner', editor: 'Can edit', viewer: 'Can view only' } as Record<
        string,
        string
      >,
      you: 'You',
      accounts: 'Accounts',
      accountName: 'Account',
      kind: 'Kind',
      bankShowed: 'Your bank showed (£)',
      checkedOn: 'Checked on',
      overdraft: 'Overdraft limit (£)',
      warnUnder: 'Warn me under (£)',
      closed: 'Closed',
      payments: 'Payments',
      paymentName: 'Name',
      inOrOut: 'Coming in or going out',
      directions: {
        in: 'Coming in',
        out: 'Going out',
        transfer: 'Moving between accounts',
      } as Record<string, string>,
      toAccount: 'To account',
      amount: 'Amount (£)',
      pattern: 'Pay pattern (£)',
      howOften: 'How often',
      first: 'First payment',
      ends: 'Ends',
      endsNever: 'Never',
      endsAfter: (count: number) => (count === 1 ? 'After 1 payment' : `After ${count} payments`),
      endsOn: (date: string) => `On ${date}`,
      lastAmount: 'Last payment (£)',
      type: 'Type',
      estimate: 'Estimate',
      debt: 'Debt',
      goal: 'Savings goal',
      note: 'Note',
      comingUp: 'Coming up in the next 12 months',
      date: 'Date',
      leftAfter: 'Left after this (£)',
      ticked: 'Ticked',
      notTickedYet: 'Not ticked yet',
      changes: 'Changes to one payment',
      originalDate: 'Its date before',
      newDate: 'Moved to',
      newAmount: 'New amount (£)',
      newName: 'New name',
      skipped: 'Skipped',
      ticks: 'Ticked payments',
      paidOn: 'Paid on',
      tickedAt: 'Ticked at',
      balances: 'Balance updates',
      balance: 'Your bank showed (£)',
      checkedAt: 'Updated at',
      debts: 'Debts',
      debtName: 'Debt',
      currency: 'Currency',
      rate: 'Rate (per £1)',
      owed: 'Owed',
      owedOn: 'On',
      startedAt: 'Started at',
      interest: 'Interest rate (%)',
      budgets: 'Budgets',
      budgetName: 'Budget',
      every: 'Every',
      everyWords: { week: 'Week', month: 'Month' } as Record<string, string>,
      leaves: 'Leaves the account',
      leavesWords: {
        'at-start': 'All at the start',
        spread: 'Spread across the days',
        'pay-later': 'As a pay-later bill',
      } as Record<string, string>,
      startsOn: 'Starts',
      endsOnHeading: 'Ends',
      spends: 'What you spent',
      spentOn: 'Spent on',
      goals: 'Savings goals',
      goalName: 'Goal',
      target: 'Target (£)',
      targetDate: 'By',
      startingAmount: 'Already saved when made (£)',
      jobs: 'Your job',
      jobName: 'Job',
      frequency: 'Paid',
      frequencies: {
        weekly: 'Weekly',
        'two-weekly': 'Every 2 weeks',
        'four-weekly': 'Every 4 weeks',
        monthly: 'Monthly',
      } as Record<string, string>,
      taxCode: 'Tax code',
      overtimeRate: 'Overtime rate (£)',
      shifts: 'Overtime and missed shifts',
      shiftKind: 'What happened',
      shiftKinds: { overtime: 'Overtime', 'missed-shift': 'Missed shift' } as Record<
        string,
        string
      >,
      workedOn: 'Worked on',
      hours: 'Hours',
      change: 'Change to pay (£)',
      history: 'History',
      when: 'When',
      whatHappened: 'What happened',
      undone: 'Undone',
      yes: 'Yes',
      no: 'No',
    },

    /** Import a backup. */
    importPurpose: 'Put a backup file from Download my data in place of your plan.',
    whatHappensHeading: 'What happens',
    replacesPlan:
      'The plan in the backup takes the place of your plan now, on this phone and in your account. Its Activity starts again.',
    replacesPlanHere: 'The plan in the backup takes the place of your plan on this phone.',
    becomesPlan: 'The plan in the backup becomes your plan.',
    downloadFirst: 'Download your data first if you want to keep your plan as it is now.',
    sharedNoImport: (name: string) =>
      `You share a plan with ${name}, so a backup can't go in. A backup only ever goes into a plan of your own, so nothing in it can reach ${name}. To use it, leave the shared plan first.`,
    goToShare: 'Go to Share with my partner',
    chooseFile: 'Choose a backup file',
    chooseFileHint: 'The file from Download my data, ending in .json.',
    checking: 'Checking the file.',
    confirmTitle: 'Import this backup?',
    madeOn: (date: string) => `It was made on ${date}.`,
    holds: (accounts: number, payments: number, debts: number, goals: number) =>
      `It has ${count(accounts, 'account', 'accounts')}, ${count(payments, 'payment', 'payments')}, ${count(debts, 'debt', 'debts')} and ${count(goals, 'savings goal', 'savings goals')}.`,
    replaceWarning: "Your plan now will be replaced. It can't be brought back.",
    confirmReplace: 'Yes, replace my plan',
    confirmImport: 'Yes, import it',
    keepPlan: 'No, keep my plan',
    importing: 'Importing the backup.',
    imported: 'Your backup is in. Your plan is now the one from the backup.',
    goHome: 'Go to Home',
    problems: {
      'too-big':
        'This file is too big to be a PrePenny backup. Choose the file from Download my data.',
      empty: 'This file is empty. Choose the backup file from Download my data.',
      'not-json':
        "This isn't a PrePenny backup. Choose the file ending in .json from Download my data.",
      'not-a-backup':
        "This isn't a PrePenny backup. Choose the file ending in .json from Download my data.",
      newer: 'This backup is from a newer version of PrePenny. Update PrePenny, then try again.',
      'too-many': 'This backup has more in it than PrePenny can take, so nothing was imported.',
      'bad-record':
        "Part of this backup isn't as PrePenny wrote it, so nothing was imported. Choose a backup that hasn't been changed.",
      'broken-link':
        "Part of this backup isn't as PrePenny wrote it, so nothing was imported. Choose a backup that hasn't been changed.",
      'cant-work-out': "PrePenny can't work out a plan from this backup, so nothing was imported.",
      unreadable: "PrePenny couldn't read this file. Choose it again.",
      offline: "You're offline. Connect to the internet to import a backup into your account.",
      'has-a-plan':
        "Your account has a saved plan this phone hasn't brought down yet. Open Home, then try again.",
      server: "PrePenny couldn't import the backup. Nothing has changed. Try again in a minute.",
    } as Record<string, string>,

    /** Delete my account. */
    deleteHeading: 'Delete my account',
    deletePurpose: 'Delete your account and everything in it, for good.',
    whatGoesHeading: "What's deleted",
    whatGoesPlan:
      'Your plan, with every account, payment, debt, budget and savings goal, and its history.',
    whatGoesAccount:
      'Your signed-in devices, your backup email, your two-step sign-in and your sign-in itself.',
    cantUndo: "It can't be undone. Download your data first if you want a copy.",
    whenGoneHeading: "When it's gone",
    whenGone:
      "It's deleted from PrePenny straight away. Copies in PrePenny's backups, and in the records of the services that run it, are gone within 30 days.",
    sharedHeading: 'Your shared plan',
    sharedWhat: (name: string) =>
      `You share a plan with ${name}. Deleting your account takes you out of it first, as Leave this plan does: every shared account stays with ${name} as it is, and everything only you see is deleted.`,
    sharedHistory: (name: string) =>
      `Your changes stay in ${name}'s Activity and History, as made by "Someone who has left". Your name, email address and account go.`,
    checkHeading: "Check it's you",
    checkLine: (email: string) =>
      `To delete your account, sign in again first. PrePenny sends a 6-digit code to ${email}.`,
    sendCode: 'Send me a code',
    sendingCode: 'Sending the code.',
    codeSent: (email: string) => `We've sent a 6-digit code to ${email}. It lasts 10 minutes.`,
    emailCodeLabel: 'Code from the email',
    confirmLabel: 'Type delete to confirm',
    confirmHint: "This can't be undone.",
    confirmMissing: 'Type delete to confirm, or go back to keep your account.',
    deleteButton: 'Delete my account and all my data',
    keepAccount: 'Keep my account',
    deleting: 'Deleting your account.',
    signInAgain: 'The check has run out. Send a new code, then try again.',
    notSignedIn: "You're not signed in, so your plan is kept only on this phone.",
    removeHere: 'Remove everything from this phone',
    removeTitle: 'Remove everything from this phone?',
    removeIntro:
      "Your plan and everything else PrePenny keeps on this phone go for good. It can't be undone.",
    removeConfirm: 'Yes, remove everything',
    removeKeep: 'No, keep it',
    haveAccount: 'Have an account? Sign in first to delete it.',
    signIn: 'Sign in',
    /** On the welcome, afterwards. */
    deleted:
      'Your account and all your data have been deleted, and nothing of yours is left on this phone. An email is on its way to say so.',
    deletedElsewhere: 'This account has been deleted, so nothing of it is left on this phone.',
    removed: 'Everything PrePenny kept on this phone has been removed.',
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
    /** What it's for, in one plain sentence (D213, step 2h). */
    purpose: 'The address may be mistyped, or the page has moved. Your plan is safe on this phone.',
    goHome: 'Go to Home',
  },
} as const;
