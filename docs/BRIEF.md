You are a senior product engineer and designer building **PrePenny**, a money planner for people in the UK who live payday to payday. Build it end to end: a working, tested, deployable app that real people can sign up to and use on their phones.

**The problem.** Most budgeting apps look backwards at what you spent. People with tight money need to look forward. They need to know, before it happens: "Will I have enough on Sunday when rent goes out?" and "Can I afford this driving lesson, or should I move it to next week?"

**The core idea.** The user tells the app what is in their account today, when they get paid, and every payment coming up: rent, bills, buy-now-pay-later instalments, debts, savings moves and spending money. The app lays it all out payday by payday, with a running balance after every single payment. It shows the lowest point ahead, warns before the balance goes too low, and shows when each debt will be paid off. When real life changes, the user taps a payment and moves it, shrinks it or removes it, and sees the effect straight away.

**What success looks like.** Someone opens the app on payday and, in under a minute, knows what this pay has to cover, what is left for themselves this week, and whether anything later in the month will go wrong. They update it as payments go out, and it stays true to their bank balance.

This prompt comes from a real person's plan, built and tested by hand first. Part 8 contains that plan as test data with the answers it must produce.

## Part 2: Who it is for

The app must work equally well for all six of these people. Nothing in the design may assume weekly pay, debts, or one account. Use them as the personas for every design decision and as the basis for end-to-end tests.

| Person | How they are paid | Their money life | What they need most |
| --- | --- | --- | --- |
| **Sam**, shift worker | Weekly on Fridays, one week behind the shifts. Amount follows a 4-week rota pattern (about £452, £618, £469, £592). Occasional overtime. | Rent, five buy-now-pay-later and credit plans, a credit card on minimum payments, a loan from a partner in euros, driving lessons, food bought on a pay-later card and paid back monthly. | See whether each payday covers what's due before the next one. Find the tight days. Move payments around. Know when each debt ends. |
| **Priya**, office worker | Monthly salary on the last working day, paid earlier when that day falls on a weekend or bank holiday. | No debts. Yearly car insurance, TV licence, quarterly water bill, subscriptions. Saving for a holiday. | A month-by-month view. Never be surprised by a yearly bill. Watch a savings goal grow. |
| **Dee**, Universal Credit and part-time work | Universal Credit monthly on a fixed date, and the amount changes with her earnings. Wages every 2 weeks. | Council tax in 10 monthly instalments, April to January. Childcare. Tight every month. | Estimates she can correct when the real amount arrives. A warning before she goes overdrawn. |
| **Kofi**, self-employed driver | Irregular. Paid by several platforms on different days in different amounts. | Van finance, fuel, and 25% of income set aside for tax. | Plan with estimates. Ask "what if I get no work next week?". Set money aside for tax automatically. |
| **Jess and Tom**, a couple | Each paid monthly on different dates. | Two personal accounts plus a joint bills account, with standing orders between them. | One shared plan they both edit on their own phones, with transfers between accounts and personal accounts kept private. |
| **Ali**, student | Student loan in three termly payments (September, January, April) and a weekly part-time job. | Rent paid each term, phone contract, a 0% overdraft. | Make three big payments last a whole term. Treat the overdraft limit as the floor, not £0. |

## Part 3: Product principles

When two choices conflict, the higher principle wins.

1. **Always true to the bank.** The plan starts from a balance the user typed in from their banking app and works forward. When they update it, the past is settled and only the future is projected.
2. **The balance after every payment.** Every row shows what will be left once it has gone out or come in. The single most important number on screen is the lowest point ahead.
3. **Plain English.** Write for someone tired at 11pm after a night shift. Say "Coming in", "Going out", "Left after this", "Paid off on". Never "transaction", "recurrence", "projection", "accrual" or "categorisation".
4. **Change anything, in two taps, and undo it.** Amount, date, name, or remove it, for just this one or this and all later ones. Every change can be undone straight away.
5. **Estimates are normal.** Pay, bills and bonuses can be marked as estimates and corrected when the real amount lands.
6. **No bank connection needed.** Everything is typed in by hand. That is a feature: it works for everyone, offline, with no sharing of bank logins.
7. **Honest and calm.** Show a shortfall early, with the exact amount and date, and the payments that could move to fix it. No shaming, no alarm colours everywhere: one clear warning at a time.
8. **Private by default.** No ads, no selling or sharing data, no third-party tracking inside the money screens.
9. **Fast on a cheap phone.** It must feel instant on a mid-range Android phone on a slow connection.
10. **Numbers, not advice.** The app shows the consequences of the user's own choices. It never recommends financial products or tells people how to deal with debt. When someone is short several weeks running, it gently points to free debt advice (StepChange, MoneyHelper).

## Part 4: Features

Build all of these. Each one must work for every persona in Part 2.

### 4.1 First-time setup, under 5 minutes

- A friendly step-by-step setup: account and balance today (and any overdraft limit) → how you're paid → rent → common bills → debts → spending money → savings → "Here's your plan".
- Pay choices: weekly, every 2 weeks, every 4 weeks, monthly on a date, last working day of the month, specific dates (student loan), or irregular with a weekly estimate.
- "My pay changes in a pattern": enter the amounts for up to 8 paydays in a repeating cycle (Sam's 4-week rota).
- A bills checklist with UK defaults to tick: council tax, energy, water, phone, broadband, TV licence, insurance, subscriptions.
- Every step can be skipped and changed later. Offer an example plan, clearly marked as an example, for people who want to look around first.

### 4.2 Accounts

- Several accounts per person: current, savings, joint. Each has a name, a balance with the date it was checked, an overdraft limit (the floor) and a warning level.
- Transfers between accounts are one entry that moves money out of one and into the other.
- "Update balance": the user types what their bank shows. The app shows what the plan expected, the difference, then asks them to tick anything from today or earlier that has already gone.

### 4.3 Money coming in

- Every schedule above, plus one-off extras: overtime, bonus, refund, gift. Two quick actions for shift workers, "I did overtime" and "I missed a shift", take two taps: confirm the date and hours, and the app remembers the rate, works out the change in take-home pay with the pay calculator (4.15), puts it on the payday that shift is paid (set once, for example "My pay is one week behind my shifts"), and shows the new balances.
- Weekend and bank holiday rule per item: move to the working day before, the working day after, or keep the date. Use the UK bank holiday list for the user's nation (England and Wales, Scotland, or Northern Ireland).
- Estimate or real: when pay lands, the user types the real amount and sees the difference from the estimate.

### 4.4 Money going out

- Repeat: once, every 1 to 52 weeks, every 1 to 12 months (so quarterly and yearly), on chosen dates, or monthly except chosen months (council tax over 10 months).
- End: never, after a number of payments, or on a date. The last payment can be a different amount.
- Each payment has a name, amount, date, account, type, note, estimate flag, paid tick and an optional linked debt.
- Edit just this one, or this and all later ones. Move, skip, remove. A quick "move to next payday" action.

### 4.5 Spending money and budgets

- Budgets per type, weekly or monthly: food £200 a month, travel £25 a week.
- Choose how a budget leaves the account: all at the start of the period (safest), spread across the days, or as one monthly pay-later bill (food on a pay-later card, paid back on the 29th).
- "I spent £x" in two taps from the home screen, with spent and left shown for this week or month. Leftover budget can roll over or not.

### 4.6 Debts

- Types: pay-later plan with fixed instalments, credit card, loan, overdraft, and money owed to a person in any currency.
- For each: what's left now, the date it will be paid off, a progress bar, and payments linked from the timeline.
- Credit cards: balance, interest rate, and the minimum payment as typed from the statement or as a rule (for example, interest plus 1% of the balance, at least £5). Compare minimum, fixed amount and full balance as numbers only: months to clear and interest paid.
- "Update from statement" resets the balance from today.
- Foreign currency: the user sets the rate. Show both currencies.

### 4.7 Savings goals

Name, target, optional date, planned transfers, and progress. Show the date the goal will be reached at the current plan.

### 4.8 The plan view

- Grouped by the user's pay period by default (weekly, fortnightly, 4-weekly or monthly), switchable to calendar months.
- Each period: what came in, every payment in date order with the balance after it, and what's left at the end.
- Lowest point ahead, first day below the warning level, and an overdue section for unticked past payments.
- Filters: still to pay, money in, debts, a type, an account. Three months shown by default, up to 24 with "Show another month".

### 4.9 Home screen

Balance and when it was checked; what this pay has to cover; left to spend this week; the next three things due; the lowest point ahead with its date; and buttons for Update balance, Add a payment, I spent, and I did overtime.

### 4.10 What if

A safe practice mode: make changes, see the new lowest point and payoff dates side by side with the real plan, then keep or throw away. For example: "What if my pay is £100 less?" or "What if I move this lesson to December?"

### 4.11 Reminders

Optional notifications: "Payday: update your balance", "Rent goes out tomorrow", "You'll be £40 short on Sunday", and a weekly summary. Quiet hours respected.

### 4.12 Undo, history, export and deletion

Undo straight after any change. A change history. Export to CSV and JSON, import a JSON backup, and "Delete my account and all my data" that really deletes it.

### 4.13 Sign up, sign in and sign out

- **Sign up** with an email address (a one-time link or code), Google or Apple. No password to remember by default; people who want one can add a password later.
- **Try first:** the example plan and the take-home pay calculator work without an account. When someone signs up, anything they made while trying it moves into their new account.
- **Stay signed in** on their own phone, until they sign out or don't open the app for 90 days.
- **Sign out** from the More screen, in two taps. Signing out removes the plan from that device, so a shared or borrowed phone keeps nothing behind.
- **Signed-in devices:** a list of every phone and computer that's signed in, with "Sign out of this device" and "Sign out everywhere".
- **App lock:** an optional PIN, fingerprint or face unlock, asked for when the app opens and after 5 minutes in the background. It hides balances in the phone's app switcher.
- **Extra security:** optional two-step sign-in with an authenticator app.
- **Getting back in:** if someone loses access to their email, they can verify a backup email or phone number added in advance, or contact support (4.16).
- **Account settings:** change email address, change sign-in method, download my data, delete my account.

### 4.14 Shared plans for couples

Two people plan money together in one shared plan, each on their own phone.

- **Invite:** from the plan, "Share with my partner" creates an invite link or sends an email. It expires after 7 days and can be cancelled. The partner signs up or signs in to join.
- **What's shared:** the person sharing chooses which accounts go into the shared plan, for example the joint account and both people's pay and bills. Personal accounts stay private unless they are added. The partner never sees anything that wasn't chosen.
- **Permissions:** "Can edit" (the default) or "Can view only". Either can be changed later.
- **Live together:** a change one person makes appears on the other's phone within seconds. Each payment shows who added or last changed it ("Changed by Tom, 2 hours ago").
- **Activity:** a list of recent changes by both people, with undo for your own changes.
- **Same payment edited at once:** keep the newest change and tell the other person ("Jess changed Rent to £560 just now"). Never lose a change silently.
- **Ticking off:** either person can tick a payment as paid, and both see it.
- **Notifications:** optional, for example "Tom added Car MOT, −£54.85 on Fri 13 Nov", plus the shared warnings ("The joint account will be £30 short on Sun 1 Nov").
- **Debts and goals:** each one is marked as shared or belonging to one person. A shared savings goal shows what each person has put in.
- **Leaving:** either person can leave at any time without the other's permission. They choose to keep a copy of the shared plan as of that moment or not. The other person keeps the shared plan.
- **Safety:** money can be used to control a partner. Leaving needs no approval. Private accounts are never shown in a shared plan, and nothing reveals when someone last opened the app. The Help centre (4.16) links to support for financial abuse, such as Surviving Economic Abuse.
- **Limit:** two people for now, but design the data so more people can join later (housemates).

### 4.15 Take-home pay calculator

Works out what will actually land in the bank from hours and pay rates, and puts it straight into the plan as that payday's estimate.

- **Pay in:** hours × rate for each line (basic, overtime, nights, weekends, holiday), plus fixed amounts such as shift premium or bonus. Save a person's usual lines as a template, for example "3-shift week" and "4-shift week".
- **Deductions:** income tax from the tax code (1257L, BR, D0, K codes, emergency codes, Scottish S codes and Welsh C codes), on the cumulative basis or week 1/month 1; employee National Insurance; workplace pension (percentage, the earnings it's worked on, and whether it comes off before or after tax); student loan Plans 1, 2, 4 and 5 and Postgraduate; and any other deductions typed in.
- **Pay periods:** weekly, every 2 weeks, every 4 weeks and monthly.
- **Year so far:** for exact tax, the person types "Gross for tax so far" and "Tax paid so far" from their last payslip. Without them, show the result as an estimate.
- **Result:** the take-home amount and a plain breakdown ("Tax £58.80, National Insurance £24.89, Pension £17.33"). One tap adds it to the plan as the next payday's estimate.
- **Check my payslip:** type in a payslip's figures and the app shows where they differ from what it expected, in plain words. It says "Ask your payroll team" and never says the employer is wrong.
- **Tax years:** keep every rate and threshold in one data file per tax year, taken from GOV.UK's "Rates and thresholds for employers" pages, with the source link written in the file. A new file is needed every April; build an admin check that warns when next year's file is missing.
- **Free for everyone,** including a public page that works without signing in, because people search for take-home pay calculators.
- Label it clearly as an estimate that isn't tax advice. Tests are in 8.6.

### 4.16 Help and support

- **Help centre:** short, searchable articles inside the app and on the website. Start with: getting started, how the balance works, changing one payment or all later ones, updating your balance, debts, shared plans, the pay calculator, sign-in problems, billing, and deleting your data.
- **Help where it's needed:** a small "?" beside anything that might confuse people ("Why is my lowest point on Sunday?"), and a 60-second tour after setup that can be skipped and replayed.
- **Contact us:** a form in the app and a support email address. The form collects the app version and phone type automatically, never money data. Send an automatic reply saying when to expect an answer, aiming for 1 working day.
- **Report a problem:** "Something looks wrong" on any screen. The person can choose to attach a screenshot or a copy of their plan, only after seeing a clear consent message.
- **Support tools:** an admin screen for whoever answers support. It shows account status, plan type and recent errors, but no amounts, payment names or notes unless the user gives temporary access from Settings. That access ends automatically after 7 days.
- **Ideas:** "Suggest a feature", collected for you to review.
- **Free advice when money is tight:** a "Worried about money?" page linking to StepChange, National Debtline, MoneyHelper and Citizens Advice. Suggest it gently when the plan shows a shortfall three paydays running.
- **Someone in distress:** if a person writes to support that they are in crisis, the reply template points them to Samaritans (116 123) as well as debt advice.
- **Service status:** a simple status page, and a message in the app when sync is down.

### 4.17 Prices and subscriptions

The app earns money from individual subscriptions after a free trial. There is no sales team and no outreach: organisations that want it buy places themselves online.

| Plan | Price | Who it's for |
| --- | --- | --- |
| Free trial | 30 days of everything, no card needed | Everyone new |
| Solo | £2.99 a month or £24.99 a year | One person |
| Couple | £4.49 a month or £34.99 a year, one payment | Two people sharing a plan (4.14) |
| Founders | £1.99 a month or £14.99 a year, kept for as long as they stay subscribed | The first 500 subscribers only |
| Organisations | £1.50 per person a month, billed yearly, at least 10 places | Employers, housing associations and others who sign up themselves |

- **Always free, no account needed:** the take-home pay calculator (4.15) and a quick "Will I make it to payday?" check. Build both as public pages that people can find through search, because they are how most people will discover the app.
- **When a trial ends without payment:** nothing is deleted. People can still see their plan, update their balance, tick payments and get shortfall warnings. Adding or changing payments, shared plans and what-if ask them to subscribe.
- **Prices in weeks too:** "£2.99 a month, about 69p a week", because many users think in weekly pay.
- **Charge after payday:** people choose which day of the month they're charged, so it lands just after they're paid.
- **Founders:** the pricing page shows how many founder places are left. Once 500 are taken, the offer ends automatically.
- **Refer a friend:** when a friend subscribes, both get a free month, up to 12 free months a year.
- **Can't afford it this month:** one tap gives a free month, up to 3 times a year, with no questions asked. Support can give more.
- **Organisations, self-serve:** a "For organisations" page where they choose the number of places, pay by card, and get a link to share with their people. A simple dashboard lets them add or remove places and see how many are in use, never anyone's money data. No sales calls and no manual work for you.
- **Payments:** Stripe Checkout and the Stripe customer portal, with prices including VAT and automatic receipts. In the app stores, use their in-app purchases where their rules require it.
- **Fair subscriptions:** cancel in two taps inside the app. Email a reminder before the free trial ends and 7 days before a yearly renewal.
- **Prices are settings,** not code, so they can change without releasing the app. Existing subscribers keep their price for at least 12 months after any rise.
- **Never** show ads, sell or share data, or earn commission from loans or credit cards.

## Part 5: The money engine

Build the engine first, as a pure TypeScript package with no UI, no network and no clock of its own ("today" is passed in). Everything on screen comes from it. These rules are exact; ask me before changing any of them.

### 5.1 Money and dates

- Store all money as whole pence (integers). Never use floating point for money. Currency conversion rounds to the nearest penny.
- Dates are calendar dates (`YYYY-MM-DD`) with no time or time zone. "Today" is the user's local date.

### 5.2 What is stored

- **Account**: name, kind (current, savings, joint), balance, the date it was checked, overdraft limit, warning level.
- **Series** (anything that happens once or repeats): account, optional destination account (for transfers), name, direction (in, out, transfer), amount, optional amount cycle with a cycle offset, schedule, end rule, optional different last amount, weekend and bank holiday rule, type, optional linked debt, budget or goal, estimate flag, note.
- **Change to one payment**, keyed by series and the payment's original date: new date, amount, name, note, estimate flag, paid tick, or skipped.
- **Debt**: name, kind, currency, rate (units of that currency per £1), balance, the date of that balance, starting balance, and for credit cards the interest rate and minimum payment rule.
- **Budget** and **savings goal** as described in Part 4.

Never store generated payments. Generate them when needed from series plus changes. Only the changes are stored.

### 5.3 Generating payments

- Payment number k of a series is calculated from the series start, never from the previous payment. Weekly: start + 7 × every × k days. Monthly: the start day in month k, moved to the month's last day when the month is shorter, so 31 January gives 28 February then 31 March. This stops dates drifting.
- Last day, last working day and "first Monday" style schedules are calculated per month.
- Amount = the change's amount if there is one, else `cycle[(k + offset) mod cycle length]` if there is a cycle, else the series amount. The last payment uses the last amount when set.
- Then apply the weekend and bank holiday rule, then any changed date. Stop at the end rule or the end of the view.

### 5.4 Editing

- **Just this one** → save a change for that payment.
- **This and all later ones** → split the series. The old series now ends just before this payment (by count or by date). A new series starts at this payment with the edits, keeping the cycle position, and later saved changes move across to it by payment number. Changes that the edit replaces are dropped. On the first payment of a series, this simply edits the whole series.
- **Remove this one** → mark it skipped. **Remove this and later** → end the series before it.
- Every edit is one undoable step.

### 5.5 The balance rule

For each account, start from its balance B checked on date D.

1. Payments dated on or before D that are ticked as paid are already inside B. Ignore them.
2. Payments dated before D that are not ticked are overdue. Apply them first, oldest first, and show them as "Not ticked yet".
3. Apply every payment from D onwards in date order. On the same day: money in first, then transfers, then money out.
4. Show the balance after every payment. The day's figure is the balance after its last payment.
5. **Lowest point ahead** = the lowest end-of-day balance from today on, with its date and the payment that caused it.
6. Below the warning level → amber. Below the overdraft floor (zero, or minus the overdraft limit) → a shortfall: show "£X short on \[date\]", and list the payments before that date that could move.
7. A budget leaves the account at the start of its period by default, as one row.
8. A transfer leaves one account and arrives in the other on the same date.

### 5.6 Debts

- **Left now** = balance on its date − every linked payment ticked as paid and dated after that date. Convert each payment with the debt's rate.
- **Paid off on** = the first date where the balance minus the planned linked payments after its date, in order, reaches 1p or less. If that never happens in the view, show what will still be left at the end.
- Credit cards with an interest rate: add monthly interest (balance × yearly rate ÷ 12) on the statement day and work out the minimum from the rule. Label these as estimates.

### 5.7 Bank holidays

Use the official UK list from `https://www.gov.uk/bank-holidays.json`, cached on the device, with a built-in copy so it works offline.

### 5.8 Tests the engine must pass

- Unit tests for every rule above, including 31st-of-the-month dates, leap years, a bank holiday on payday, and a cycle that continues correctly after a split.
- Property tests: the end balance equals the start balance plus the sum of every applied payment; splitting a series without changing anything produces exactly the same payments; undo returns the exact earlier state.
- The worked example in Part 8 gives exactly the stated results.
- Speed: 24 months of 100 series calculated in under 50 milliseconds on a mid-range phone.

## Part 6: Design, accessibility and wording

**Layout.** Phone first, working down to 320px wide and usable with one thumb. Bottom navigation with four places: Home, Plan, Debts, More. Editing opens in a bottom sheet, never a new page. Tap targets at least 44 by 44 pixels. On a laptop, the same app in a centred column with the sheet as a dialog.

**Look.** Calm, clear and trustworthy, like a well-made bank statement rather than a game. Create a small design system first (colours, type sizes, spacing, corner radius) and use it everywhere. Avoid the generic fintech look of purple gradients and big stock illustrations. Money in is green, tight is amber, short is red, and colour is never the only signal: always words too.

**Name.** The app is called **PrePenny**, always written with two capital Ps, as one word. The tagline is "Plan every penny before payday." Use the tagline on the website, the app store listings and the first setup screen, so people understand the name straight away.

**Numbers.** Always £ and pence, digits that line up in columns, a proper minus sign, and the word "short" for a shortfall. Dates as "Fri 30 Oct", adding the year only when it isn't this year.

**Accessibility.** Meet WCAG 2.2 AA: contrast, focus that can be seen, every control labelled for screen readers, text that scales to 200% without breaking, and no animation when the user has reduced motion turned on. Light and dark mode both designed with care.

**Wording.** Calm, specific, never blaming, no exclamation marks, no emoji on money screens. Write all text as a set of strings so the app can be translated later. Examples of the voice:

- "Rent goes out tomorrow. You'll have £4.53 left until Friday."
- "You'll be £92 short on Sun 1 Nov. Moving one of these payments would fix it."
- "Klarna is paid off on 23 Aug 2027."
- An error: "Type an amount, for example 25."
- An empty week: "Nothing planned this week."

**Speed and offline.** Show the plan instantly from the device's copy, then sync. Changes appear immediately and sync in the background. A small, clear note when offline. Skeleton screens, never spinners on the home screen.

## Part 7: Technology, privacy and safety

### 7.1 Suggested stack

Use this unless you have a clearly better option; if so, explain why in Phase 0 and wait for my answer.

- **App:** an installable web app (PWA) first, so it works on Android and iPhone home screens from day one. Turn it into App Store and Google Play apps from the same code with Capacitor in Phase 6.
- **Code:** TypeScript everywhere. React with Next.js. A monorepo with the engine as its own package (`packages/engine`) and the app in `apps/web`.
- **Data and sign-in:** Supabase (Postgres) in a UK or EU region. Sign in with an email link, Google or Apple. Row Level Security on every table so a person can only ever read and change their own data.
- **Offline:** keep a copy of the user's plan on the device (IndexedDB). Sync each record with an updated time; when the same record changed on two devices, keep the newest and tell the user.
- **Notifications:** web push for the app, and email through a transactional email service.
- **Testing:** Vitest for the engine, fast-check for property tests, Playwright for end-to-end tests at phone size, one scripted journey per persona.
- **Delivery:** GitHub Actions runs lint, type checks, unit tests and end-to-end tests on every push. Preview deployments for every pull request.
- **Errors:** error tracking with all money amounts, names and notes removed before anything is sent.

**Also needed for 4.13 to 4.17:**

- **Sign-in:** Supabase Auth with email one-time codes or links, Google and Apple, optional authenticator-app two-step sign-in, and a list of signed-in sessions that can be ended.
- **Shared plans:** a plan belongs to one or two members with a role each (owner, editor, viewer). Row Level Security checks membership on every row. Supabase Realtime sends changes to the other person's phone. Every change records who made it.
- **Payments:** Stripe Checkout and the Stripe customer portal, with webhooks updating each person's plan type. Test mode until launch.
- **Help centre:** articles written as Markdown files in the repository, so they can be edited without code changes.
- **Support inbox:** a shared support email address and a simple admin page that respects the privacy rules in 4.16.

### 7.2 Privacy and security

- Collect the minimum: no bank logins, no National Insurance numbers, no real names needed. A nickname is enough.
- Encrypt in transit and at rest. Never write amounts, payment names or notes to logs or analytics. Any usage analytics are counts only, privacy-friendly and opt-in.
- Optional app lock with a PIN or the phone's fingerprint or face unlock.
- A plain-English privacy notice, a working data export, and a real "delete everything" that removes the data, backups included, within 30 days.
- Rate-limit sign-in and protect sessions. Run a dependency and security check in CI.

### 7.3 UK rules to respect

The product must stay simple to run legally. Build it so that it:

- Gives no financial advice and recommends no financial products. It only shows the user's own numbers.
- Holds no money, lends nothing and connects to no bank accounts.
- Follows UK GDPR, with the export and deletion above.

Subscriptions must follow UK consumer law: clear prices including VAT, renewal reminders, and cancelling as easily as signing up. Check the current rules on GOV.UK before taking the first payment.

Add a launch checklist for me covering: checking the name PrePenny on the UK trademark register and at Companies House, buying the web address, setting up a limited company (Apple may require one for a money app), registering with the Information Commissioner's Office if required, a privacy notice and terms, an accessibility statement, and getting a short legal review before launch. If bank connections are ever added, they must go through an FCA-authorised Open Banking provider.

## Part 8: Test scenarios and expected results

Sam's plan below was worked out and checked by hand. Load it as a test fixture and as the app's example plan. In this test, today is **Sun 25 Oct 2026**, nothing is ticked, the view runs to the end of February 2027, and every payment keeps its date (no weekend or bank holiday moves).

### 8.1 Sam's accounts and debts

- **Current account:** £267.54 checked on 25 Oct 2026, no overdraft, warning level £20.
- **Savings:** £500 on 25 Oct 2026.

| Debt | Currency | Owed on 25 Oct 2026 | Notes |
| --- | --- | --- | --- |
| Monzo Flex | £ | 466.07 |  |
| Clearpay | £ | 183.89 | Two orders |
| Lemfi | £ | 484.00 |  |
| Klarna | £ | 453.77 |  |
| Capital One | £ | 420.99 | No interest in this test |
| Partner loan | € at 1.1612 per £1 | 1,400.57 | Started at €2,396.93 |

### 8.2 Sam's payments

| Payment | Amount | When |
| --- | --- | --- |
| Spending money until payday | −£30 | Sun 25 Oct 2026, once |
| Partner loan | −£125 | Mon 26 Oct and Fri 6 Nov 2026 |
| Driving lesson | −£100 | 26 Oct, 17 Nov, 23 Nov, 15 Dec 2026 and 12 Jan 2027 |
| From savings to current account | £500 | Wed 28 Oct 2026 |
| Monzo Flex, paid in full | −£466.07 | Thu 29 Oct 2026 |
| Pay (estimates) | +£452.17, £618.46, £469.06, £592.17, repeating in that order | Every Friday from 30 Oct 2026. The first one is £603.06 (overtime) |
| Spending money | −£54 a week | Every Friday from 30 Oct 2026. The first one is −£45 |
| Rent | −£550 | The 1st of each month from 1 Nov 2026. The first one is −£600 |
| Clearpay (£165.20 order) | −£41.30 | Every 2 weeks from Sat 7 Nov 2026, 3 payments |
| Clearpay (£79.99 order) | −£20 | Every 2 weeks from Sun 8 Nov 2026, 3 payments, the last −£19.99 |
| Lemfi | −£150 | Tue 10 Nov 2026, then the 20th of each month from 20 Dec 2026 for 3 payments, the last −£34 |
| Klarna | −£77, then −£37.88 | −£77 on Tue 10 Nov 2026, then the 23rd of each month from 23 Nov 2026 for 10 payments, the last −£35.85 |
| Current account to savings | £150 | Fri 13 Nov 2026, then back on Mon 30 Nov 2026 |
| Capital One minimum (estimate) | −£25 | The 15th of each month from 15 Nov 2026 |
| Partner loan | −£250 | Every 2 weeks from Fri 20 Nov 2026, 4 payments, the last −£206.15 |
| Monzo Flex (food) | −£200 | The 29th of each month from 29 Nov 2026 (28 Feb in February) |
| Christmas bonus (estimate) | £0 | Fri 18 Dec 2026 |
| Driving test | £0 | Tue 26 Jan 2027 |

Each debt payment is linked to its debt: Monzo Flex (29 Oct only), both Clearpay series, both Lemfi entries, both Klarna entries, Capital One, and all Partner loan payments.

### 8.3 Results the app must show

| Check | Expected |
| --- | --- |
| Lowest end-of-day balance | £4.53 on Sun 1 Nov 2026, after rent |
| Current account at the end of Oct, Nov, Dec, Jan, Feb | £604.53, £732.91, £1,024.60, £2,235.89, £3,304.87 |
| Total pay in the view | £9,748.96 from 18 paydays |
| Paid off on | Monzo Flex 29 Oct 2026, Clearpay 6 Dec 2026, Partner loan 1 Jan 2027, Lemfi 20 Feb 2027 |
| Still owed at the end of Feb 2027 | Klarna £225.25 (paid off 23 Aug 2027 when the view is extended), Capital One £320.99 |
| Savings | £0 from 28 Oct, £150 from 13 Nov, £0 from 30 Nov |

### 8.4 Editing tests on Sam's plan

1. Change rent to £560 for "this and all later ones" from 1 Jan 2027 → January and February are £560. November (£600) and December (£550) do not change.
2. Edit only the note on pay from 4 Dec 2026, "this and all later ones" → every pay amount stays exactly the same, and the 4-week pattern continues.
3. Type £640 as the real pay on 6 Nov, "just this one" → only that payday loses its estimate label. Every balance after it rises by £21.54.
4. Remove spending money from 8 Jan 2027, "this and all later ones" → the last spending money row is 1 Jan 2027.
5. Update the balance on 30 Oct to £600 and tick everything dated up to then → the plan works forward from £600, and nothing ticked is counted twice.

### 8.5 Tests for the other people

- **Priya:** salary of £2,100 on the last working day, moved to the working day before → it lands on Thu 31 Dec 2026, then Fri 29 Jan 2027 (31 Jan is a Sunday). A yearly car insurance payment appears once a year. A quarterly water bill appears every 3 months.
- **Dee:** Universal Credit due on the 28th, moved to the working day before → December 2026's payment lands on **Thu 24 Dec 2026**. Christmas Day and the Boxing Day substitute holiday on Mon 28 Dec are both bank holidays, with a weekend between them ([source](https://www.cityam.com/2026-bank-holidays-full-list-including-boxing-day-switch-up/)). Council tax in 10 payments, April to January, has nothing in February or March.
- **Kofi:** in "what if" mode, removing next week's estimated income shows the new lowest point beside the real one. Throwing it away leaves the real plan exactly as before.
- **Jess and Tom:** a £600 transfer from a personal account to the joint account on payday lowers one balance and raises the other by £600. The total across all accounts is unchanged.
- **Ali:** with a £1,000 overdraft, a balance of −£300 shows amber, not red. Only a balance below −£1,000 counts as a shortfall.
- **Any month-end payment:** a payment set for the 31st lands on 30 Nov, 31 Dec, 28 Feb 2027 and 31 Mar 2027.

### 8.6 Take-home pay tests

These are four real weekly payslips from the 2026–27 tax year. Settings for all four: tax code 1257L on the cumulative basis, paid weekly, workplace pension 4% of earnings between £120 and £967 a week taken before tax, no student loan.

| Week, paid | Pay lines | Gross | Gross for tax so far | Tax paid so far | Pension | Tax | NI | Take-home |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 26, 3 Oct 2026 | 34.5 h × £12.71, shift premium £114.69 | £553.19 | £8,463.43 | £434.60 | £17.33 | £58.80 | £24.89 | £452.17 |
| 27, 10 Oct 2026 | 46 h × £12.71, shift premium £210.23 | £794.89 | £9,231.32 | £539.80 | £27.00 | £105.20 | £44.23 | £618.46 |
| 28, 17 Oct 2026 | 34.25 h × £12.71, shift premium £142.29 | £577.61 | £9,790.63 | £603.20 | £18.30 | £63.40 | £26.85 | £469.06 |
| 29, 24 Oct 2026 | 46 h × £12.71, 11.5 h overtime × £19.07, shift premium £172.01 | £975.98 | £10,732.73 | £743.40 | £33.88 | £140.20 | £58.18 | £743.72 |

"So far" figures include that week. The calculator must match pension and tax to the penny, and NI and take-home within 1p (some payroll software uses HMRC's NI tables). Worked check for week 29: £10,732.73 − (29 × £241.92 tax-free pay) = £3,717.05, rounded down to £3,717; 20% of that is £743.40 tax so far; minus £603.20 paid by week 28 = £140.20 this week.

Also test: a Scottish tax code, student loan Plan 2, a BR code, an emergency code on week 1/month 1, a monthly salary, and a pension taken after tax. Also test "I did overtime": 11.5 hours at £19.07 worked on Mon 26 Oct 2026, with pay one week behind, lands on Fri 6 Nov 2026 and raises that payday by about £155 after tax, NI and pension.

### 8.7 Shared plan, sign-in and payment tests

1. Jess invites Tom with "Can edit". Tom changes rent on his phone, and it appears on Jess's phone within 5 seconds, marked "Changed by Tom".
2. Jess's personal account is not shared. A security test proves no request Tom can make returns any of its data.
3. Tom is changed to "Can view only". The server refuses his edits, not just the screen.
4. Both edit the same payment within a second. The newest change wins and the other person is told.
5. Tom leaves and keeps a copy. Jess's plan is unchanged, and Tom's copy no longer updates.
6. Signing out removes the plan from the device. "Sign out everywhere" ends every other session within 1 minute.
7. A free trial ends without payment: nothing is deleted. The person can still view the plan, update the balance, tick payments and see warnings, but adding or changing a payment asks them to subscribe.
8. Cancelling takes two taps. Stripe sending the same webhook twice changes nothing the second time.
9. An organisation buys 10 places online and shares its link. Each person who joins gets full access until the organisation's end date, then is asked to subscribe. The organisation's dashboard never shows anyone's money data.

## Part 9: How to work

I am the owner, not a developer. Work in these phases and **stop at the end of each one** until I say go. At every stop, tell me in plain English: what works now, how to try it on my phone (a link and three or four steps), what's left, and any decisions you need from me.

1. **Phase 0, plan.** Read this whole prompt. Ask me up to 10 questions in one message. Then propose the final stack, the data model, the list of screens with rough sketches, and the folder structure. Wait for my approval.
2. **Phase 1, the engine.** Build `packages/engine` with every rule in Part 5 and the take-home pay rules in 4.15. Make every test in Parts 5 and 8 pass, and show me the test results.
3. **Phase 2, the app on one device.** Setup, home, plan view, edit sheets, debts, budgets, savings goals, what-if and the pay calculator, saving on the device only, with Sam's example plan. Deploy a preview link so I can try it on my phone.
4. **Phase 3, accounts and sync.** Sign up, sign in and sign out (4.13), the database with Row Level Security, sync between devices, shared plans for couples (4.14), offline use, export, import and delete. Include a test proving one user can never read another user's data.
5. **Phase 4, polish.** Reminders, the help centre and support tools (4.16), bank holiday rules, an accessibility check against WCAG 2.2 AA, a speed check on a mid-range Android phone, and installing to the home screen.
6. **Phase 5, ready to launch.** Subscriptions, founders, referrals and organisation places with Stripe in test mode (4.17). Draft the privacy notice, terms and accessibility statement for legal review; a simple landing page; opt-in privacy-friendly analytics; monitoring; and my launch checklist from Part 7. Then move on to Phase 6.
7. **Phase 6, the app stores.** Turn the app into iPhone and Android apps with Capacitor, from the same code, adding native sign-in with Apple and Google, push notifications, and fingerprint or face unlock. Sell subscriptions as in-app purchases where the store rules require it, and make one subscription work everywhere: someone who pays on the website is a subscriber in the app, and the other way round. Prepare both store listings: name, description, screenshots for each phone size, Apple's privacy labels, Google's data safety form, age rating, and support and privacy links. Register both developer accounts to my limited company. Build the iPhone version with a cloud Mac build service. Test through TestFlight and Google Play's testing track, then submit for review, fix anything the reviewers raise, and resubmit until both apps are live. Tell me exactly which steps I must do myself, such as paying the fees and accepting the agreements.

**Working rules**

- Keep `PLAN.md` (progress against these phases) and `DECISIONS.md` (each decision and why) up to date in the repository.
- Small commits with clear messages, and one pull request per phase.
- Run the tests before saying anything works. Never claim something works that you have not run.
- If a money rule is unclear, ask me. Never guess with people's money.
- Before each stop, review your own work as a strict outsider would: check the numbers, check it on a phone-sized screen, check the wording against Part 6, and fix what you find.

## Part 10: Left for later, and when it's done

**Leave these out for now**, but design the data so they can be added later without starting again:

- Bank connections that tick payments automatically, through an FCA-authorised Open Banking provider.
- Shared plans for more than two people, such as housemates splitting bills.
- Reading a payslip or statement from a photo to fill in pay and debts.
- Entering a shift rota and predicting each payday from it, as Sam's pay was worked out by hand.
- Comparing ways to clear several debts, shown as numbers only.
- Other countries, currencies and languages.

**The app is done when:**

- [ ] Every test in Parts 5 and 8 passes in CI.
- [ ] An end-to-end test for each of the six people completes setup and their main tasks on a 360px-wide phone screen: update balance, add a payment, change "this and later", move to next payday, "I spent", and what-if.
- [ ] Three people who have never seen the app set it up without help in under 5 minutes.
- [ ] WCAG 2.2 AA checks pass, the app works offline, and no money data appears in logs.
- [ ] Export, import and "delete everything" work.
- [ ] The README lets me, a non-developer, deploy an update by following the steps.

* [ ] The pay calculator matches pension and tax on all four payslips in 8.6 to the penny.
* [ ] Two people share a plan on two phones and pass every test in 8.7.
* [ ] Someone can sign up, sign out, sign in on another phone and find their plan exactly as they left it.
* [ ] Solo, Couple, founders, referrals and organisation places work end to end with Stripe in test mode, including the trial ending and cancelling.
* [ ] The app is approved and live in the App Store and Google Play, and one subscription works on the website and in both apps.
