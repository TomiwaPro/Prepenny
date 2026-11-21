// The support dashboard's words (step 4j, D617 to D625, D641), apart from
// the app's (strings/en-GB.ts), so none of them are in the app: the
// dashboard is its own site, at admin.prepenny.co.uk, and only it uses
// these. They follow docs/VOICE.md as every word does (scripts/check-voice.ts
// reads this file too).

export const supportStrings = {
  /**
   * The support dashboard's views (step 4j, brief 4.16, D617 to D623): the
   * inbox, a message and its reply, an account, the plan someone let
   * support see, usage and the tax year check.
   */
  supportTools: {
    heading: 'Support',
    purpose:
      'Messages and ideas people sent to PrePenny, and the tools to help them. Only PrePenny support can open this dashboard.',
    loading: 'Getting the support inbox.',
    couldNotLoad: "PrePenny couldn't reach its server. Try again in a minute.",
    offline: "You're offline. Connect to the internet to use the support dashboard.",
    tryAgain: 'Try again',
    /** "2:05pm on Fri 20 Nov". */
    at: (time: string, day: string) => `${time} on ${day}`,

    /** The tax year check (brief 4.15, D45, D625). */
    taxYearHeading: 'Tax files',
    taxYearFine: 'The pay calculator has the tax file for every tax year it needs now.',
    taxYearMissing: (year: string, starts: string) =>
      `The pay calculator has no tax file for the ${year} tax year, which starts on ${starts}. Ask Claude Code to add it (step 4r) before then.`,

    /** The inbox. */
    inboxHeading: 'Inbox',
    inboxLine: (waiting: number) =>
      waiting === 0
        ? 'Newest first. Nothing is waiting for a reply.'
        : waiting === 1
          ? 'Newest first. 1 message is waiting for a reply.'
          : `Newest first. ${waiting} messages are waiting for a reply.`,
    empty: 'No messages yet.',
    kinds: {
      contact: 'Contact us',
      problem: 'Something looks wrong',
      idea: 'Suggest a feature',
    } as Record<string, string>,
    waitingReply: 'Waiting for a reply',
    replied: 'Replied',
    ideaStatus: 'An idea',
    showOlder: 'Show older messages',
    showingOlder: 'Finding older messages.',

    /** Finding an account. */
    findHeading: 'Find an account',
    findLine: 'Type the address they sign in with, or their backup email.',
    findLabel: 'Email address',
    findMissing: 'Type an email address, for example sam@example.com.',
    find: 'Find',
    finding: 'Finding the account.',
    notFound: 'No account signs in with that address or has it as its backup email.',

    /** PrePenny's status, at the top of the dashboard (step 4k, D644): the status page's four parts. */
    statusHeading: "PrePenny's status",
    statusLine:
      "The same checks as the status page, made now. None of them uses anyone's account or data.",
    statusParts: {
      app: 'The app',
      'sign-in': 'Signing in',
      saving: 'Saving changes',
      reminders: 'Reminders',
    },
    working: 'Working',
    notWorking: 'Not working',
    checking: 'Checking.',
    checkedAt: (time: string) => `Checked at ${time}.`,
    noAnswer:
      "PrePenny's server didn't answer, so nothing could be checked. Signing in, saving changes and reminders may all be down.",
    checkAgain: 'Check again',
    statusPage: 'Open the status page',
    statusPageOpens: 'Opens the status page',

    /** Usage, counts only (D623). */
    usageHeading: 'Usage',
    usageLine:
      'Counts only: never names, addresses or money. Opened means signed in on a phone or computer that used PrePenny then.',
    signUpsCaption: 'Sign-ups by week',
    weekOf: (day: string) => `Week starting ${day}`,
    opened7: 'Opened PrePenny in the last 7 days',
    opened30: 'Opened PrePenny in the last 30 days',
    sharedPlans: 'Shared plans',
    remindersOn: 'People with reminders on',
    waitingCount: 'Messages waiting for a reply',

    /** One message. */
    backToInbox: 'Back to the inbox',
    messagePurpose:
      'One message, with everything that came with it. Your reply is emailed from hello@prepenny.co.uk.',
    sentAt: (when: string) => `Sent at ${when}`,
    fromSignedIn: (email: string) => `From ${email}, signed in`,
    fromChecked: (email: string) => `From ${email}, checked with a code`,
    onScreen: (screen: string) => `On the screen: ${screen}`,
    phone: (phone: string) => `Phone: ${phone}`,
    version: (version: string) => `PrePenny version: ${version}`,
    answerBy: (day: string) => `The automatic reply said by the end of ${day}.`,
    wroteHeading: 'What they wrote',
    pictureHeading: 'Their screenshot',
    pictureAlt: 'The screenshot they sent',
    pictureFacts: (width: number, height: number, gone: string) =>
      `${width} by ${height}. It's deleted at ${gone}, 30 days after it was sent.`,
    planHeading: 'Their plan copy',
    planFacts: (gone: string) => `It's deleted at ${gone}, 30 days after it was sent.`,
    readPlan: 'Read the plan copy',
    readingFile: 'Getting the file.',
    fileGone: (day: string) => `What they added was deleted on ${day}, 30 days after it was sent.`,
    notAPlan: "That file can't be read as a plan. It may be from a newer version of PrePenny.",
    openAccount: 'Open their account',
    findTheirAccount: 'Find their account',
    repliesHeading: 'Replies',
    noReply: 'No reply yet.',
    replyHeading: 'Reply',
    readyLegend: 'Start from a ready reply?',
    readyNone: 'No, write my own',
    replyLabel: 'Your reply',
    replyHint:
      "Each line is a paragraph. Never write an amount, a payment name or a note: Resend keeps emails for 30 days. The email doesn't repeat what they wrote.",
    replyMissing: 'Type your reply, or start from a ready reply.',
    replyTooLong: (count: string) => `Make it 5,000 characters or fewer. It's ${count} now.`,
    sendReply: 'Send reply',
    sendingReply: 'Sending your reply.',
    replySent: (email: string) => `Reply sent to ${email}.`,
    busy: 'Support has sent its 15 emails for today, so sign-in codes keep their room. Try again tomorrow.',
    emailOff: "Emails from PrePenny aren't switched on yet, so nothing was sent.",
    noAddress: "There's no address to reply to: the account has been deleted.",
    server: "PrePenny couldn't reach its server, so nothing was sent. Try again in a minute.",

    /**
     * Ready replies to pick and change before sending (brief 4.16). Every
     * number was checked on the organisation's own website on Fri 20 Nov 2026
     * (D589, D626).
     */
    ready: [
      {
        key: 'distress',
        title: 'Someone in distress',
        words: [
          "Thank you for telling us. You don't have to deal with this on your own.",
          "If you're struggling or feel you can't cope, Samaritans are there any time, day or night. Call 116 123, free from any phone.",
          "If you're in danger now, call 999.",
          'For free, confidential help with money and debt:',
          'StepChange: 0800 138 1111, free from mobiles and landlines. Monday to Friday 8am to 8pm, Saturday 9am to 2pm.',
          'National Debtline: 0808 808 4000, free to call. Monday to Friday 9am to 8pm, Saturday 9:30am to 1pm.',
          "Citizens Advice's debt helpline: 0800 240 4420, free from mobiles and landlines. Monday to Friday 9am to 8pm, Saturday 9:30am to 1pm, not on public holidays.",
          'PrePenny is here too. Reply to this email any time.',
        ],
      },
      {
        key: 'looking',
        title: "Thanks, we're looking into it",
        words: [
          "Thanks for writing to PrePenny. We're looking into it, and we'll write again when we know more.",
        ],
      },
      {
        key: 'see-plan',
        title: 'Can we see your plan?',
        words: [
          "To help, it would be useful to see your plan. If you're happy for us to, open PrePenny, tap More, then Let support see my plan, then Let support see it for 7 days.",
          'We can look but never change anything, and you can stop it at any time. In a shared plan, we only see what you see, and your partner is told.',
        ],
      },
      {
        key: 'lost-app',
        title: 'Lost the authenticator app',
        words: [
          "We can turn off two-step sign-in for you. For your safety, it takes 7 days. We've started the wait now, and emailed the address you sign in with, with a link to stop it if it wasn't you.",
          'After 7 days, you sign in with your email address alone. To turn two-step sign-in on again with a new authenticator app, tap More, then Two-step sign-in.',
        ],
      },
      {
        key: 'lost-email',
        title: 'Lost the sign-in email, no backup',
        words: [
          "We're sorry, but PrePenny support never moves an account to a new email address. Someone close to you could answer questions about your plan, so it wouldn't be safe.",
          "Your email provider can help you get back into your email: look for Can't sign in or Account recovery on its sign-in page.",
          'Or start a new plan with a new address. If you share a plan, your partner can invite your new address: More, then Share with my partner.',
        ],
      },
      {
        key: 'locked-backup',
        title: 'Backup email kept locked',
        words: [
          "We've sent a link to your backup email. Open it to ask to get back in. Wrong codes typed by anyone else can't stop it.",
          'For your safety, nothing changes for 24 hours, and we tell the address you sign in with now. After 24 hours, we email your backup address a new link to finish.',
        ],
      },
      {
        key: 'idea',
        title: 'Thanks for the idea',
        words: ["Thank you for the idea. It's on PrePenny's list to think about."],
      },
    ] as readonly {
      readonly key: string;
      readonly title: string;
      readonly words: readonly string[];
    }[],

    /** One account (D619). */
    accountHeading: 'Account',
    accountPurpose:
      "Who this is and what's set up. Never their amounts, payment names or notes, unless they let support see their plan.",
    aboutHeading: 'About this account',
    signsInWith: (email: string) => `Signs in with ${email}`,
    backup: (email: string) => `Backup email: ${email}`,
    noBackup: 'No backup email',
    signedUp: (day: string) => `Signed up on ${day}`,
    lastSignedIn: (when: string) => `Last signed in at ${when}`,
    neverSignedIn: 'Never signed in',
    twoStepOn: 'Two-step sign-in: on',
    twoStepOff: 'Two-step sign-in: off',
    plans: {
      own: 'Plan: their own',
      shared: 'Plan: shared with a partner',
      none: 'Plan: none in the account yet',
    } as Record<string, string>,
    devices: (count: number) =>
      count === 0
        ? 'Not signed in anywhere now'
        : count === 1
          ? 'Signed in on 1 phone or computer'
          : `Signed in on ${count} phones or computers`,
    yourOwn: 'This is your own account, so support actions are off here.',
    planAccessHeading: 'Their plan',
    accessOn: (when: string) => `They let support see their plan until ${when}.`,
    accessOff:
      "They haven't let support see their plan. They can, in PrePenny: More, then Let support see my plan.",
    seePlan: 'See their plan',
    errorsHeading: 'Recent error codes',
    errorsEmpty: 'No error codes in the last 30 days.',
    errorLine: (code: string, screen: string | null, when: string) =>
      screen === null ? `${code}, at ${when}` : `${code} on ${screen}, at ${when}`,
    underWayHeading: 'Under way',
    nothingUnderWay: 'Nothing is under way.',
    twoStepWaiting: (when: string) =>
      `Two-step sign-in is turned off at ${when}, unless it's stopped.`,
    stopTwoStepWait: 'Stop turning it off',
    getBackInWaiting: (started: string, ready: string) =>
      `They asked to get back in with their backup email at ${started}. It can be finished from ${ready}.`,
    getBackInFromSupport:
      "It was started with support's link. The link to finish is emailed once the 24 hours are up.",
    finishLinkSent: (when: string) => `The link to finish was emailed at ${when}.`,
    messagesHeading: 'Their messages',
    noMessages: 'No messages from this account.',
    messageLine: (when: string, state: string) => `${when}. ${state}.`,
    didHeading: 'What support did',
    didNothing: 'Nothing yet.',
    did: {
      reply: 'Replied to a message',
      looked: 'Looked at their plan',
      'signed-out': 'Signed them out everywhere',
      'two-step-wait': 'Started the 7-day wait to turn off two-step sign-in',
      'two-step-stopped': 'Stopped turning off two-step sign-in',
      'two-step-kept':
        'Two-step sign-in stays on: they stopped the wait, or used their authenticator app',
      'two-step-off': 'Two-step sign-in was turned off after 7 days',
      'backup-link': 'Sent a link to their backup email',
      'backup-finish-link': 'Sent the link to finish getting back in',
    } as Record<string, string>,
    didAt: (what: string, when: string) => `${what}, at ${when}.`,
    emailed: 'They were emailed.',

    /** Actions (D621, D622). Each asks once, and the person is emailed. */
    actionsHeading: 'Actions',
    actionsLine: 'Each one is recorded with the time, and they get an email saying so.',
    signOut: 'Sign out everywhere',
    signOutLine: 'Ends every sign-in on every phone and computer.',
    signOutTitle: (email: string) => `Sign ${email} out everywhere?`,
    signOutIntro:
      'Every phone and computer signed in to this account is signed out within a minute. Their plan is safe in their account.',
    signOutYes: 'Sign out everywhere',
    signOutNo: 'Keep them signed in',
    signedOutDone: (count: number) =>
      count === 1
        ? "Signed out of 1 phone or computer. They've been emailed."
        : `Signed out of ${count} phones or computers. They've been emailed.`,
    twoStep: 'Turn off two-step sign-in',
    twoStepLine:
      'For someone who lost their authenticator app but still has their email. Nothing changes for 7 days, and their sign-in address gets an email with Stop it.',
    twoStepTitle: 'Start the 7-day wait?',
    twoStepIntro:
      "Two-step sign-in is turned off after 7 days, unless it's stopped with the link in the email to their sign-in address.",
    twoStepYes: 'Start the 7-day wait',
    twoStepNo: "Don't start it",
    twoStepStarted: (when: string) =>
      `The 7-day wait has started. Two-step sign-in is turned off at ${when}, unless it's stopped.`,
    stopTitle: 'Stop turning off two-step sign-in?',
    stopIntro: 'Two-step sign-in stays on, and they get an email saying so.',
    stopYes: 'Stop turning it off',
    stopNo: 'Keep the wait',
    stopped: "Stopped. Two-step sign-in stays on, and they've been emailed.",
    backupLink: 'Send a link to their backup email',
    backupLinkLine:
      "For someone whose backup email is kept locked by someone typing wrong codes. The link can't be locked. It starts the same 24-hour wait, with Stop it.",
    backupLinkTitle: 'Send the link?',
    backupLinkIntro: (email: string) =>
      `A link goes to ${email}. Opening it asks to get back in, and the address they sign in with is told, with Stop it.`,
    backupLinkYes: 'Send the link',
    backupLinkNo: "Don't send it",
    backupLinkSent: (email: string) => `Link sent to ${email}.`,
    finishLinkSentNow: (email: string) => `The link to finish was sent to ${email}.`,
    lostEmail:
      'Lost their sign-in email, with no backup? Support never moves an account to a new address. Use the ready reply Lost the sign-in email, no backup.',
    problems: {
      busy: 'Support has sent its 15 emails for today, so sign-in codes keep their room. Try again tomorrow.',
      already: 'A wait to turn off two-step sign-in has already started.',
      waiting: "Their 24-hour wait to get back in hasn't finished yet. Try again once it has.",
      'two-step-off': "Two-step sign-in is off on this account, so there's nothing to turn off.",
      'no-backup': 'This account has no backup email.',
      'is-you': "This is your own account, so support can't act on it.",
      'email-off': "Emails from PrePenny aren't switched on yet, so nothing was done.",
      'no-address': 'This account has no address to email.',
      'not-found': "That account isn't there any more. It may have been deleted.",
      offline: "You're offline. Connect to the internet, then try again.",
      server: "PrePenny couldn't reach its server, so nothing was done. Try again in a minute.",
    } as Record<string, string>,

    /** The plan someone let support see, read only (D618). */
    planViewHeading: 'Their plan',
    planViewPurpose: 'What this person sees in PrePenny, read only. Nothing here can change it.',
    planCopyHeading: 'Their plan copy',
    planCopyPurpose: 'The plan copy they sent, read only, worked out as from today.',
    backToAccount: 'Back to their account',
    backToMessage: 'Back to the message',
    accessUntil: (when: string) => `They let support see it until ${when}.`,
    accessEnded:
      "They've stopped support seeing their plan, or its 7 days are over, so it can't be shown.",
    noPlan: 'They have no plan in their account.',
    accountChecked: (amount: string, day: string) => `Bank: ${amount} on ${day}`,
    lowest: (amount: string, day: string) => `Lowest point ahead: ${amount} on ${day}`,
    comingUp: 'Coming up',
    notTicked: (when: string) => `${when}, not ticked yet`,
    nothingComing: 'Nothing planned.',
    debtsHeading: 'Debts',
    debtLine: (name: string, left: string) => `${name}: ${left} left now`,
    paidOffOn: (day: string) => `Paid off on ${day}`,
    stillOwed: (amount: string) => `${amount} still owed at the end of the next 24 months`,
  },

  /**
   * The support dashboard's own sign-in and two-step sign-in (step 4j,
   * D641, D642), at its own address, for support's own account only.
   */
  supportDashboard: {
    title: 'PrePenny support',
    signInHeading: 'Sign in to PrePenny support',
    signInPurpose:
      "For PrePenny support's own account only. Nothing from this dashboard is kept on this computer: closing the tab signs you out here.",
    checking: 'Checking.',
    off: "Signing in isn't switched on in this copy of the dashboard.",
    emailLabel: 'Email address',
    emailHint: "We'll email a 6-digit code to it.",
    emailMissing: 'Type the email address, for example sam@example.com.',
    sendCode: 'Send me a code',
    sending: 'Sending the code.',
    codeHeading: 'Type the code',
    sentTo: (email: string) => `We've sent a 6-digit code to ${email}. It lasts 10 minutes.`,
    newCodeSentTo: (email: string) => `We've sent a new code to ${email}. It lasts 10 minutes.`,
    codeLabel: '6-digit code',
    codeHint: "It's in an email from PrePenny. The link in it works too, in this browser.",
    codeMissing: 'Type the 6 numbers from the email, for example 123456.',
    signIn: 'Sign in',
    signingIn: 'Signing you in.',
    sendNewCode: 'Send a new code',
    otherEmail: 'Use a different email address',
    codeWrong:
      "That code doesn't match, or has run out. Check the 6 numbers in the email from PrePenny, or tap Send a new code.",
    wait: (seconds: number) =>
      seconds === 1
        ? 'You can ask for a new code in 1 second.'
        : `You can ask for a new code in ${seconds} seconds.`,
    tooManyEmails: 'Too many codes have been sent in the last hour. Try again in an hour.',
    tooManyTries: 'Too many tries from this computer. Wait 5 minutes, then try again.',
    emailRefused:
      "That email address can't get emails from PrePenny. Check it, or use another one.",
    offline: "You're offline. Connect to the internet, then try again.",
    server: "PrePenny couldn't reach its server. Try again in a minute.",
    /** The email's link opens this first, so a service checking links can't use it up (D312). */
    linkHeading: 'Finish signing in',
    linkPurpose: 'You opened the sign-in link from the email. Tap the button to sign in here.',
    finishLink: 'Finish signing in',
    checkingLink: 'Checking the link.',
    linkRanOut:
      'This link has run out or has been used already. Type the email address to get a new code.',
    anotherWay: 'Sign in another way',
    /** The second step, every time support signs in. */
    secondHeading: 'Type the code from your authenticator app',
    secondPurpose: 'PrePenny support always uses two-step sign-in.',
    appCodeLabel: 'Code from your authenticator app',
    appCodeHint:
      'Open your authenticator app and type the 6-digit code it shows for PrePenny support.',
    appCodeMissing: 'Type the 6 numbers from your authenticator app, for example 123456.',
    appCodeWrong:
      "That code doesn't match. Type the code your authenticator app shows now: it changes every 30 seconds.",
    continue: 'Continue',
    checkingCode: 'Checking the code.',
    /** Setting it up, the first time support signs in. */
    setUpHeading: 'Set up two-step sign-in',
    setUpPurpose:
      'PrePenny support always uses two-step sign-in: a code from an authenticator app on your phone as well as the code by email. You set it up once.',
    setUp: 'Set it up',
    starting: 'Getting PrePenny support ready for your authenticator app.',
    getApp:
      "1. Get an authenticator app on your phone, if you haven't one already, such as Google Authenticator or Microsoft Authenticator.",
    scan: '2. Scan this picture with the app:',
    qrAlt: 'A picture for an authenticator app to scan',
    orType: 'Or type this key into the app:',
    keepKey:
      "Keep the key somewhere safe. If you lose the phone with the app, it's how you add PrePenny support to a new one.",
    typeCode: '3. Type the 6-digit code the app now shows for PrePenny support.',
    turnOn: 'Turn on',
    turningOn: 'Turning on two-step sign-in.',
    /** An account that isn't support's. */
    notSupport:
      "This dashboard is for PrePenny support's own account only. Sign out, then sign in with support's address.",
    signOut: 'Sign out',
    signingOut: 'Signing out.',
    /** An address on the dashboard's site with no page. */
    notFound: "This page isn't here",
    notFoundPurpose: 'The support dashboard has one page.',
    toDashboard: 'Go to the support dashboard',
  },
} as const;
