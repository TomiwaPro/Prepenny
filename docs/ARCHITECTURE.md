# Architecture

How PrePenny will be built. Written for the owner in plain English. The parts marked **For future sessions** hold the technical detail later Claude Code sessions need.

**Status: approved by the owner on Tue 27 Oct 2026.** Its 21 proposals are now decisions D38 to D58 in `docs/DECISIONS.md`, and the answers to the Phase 0 questions are D59 to D68. This file is the map every later step follows. Where this file and `docs/DECISIONS.md` disagree, `docs/DECISIONS.md` wins.

Contents:

1. [Tools](#1-tools)
2. [The engine](#2-the-engine)
3. [The data model](#3-the-data-model)
4. [Screens](#4-screens)
5. [Folders](#5-folders)
6. [Tests](#6-tests)
7. [Risks](#7-risks)

## In short

- **One app, written once.** It runs in the phone's web browser and can be added to the home screen. In Phase 6 the same build becomes the iPhone and Android apps (D17).
- **The engine does every sum.** It's a separate package with no screens, no internet and no clock: the app tells it what day it is. The same inputs always give the same pence (brief Part 5).
- **Your plan lives on your phone first,** so it opens instantly and works offline. A copy is kept in a database in London (Supabase), so it's safe, follows you to your other devices and can be shared with a partner (brief 7.1, D17).
- **Only what people type in is stored:** accounts, balances, repeating payments and one-off changes. Every payment on screen is worked out fresh each time (brief 5.2).
- **Private accounts never leave their owner.** The database itself refuses to send them to anyone else, whatever the app asks for (brief 4.14, D16).
- **Free plans until real users arrive** (D19). Section 1 says which plans and when they stop being enough.

## Proposed in this plan

The owner approved these with the plan on 27 Oct 2026. They are D38 to D58 in `docs/DECISIONS.md`, in this order.

**Money and rules**

1. **D38.** A one-off change wins over a different last amount (2.2).
2. **D39.** A payment ticked after a balance update, but dated before it, goes out at the start with the overdue payments. Balances from today on come out the same as if it went out today (2.4).
3. **D40** (replaced by D69). "Payments that could move" lists the unticked payments going out from today up to the short day that would fix the shortfall on their own if moved to the first main payday after it, biggest first, with "Show all" for the rest (2.4).
4. **D41.** A spread budget's daily rows fold into one line on screen, which opens to show each day (2.5).
5. **D42.** A debt in another currency counts as paid off at 1 cent (or that currency's smallest unit) or less, as D34 does with 1p (2.6).
6. **D43.** The Debts screen looks 24 months ahead for "Paid off on" (2.6).
7. **D44.** "I did overtime" and "I missed a shift" change a payday only while it's an estimate (2.7).
8. **D45.** The tax year check starts warning on 1 March (2.7).
9. **D46.** "Expected" in Update balance is the plan's balance at the end of today, before anything is ticked (4.6).
10. **D47.** Setup suggests a warning level of £20.00 (3.3).

**Data and sharing**

11. **D48.** A paid tick is its own record, so a tick and an edit never clash (3.3).
12. **D49.** Series split from the same original share a family, so main pay and the same-day order (D12) don't change after a split (3.3).
13. **D50.** Edits are kept for 12 months as the change history (3.5).
14. **D51.** "Can view only" includes ticks. This narrows brief 4.14's "either person can tick" to people who can edit (3.6).
15. **D52.** Money from a shared account into a private one shows as "To Jess", the reverse of D16 (3.6).
16. **D53.** If the owner leaves, the person who stays becomes the owner. If the owner stops sharing, the other person keeps a copy automatically (3.6).
17. **D54.** A setting to hide amounts in notifications (3.7).
18. **D55.** Files attached to "Something looks wrong" are deleted after 30 days (3.7).

**Tools and words**

19. **D56.** The tools in section 1, including TypeScript 6.0 rather than 7.0, no sheet library, Resend for email, Sentry's EU region, UptimeRobot, and buying the web address by Phase 3. RevenueCat and Codemagic are named for Phase 6 and decided then.
20. **D57.** The phone gets fresh bank holidays from PrePenny's own site, which copies GOV.UK's list weekly, so the phone never contacts another site (2.9).
21. **D58.** New names for two public pages, because VOICE.md bans questions as headlines (D36): **Payday check** and **Help when money is tight** (4.1).

The D32 pay-later proposal and how a pay-later budget meets Left to spend (2.5), and the other questions asked at the end of Phase 0, were answered separately by the owner: D59 to D68.

## 1. Tools

**In plain words.** These are every tool and service PrePenny will use. Most are free. Before launch, three things start to cost money: Supabase's paid plan (about £20 a month, D19), the web address (about £10 a year, needed from Phase 3 because sign-in emails must come from it) and, in Phase 6, the Apple and Google developer accounts. Stripe takes a share of each payment instead of a monthly fee.

Versions are the latest at the time of writing (27 Oct 2026). Step 1a pinned the exact versions in the project's files (D77), and they only change on purpose. Facts about free plans were checked on the services' own pages on 27 Oct 2026 and should be checked again before launch.

### 1.1 Building the app

| Tool | What it does, and why | Version | Free plan enough for now? |
| --- | --- | --- | --- |
| Node.js | Runs the build tools and tests on the computer that builds the app | 24 (long-term support) | Free |
| pnpm | Installs the building blocks and runs the monorepo: engine and app in one repository (D17) | 12.15 | Free |
| TypeScript | The language for all the code, so mistakes are caught before they run (brief 7.1) | 6.0. **Agreed (D56):** not the new 7.0 yet, because the tools around it (Next.js type checks, linting) don't fully support 7.0 | Free |
| React | Builds the screens (brief 7.1) | 19.3 | Free |
| Next.js, static export | Turns the screens into plain files: the public pages as ready-made pages search engines can read, and the app as one bundle that also becomes the phone apps (D17) | 16.4 | Free |
| Dexie | Stores the plan in the phone's own browser database (IndexedDB), so it opens instantly and works offline (brief 7.1) | 4.4 | Free |
| Supabase client | Talks to the database, sign-in and live updates | 2.118 | Free |
| Serwist | The offline helper (service worker): keeps the app's files on the phone so it opens with no signal. Used through its command-line build step, which works with Next.js 16's static export | 9.5 | Free |
| Zod | Checks data arriving from outside, such as an imported backup, before it's trusted | 4.6 | Free |
| Figtree font files | The one font, served from PrePenny's own site, never from Google (D23) | 5.3 (Fontsource) | Free, open licence |
| The browser's own dialog element | Bottom sheets and laptop dialogs, styled entirely with the DESIGN.md colours and sizes. **Agreed (D56):** no sheet library; the popular one (vaul) hasn't been updated since Dec 2024, and DESIGN.md bans a library's default look | Built into browsers | Free |
| Our own icons | About 10 simple line icons drawn as SVG (DESIGN.md: navigation and a few actions only) | Ours | Free |

### 1.2 Tests and checks

| Tool | What it does, and why | Version | Free plan enough for now? |
| --- | --- | --- | --- |
| Vitest | Runs the engine's tests (brief 7.1) | 5.0 | Free |
| fast-check | Property tests: tries thousands of made-up plans to prove a rule always holds (brief 5.8) | 4.10 | Free |
| Playwright | End-to-end tests that use the real app on phone-sized screens, 320px and 360px wide (brief 7.1, D37) | 1.64 | Free |
| axe-core for Playwright | Automatic accessibility checks against WCAG 2.2 AA (brief Part 6) | 4.14 | Free |
| Biome | Checks code style and common mistakes, and formats the code, in one fast tool | 2.6 | Free |
| Our own check scripts | Banned words and long dashes in every string (VOICE.md), no amounts or names in logs, a missing tax year file (brief 4.15) | Ours | Free |
| Supabase command line | Database changes, a local test database, and deploying server functions | 2.122 | Free |
| pgTAP | Tests inside the database proving one person can never read another's data (brief Part 9, Phase 3) | Built into Supabase | Free |
| GitHub Actions | Runs every check on every push, and the end-to-end tests (brief 7.1) | | 2,000 free minutes a month for a private repository. They ran out in Nov 2026; extra minutes are capped at $10 a month, and since step 3b each commit is checked once, with the end-to-end tests once a pull request is ready (D300) |
| Dependabot and `pnpm audit` | Warn about building blocks with known security problems (brief 7.2) | | Free |

### 1.3 Services

| Service | What it does, and why | Version or plan | Free plan enough for now? |
| --- | --- | --- | --- |
| Cloudflare Workers | Hosts the website and app, with a preview link for every pull request (D18, D68) | Free plan | Yes: 3,000 build minutes a month (section 1.6) |
| Supabase, London region | The database (Postgres), sign-in, live updates and server functions, all in one place (D17). A second project, prepenny-preview, is for pull request previews only, made with the paid plan (D403, D411) | Free plan, Pro before launch | Yes for now: 500 MB of data, 50,000 people a month, 200 live connections, 500,000 function calls. But it pauses after 7 days without use and has no backups or 90-day sign-out. Move to Pro (about £20 a month) before launch (D19) |
| Supabase Auth | Sign-in with a 6-digit email code (D20), Google (Phase 3), Apple (Phase 6), and two-step sign-in with an authenticator app | Included | Yes. Two-step sign-in is free. The 90-day "stay signed in" limit needs Pro (D19) |
| Supabase Realtime | Nudges the other phone within seconds when the plan changes (brief 4.14) | Included | Yes |
| Supabase Edge Functions | All server work: Stripe messages, emails, reminders, invites, account deletion (D17). They can run the engine, so reminders use the same sums as the app | Included | Yes |
| Resend | Sends emails: sign-in codes, invites, trial and renewal reminders, support replies | Free plan | Yes: 3,000 emails a month, 100 a day. Resend keeps email text for 30 days on servers in the US, so **no email ever contains amounts, payment names or notes**. A French alternative, Brevo, is ready if the owner prefers |
| Web Push | Reminders on the phone, sent straight from PrePenny's server with no other push company in between (brief 7.1) | The `web-push` library, 3.6 | Free. On iPhone it needs "Add to Home Screen" until Phase 6 (D22) |
| Sentry, EU data region | Error reports, with every amount, name and note stripped before sending (brief 7.1). Built into our own code, not loaded from Sentry. Only the error type, where in the code, the app version and phone type are sent | Free (Developer) plan | Yes: 5,000 errors a month |
| UptimeRobot | Checks every 5 minutes that the app and server are up, and runs the status page (brief 4.16) | Free plan | Yes: 50 checks and 1 status page. Its terms, updated in May 2026, allow business use; older guides say otherwise, so check again before launch |
| Google sign-in | Lets people sign in with Google (D20) | Google Cloud | Free |
| A web address | The website, and the address sign-in emails come from | About £10 a year | **Not free.** Needed by Phase 3, before the rest of the launch checklist |
| Stripe | Subscriptions: Checkout, the customer portal and payment messages (brief 4.17). Test mode until launch | No monthly fee | Yes. Stripe takes about 1.5% + 20p of each UK card payment, plus 0.7% for running subscriptions |
| PrePenny's own counts | After launch only: opt-in, counts only, stored in Supabase, no other analytics company (D19) | Ours | Free |

### 1.4 Phase 6: the app stores

These are chosen in Phase 6. Listed now so nothing earlier rules them out.

| Tool or service | What it does, and why | Version or plan | Free plan enough? |
| --- | --- | --- | --- |
| Capacitor | Wraps the same build into the iPhone and Android apps (D17) | 8.5 | Free |
| Capacitor plugins | Hiding balances in the app switcher (`@capacitor/privacy-screen` 2.0), fingerprint or face (`@aparajita/capacitor-biometric-auth` 10), phone notifications (`@capacitor/push-notifications` 8.1) | As listed | Free |
| RevenueCat | **Named for Phase 6, decided then (D56):** one subscription across Stripe, the App Store and Google Play (brief Phase 6). Apple's UK rules allow a subscription bought on the web to work in the app only if it's also sold inside the app | Free plan | Free until $2,500 a month of sales, then 1% |
| Codemagic | Builds the iPhone app on a Mac in the cloud (brief Phase 6). Ionic Appflow, the other well-known choice, is closing in 2027 | Free plan | 500 Mac minutes a month. Check its terms allow a business app before relying on it |
| Apple Developer Program | Needed to publish on the App Store, registered to the company (D24) | £79 a year | Not free |
| Google Play Console | Needed to publish on Google Play, registered to the company (D24) | US$25 once | Not free |

### 1.5 Considered and not chosen

- **A ready-made sync service** (such as PowerSync). It would add another company that sees people's plans, and PrePenny's sync is small enough to build on Supabase (section 3.5).
- **Vite instead of Next.js.** Next.js's static export already builds the public pages as ready-made pages that search engines can read, which the free calculator and payday check need (brief 4.17). D17 stays.
- **A component library.** DESIGN.md bans their default look, and the few pieces needed (sheets, dialogs, buttons) are small.

### 1.6 One change to a decision

This was the one place where something looked clearly better than a decision already made. The owner agreed it on 27 Oct 2026 (D68).

- **Cloudflare Workers instead of Cloudflare Pages (D18).** Cloudflare's own guidance now says new projects should start on Workers. Pages keeps working with no end date, but new features go to Workers. Workers' free plan also gives a preview link for every pull request (the latest 100 are kept), serves the app's files free and includes 3,000 build minutes a month. Same company, same price, and it avoids a move later.
- One more thing to check before launch, whichever is chosen: Cloudflare describes its free plan as "for personal or hobby projects", and no clause either allows or bans a paid app. D18 chose Cloudflare because it's free for commercial use, so the terms should be read before launch. If needed, Workers' paid plan is US$5 a month. This is added to the launch checklist.

## 2. The engine

**In plain words.** The engine is the calculator at the heart of PrePenny. You give it what's stored (accounts, balances, payments, debts, budgets) and today's date. It gives back every row of the plan with the balance after it, the lowest point ahead, any warning, left to spend, and when each debt is paid off. It never saves anything, never goes online and never looks at a clock. That makes it easy to test: Sam's plan from brief Part 8 goes in, and the exact numbers from the brief must come out.

It's built first, in Phase 1, before any screen (brief Part 9).

### 2.1 Main functions

| What it does | What goes in | What comes out |
| --- | --- | --- |
| **Work out payments** | Series, one-off changes, ticks, pay adjustments, bank holidays, a start and end date | Every payment in that window: date, amount, account, and whether it's an estimate, ticked, moved or skipped, plus the series and payment number it came from |
| **Work out the plan** | Everything stored for the plan, today's date, how far ahead to look | For each account: every row with "Left after this", each day's closing balance, the "Not ticked yet" list, the lowest point ahead (amount, date and the payment that caused it), the first day under the warning level, and each shortfall with its amount, date and the payments before it that could move |
| **Group into periods** | The plan, and pay periods or calendar months | Each period's "Came in", its rows in date order, and "Left at the end" |
| **Left to spend** | The plan and today | The amount, the payday it lasts until (D28), and the "Spend no more than" line when it's needed (D3) |
| **Debts** | A debt, its linked payments, today | Left now, Paid off on (or what's still left at the end), progress, and for credit cards the interest and minimum estimates and the minimum, fixed and full comparison |
| **Budgets** | A budget, its spends, today | The rows it puts in the plan, spent and left this period, and any roll-over |
| **Savings goals** | A goal and the transfers linked to it | Saved so far, the date it's reached at the current plan, and, from Phase 3 with shared plans, what each person has put in (D114) |
| **Make an edit** | The plan and one command, for example "change this and all later ones from 1 Jan 2027 to £560" | The records to save, and the records that put everything back (the undo) |
| **Take-home pay** | Pay lines, tax settings, year-so-far figures, the tax year file | Take-home pay and the breakdown: tax, National Insurance, pension, student loan, other deductions |
| **Overtime** | The payday's linked pay week, the extra hours and rate | How much that payday changes (D5) |
| **Check my payslip** | A payslip's figures | Each figure that differs from what the calculator expected |
| **What if** | The real plan and the practice changes | The lowest point and paid-off dates for both, side by side |
| **Dates** | A date, the main pay, the nation's bank holidays | The next main payday (D14), working days, plan periods and budget periods (D29) |

### 2.2 How payments are worked out without storing them

Take Sam's rent. All that's stored is:

- one **series**: Rent, £550 going out, monthly on the 1st from Sun 1 Nov 2026, never ends
- one **change**: the payment first due on 1 Nov 2026 is £600.

To show the plan, the engine counts payments from the start of the series. Payment 0 is Sun 1 Nov 2026, payment 1 is Tue 1 Dec 2026, and so on. For each payment number k:

1. **Date.** Worked out from the series start and k, never from the previous payment, so dates never drift (brief 5.3). Weekly: start + 7 × every × k days. Monthly: the start day in month k, or the month's last day when the month is shorter (31 Jan, 28 Feb, 31 Mar). "Last day", "last working day" and "first Monday" are worked out for each month. Specific dates (Ali's student loan) come from the list. Months set to be left out (Dee's council tax in February and March) are passed over and don't count as payments.
2. **Amount.** The change's amount if there is one; otherwise the different last amount if this is the last payment; otherwise `cycle[(k + offset) mod cycle length]` if the amount follows a pattern; otherwise the series amount (brief 5.3). **Agreed (D38):** a one-off change wins over the last amount, because it's the most specific thing the person typed. While a payday is an estimate, its pay adjustments ("I did overtime", "I missed a shift") are added on top (2.7).
3. **Weekend and bank holiday rule.** Move to the working day before or after, or keep the date (brief 4.3).
4. **Changed date, skip.** A changed date replaces the result. A skipped payment is left out but still counts towards "after N payments" (D4).
5. **Stop** at the end rule or the end of the view.

The date from step 1, before any move, is the payment's **original date**. Changes and ticks are attached to the series and the original date (brief 5.2), so they stay attached when the bank holiday list or the weekend rule changes. When an edit changes the dates themselves, changes and ticks move across by payment number, as in a split (2.3).

Sam's pay shows the pattern working. The series has the cycle £452.17, £618.46, £469.06, £592.17 with offset 0, plus one change: the first payment (Fri 30 Oct) is £603.06. Payment 5 is Fri 4 Dec: cycle[5 mod 4] = cycle[1] = £618.46.

### 2.3 Editing and undo

Every edit goes in as a command and comes out as records to save. The engine never changes anything itself.

- **Just this one:** save a change for that payment (brief 5.4).
- **This and all later ones:** split the series. The old series now ends just before this payment: by count if it ends after a number of payments, otherwise by date. A new series starts at this payment with the edits. It remembers which payment number it starts at, so the amount pattern and the "after N payments" count carry on. Later changes and ticks move across to it by payment number. Changes that the edit replaces are dropped (brief 5.4); exactly which ones is D60. The new series joins the old one's family (3.3), so main pay and the same-day order stay as they were. On the first payment of a series, this edits the whole series instead.
  - Brief 8.4 test 1: rent £560 from 1 Jan 2027. The old series never ended, so it now ends by date, on Thu 31 Dec 2026, and keeps the November £600 change. The new series is £560 from 1 Jan 2027.
  - Brief 8.4 test 2: a new note on pay from Fri 4 Dec. The new series starts at payment 5, so its pattern position is (0 + 5) mod 4 = 1: £618.46, the same as before. Every amount stays the same.
  - **Built in step 1c:** "this and all later ones" also changes every later series of the family, so a payment split off earlier changes too (D88). How the split works is D89. A new amount replaces any amount pattern, and a different last amount stays unless the last payment is the one changed (D90). A new date comes from the app with the schedule from that date on, and never adds or loses a payment (D91).
  - **Built in step 1d:** when pay follows a pattern, the edit sheet asks "Every payday from now" (D90) or "Only this week of the pattern" (D97), which changes only this payment's step of the pattern, so every payment on that step from here on gets the new amount. Where later payments go after a new date follows the owner's answer in D96: the new weekday for weekly payments, the new day of the month for monthly ones, and only that one date for chosen dates. The app sends only the new date, and the engine works the rest out.
- **Remove this one:** mark it skipped. **Remove this and later:** end the series before it, and remove later series of the family. The payments left keep their amounts, and it's refused while a payment it would remove is ticked (D92).
- **Move:** a changed date. **Move to next payday:** a changed date on the first main payday after the payment's current date (D14, D81). A "just this one" change keeps only what differs from the series, so moving a payment back to its own date undoes the move (D93).
- **Tick:** a tick record with the paid date and time (D1, D33), worked out when the tick is made (D71, D95). **Untick** removes it.
- **Update balance:** a new balance update, with everything ticked in its steps, as one edit (D33, D87).
- **Update from statement:** a debt's new balance, date and time, with the linked payments ticked in its steps, as one edit. Those ticks count as before the update for that debt (D62, D103).
- **Private transfers:** every command changes both halves in the same edit. Names and notes stay on the private half (D94).
- **Built in step 2a** (D149 to D157): commands for everything setup, "Add a payment" and the add and edit sheets change. Accounts are added with their first balance, changed and closed once nothing is planned in them. Payments are added from their next payment, never before today (D150), and one that hasn't started can be deleted (D156). Debts, budgets and savings goals are added, changed and closed or ended; a budget's new amount counts from the period with today in it (D152). Pay profiles and pay weeks are added and changed, pay is linked to them, and overtime saved on them is worked out again (D154). The main pay and the nation are one settings record (D155). Each is one edit and one undo, checks its input with plain codes, and never saves a record the plan can't use (D149).

**Undo.** Each edit returns two lists: the records to save, and a copy of how those records looked before (or a note that they didn't exist). Undo saves the "before" copy as a new edit. This means:

- one edit is one undo step, however many records it touched (brief 5.4)
- an undo reaches the other phone like any other change
- in a shared plan you can undo your own change as long as nobody has changed the same records since. Otherwise the app says "Tom has changed Rent since, so this can't be undone", and nothing is lost. Undo is also refused when it would take away a split series that has a change or tick made on it since (D87)
- the change history (brief 4.12) is the list of edits.

A property test proves that an edit followed by its undo gives back exactly the records from before (brief 5.8).

### 2.4 The balance rule, step by step

For each account (brief 5.5, with D1, D10, D11, D12 and D33):

1. **Start** from the latest balance update: amount B, typed on date D at time T.
2. **Already inside B, so ignored:** payments ticked at or before T with a paid date on or before D (brief 5.5 rule 1, D1, D138), payments ticked inside that update's steps (D33), and spends recorded at or before T (D2, D33).
3. **Overdue:** unticked payments dated before D. These are applied first, oldest first. On screen, "Not ticked yet" lists unticked payments dated before today (D11).
4. **Ticked after T:** not inside B, even on the same day (D33). It goes out on its paid date: the day it was ticked if that was before the payment was due (D1), otherwise the payment's own date after any weekend, bank holiday or moved-date change (D71). **Agreed (D39):** if that date is before D, it goes out at the start with the overdue payments, shown as ticked. Balances from today on come out the same as if it went out today.
5. **Everything from D onwards,** in date order. On the same day: money in, then transfers, then money out. Within each group, by when the series' family was first created (3.3), then by name (D12).
6. **Balance after every row.** The day's figure is the balance after its last row.
7. **Lowest point ahead:** the lowest end-of-day balance from today on, with its date and the payment that caused it.
8. **Warnings.** Strictly below the warning level is Tight. Strictly below the floor (zero, or minus the overdraft limit) is Short: "£X short on [date]", with the payments before that date that could move (D10). **Agreed (D69, replacing D40):** "could move" lists the unticked payments dated from today to the day before the short day that would fix the shortfall on their own if moved to the first main payday after it, without making any day short that wasn't short before, biggest first, with "Show all" for the rest. Tapping one shows the new lowest point.
9. **Transfers** leave one account and arrive in the other on the same date. A transfer between a private account and a shared one is stored as two linked halves (section 3.6, D16).
10. **Budgets** add their rows (section 2.5).

Brief 8.4 test 5 checks steps 2 to 4: a balance of £600 on Fri 30 Oct with everything up to then ticked inside the update steps. The plan works forward from £600 and nothing is counted twice.

### 2.5 Budgets and spending money

Each budget has a period (D29), an amount, a way of leaving the account, and roll-over on or off (D30).

- **All at the start** (the default, brief 5.5): a future period leaves in full on its first day, as one row. In the period that contains the balance date, spends recorded after the balance update are rows on their own dates, and the unspent part, max(0, budget minus all spends this period), leaves as one row today (D2).
- **Spread across the days** (D31): equal daily amounts, rounded down to the penny, with the leftover pennies on the last day. £25 a week is £3.57 a day for 6 days and £3.58 on the 7th. In the current period, only the unspent part is spread, over the days left from today. **Agreed (D41):** on screen, a period's daily rows fold into one line ("Travel, £3.57 a day") that opens to show each day; the maths always uses the daily rows.
- **Pay-later bill** (D32): spends on the card never leave the bank account. One bill row leaves on the bill date: the budget, or what was really spent in the period the bill covers if that's more. When the real bill arrives, the person types it in and it replaces the estimate.
  - **Agreed (D61):** each pay-later budget stores a bill day and a statement day. A bill covers spends dated from the day after the previous statement day up to and including this statement day. The statement day starts as the day before the bill day, and can be changed to match the card. Example: bill on the 29th, statement day the 28th, so the bill on Sun 29 Nov covers spends from Thu 29 Oct to Sat 28 Nov. "Spent" and "left" for this budget use the same dates.
  - **Also D61:** how a pay-later budget meets "Left to spend" (D28). What's left on the budget is spent on the card, not from the bank account, so it shows on its own line under Left to spend ("On the pay-later card: £80.00 left until Sat 28 Nov") rather than inside it. The bill itself pays for spending already done, so it doesn't count in Left to spend even when it falls before payday; it shows in the plan like rent.
- **Roll-over** (D30): when on, a period's budget is the budget plus the unspent amount at the end of the period before, shown as "£25 + £7 from last week". Future periods in the plan assume the current one is spent in full, so roll-over appears once a period has ended.
- **Left to spend** (D28): all spending money due to leave from today to the day before the next main payday. That's unspent budget rows (including spread days and any full future period that starts inside that window) plus payments of the type Spending money. The extra line from D3 appears only when spending it all would take the balance under the warning level: X = max(0, L + M − W).
- **A balance checked in an earlier budget period** follows D67.
- **Built in step 1e** (D107 to D115):
  - A budget's first period is the one with its start day in it, at the full amount. Its rows count as Spending money, and a pay-later budget's bills as Bills (D107).
  - Weekly periods start on the main pay's weekday or on Monday. Monthly ones run payday to payday for monthly pay, carrying on in whole months before the first payday and after the last, or by calendar month otherwise (D108).
  - D2 applies to every period from the one with today in it: spends recorded after the update are rows on their days, and what's left leaves today, or on the first day of a later period. Budget rows and spends are never ticked (D109).
  - Roll-over adds what's left of an ended period to the next, never takes off an overspend, and can start from the day it was switched on (D110).
  - A pay-later bill is a payment of its own, found by the budget's id and the bill's date, so it's ticked, moved and given its real amount like rent. Without the card's statement day, it covers spends from the bill before it to the day before it (D111).
  - Left to spend is worked out for each account, and the pay-later card's line sits under it (D112).
  - Set aside moves part of money coming in to another account the same day, and goes with its payment (D113).
  - Savings goals: saved so far from ticked payments, and the date the plan reaches the target (D114).
  - "I spent", changing and removing a spend are undoable edits (D115).
  - From the owner's review of step 1g, built in step 2a: Left to spend always counts to the day before the next main payday, however far the plan looks (D143); when the main pay has no more paydays, Left to spend runs to the end of this month and the plan goes by calendar month after the last payday (D144); and an ended pay-later bill with roll-over is estimated at what was spent (D147).
  - The owner answered the three questions left at the end of step 1e, and the answers were built in step 1f (D116 to D119): money set aside has its own tick; when even spending nothing goes under the warning level, the line says "You'll go under £20 on Mon 26 Oct, even if you spend nothing."; "Spend no more than" counts only the spending money due by each day; and "I spent" takes only today or an earlier date.

### 2.6 Debts

- **Left now** = the balance on its date, minus every linked payment ticked as paid after the balance was typed in or updated from a statement, by time, even on the same day (brief 5.6, D27, D62), and every one ticked before it but paid after the statement's date (D138). Each payment is converted with the debt's rate and rounded once (D9).
- **Paid off on** = the first date where the balance minus the planned linked payments after its date, in order, reaches 1p or less. **Agreed (D42):** 1 cent, or the smallest unit, for a debt in another currency. If that never happens in the view, show what will still be left at the end.
- **Never less than nothing** (D34): 1p or less, including a small minus from rounding, shows "Paid off" and £0.00. Family loan: €1,400.57 minus 6 payments converted at €1.1612 per £1 leaves −€0.01, so it shows "Paid off on Fri 1 Jan 2027".
- **Credit cards with an interest rate:** monthly interest (balance × yearly rate ÷ 12) is added on the statement day (D13), rounded once (D9), and the minimum is worked out from the rule, for example interest plus 1% of the balance, at least £5. Both are labelled as estimates. When a planned payment is more than what's left, D63 applies.
- **Compare** minimum, fixed amount and full balance: months to clear and interest paid. Numbers only (brief Part 3, principle 10).
- **Agreed (D43):** the Debts screen looks 24 months ahead for "Paid off on", whatever the Plan screen shows, and after that says how much is left on the last day it looks at. The brief 8.3 tests keep their own view to the end of February 2027.
- **Built in step 1d** (D98 to D103):
  - A debt has the fields in 3.3. Only money going out can be linked to it, never either half of a private transfer, and only a credit card has an interest rate, a statement day or a minimum (D98).
  - Left now in pounds, progress (nearest whole percent, 99% until paid off) and Owed now across every open debt (D99).
  - Paid off on: ticked payments on their paid date, planned ones after the balance date, in the same-day order; "24 months ahead" is the same date 24 months on; a payment more than 1p or 1 cent over what's left says by how much, in the debt's currency; and Paid off on is labelled an estimate when interest or an estimated payment goes into it (D100).
  - Credit card interest on each statement day after the balance date, after that day's payments, and never once paid off. The minimum is the owner's rule: the interest plus 1% of the balance before it, at least the floor, never more than the balance (D101).
  - The comparison counts payments and interest for the minimum, a fixed amount and the full balance, from Left now, with 100 years as "never clears it" (D102).
  - Update from statement is one edit with its ticks (D103).
  - Built in step 2a: on payment day, the comparison counts that day's payment until it's ticked (D146).
  - Two questions waited for the owner at the end of step 1d. The answers were built in step 1e (D104 to D106):
    - A credit card's Left now includes the estimated interest on each statement day since the last update, up to today, labelled as an estimate. A credit card with no rate says "Interest not included" (D104).
    - A payment due on the statement date itself comes off the debt, unless it was ticked at or before that update (D105).
    - A card can have "0% until [date]": statement days on or before it add no interest (D106).

### 2.7 Take-home pay

- **Pay lines:** hours × rate worked out exactly, then rounded once per line (D9). 34.5 h × £12.71 = £438.495, which rounds to £438.50. Fixed amounts are added as typed.
- **Pension:** a percentage of the earnings between a lower and upper limit for the pay period, taken before tax or after tax. Week 26: 4% × (£553.19 − £120.00) = £17.3276, which rounds to £17.33.
- **Income tax:** from the tax code, on the cumulative basis or week 1/month 1. The cumulative sum follows the worked check in brief 8.6: gross for tax so far, minus tax-free pay to date, rounded down to the pound, taxed by band, minus tax already paid. Scottish S and Welsh C codes use their own bands. K codes, BR, D0, D1, NT and emergency codes are covered.
- **National Insurance, student loans (Plans 1, 2, 4, 5 and Postgraduate) and other deductions,** with every threshold and rounding rule taken from GOV.UK and written in the tax year file.
- **The tax year file:** one data file per tax year (`2026-27.json`) holding every rate and threshold, with the GOV.UK source link written in it (brief 4.15). **Agreed (D45):** the admin check starts warning on 1 March if the file for the tax year starting in April is missing.
- **Overtime** (D5): the change to the payday is take-home with the overtime minus take-home without it, using the payday's linked pay week. 11.5 h × £19.07 on week 27's lines raises that payday by £155.23 (within £1). On week 26's lines it gives £150.89, which is how Fri 30 Oct became £603.06.
- **Agreed (D44):** "I did overtime" and "I missed a shift" change a payday only while it's an estimate. Once the real amount is typed in, the real amount stands.
- **Built in step 1f** (D120 to D128):
  - Every figure comes from GOV.UK. A GitHub workflow saves the GOV.UK pages listed in `sources/gov-uk.txt` unchanged in `sources/gov-uk/`, with the date each was fetched, and only fetches from www.gov.uk and GOV.UK's own files that those pages link to (D120).
  - Income tax follows HMRC's Specification for PAYE tax table routines, version 24.0, step by step, for every kind of tax code (D121). National Insurance uses the exact percentage method and HMRC's rounding (D122). Both give HMRC's own 2026-27 test data to the penny.
  - "I did overtime" and "I missed a shift" are pay adjustments, found by the pay's family and the payday's payment number (D123), on the first payday on or after the shift's working week moved on by the weeks pay is behind (D125, replaced in step 1g by D131).
- **Built in step 1g** (D130, D131, D136):
  - A shift goes on the first payday whose last day of work covered is on or after the shift (D131). Setup asks once, "Fri 6 Nov pays for work up to Sun 1 Nov": monthly pay keeps a day of the month (or the last day), in the payday's own month; any other pay keeps a number of days before payday, 5 for Sam. Both count from the payday's date from its schedule, before any weekend or bank holiday move.
  - When the payday's pay week has fixed extras, such as a shift premium, "I did overtime" and "I missed a shift" take an optional change to them, worked out with the hours (D130).
  - A new amount for every payday from now drops the pattern's pay weeks with the pattern, and "Only this week of the pattern" keeps a single pay week on every step (D136).
  - From the engine review (D140): every overtime and missed shift on one payday is worked out together, in the order they were saved, so removing one works the others out again, and an undo that would leave one wrong is refused. A shift goes on the payday that covers its work even when another payday has been moved before it. NONCUM is an emergency code. Check my payslip allows 1p on National Insurance and take-home pay. Other deductions can't be below zero.
  - Built in step 2a: monthly pay can cover work up to a day of the month before, worked out from the dates setup asks for (D142), and pay on the last working day is stored against the month's last day, so a new bank holiday never moves a tick (D145).
  - The year so far is exact from the payslip just before. Otherwise the pay periods in between count as this payday's pay, or for overtime as the payday's own pay week, and the result is an estimate (D124).
  - Pension is a percentage of the earnings in a band, before or after tax; other deductions come off after tax (D126). One of student loan Plans 1, 2, 4 and 5, and a Postgraduate loan (D127). The tax year file and the check are D128.

### 2.8 Speed: 24 months of 100 series in under 50 milliseconds

The worst case is 100 weekly series over 24 months: about 10,400 payments, plus a row a day for each spread budget (about 730 each).

How the engine stays fast:

1. **Dates are whole numbers** (days since 1 Jan 1970), not date objects. Months use lookup tables. Bank holidays are a set of day numbers. Dates become "YYYY-MM-DD" only on the way in and out.
2. **Payment k is a direct sum from the start** (brief 5.3), so the engine jumps straight to the first payment in the window instead of walking through years of old ones.
3. **Changes and ticks sit in lookup tables** keyed by series and original date: one lookup per payment.
4. **No big sort.** Payments drop into one bucket per day, and each day uses the fixed same-day order (D12).
5. **One pass per account** works out balances, the lowest point, warnings and shortfalls together.
6. **Only what changed is redone.** Each series' payments are kept until that series changes.
7. **It runs in a background worker,** so the screen never stutters, even on a cheap phone.
8. **A speed test in every test run** (step 1g): 100 series over 24 months must finish in under 12 milliseconds on the test machine, using the middle time of 20 runs after a warm-up (D72), which leaves room for a phone four times slower. Phase 4 checks it on a real mid-range Android phone.

**Built in step 1g** (D134): points 1 to 5 and 8. The speed test, `packages/engine/test/speed/speed.test.ts`, works out 100 weekly series over two accounts for 24 months, about 10,500 rows, and takes about 5 milliseconds on the test machine, down from about 28 before step 1g. On top of points 1 to 5, each date's text is written once and kept, payments are written out field by field without copying, payments are collected in the same-day order so most days need no sorting, and what every row of a series shares is kept once for the series. The test runs in a group of its own, never at the same time as the other tests, and loads the engine with Node's own import, as the app's build will. On GitHub's machine it took 3.30 milliseconds. Points 6 and 7 aren't needed to meet the target, so they wait for Phase 2: the background worker comes with the app, and keeping each series' payments between changes only if the phone check in Phase 4 needs it.

### 2.9 Bank holidays

The engine has a built-in copy of the official list from `https://www.gov.uk/bank-holidays.json` for England and Wales, Scotland and Northern Ireland (brief 5.7). The built-in copy is `packages/engine/data/bank-holidays.json`, saved unchanged by the Bank holidays workflow on GitHub (`.github/workflows/bank-holidays.yml`), with `bank-holidays.source.json` beside it giving the source link, the date downloaded and a checksum. The engine takes the list as an input, so the app can pass in a fresher one. For a year the official list doesn't cover (D76), the engine works out the usual bank holidays by the standard rules, substitute days included, and switches to the official list once it covers that year (D74). **Agreed (D57):** the app also fetches a fresher copy of that same file from PrePenny's own website, which a weekly job refreshes from GOV.UK, and keeps it on the phone, so the phone never contacts another site. Each plan has one nation, chosen in setup.

### 2.10 What if

**Built in step 1g** (D135). A safe practice mode (brief 4.10). The person makes practice changes on the What if screen with the same sheets as real changes, such as "Move", "Just this one" or "Remove this one", and the engine makes them on a copy of the plan. It shows the real plan and the practice plan side by side: each account's lowest point, first day under the warning level and shortfalls, each debt's "Paid off on" and each savings goal's date. Throwing the practice away changes nothing. Keeping it saves every practice change as one edit, so one tap of Undo takes all of it back. Practice changes stay on the phone and are never sent anywhere (3.8).

### For future sessions: the engine

- Package `@prepenny/engine` in `packages/engine`: TypeScript, ES modules, no runtime dependencies. It must run in the browser, in a Web Worker, in Node (Vitest) and in Deno (Supabase Edge Functions use it to work out reminders).
- **Money** is `Pence`, a whole number; check `Number.isSafeInteger` at the edges. Rates, percentages and hours are exact decimal strings ("1.1612", "4", "34.5"), parsed into whole-number fractions. Multiply first, then round once, halves away from zero (D9), with whole-number maths (`BigInt` where a product could pass 2^53). Never floating point for money.
- **Dates** are `Day` numbers inside the engine and `"YYYY-MM-DD"` strings at its edges. Never `new Date("2026-10-25")`: that is midnight UTC and lands on the wrong day in some time zones.
- **Times** (balance updates, ticks, spends, D33) are ISO strings in UTC. The engine only compares stored times with each other, so it still needs no clock.
- **Pure:** no `Date.now()`, no `Math.random()`, no network, no storage. A lint rule blocks them inside the package.
- **Debts** (step 1d, `packages/engine/src/debts`): `workOutDebts({ debts, series, changes, ticks, holidays, today, to }) → { owedNow, owedNowIsEstimate, debts }`, one `DebtPlan` per debt with Left now (with `interestSinceUpdate`, `leftNowIsEstimate` and `interestNotIncluded`, D104), Paid off on or `leftAtEnd`, progress and every row (linked payments and credit card statement days). A card's `zeroInterestUntil` is its "0% until" date (D106). Use `to: debtsLookAhead(today)` for the Debts screen (D43, D100). `compareCardPayments({ card, left, from, paysOn, fixed })` gives the minimum, fixed and full comparison (D102). Debt amounts are the debt's own minor units (`MinorUnits`); `leftNowInPounds` and `owedNow` are pence. A series links to a debt with `debtId`; a tick made inside a debt's statement update has `inDebtUpdate` set to the debt's id (D62).
- **Budgets, Left to spend and Set aside** (step 1e, `packages/engine/src/budgets`): `PlanInput` takes optional `budgets`, `spends` and `goals`. `workOutPlan` gives back `plan.budgets` (one `BudgetPlan` per budget: `current` and `periods`, each with `base`, `rolledOver`, `amount`, `spent`, `left`, `perDay` for spread budgets and `bill` for pay-later ones) and `account.leftToSpend` (`until`, `amount`, `lowest`, `spendNoMoreThan`, `canKeepWarningLevel` and the `payLater` lines). Every `PlanRow` has a `kind`: `payment`, `bill`, `set-aside`, `budget` or `spend`, with `budgetId` and `spendId`. A pay-later budget's bills are a series made inside the engine with the budget's id (`billSeriesOf`), so ticks, changes and edits find them like any payment. A series' `setAside` is `{ percent, accountId }`.
- **Take-home pay** (step 1f, `packages/engine/src/pay`): `workOutTakeHome({ settings, lines, fixed, payDate, soFar, assumedPayBetween }) → TakeHome` with gross, pension, pay for tax, tax, National Insurance, student loan, Postgraduate loan, other deductions, take-home, the year so far after it, the tax the regulatory limit held back, and `isEstimate` with its reason (D124). `checkPayslip(input, payslip)` lists each figure that differs and by how much; `takeHomeAsEstimate(payday, result)` is the `just-this-one` edit that adds it to the plan. Tax year files are JSON in `src/pay/tax-years`, checked by `checkTaxYear`; `taxYearsOf()` gives the built-in ones and `checkTaxYearFiles(today)` the needed and missing ones (D45, D128). The tax itself is `taxForPeriod` with `parseTaxCode` (D121), National Insurance `employeeNationalInsurance` (D122), student loans `studentLoanDeduction` (D127). `PlanInput` and the edit records take optional `payProfiles`, `payWeeks` and `payAdjustments`; a series links with `payProfileId` and `cyclePayWeeks`. The edit commands `overtime`, `missed-shift` and `remove-pay-adjustment` save a `pay-adjustment` record (D123); `overtime` and `missed-shift` take an optional `extras` (D130). A pay profile's `coveredTo` is the last day of work each payday covers (D131): `{ kind: 'days-before', days }`, `{ kind: 'day-of-month', day }` or `{ kind: 'last-day' }`, and `lastDayCovered(coveredTo, paydayOriginal)` works it out. A payday that's an estimate adds its adjustments to its amount and shows them in `payment.payAdjustment`.
- **What if** (step 1g, `packages/engine/src/whatif`, D135): `whatIf(input, practiceChanges) → WhatIf`, where `input` is an `EditInput` with `to` (and optionally `debtsTo`, 24 months ahead by default) and `practiceChanges` is a list of ordinary `EditCommand`s, made in turn on a copy. It gives `real` and `practice` (each with its `records`, `plan`, `debts` and `goals`), `accounts`, `debts` and `goals` side by side (lowest point, first day under the warning level, shortfalls, Paid off on, the date a goal is reached), and `keep`, one `Edit` with every practice change in it, which is one undo step. It never changes `input`. Before keeping, the app runs it again on the newest real records with the same commands, as a sync clash does (3.5). A refused practice change keeps its usual code, and its message starts "Practice change N:".
- **Savings goals** (step 1e, `packages/engine/src/goals`): `workOutGoals({ goals, series, changes, ticks, holidays, today, to }) → { goals }`, one `GoalPlan` per goal with saved so far, progress, `reachedOn` and `reachedWith`, and every linked payment. Use `to: debtsLookAhead(today)` to look 24 months ahead (D114). A series links to a goal with `goalId`.
- **Edits** are commands: `editPlan(input, command) → { writes, undo }`, where `input` is the stored records (accounts, balance updates, series, changes, ticks and, from step 1d, debts) with the main pay, the bank holidays and `today`. Built in step 1c, in `packages/engine/src/edit`. The same function runs again when a sync clash needs an edit replayed on newer data (section 3.5).
  - Commands: `just-this-one`, `this-and-later`, `remove-this-one`, `remove-this-and-later`, `move`, `move-to-next-payday`, `tick`, `untick`, `update-balance`, `update-from-statement` (step 1d), `spend`, `change-spend` and `remove-spend` (step 1e) and `undo`.
  - Step 2a adds the commands for records (D149): `add-account` (with its first balance update), `change-account`, `close-account`, `add-payment` (a `NewSeries` and `madeAt`, which becomes its family time), `delete-payment`, `link-pay`, `add-debt`, `change-debt`, `close-debt`, `add-budget`, `change-budget`, `end-budget`, `add-goal`, `change-goal`, `close-goal`, `add-pay-profile`, `change-pay-profile`, `add-pay-week`, `change-pay-week`, `choose-main-pay` and `set-nation`. They live in `src/edit/accounts.ts`, `new-payments.ts`, `debts-goals.ts`, `budget-commands.ts`, `pay-records.ts` and `settings.ts`, with the shared checks in `checks.ts`. Each checks its own input first with plain codes, then `checkNow` checks the records would still make a plan, so `edit-breaks-plan` never happens. Edits work on a plan with no accounts (`checkRecords(…, emptyPlan)`), so setup starts from `{ accounts: [], balanceUpdates: [], series: [] }`.
  - The records now also hold `budgets`, `goals`, `payProfiles` and `payWeeks` as edit records, accounts as `account` writes, and the plan's `settings` (`{ nation, mainPayFamilyId }`, D155) as one record with no id. The app builds each edit's `mainPayFamilyId` and `holidays` from `settings`. `coveredToFromDates(frequency, payday, upTo)` turns setup's one example into a pay profile's `coveredTo` (D142). A pay-later bill takes every payment command except `this-and-later` and `remove-this-and-later` (D111). A `this-and-later` edit takes `amount` for "Every payday from now" (D90) or `stepAmount` for "Only this week of the pattern" (D97), never both. For a new date, the app sends only `date`, and the engine works out the schedule from it (D96, `src/edit/new-date.ts`). A `schedule` in the command is for a later "how often" change.
  - Debts in the records are optional: when they're given, every series' link to a debt is checked, and `applyWrites` keeps them as given unless an edit changes one.
  - Each write names one record and its new `value`, or `value: null` for a removal: `{ kind: 'series' | 'balance-update' | 'debt' | 'spend' | 'pay-adjustment' | 'account' | 'budget' | 'goal' | 'pay-profile' | 'pay-week', id, value }`, `{ kind: 'change' | 'tick', seriesId, originalDate, value }` (D87), or `{ kind: 'settings', value }` (D155). `undo` lists the same records with their values before, null where one didn't exist. `applyWrites(records, writes)` saves them into a copy of the records.
  - New ids come with the command: `newSeriesId` for a split, `newOtherHalfSeriesId` for the second half of a private transfer, and the balance update's own id.
  - Refusals are `EngineInputError`s with a code (`no-payment`, `ticked`, `changed-since`, `date-not-in-schedule` and so on) and a message holding ids and dates only. `edit-breaks-plan` means the engine's own mistake, never the person's, and property tests check it never happens.
  - A family is a series and every series split from it (D49). Its series cover payment numbers in order, with no gaps or overlaps, and only the family's last payment is last (D89). The shared half of a private transfer has its own family that mirrors the private one series for series (D94). The engine makes only families like that, but doesn't yet refuse stored data that breaks these rules, such as two halves sharing one family. Phase 3's server checks should.
  - A tick's paid date uses the `today` passed in (D71). When Phase 3 runs an edit again on newer records after a clash (3.5), it must pass the `today` of the person who made the edit, not the day it's replayed.

## 3. The data model

**In plain words.** These are all the kinds of record PrePenny keeps, what's in each one and where it lives. There are three places:

- **On the phone and on the server:** the plan itself. The phone's copy makes the app instant and lets it work offline. The server's copy keeps it safe, puts it on your other devices and lets a partner share it.
- **On the server only:** sign-in devices, billing, organisations and support.
- **On the phone only:** changes not sent yet, what-if practice changes, the app lock and this device's own settings.

Payments themselves are never stored. Only the series, the one-off changes and the ticks are (brief 5.2).

Types used below:

| Type | Meaning |
| --- | --- |
| id | A random ID (UUID version 7) made on the phone, so records can be made offline |
| pence | Whole pence as an integer: £4.53 is 453. Stored as a 64-bit whole number |
| minor units | Whole cents (or the smallest unit) of a debt's own currency |
| date | A calendar date, `YYYY-MM-DD`, with no time |
| time | A date and time in UTC, for example `2026-10-30T09:14:05Z` |
| decimal | An exact number written as text, for example `"1.1612"` (rates, percentages, hours). Never floating point |
| yes/no | True or false |
| text | Words a person typed |
| choice | One of a fixed list |
| list | Several values |

### 3.1 Fields on every shared record, for sync

| Field | Type | What it's for |
| --- | --- | --- |
| `id` | id | The record's own ID |
| `plan_id` | id | Which plan it belongs to |
| `private_to` | person id, or empty | Empty: everyone in the plan can see it. Set: only that person, ever (D16) |
| `version` | number | Goes up by 1 on every save. A phone sends the version it changed; if the server has moved on, that's a clash (3.5) |
| `seq` | number | The plan's change number when it was last saved. Phones ask for "everything after number N" |
| `created_at`, `created_by` | time, person id | When it was made, and who made it |
| `changed_at`, `changed_by` | time, person id | Who last changed it, and when: "Changed by Tom, 2 hours ago" (brief 4.14). Set by the server, not the phone |
| `edit_id` | id | The edit that last saved it, for the activity list and undo |
| `deleted` | yes/no | Removed records stay as "deleted" for 90 days so every phone hears about it, then they're cleared out for good |

### 3.2 The plan and the people

**Person** (server, and the person's own phones; a partner sees only the nickname)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | The same ID as their sign-in |
| `nickname` | text | A nickname is enough, no real name (brief 7.2). Shown to a partner as "Changed by Tom" |
| `created_at` | time | |

Email addresses and sign-in methods live in Supabase's own sign-in tables, not here.

**Plan** (phone and server)

| Field | Type | Notes |
| --- | --- | --- |
| `name` | text | For example "Our plan" |
| `nation` | choice: England and Wales, Scotland, Northern Ireland | Which bank holidays apply (brief 4.3) |
| `is_example` | yes/no | Sam's example plan, clearly marked (brief 4.1, D15) |
| `max_members` | number | 2 for now (brief 4.14). Raising it is how housemates join later (3.10) |
| `owner` | person id | Who made the plan |

**Plan member** (phone and server)

| Field | Type | Notes |
| --- | --- | --- |
| `plan_id`, `person_id` | id | |
| `role` | choice: owner, editor, viewer | "Can edit" is editor, "Can view only" is viewer (brief 4.14) |
| `main_pay_family_id` | id | This person's main pay (D14): a series family (3.3), so it still points at the right pay after a split. In a shared plan each person has their own, so Jess's plan periods follow Jess's payday and Tom's follow Tom's |
| `joined_at` | time | |
| `left_at` | time, or empty | Set when they leave |

**Invite** (server, and the inviter's phone)

| Field | Type | Notes |
| --- | --- | --- |
| `plan_id` | id | |
| `role` | choice: editor, viewer | "Can edit" is the default (brief 4.14) |
| `email` | text, or empty | Only when the invite is sent by email |
| `token_hash` | text | The invite link carries a secret. Only a scrambled copy (a hash) is stored, so a copy of the database can't be used to join |
| `expires_at` | time | 7 days after it was made (brief 4.14) |
| `cancelled_at`, `accepted_at`, `accepted_by` | time, time, person id | |

### 3.3 Money records

All of these are on the phone and the server, with the sync fields from 3.1.

**Account**

| Field | Type | Notes |
| --- | --- | --- |
| `name` | text | |
| `kind` | choice: current, savings, joint | Brief 4.2 |
| `currency` | text | `"GBP"` for now, ready for other currencies later (brief Part 10) |
| `overdraft_limit` | pence | 0 if none. The floor is minus this (brief 5.5): −£1,000.00 for Ali |
| `warning_level` | pence | Strictly under this is Tight (D10). **Agreed (D47):** setup suggests £20.00 and people can change it |
| `belongs_to` | person id, or empty | Whose money it is, for "From Jess" (D16). Empty for a joint account |
| `sort_order` | number | |
| `closed` | yes/no | Once nothing is planned in it (D151) |

**Balance update** (what the bank showed)

| Field | Type | Notes |
| --- | --- | --- |
| `account_id` | id | |
| `balance` | pence | The amount typed in |
| `checked_on` | date | The balance date D (brief 5.5) |
| `checked_at` | time | The moment of the update (D33) |
| `expected` | pence | What the plan expected, kept for the history ("The plan expected £604.53") |
| `source` | choice: typed, bank | Always "typed" for now. "bank" is ready for bank connections (3.10) |

An account's balance and date (brief 5.2) are its latest balance update. Keeping each update as its own record gives a history and lets undo put the old one back.

**Series** (anything that happens once or repeats, brief 5.2)

| Field | Type | Notes |
| --- | --- | --- |
| `account_id` | id | The account the money leaves or arrives in |
| `to_account_id` | id, or empty | The other account, for transfers |
| `name` | text | |
| `direction` | choice: in, out, transfer | |
| `type` | choice | Pay, Benefits, Rent or mortgage, Bills, Debt, Spending money, Savings or Other, fixed in step 1b (D79). "Spending money" counts towards Left to spend (D28) |
| `amount` | pence | |
| `amount_cycle` | list of pence, up to 8 | "My pay changes in a pattern" (brief 4.1) |
| `cycle_offset` | number | Where in the pattern payment 0 sits |
| `cycle_pay_weeks` | list of pay week ids | Each pattern step linked to a saved pay week (D5). Sam: steps 1 and 3 "3-shift week", steps 2 and 4 "4-shift week" |
| `schedule` | see below | |
| `start_date` | date | |
| `end_rule` | never; after N payments, with N; or on a date, with the date | Brief 4.4 |
| `last_amount` | pence, or empty | A different last payment (brief 4.4) |
| `holiday_rule` | choice: keep the date, working day before, working day after | Brief 4.3 |
| `debt_id`, `budget_id`, `goal_id` | id, or empty | The linked debt, budget or goal. A goal's series must move money into or out of the goal's account (D114) |
| `set_aside` | a percentage (decimal) and an account, or empty | Money coming in only: part of each payment moved to another account the same day (D64, D113) |
| `is_estimate` | yes/no | |
| `note` | text | |
| `pay_profile_id` | id, or empty | For pay: which job's tax settings to use |
| `split_from` | id, or empty | The series this one was split from (brief 5.4, D89) |
| `family_id` | id | The first series in its chain of splits (its own id if never split). Main pay and the same-day order (D12) use the family, so a split changes neither |
| `first_number` | number | The payment number this series starts at, counted from the original series, so patterns and "after N payments" carry on after a split. 0 for a new series |
| `mirror_of` | id, or empty | Set on the shared half of a private transfer (D16, 3.6): the private half it mirrors. Both halves change together (D94) |
| `locked_to` | person id, or empty | Only this person can change it (D16) |

The `schedule` is one of:

- **once:** a date
- **every N weeks**, 1 to 52, on the start date's weekday
- **every N months**, 1 to 12, on a day of the month (1 to 31), the last day, the last working day, or "the first Monday" style, with optional months to leave out (Dee's council tax, April to January)
- **on chosen dates:** a list of dates (Ali's student loan)
- **irregular:** a weekly estimate on a chosen weekday (Kofi). It's its own kind, so D14's Monday-to-Sunday weeks can tell it apart from weekly pay. The next main payday is the next Monday (D66).

Kofi's 25% for tax is D64: a series coming in gets an optional `set_aside`, a percentage and the account it moves to, built in step 1e (D113).

**Payment change** (a change to one payment, brief 5.2)

| Field | Type | Notes |
| --- | --- | --- |
| `series_id` or `budget_id` | id | A budget is used for the real pay-later bill (D32) |
| `original_date` | date | Which payment. Only one change per series and original date |
| `new_date` | date, or empty | Moved |
| `amount` | pence, or empty | A new amount, or the real amount once it lands |
| `name`, `note` | text, or empty | |
| `is_estimate` | yes/no, or empty | |
| `skipped` | yes/no | Removed, just this one (D4) |

**Agreed (D48):** the paid tick, which brief 5.2 lists as part of a change, is its own record. Then Jess ticking Rent and Tom changing Rent's amount at the same moment never clash with each other.

Changes and ticks have their own `id` in the database (3.1), but the engine finds them by series and original date, so an edit names them that way (D87). Moving one to another series in a split is a removal and a new record in the same edit.

**Tick**

| Field | Type | Notes |
| --- | --- | --- |
| `series_id` or `budget_id` | id | |
| `original_date` | date | Which payment |
| `paid_on` | date | The day it was ticked, if that was before the payment was due (D1); otherwise the payment's own date after any weekend, bank holiday or moved-date change (D71). Used for the bank balance and for debts (D27, brief 5.6) |
| `ticked_at` | time | Compared with the balance update's time (D33) |
| `in_balance_update` | id, or empty | Set when ticked inside the Update balance steps, so it counts as before that update (D33) |
| `in_debt_update` | id, or empty | The debt, when ticked inside its Update from statement steps, so it counts as before that update for that debt (D62, D103) |
| `set_aside` | yes/no | The tick of the payment's money set aside, which is ticked on its own (D116) |
| `ticked_by` | person id | Either person can tick (brief 4.14) |
| `source` | choice: typed, bank | "bank" is ready for bank connections (3.10) |

Unticking deletes the tick.

**Debt**

| Field | Type | Notes |
| --- | --- | --- |
| `name` | text | |
| `kind` | choice: pay-later plan, credit card, loan, overdraft, owed to a person | Brief 4.6 |
| `currency` | text | `"GBP"`, `"EUR"` and so on |
| `rate` | decimal, or empty | Units of that currency per £1, set by the person (brief 4.6): `"1.1612"`. Needed for any currency but pounds, and empty for pounds (D98) |
| `balance` | minor units | What's owed on `balance_on` |
| `balance_on` | date | |
| `balance_at` | time | When "Update from statement" was used (D62) |
| `starting_balance` | minor units | For the progress bar: "Started at €2,396.93" |
| `interest_rate` | decimal, or empty | Yearly %, credit cards only (D98) |
| `statement_day` | 1 to 31, or empty | Credit cards only, needed with an interest rate or a minimum rule (D13, D98) |
| `minimum_rule` | a typed amount, or a rule: interest plus a % of the balance, at least an amount | Brief 4.6, credit cards only. How the rule works is D101 |
| `belongs_to` | person id, or empty | Empty means shared (brief 4.14) |
| `closed` | yes/no | |

**Budget**

| Field | Type | Notes |
| --- | --- | --- |
| `account_id` | id | The account it leaves |
| `name`, `type` | text, choice | Food, Travel |
| `amount` | pence | |
| `every` | choice: week, month | The period follows D29 |
| `leaves` | choice: all at the start, spread across the days, pay-later bill | D2, D31, D32 |
| `roll_over` | yes/no | Off unless switched on (D30) |
| `roll_over_from` | date, or empty | When roll-over was switched on |
| `starts_on` | date | |
| `ends_on` | date, or empty | |
| `amounts_before` | list of a date and pence, or empty | The amounts it had before its amount changed, for periods that had ended (D152) |
| `bill_day` | 1 to 31, or empty | Pay-later bill only (D32) |
| `statement_day` | 1 to 31, or empty | Pay-later bill only, the card's own statement day. Empty means each bill covers spends up to the day before it (D61, D111) |

A pay-later budget's bills are ticked and given their real amount like payments: the tick and the payment change name the budget's id and the bill's date (D111). A budget's `created_at` (3.1) sets its place in the same-day order (D12, D107).

**Spend** ("I spent")

| Field | Type | Notes |
| --- | --- | --- |
| `budget_id` | id | |
| `amount` | pence | |
| `spent_on` | date | |
| `recorded_at` | time | Compared with the balance update's time (D2, D33) |
| `recorded_by` | person id | |
| `note` | text, or empty | |

**Savings goal**

| Field | Type | Notes |
| --- | --- | --- |
| `name` | text | |
| `target` | pence | |
| `target_date` | date, or empty | Brief 4.7 |
| `account_id` | id | Where the money is kept |
| `starting_amount` | pence | Already saved when the goal was made. Saved so far adds every linked payment ticked as paid (D114) |
| `belongs_to` | person id, or empty | Empty means shared. A shared goal shows what each person put in, worked out from whose account each linked transfer came from (brief 4.14) |

Planned transfers into a goal are series with `goal_id` set.

### 3.4 Pay records

**Pay profile** (one job's tax settings, brief 4.15)

| Field | Type | Notes |
| --- | --- | --- |
| `belongs_to` | person id | Whose pay |
| `name` | text | "Warehouse job" |
| `period` | choice: weekly, every 2 weeks, every 4 weeks, monthly | |
| `tax_code` | text | `"1257L"`, `"S1257L"`, `"C1257L"`, `"BR"`, `"K475"` |
| `basis` | choice: cumulative, week 1/month 1 | |
| `pension_percent` | decimal | |
| `pension_lower`, `pension_upper` | pence, or empty | The earnings band for each pay period. Empty means all earnings |
| `pension_when` | choice: before tax, after tax | |
| `student_loans` | list: Plan 1, Plan 2, Plan 4, Plan 5, Postgraduate | |
| `other_deductions` | list of name and pence | |
| `ni_category` | choice | The National Insurance category letter, A unless the payslip says otherwise (D122) |
| `gross_so_far`, `tax_so_far` | pence | "Gross for tax so far" and "Tax paid so far" from the last payslip |
| `so_far_period`, `so_far_tax_year` | number, text | Which tax week or month, and tax year, those figures include (D124) |
| `overtime_rate` | decimal | Remembered for "I did overtime" (brief 4.3) |
| `covered_to` | a day of the month, the last day, or a number of days before payday | The last day of work each payday pays for, asked once in setup: "Fri 6 Nov pays for work up to Sun 1 Nov". A shift goes on the first payday whose last day covered is on or after it. Monthly pay keeps a day of the month; any other pay keeps days before payday, 5 for Sam (D131). Replaces `work_week_starts` and `shift_pay_delay` (D125) |

**Pay week** (a saved set of pay lines, D5)

| Field | Type | Notes |
| --- | --- | --- |
| `pay_profile_id` | id | |
| `name` | text | "3-shift week" |
| `lines` | list of name, hours (decimal), rate (decimal), kind | Kind: basic, overtime, nights, weekends, holiday |
| `fixed` | list of name and pence | Shift premium, bonus |

**Pay adjustment** ("I did overtime" or "I missed a shift")

| Field | Type | Notes |
| --- | --- | --- |
| `family_id` | id | The pay series' family (D49). **Built in step 1f (D123):** found by family and payment number, not series and original date, so a split or a new date never loses it |
| `payment_number` | number | The payday it lands on (D131) |
| `kind` | choice: overtime, missed shift | |
| `worked_on` | date | The day of the shift |
| `hours`, `rate` | decimal | |
| `extras` | pence, or empty | A change to the pay week's fixed extras, such as its shift premium: added for overtime, taken off for a missed shift (D130) |
| `change` | pence | Worked out by the calculator when saved (D5): more for overtime, less for a missed shift |
| `tax_year` | text | `"2026-27"` |

### 3.5 History, clashes and sync

**Edit** (one undoable change, phone and server)

| Field | Type | Notes |
| --- | --- | --- |
| `person_id` | id | Who made it |
| `made_at` | time | When it was made, by the phone's clock corrected against the server's |
| `saved_at` | time | When the server saved it |
| `kind` | text | "change this and all later ones", "tick", "undo" and so on |
| `summary` | small structured value | Which records and fields changed, before and after, for the activity list |
| `undo` | small structured value | The "before" copies (2.3) |
| `undone_by` | id, or empty | |
| `private_to` | person id, or empty | Set when it touched anything private, so a partner never sees it |

**Agreed (D50):** edits are kept for 12 months as the change history (brief 4.12).

**Notice** (a message for one person, server and that person's phones)

| Field | Type | Notes |
| --- | --- | --- |
| `for_person` | person id | |
| `kind` | choice: clash, partner change, shared warning | "Jess changed Rent to £560 just now" |
| `edit_id` | id | |
| `data` | small structured value | Which record and what changed |
| `read_at` | time, or empty | |

**How sync works, in plain words:**

1. Every change is saved on the phone straight away, and the screen updates at once (brief Part 6).
2. The change joins a queue of unsent edits on the phone.
3. When the phone is online, it sends each edit with the version of every record it changed.
4. The server checks everything in one go: the person is in the plan and allowed to change these records, nothing private belongs to someone else, and every record is still at the version the phone saw. Then it saves the whole edit and gives each record the plan's next change number.
5. The server nudges every other phone in the plan over a live connection: "this plan is now at change 1,042". The nudge holds no money data. Each phone then asks for everything after the change number it already has.
6. **A clash** is when a record moved on before the edit arrived. The phone fetches the newest records and runs the same command again on top of them. If this person's change is the newest (D59), it's saved, and the other person gets a notice: "Jess changed Rent to £560 just now". If it isn't, it isn't saved, and this person gets the notice, with a button to put theirs back. Nothing is lost without anyone being told (brief 4.14).
7. If the command can't run any more, for example because the other person removed that payment, the phone says so: "Tom removed Rent, so your change wasn't saved."

Running the command again, rather than copying records over, keeps "this and all later ones" right even when both people split the same series at once. Copying records blindly could leave two series covering the same months.

**For future sessions: sync**

- Writes go through one Postgres function, `save_edit(plan_id, edit_id, made_at, writes)`, called through Supabase. It runs as the signed-in person (`security invoker`), so Row Level Security still applies to every row. `writes` is a list of `{table, id, base_version, values}`. It's safe to send twice: a repeated `edit_id` changes nothing.
- Reads: `changes_since(plan_id, seq)` returns every row in the plan, across all tables, with a higher `seq`, deleted rows included.
- Live nudges: a private Supabase Realtime broadcast channel per plan (`plan:<id>`). A database trigger sends `{seq}` only. Joining the channel is checked by Row Level Security on `realtime.messages`.
- Every server reply carries the server's time. The phone keeps the difference and uses it for `made_at`, so a phone with a wrong clock can't win clashes it shouldn't.
- **Built in step 3c** (D324 to D345), in `supabase/migrations/20261107100000_your_plan_on_the_server.sql`:
  - `public.save_edit(plan, edit, made_at, kind, writes)`, `security invoker`: `writes` is `[{table, id, version, row}]`, `version` null for a new record and `row` null to remove one; `row` is every column a phone sends (`app.sent_columns`), null where empty. `kind` is a short code (`^[a-z][a-z-]{0,39}$`), the engine command's kind, `changes`, `setup` or `first-copy`. Returns `{saved: 'new' | 'already', rows: [{table, id, version, seq, private_to, deleted}]}`. Refusals: `bad-edit`, `bad-record` (anything Postgres refuses, so no row reaches its logs), `not-found` and `not-allowed` (42501), `changed-since` (P0001, `detail` lists `{table, id}`), `family-broken`, and every 3a and 3b trigger code. `app.begin_edit` (definer) writes the `edits` row private to the person, or says `already`; `prepenny.edit` (a transaction setting only save_edit sets) makes `app.fill_sync_fields` and `app.before_plan` fill `edit_id`, and `app.edit_for` makes the edit shared on its first shared record. `app.family_rules_problem` (invoker) runs D332's rules for the families written. `app.nudge` and `app.send_nudge` (definer) call `realtime.send('{}', 'changed', topic, true)`.
  - `public.plan_changes(plan, shared_after, mine_after)`, invoker: `{plan, rows: [{table, row}], members}`, every row the person can read with `seq` after the numbers given, removed ones included, without `plan_id`, `created_*` and `edit_id`.
  - `public.start_plan(plan, nation)`, invoker: adds the person to `people`, then the plan, or nothing when they own it already. `public.remove_plan(plan)`, definer: owner only, alone, signed in.
  - Realtime: `app.may_hear(topic)` and the policy `prepenny_hear_own_plans` on `realtime.messages`.
  - Only through `save_edit` (D345), in `supabase/migrations/20261107200000_changes_only_through_save_edit.sql`: the trigger `a0_only_through_save_edit`, first on every record table and on `plans`, refuses a person's insert or update with `use-save-edit` (42501) unless the `prepenny.edit` mark is set; `save_edit` sets it once its edit has begun and clears it once its records are written; `start_plan` sets `prepenny.starting` to the one plan it inserts. A person is the role `authenticated` or `anon`; the database's own roles aren't refused. Tests: `14-only-through-save-edit.test.sql`, and `tests.in_an_edit(name, plan)` in `supabase/seed.sql` for tests that write as a person.
  - Tests: `12-save-edit.test.sql`, `13-save-edit-roles.test.sql` (which swaps `app.send_nudge` for a catcher inside its transaction, because Realtime's store takes nothing while its service is off).
- **Built in step 3c, on the phone:** `apps/web/lib/sync-rows.ts` turns the engine's records into rows (`rowsOf`, `writesFor`, `writesForEdit`) and back (`recordsFromRows`), with derived ids from `lib/sync-ids.ts` (SHA-256, UUID version 8) for changes, ticks, settings, overtime details and private links; it runs in the worker (`sync-writes`, `sync-records`, `lib/sync-work.ts`). `apps/web/data/db.ts` version 2 adds `rows` (the server's rows as last seen), `unsent` (the queue, written by `saveChange` in the same transaction when the plan has a `links` row) and `links` (person and change numbers). `apps/web/data/sync.ts` does the rest: `connectPlan` after sign-in (first copy, bring down, or `choose`), `keepSavedPlan`, `keepPhonePlan`, `syncNow` (send the queue one edit at a time, then `plan_changes`), `keepInStep` (open, visible, online, every 60 s, and the nudges), `useSync`, `allSent` and `onPlanBroughtDown`. The plan on the phone is always `recordsFromRows(rows)` with the queue's writes on top (`rebuild`). `lib/edit.ts` gives each edit's `numbers` (payment numbers, `paymentNumberOf`) for undo's check.
- **Step 3c fix** (D351 to D355): `components/KeepInStep.tsx` (`checkSignIn`, `followSignOutInOtherTabs`, then `keepInStep` and `onAccountNews` while signed in) is on every screen: `AppShell.tsx`, and `SetupScreen` and `WelcomeScreen` in `components/setup/SetupScreen.tsx`. `syncNow` runs `syncOnce` through `inTurn`, one task at a time with `connectPlan`, `keepSavedPlan` and `keepPhonePlan`. `syncOnce` calls `lookAtAccount` (`lookOnce`, again on `AGAIN`, up to 3 times) when the account hasn't been looked at since PrePenny opened (`accountLooked`) or the plan on the phone has no `links` row, then `keepInStepOnce`; a `not-found` from `save_edit` or `plan_changes` means the plan left the account, and it looks again. `lookOnce`: a linked plan missing from `plan_members` is swapped for the account's (`bringDownInstead`, one Dexie transaction: remove, then put the plan, its rows and link); a linked plan beside another owned plan, or an unlinked plan with an account or a series beside any plan in the account, gives `choose` (`askToChoose`); an unlinked plan with nothing in it, or none, is swapped for the account's (`onlyIfEmpty`, checked inside the transaction); an unlinked plan with something in it and an empty account goes up (`sendFirstCopy`, which returns `has-a-plan` when `start_plan` is refused). `onAccountNews` gives `choose` (KeepInStep: `router.replace('/sign-in/?choose')`) or `brought-down` (`location.replace('/app/')`). `keepSavedPlan` calls `remove_plan` on a linked plan first. `saveChange(…, isNew)` throws `PlanGone` for a plan no longer on the phone, or a new plan beside another. `bringDownInstead` checks inside its transaction that the phone's own plan is still the one it looked at (`changed-here`). A first copy going up has `sending: true` on its `PlanLink` until `sendRest` has sent all of it; `publish`, `allSent` and `planSafelyKept` count it as not kept (D355). Only `plan_changes` refusing `not-found` means the plan left the account. Database: `supabase/migrations/20261108100000_one_plan_of_your_own.sql`, the trigger `one_plan_each` on `plans` (`before insert`, after `before_write` by name), `app.one_plan_each()` (definer: locks the owner's `people` row, refuses `has-a-plan`); test `15-one-plan-each.test.sql`. Sign out on the welcome, setup steps and the choice: `components/SignedInLine.tsx` with `components/SignOutSheet.tsx`, which `AccountCard.tsx` uses too. Since D360, `signOutAndForget` in `lib/account.ts` waits up to 3 seconds for the work registered with `finishBeforeSigningOut` (sync.ts's `running` and `chain`) before `forgetEverything`. Tests: `e2e/your-plan.spec.ts` 7 to 13, `test/unit/db.test.ts` ("A plan removed from this phone", "A new plan beside one that has just come down").

- **Built in step 3d** (D365 to D374): database: `supabase/migrations/20261109100000_offline_changes_and_clashes.sql`. `app.server_time()`; `app.begin_edit` saves `made_at` no later than the server's time (`app.no_later_than_now`). `public.save_edit(plan, edit, made_at, kind, writes, overrides uuid[] default null)` answers with `now`; for each updated or removed record whose old `edit_id` is in `overrides`, it calls `app.tell_clashes(plan, edit, lost)` (definer, only while `prepenny.edit` is this edit, only for an edit in the plan made no later than this one), which inserts a `notices` row `{lost, by, made_at, rows: [{table, id}]}` for the replaced edit's person. `public.plan_changes` gives each row as `{table, row (with edit_id), edit_made_at, edit_by}`, `members` with `nickname`, the person's unread `clash` `notices` from the last 30 days, and `now`. Tests: `16-clashes.test.sql`. Phone: `data/clock.ts` (`clockFrom`, `rememberClock`, `correctedTime`; the `device` key `server-clock`), learnt by `rpc(…, db)` in `data/sync.ts`. `data/db.ts` version 3: `UnsentEdit` extends `MadeChange` (`commands`, `today`, `numbers`, `before` (the edit's undo), `payments` (`PaymentAt`), `seen`, `madeOnPhone`, `clockKnown`, and `attempt`, what was last sent with no answer); `sent` (`SentEdit`, the last 100 per plan, for "ours" and notices); `clashes` (`StoredClash`: `kept-theirs`, `replaced`, `cant`, `refused`, with `facts`, `putBack` and `dismissed`); `StoredPlan.seen` (set by `rebuild`); `PlanLink.nicknames`. `saveChange` stamps `madeAt` with the corrected clock and `seen`. `lib/payment-at.ts`: `PaymentFacts`, `PaymentAt`, `paymentInFamily`, `paymentsAt`, `onNewestRecords` (refs found again by family and number; ticks already ticked dropped from an Update balance). `lib/clash.ts` (worker `settle` and `clash-facts`): `settleChange` → `send` (with `overrides`), `done`, `kept-theirs` or `cant`, judging record by record (`undoesTheirs`) and payment by payment (`keepsWhatTheyChanged`, `removedNow`); `replacedFacts`. `lib/edit.ts`'s `EditResult.payments`, and `runEdits(…, madeOn)` for "Put mine back". `data/sync.ts`: `keepInStepOnce` brings down what's new before sending a non-empty queue; `sendQueue` → `sendOne` (resends an `attempt` as it was; settles; keeps the attempt and notes it in `sent` before `save_edit`; `changed-since` brings down and settles again; any other refusal, after checking the plan is still there for `not-found`, is `takeOff` with a `refused` clash); `hearNotices` (in `bringDown`) turns a notice about a change in `sent` into a `replaced` clash and marks it read; `syncSoon` publishes the waiting count at once; only the privacy rules' own 42501 ("new row violates row-level security") is `not-allowed`, any other is tried again; `sendQueue` stops when `stillSignedIn()` (lib/account.ts) is false and works the plan out again (`rebuild`) after sending; a `save_edit` answer of `already` keeps no rows; a settle that throws is tried 3 times (`UnsentEdit.tries`), then taken off. The plan's own row comes down with `edit_id`, `edit_made_at` and `edit_by`, and a `settings` write is also checked against it (bank holidays). `rememberClock` keeps the most precise difference (`betterClock`). `mainPayments` (payment-at.ts) leaves Update balance ticks out of the removed-payment check; `onNewestRecords` drops ticks on payments no longer there (D375). `data/clashes.ts` (`useClashes`, `clashesChanged`, `dismissClash`), `lib/clash-words.ts`, `components/ClashSheet.tsx` (in `AppShell`), and `PlanActions.makeChangesAgain`. Item 37: `components/ServiceWorker.tsx` posts `TAKE_CHARGE` (`service-worker/messages.ts`) when the helper is ready and the page isn't controlled; `service-worker/sw.ts` answers with `clients.claim()`. Tests: `e2e/clashes.spec.ts` (with `e2e/two-phones.ts`), `test/unit/clash.test.ts`, `test/unit/clash-words.test.ts`, and the item 37 test in `e2e/offline.spec.ts`.

- **Built in step 3e** (D379 to D390): database: `supabase/migrations/20261110100000_devices_and_security.sql`. `app.session_ok()` now also needs `app.version_problem()` to be null (a Data API request, `request.path` set, must send `x-prepenny-version` equal to `app.database_version()`, the newest row of `supabase_migrations.schema_migrations`; else "update-needed" or "server-behind") and, when `app.two_step_on(person)` (a verified `auth.mfa_factors` row), `app.second_step_passed()` (the session's `aal` and the token's `aal` both "aal2"). `app.second_step_fresh()`: a `totp` row in `auth.mfa_amr_claims` for this session updated in the last 5 minutes; triggers `fresh_second_step` on `auth.mfa_factors` (before delete of a verified factor) and `auth.users` (before `email_change` is set) need one on any of the person's sessions. `public.hello()` (definer): `{sign_in: ok | ended | second-step, version: ok | update-needed | server-behind, now}`, and notes `app.devices.last_used_at`. `public.my_devices()`, `end_device(device)`, `end_every_device()` (definer; `app.browser_of`, `app.device_of` from `auth.sessions.user_agent`; `app.nudge_my_phones`). Backup email: `app.backup_emails` (one each, unique), `app.email_codes` (hashed, purpose `add-backup` or `get-in`, 10 minutes, 5 tries), `public.backup_email()`, `add_backup_email(email)`, `confirm_backup_email(email, code)`, `remove_backup_email()`, and for `anon` too `send_get_in_code(email)` and `use_get_in_code(email, code)` (swaps `auth.users.email` and the email identity, ends every session). Emails: `app.send_email` through `net.http_post` to `app.email_sender` (`test-inbox` in `seed.sql`, Mailpit's `/api/v1/send`; `resend` set by `app.use_resend(key)`, key in `vault.secrets` as `resend_api_key`, from `database.yml`). Item 39: `app.edit_devices` (filled by `app.begin_edit`), and `app.tell_clashes` adds `from: {session, browser, device}` to a notice. Tests: `17-devices`, `18-two-step`, `19-backup-email`, `20-versions` (seed helpers `tests.turn_on_two_step`, `tests.as_person_with_second_step`, `tests.through_the_data_api`). Phone: `lib/version.ts` (`appVersion`, `liveVersion` from `/version.json`, written by `scripts/build-worker.ts` with `NEXT_PUBLIC_DATABASE_VERSION` and `NEXT_PUBLIC_APP_BUILD`, excluded from the offline helper and `no-store` in `_headers`), `lib/account.ts` sends the header on every request and has `signInEndedOnServer` and `anyClient`; `data/sync.ts` `lookAtStanding` and `actOn` run first in `syncOnce` and `connectPlan`, and `lookAtSignInOnly` runs every minute while hidden; `lib/update.ts` (`updateWhenSafe`, `safeToReload`: no `dialog[open]`, no box typed into since its form was sent that's still on screen in an open place). `lib/security.ts` (two-step through `auth.mfa`, devices, email change verified on a throwaway client, backup email), `lib/device-words.ts`, `lib/app-lock.ts` (PBKDF2, `device` key `app-lock`, small-store keys `prepenny-app-lock` and `prepenny-app-lock-tries`), `lib/clock-offset.ts` (D378: `timeNow` and `timeInOrder` in `lib/ids.ts` use `serverNow()`, set by `data/clock.ts`), and the `elsewhere` clash kind (`heardElsewhere` in `data/sync.ts`, `StoredClash.madeOn`). Screens: `SecurityCard.tsx` on More, `DevicesScreen.tsx` (`/app/devices/`), `TwoStepScreen.tsx` (`/app/two-step/`), `EmailsScreen.tsx` (`/app/email/`), `LockSettingsScreen.tsx` (`/app/lock/`), `AppLock.tsx` in `AppShell` and `SetupScreen`, `GetBackInScreen.tsx` (`/get-back-in/`), the sign-in page's `second-step` step, `SecondStepSheet.tsx` and `CodeBox.tsx`. Tests: `e2e/devices.spec.ts`, `two-step.spec.ts` (with `e2e/totp.ts`), `emails.spec.ts`, `versions.spec.ts`, `app-lock.spec.ts`.
- **Built in step 3e hardening** (D391 to D398): database: `supabase/migrations/20261111100000_safer_recovery.sql`. `app.get_back_in` (one open per person: `stopped_at` and `done_at` null; `stop_hash` is the SHA-256 of the stop link's 32-byte token, nulled when it ends; `finishing_at` once the finishing code is accepted; ready 24 hours after `started_at`, then open 7 more days before `ran-out`), `app.open_get_back_in(person)`, `app.start_get_back_in`, `app.stop_get_back_in_for`, `app.tell_stopped`. `app.email_codes` gains `stage` (`start`, `wait`, `finish`) and `request_id`; a finishing code must be `finish`, for the open request, sent after it was ready. Caps: `app.code_tries` and `app.code_locks`, keyed by `app.address_key(address)` (SHA-256) and purpose; `app.may_send_code` (not locked, under 3 in 24 hours), `app.note_wrong_try` (the 10th in 24 hours locks for 24 hours and clears the tries); `app.check_code` now refuses a locked address and notes every wrong try. Emails: `app.email_html` and `app.send_email` gain a button (`link_label`, `link_url`), `app.email_sender.site` is the site for links (`http://127.0.0.1:4173` in `seed.sql`), `app.when_words` writes UK times. `public.hello()` adds `get_back_in: {started_at, ready_at}` (null when none, or while finishing). `public.send_get_in_code(email)` chooses the email by stage. `public.get_back_in_with_code(email, code)`, `get_back_in_finished(request)`, `get_back_in_not_finished(request)`: `service_role` only, each checks `app.from_supabase_admin()`. `public.stop_get_back_in()` (signed in) and `stop_get_back_in_with_link(token)` (anyone). `public.end_other_devices()` replaces `end_every_device()`. `use_get_in_code` is gone. Finishing (`app.complete_get_back_in`, also from `app.settle_finishing`) deletes every `auth.identities` row but `email` and sets `raw_app_meta_data` `provider` and `providers` (D402); `get_back_in_not_finished` settles rather than only reopening, and `app.open_get_back_in` settles any left finishing over 5 minutes (D399). Function: `supabase/functions/get-back-in/index.ts` (Deno, no packages; `verify_jwt = false` in `config.toml`; secret key from `SUPABASE_SECRET_KEYS`, else `SUPABASE_SERVICE_ROLE_KEY`; calls the three steps through the Data API and `PUT`/`DELETE /auth/v1/admin/users/{id}`), deployed by `database.yml` with `supabase functions deploy get-back-in --no-verify-jwt --use-api`; `end-to-end.yml` no longer leaves out `edge-runtime`. Tests: `21-safer-recovery` (seed helper `tests.as_supabase_admin`). Phone: `lib/security.ts` (`getInWithCode` fetches `/functions/v1/get-back-in` with the publishable key in `apikey`; `stopGetBackIn`, `stopWithLink`, `endOtherDevices`), `data/get-back-in-notice.ts` (set from `hello` in `data/sync.ts` `lookAtStanding`), `lib/device-words.ts` `momentWords`. Screens: `GetBackInNotice.tsx` in `AppShell`'s notes and setup's notices, `GetBackInScreen.tsx` (the wait, remembered under the small-store key `prepenny-get-back-in`), `StopGetBackInScreen.tsx` (`/stop-get-back-in/#token`), and `DevicesScreen.tsx`'s "Sign out of all other devices". Tests: `e2e/recovery.spec.ts`, and `devices.spec.ts` test 2.
- **Built in step 3e-2** (D403 to D411): previews can have a database of their own, the Supabase project `prepenny-preview`, made with Supabase's paid plan (D411). Until then the `preview` job is skipped (its `if` needs `vars.PREVIEW_SUPABASE_URL` and `vars.PREVIEW_SUPABASE_PUBLISHABLE_KEY`), previews build with signing in off, and the `deploy` job's link comment says what a preview can and can't do. `.github/workflows/deploy.yml`: the `deploy` job builds a pull request with `NEXT_PUBLIC_PREVIEW=true` and `vars.PREVIEW_SUPABASE_URL` / `PREVIEW_SUPABASE_PUBLISHABLE_KEY` only (refusing the real project's), and outputs the preview's address; the `preview` job (`needs: deploy`, concurrency group `preview-database`, never cancelled) checks `PREVIEW_SUPABASE_URL` is `https://<ref>.supabase.co` and not `vars.SUPABASE_URL`, runs `scripts/check-supabase-key.ts` with `PREVIEW_SUPABASE_ACCESS_TOKEN` and `EXPECT_PROJECT_NAME=prepenny-preview` (it stops after its first GET on any other name), links with `PREVIEW_SUPABASE_DB_PASSWORD`, reads `supabase_migrations.schema_migrations`, `preview.migrations` and `preview.pull_requests` (every pull request sharing it) through `POST /database/query`, decides with `scripts/preview-database.ts` (`nothing`, `add` → `supabase db push --linked`, `start-again` → `supabase db reset --linked --no-seed --yes`), notes the fingerprints and pull requests (`recordSql(…, changed)`: only this one after a change), deploys the function, checks the Data API, sends `supabase/sign-in-settings.json` with `site_url` the preview, `uri_allow_list` `https://*-<worker>.<subdomain>.workers.dev/**`, Google off and Resend as "PrePenny (test version)", runs `app.use_resend($1)` with the key as a parameter and sets `app.email_sender.site` and `from_name`, then runs `e2e/preview.spec.ts` (Playwright project `preview`, only when `PREVIEW_URL` is set, with no web server) with the secret key from `GET /api-keys?reveal=true`, removes `preview-check-*@example.com` accounts and their plans (only after the key check passed), updates the link comment the `deploy` job posted, and comments on every other open pull request sharing it after a change. A pull request's build is never deployed as the live app, even when Cloudflare has none (10007). Every secret is given only to the steps that use it, and the tests never get the Supabase key. `database.yml` runs the key check first. `scripts/check-supabase-key.ts`: `NEEDED` (the eleven, as the token page names them), probes from Supabase's `x-fga-permissions` (PATCH the project's own name; DELETE `third-party-auth/00000000-…`; PATCH `database/migrations/19700101000000` and `functions/prepenny-key-check-never-made` with `{}`; `database/query/read-only` with `select 1`, and `database/query` making a temporary table `on commit drop`, which must answer 2xx; `api-keys?reveal=true`, which must show an `sb_secret_` or `service_role` key in full; any non-refusal from the migrations calls), `checkKey`, `report`. Phone (D404): `lib/time-limit.ts` (`fetchWithTimeLimit`, 30 seconds, given to Supabase's client as `global.fetch` and used for `/auth/v1/settings`, the get-back-in function and `/version.json`); `data/sync.ts` `lookForGetBackIn` (its own `hello`; asked again while asking, it asks once more; an answer after the notice changed meanwhile is left out, by `getBackInNoticeChanges`) from `keepInStep`'s every look and each live nudge. Database: `supabase/migrations/20261112100000_notice_for_every_version.sql` (`hello` gives `get_back_in` to any version whose sign-in stands; `app.devices` is still noted only for the right version). `lib/preview.ts` and `components/PreviewLine.tsx` (in `app/layout.tsx`). Tests: `scripts/check-supabase-key.test.ts`, `scripts/preview-database.test.ts`, `test/unit/time-limit.test.ts`, `22-notice-for-every-version.test.sql`, `e2e/recovery.spec.ts` test 4 and `e2e/preview.spec.ts`.

### 3.6 Shared plans, roles and privacy

- **Roles.** Each plan member has one role (brief 7.1):
  - **owner:** made the plan; invites, changes permissions and renames the plan. One per plan.
  - **editor** ("Can edit", the default): sees and changes everything shared.
  - **viewer** ("Can view only"): sees everything shared, changes nothing shared. **Agreed (D51):** that includes ticks, which narrows brief 4.14's "either person can tick" to people who can edit. The server refuses, not only the screen (brief 8.7 test 3).
- **Shared or private.** Each account is shared or private to the person it belongs to. When Jess shares, she chooses which accounts go into the plan (brief 4.14). A private account and everything on it (its series, changes, ticks, balance updates, budgets and spends) carry `private_to = Jess`. The database fills this in itself from the account, so the app can't forget.
- **The rule on every table.** A person can read a row only if their sign-in session still exists (D21), they're a current member of the plan, and the row is shared or private to them. They can change it only if, as well, they're the owner or an editor (or the row is private to them), and the row isn't locked to someone else.
- **From Jess (D16).** Jess's £600 from her private account to the joint account is saved as two linked series in one edit:
  - the private half, on her account, `private_to = Jess`
  - the shared half, on the joint account, named "From Jess", with no account name, note or debt, `locked_to = Jess`.

  Tom sees "From Jess, £600" arriving on the date, and nothing else. The server refuses a shared half that carries anything except the date, amount, schedule and estimate flag.

  The private half is money going out of Jess's account and the shared half is money coming into the joint account. Neither is a transfer in the sums, so Jess's own view counts the £600 once on each side, never twice. **Agreed (D52):** money the other way shows as "To Jess".
- **Debts and goals** each belong to the plan (shared) or to one person (brief 4.14). A debt or goal that belongs to one person is private to them unless they choose to share it (D65).
- **Activity.** Edits that touched anything private are private too. A partner's activity list shows only shared changes.
- **Leaving** (brief 4.14) needs nobody's approval. The leaver's private accounts move out with them into a plan of their own. If they choose to keep a copy, the shared records they could see are copied into that plan as of that moment, and never update again (brief 8.7 test 5). The other person keeps the shared plan as it was. Shared halves of the leaver's transfers ("From Jess") stay in the shared plan, no longer locked, so the person who stays can change or remove them.
- **Agreed (D53):** if the owner leaves, the person who stays becomes the owner. If the owner stops sharing, the other person keeps a copy automatically, so nobody can be cut off from records they relied on.
- **Nothing shows when someone last opened the app** (brief 4.14). There's no "last seen" anywhere a partner can read, and the list of signed-in devices is visible only to its owner.
- **Sign out everywhere** (D21) ends the sessions. Every rule checks that the session still exists, so the next request from an old phone is refused at once. A message on the person's own private channel tells their other phones to wipe the plan and close the live connection. A phone that misses that message only gets nudges with no money data, and refused requests.

**For future sessions: Row Level Security, in outline**

```sql
-- true while the sign-in session in the token still exists (D21)
create function app.session_ok() returns boolean ...
  -- exists (select 1 from auth.sessions where id = (auth.jwt() ->> 'session_id')::uuid)

create function app.is_member(p uuid) returns boolean ...   -- current member, not left
create function app.can_edit(p uuid) returns boolean ...    -- role is owner or editor

create policy read on app.series for select using (
  app.session_ok() and app.is_member(plan_id)
  and (private_to is null or private_to = auth.uid()));

create policy change on app.series for update using (...) with check (
  app.session_ok() and app.is_member(plan_id)
  and (private_to = auth.uid() or (private_to is null and app.can_edit(plan_id)))
  and (locked_to is null or locked_to = auth.uid()));
```

The same pattern goes on every plan table. Every table starts with everything refused, and a test proves each policy (brief 8.7 test 2, Phase 3).

**Built in step 3a** (D288 to D299), in `supabase/migrations`:

- `20261105100000_people_and_plans.sql`: `people`, `plans` (with the nation, D289), `plan_members`, `invites`, the plan's change counts `app.plan_counters` (one for shared records and one for each person's private ones, so a partner sees no gap, D299; `seq` comes from the count of the row's own privacy, so `changes_since` in 3c takes a shared number and the person's own), and the checks in the `app` schema, which PostgREST never exposes: `app.session_ok()` (the token's own `session_id` is still in `auth.sessions`, for that person, before `not_after`, D21), `app.my_plans()`, `app.my_edit_plans()`, `app.my_owned_plans()` and `app.my_partners()`, each answering only about `auth.uid()`. Policies use them as `plan_id in (select app.my_plans())`, evaluated once per query. Domains: `app.pence` (a whole number within `Number.isSafeInteger`), `app.decimal_text`, `app.utc_time` (the phone's own UTC text, kept exactly, D288) and `app.tax_year`.
- `20261105100100_plan_records.sql`: every plan record table, each starting with the sync fields of 3.1 plus `list_order` (D168): `accounts`, `balance_updates`, `debts`, `pay_profiles`, `pay_weeks`, `goals`, `budgets` (with `made_at`, the engine's `createdAt`), `series`, `payment_changes` and `ticks` (each with `payment_number`, PLAN.md item 4, and `locked_to` from their series, D293), `spends`, `pay_adjustments`, `settings` (each person's `main_pay_family_id` and `setup`, D289), `practice_changes` (D294) and `private_links` (D291); then `edits` and `notices` (D296). A change or tick names a series or, for a pay-later bill, a budget (D111). The list of plan record tables is `app.record_tables()`. Two changes from 3.3: the shared half of a private transfer doesn't name its private half; the private half names it in `mirrored_by` (D291). And `series.budget_id` must stay empty (D160).
- `20261105100200_filled_in_by_the_database.sql`: triggers, `a_privacy` then `b_sync_fields` on each table. `b_sync_fields` fills `created_*`, `changed_*`, `version` and `seq` and refuses anyone outside the plan before counting. The `a_privacy` triggers fill `private_to` from the parent (D290), check every link with `app.check_link` ("link-to-private" when a shared row names a private one, D291), look up only records in the row's own plan (D299), check a series' family with `app.family_problem` ("family-mixed", D299), refuse private-to-shared transfers ("private-transfer-needs-halves"), check the shared half ("shared-half"), fill `ticked_by` and `recorded_by`, and refuse changes to a record's parent ("fixed-field") or privacy ("sharing-comes-later"). Every lookup runs as the person, under the rules, so a record they can't see is "not-found" with code 42501, the same as the rules' own refusal.
- `20261105100300_privacy_rules.sql`: on each plan record table, three policies, `read`, `add` and `change`, as in the outline above; no `delete` for anyone. Then the rules for `edits` and `notices`, and, at the end, every function in `app` taken back from everyone and only the checks the rules call given to `authenticated`. A later migration that adds a function to `app` must end the same way.
- **Built in step 3b** (D301, D303): `20261106100000_owner_answers_to_step_3a.sql` drops `practice_changes` (D301). Pay profiles are always private to their person (`app.check_pay_profile`). `series.paid_to` says whose pay a series is: set only by that person, kept by a split (`app.family_problem` now takes it too), and refused on the shared half "From Jess". `private_links` takes a third kind, `series_id` + `pay_profile_id` + `cycle_pay_weeks`, made only by the person whose pay it is ("not-your-pay"). `pay_adjustments` keeps only `family_id`, `payment_number` and `change`, with `locked_to` filled in on shared pay; its details are in the new `pay_adjustment_details` (`adjustment_id`, `kind`, `worked_on`, `hours`, `rate`, `extras`, `tax_year`), always private. Only the person whose pay it is can add either. Test: `09-job-details.test.sql`. `20261106110000_view_only_own_pay.sql` (D311) recreates the `add` and `change` rules of `series`, `payment_changes`, `ticks` and `pay_adjustments` so a viewer can write shared rows that are their own pay (`paid_to` = them, money in, no set-aside or goal; `app.my_own_pay()` for changes and ticks; `locked_to` = them for adjustments). Test: `10-view-only-own-pay.test.sql`. `20261106120000_no_planted_passwords.sql` (D313) puts `app.no_planted_password()` on `auth.users`: `encrypted_password` is '' while `email_confirmed_at` is null and at the moment it's set. Test: `11-no-planted-passwords.test.sql`, and the e2e "nobody can plant a password".
- **Built in step 3f** (D412 to D425), in `supabase/migrations/20261113100000_shared_plans_invite_and_join.sql`: `invites` gains `asked_by`, `asked_at` and `refused_at`; `app.invite_hash(token)` (SHA-256 of "prepenny-invite:" and the 32-byte token from `app.new_token()`), `app.invite_state(invite)` (`joined`, `not-allowed`, `cancelled`, `ran-out`, `waiting`, `open`), `app.nickname(typed)` (1 to 30 characters, "needs-name"), `app.in_a_plan(person)`, `app.members_now(plan)`, `app.owner_name(plan)`, `app.join_requests()`. Steps, all `security definer`, each checking who's asking: `public.make_invite(plan, role, nickname, email)` (owner only; cancels any invite not answered; sends the email with `app.send_email` and its button `/join/#token`; 3 emails a day for a plan; gives the token back for a link only), `cancel_invite(invite)`, `look_at_invite(token)` (the state for this person: `used` for anyone but the asker once asked, `yours`, `member`, `full`, `has-a-plan`, `not-found`), `ask_to_join(token, nickname)` (adds the person to `people`, uses the invite up, nudges `plan:<id>:<owner>`), `answer_join(invite, allow)` (owner only; adds a `plan_members` row with the invite's role, or sets `refused_at`; nudges `plan:<id>`), `sharing(plan)` (members with roles and names, `max_members`, `my_name`, and for the owner the invite open or last, and the requests), `share_accounts(plan, accounts, edit, made_at)` (D413: editors only, the person's own private accounts; refuses `share-together` and `share-has-halves` with ids in `detail`; begins the edit, sets `prepenny.sharing` and `prepenny.edit`, makes the private links with `app.derived_id(plan, kind, parts)`, the phone's own ids, then saves the accounts (`private_to` and `belongs_to` empty) and every live record on them again, so the `a_privacy` triggers fill in their privacy; removed records stay private, D414) and `claim_pay(plan, family, edit, made_at)` (D418, sets `prepenny.claiming`). `hello()` adds `join_requests`. `app.check_owned_record` lets `prepenny.sharing` share an account of the person's own; `app.check_series` lets `prepenny.sharing` and `prepenny.claiming` change whole families and waits on the family check for them; `app.family_problem` leaves out a removed series' privacy, lock and pay; `app.check_pay_adjustment` takes its privacy from a live series. Tests: `23-invite-and-join.test.sql`, `24-sharing-accounts.test.sql`, with the fixture `tests.make_jess_alone()` in `seed.sql`. Engine: `add-payment` takes `otherHalf: { id, accountId, name }` for the shared half of a private transfer, and `delete-payment` removes both halves. Phone: `lib/sharing.ts` (the steps, `problemOf`, the link `inviteLink`/`tokenFrom`, the small-store key `prepenny-join`), `lib/private-transfer.ts` (`addPaymentCommand`), `data/shared-plan.ts` (`useSharedPlan`: shared accounts, `lockedTo`, `paidTo`, `familyOf` and names, from the rows on the phone), `data/join-requests.ts` (set from `hello` in `data/sync.ts`), `phoneHasOwnPlan()` in `data/sync.ts`. Screens: `ShareScreen.tsx` (`/app/share/`), `ShareAccountsScreen.tsx` (`/app/share/accounts/`), `JoinScreen.tsx` (`/join/`, outside the app's frame; looks every 3 seconds while waiting, then `connectPlan`), `JoinRequest.tsx` (`JoinRequestChoice`, and `JoinRequestSheet` in `AppShell`), `ClaimPay.tsx` and the "locked to" line in `EditSheet.tsx`; the sign-in page's `?from=join`. Tests: `e2e/sharing.spec.ts` (in the sign-in projects), `test/unit/sharing.test.ts`, `packages/engine/test/unit/add-private-transfer.test.ts`.
- Tests: `supabase/tests/database/*.test.sql` (pgTAP), with helpers and the Jess, Tom and Alex fixture in `supabase/seed.sql` (`tests.make_jess_and_tom(role)`, `tests.as_person(name)`, `tests.rows_naming(ids)` and others). Supabase loads the seed into the local database only. Run them with `supabase start` then `supabase test db`, and `supabase db lint --level warning`.

### 3.7 Records on the server only

| Record | Fields | Notes |
| --- | --- | --- |
| **Device** | person, sign-in session id, name ("Android phone, Chrome"), signed in at | The signed-in devices list (brief 4.13). No "last seen" a partner can read. Built in step 3e as `app.devices` (when it was last used, for its own person only) beside Supabase's own sessions (D380) |
| **Push subscription** | person, device, push address and keys, made at | For reminders (brief 4.11) |
| **Recovery contact** | person, kind (email or phone), value, verified at | Getting back in (brief 4.13). Built in step 3e as `app.backup_emails`, email only (D379, D384), with a 24-hour wait in `app.get_back_in` from step 3e hardening (D391) |
| **Person settings** | which reminders are on, quiet hours from and to, weekly summary day, hide amounts in notifications (D54), analytics opt-in, time zone, charge day | Also copied to the person's own phones. Time zone is "Europe/London" unless changed; reminders use it to know the person's "today" |
| **Subscription** | person (or plan, for Couple), kind (trial, Solo, Couple, Founders, organisation), month or year, status, trial ends on, renews on, price, source (Stripe, Apple, Google, organisation), Stripe customer id, free months used this year, referral months used this year | Brief 4.17. Filled in by Stripe and store messages, never by the phone |
| **Price** | plan, month or year, amount in pence, on sale or not, founders limit (500) | Prices are settings, not code (brief 4.17) |
| **App setting** | VAT registered or not | Prices say "including VAT" only once registered (D25) |
| **Organisation** | name, places, paid until, join link (hashed), Stripe ids, admins | Brief 4.17. Holds no money data from anyone's plan |
| **Organisation member** | organisation, person, joined on, removed on | |
| **Referral** | who referred, the friend, rewarded on | Up to 12 free months a year |
| **Payment event** | Stripe event id (unique), received at | The same message from Stripe twice changes nothing (brief 8.7 test 8) |
| **Support access** | person, granted at, ends at (7 days later) | The only way support sees amounts, names or notes (brief 4.16) |
| **Support message** | person or email, app version, phone type, message, replied at | Never adds money data on its own (brief 4.16) |
| **Problem report** | person, screen, consent given at, attachment (screenshot or plan copy, private storage) | Attachments deleted after 30 days (D55) |
| **Idea** | person, text | "Suggest a feature" |
| **Usage count** | day, event name, count | After launch, opt-in only, no person id (brief 7.2, D19) |
| **Deletion request** | scrambled person id, requested at, finished at | Data goes straight away. Supabase Pro backups roll off after 7 days, inside the brief's 30 (brief 7.2) |

### 3.8 Kept on the phone only

Stored in the phone's browser database (IndexedDB):

- a copy of every record this person can see, for each plan they're in
- the queue of unsent edits, the last change number for each plan, and the server clock difference
- the undo list (this person's recent edits)
- what-if practice changes, which are never sent anywhere
- the app lock: on or off, the PIN, scrambled so it can't be read back, the fingerprint or face key's id, and the 5-minute timeout (brief 4.13)
- this device's settings: light or dark, pay periods or calendar months, filters, how many months to show
- the "try first" plan and pay calculator drafts made before signing up. They move into the new account at sign-up (brief 4.13). Since step 3b, the plan notes whose it is once they sign up (`owner`, D306)
- the sign-in itself, kept by Supabase's client in the browser's small store (step 3b)
- the bank holiday copy and the date it was fetched.

Signing out wipes all of it (brief 4.13). Other people's private records are never on the phone, because the server never sends them.

### 3.9 Where each decision lives

| Decision | Where it lives in the data |
| --- | --- |
| D1 Paying early | Tick `paid_on` |
| D2 Budgets and the bank | Spend `recorded_at`, Budget, Balance update |
| D3 Left to spend line | Account `warning_level`, Plan member `main_pay_family_id` |
| D4 Skipping | Payment change `skipped`; Series `end_rule` still counts it |
| D5 Overtime | Series `cycle_pay_weeks`, Pay week, Pay adjustment, Pay profile `covered_to` (D131) |
| D6, D7, D8 | Test data and test tolerances only |
| D9 Rounding | Decimals stored as exact text; the engine rounds once |
| D10, D11 | Rules in the engine and on screen; nothing stored |
| D12 Same-day order | Series `family_id` (when the family was first created) and `name` |
| D13 Statement day | Debt `statement_day` |
| D14 Main pay | Plan member `main_pay_family_id` |
| D15 Example plan | Plan `is_example`, and the example data file |
| D16 Couples | `private_to`, Series `mirror_of` and `locked_to` |
| D17 to D23 | Tools and set-up, not data (section 1); D21 uses Device and the session check in every rule |
| D24, D26 | Business and design, not data |
| D25 VAT wording | App setting |
| D27 Debts follow D1 | Tick `paid_on`, read by the debt sums |
| D28 Left to spend | Series `type`, Budget, Plan member `main_pay_family_id` |
| D29 Budget periods | Budget `every`, Plan member `main_pay_family_id` |
| D30 Roll-over | Budget `roll_over`, `roll_over_from` |
| D31 Spread | Budget `leaves` |
| D32 Pay-later bill | Budget `leaves`, `bill_day`, `statement_day`; the real bill is a Payment change on the budget |
| D33 Time of update | Balance update `checked_at`, Tick `ticked_at` and `in_balance_update`, Spend `recorded_at` |
| D34 Paid off | A rule only, no data |
| D35 to D37 | Words and checks, not data |

### 3.10 Adding "Leave these out for now" later

Brief Part 10 lists six things to leave out but design for. None of them needs the data started again.

| Later | What's already in place | What gets added |
| --- | --- | --- |
| **Bank connections** that tick payments, through an FCA-authorised Open Banking provider | Ticks and balance updates already have a `source` field ("typed" or "bank"). The engine treats a tick the same however it was made | A **Bank link** record (provider, consent expiry, which account it fills) and a **Bank item** record (what the bank reported, matched to a payment). Matching creates ordinary ticks and balance updates with `source = bank`. The provider's keys live only on the server |
| **Housemates** (more than two people) | Plan members are already a list with roles, and `max_members` is a setting. "From Jess" halves work for any number of people | Raise `max_members`. Add an optional `shares` list to a series (person and percentage) to split a bill, worked out by the engine. Who owes whom is a new engine function, not new stored data |
| **Reading a payslip or statement from a photo** | The pay calculator and "Update from statement" already take typed figures | A step that fills those same fields from a photo. The photo is read and thrown away; only the typed-in figures are kept, as today |
| **A shift rota that predicts paydays** | Pay weeks, pay profiles and `covered_to` already link shifts to paydays (D5, D131) | A **Shift** record (person, date, hours, kind). The engine builds each payday's pay lines from the shifts and saves the difference as a pay adjustment, as "I did overtime" does now |
| **Comparing ways to clear several debts** | Debts already hold balances, rates and minimum rules | A new engine function only. No new data |
| **Other countries, currencies and languages** | Accounts and debts store a currency; all words live in one strings file (VOICE.md); dates and money go through one formatter; tax rules are data files | Plan `nation` becomes country and region; one strings file per language; tax files per country; bank holiday lists per country |

## 4. Screens

**In plain words.** Below is every screen, sheet and public page, which part of the brief asks for it, and which of the six people need it most. Then come rough sketches of the main screens at phone width, filled in with Sam's example plan on Sun 25 Oct 2026, using the parts from `docs/DESIGN.md`. Every number in the sketches comes from Sam's plan in brief Part 8 and was checked against brief 8.3, except where a sketch says its amounts are examples.

The app has four places in the bottom navigation: **Home, Coming up, Debts, More** (brief Part 6; the brief's Plan is called Coming up since step 2d-2, D208). Editing always opens in a bottom sheet on phones and a centred dialog on laptops, never a new page. "Everyone" means all six people from brief Part 2.

### 4.1 Public pages (no account needed)

| Page | Brief | Who needs it |
| --- | --- | --- |
| Website home (landing page), with the tagline | Part 6, Phase 5 | Everyone |
| Take-home pay calculator, at `/pay-calculator/` (step 2g) | 4.15, 4.17 | Sam, Priya, Dee, Jess and Tom, Ali (Kofi is self-employed, so not him) |
| Payday check (the brief's "Will I make it to payday?"): type today's balance, your payday and what's going out before it; see "£X left on Fri 30 Oct" or "£X short on Sun 1 Nov" | 4.17 | Everyone, most of all Sam, Dee and Ali |
| Pricing, with weekly prices ("about 69p a week") and founder places left | 4.17 | Everyone |
| For organisations: buy places, then a dashboard of places in use | 4.17 | Employers and housing associations |
| Help centre articles | 4.16 | Everyone |
| Help when money is tight (the brief's "Worried about money?") | 4.16 | Sam, Dee, Ali |
| Privacy notice, terms, accessibility statement | 7.2, 7.3 | Everyone |
| Service status | 4.16 | Everyone |
| Sign up and sign in: email code, Google, later Apple | 4.13, D20 | Everyone |
| Getting back in: a backup email or phone added in advance, or contact support | 4.13 | Everyone |
| Join a shared plan: the page an invite link opens, to sign up or sign in and then join (`/join/`, built in step 3f) | 4.14 | Jess and Tom |
| Join through an organisation: the page an organisation's link opens | 4.17 | People whose employer or housing association pays |

**Agreed (D58):** VOICE.md bans questions as headlines and wins over the brief (D36), so two pages get new names. "Will I make it to payday?" becomes **Payday check**, headed "Check your money lasts until payday". "Worried about money?" becomes **Help when money is tight**. Help articles are titled as statements too: "Why your lowest point is on Sunday".

### 4.2 First-time setup

6 screens in 3 parts since the shorter setup (D356), instead of step 2e's 8 steps. Every screen can be skipped and changed later (brief 4.1), except the first, the account and balance (D163), and the last, which has nothing to skip. Sketches are in 4.6. Built in step 2e (D220 to D229), and made shorter in D356.

| Screen | Brief | Who needs it most |
| --- | --- | --- |
| Welcome: the tagline, "Set it up once, about 5 minutes. After that, just keep it up to date.", "Make my plan" and "Look at an example plan" (step 2e, D356) | 4.1, Part 6 | Everyone |
| **Part 1 of 3: Money in** | | |
| 1. Your account and balance today, with any overdraft limit and warning level | 4.1, 4.2 | Everyone; Ali for the overdraft |
| 2. How you're paid: every pay choice, "My pay changes in a pattern", linking pattern steps to pay weeks (D5), choosing the main pay when there's more than one (D14) | 4.1, 4.3 | Everyone: Sam's pattern, Priya's last working day, Dee's two incomes, Kofi's estimate, Ali's chosen dates |
| **Part 2 of 3: Money out** | | |
| 3. Home and bills: rent or mortgage at the top, then the bills checklist with UK defaults, on one screen | 4.1 | Sam, Ali (rent each term), Jess and Tom; everyone for bills, Priya's yearly bills, Dee's council tax |
| 4. Debts | 4.1, 4.6 | Sam, Kofi, Ali |
| 5. Spending money | 4.1, 4.5 | Everyone |
| **Part 3 of 3: Your plan** | | |
| 6. Here's your plan, ending "From now on: update your balance when you check your bank, and tick payments as they go out.", with "Saving for something? Add a goal", which opens the savings goal sheet | 4.1, 4.7 | Everyone; Priya, Jess and Tom for savings |

### 4.3 Main screens

| Screen | Brief | Who needs it most |
| --- | --- | --- |
| **Home** | 4.9 | Everyone |
| **Coming up** (the brief's Plan, D208), by payday or calendar month, with View and "Show another month" | 4.8 | Everyone |
| **Debts** | 4.6 | Sam, Kofi, Ali. Others see "No debts" and an "Add a debt" button |
| **One debt**, with "Update from statement" and, for credit cards, the minimum, fixed and full comparison | 4.6 | Sam, Kofi, Ali |
| **More** | 4.11 to 4.17 | Everyone |
| Accounts, and one account | 4.2 | Everyone; Jess and Tom have three |
| Budgets, and one budget with its spends | 4.5 | Everyone |
| Savings goals, and one goal | 4.7, 4.14 | Priya, Jess and Tom |
| Pay calculator, with saved pay weeks and "Check my payslip" | 4.15 | Sam, Priya, Dee, Jess and Tom, Ali |
| What if | 4.10 | Everyone, most of all Kofi |
| Shared plan: who's in it, permissions, invite, leave (Share with my partner, `/app/share/`, and Choose shared accounts, built in step 3f; roles and leaving in step 3g) | 4.14 | Jess and Tom |
| Activity: recent changes, with undo for your own | 4.12, 4.14 | Jess and Tom; everyone for the change history |
| Reminders | 4.11 | Everyone |
| Export, import and delete | 4.12 | Everyone |
| Account settings: email, sign-in method, password, two-step sign-in, backup email or phone | 4.13 | Everyone |
| Signed-in devices, with "Sign out of this device" and "Sign out of all other devices" (D394) | 4.13 | Everyone |
| App lock settings, and the lock screen ("Open with your PIN", "Open with fingerprint", "Open with face", D35) | 4.13 | Everyone; Jess and Tom for safety |
| Subscription: plan, charge day, cancel in two taps, "Can't afford it this month", refer a friend | 4.17 | Everyone |
| Help, Contact us, Suggest a feature, Help when money is tight | 4.16 | Everyone |
| The 60-second tour, skippable and replayable | 4.16 | Everyone |
| Support admin (staff only), with no money data unless access is given | 4.16 | The owner and support |
| Tax year check (staff only) | 4.15 | The owner |

### 4.4 Bottom sheets

| Sheet | Brief | Who needs it most |
| --- | --- | --- |
| **Edit a payment**: mark as paid, move to next payday, skip, change amount, date, name or note, then "Just this one" or "This and all later ones", or remove | 4.4, 5.4 | Everyone |
| Add a payment: in, out or transfer, the next payment's date (labelled "Next payment", never "First payment", D86), how often, when it ends, a different last amount, weekend rule, type, linked debt or goal, estimate | 4.3, 4.4 | Everyone |
| **Update balance**, in three steps | 4.2, D33 | Everyone |
| I spent | 4.5 | Everyone |
| I did overtime, and I missed a shift | 4.3, D5 | Sam; Dee for her wages |
| Real pay arrived: type the real amount and see the difference | 4.3 | Sam, Dee, Kofi |
| Filters: still to pay, money in, debts, a type, an account | 4.8 | Everyone |
| Payments that could move, opened from a shortfall | 5.5, Part 3 principle 7 | Sam, Dee, Ali |
| Update from statement | 4.6 | Sam, Kofi, Ali |
| Add or edit a debt, including the credit card rule and a currency rate | 4.6 | Sam, Kofi, Ali |
| Add or edit a budget | 4.5 | Everyone |
| Add or edit a savings goal | 4.7 | Priya, Jess and Tom |
| Share with my partner: choose accounts, permission, link or email (built in step 3f as screens, with "Jess wants to join your plan" as a sheet) | 4.14 | Jess and Tom |
| Clash notice, "Changed on two phones" (built in step 3d, D368): "Jess changed Rent on Tue 1 Dec to £560 after you changed it to £550. Jess's change is kept.", with "Put mine back" | 4.14 | Jess and Tom; anyone with two phones |
| Leave the shared plan: keep a copy or not | 4.14 | Jess and Tom |
| Something looks wrong: choose to attach a screenshot or plan copy, after a clear consent message | 4.16 | Everyone |
| Subscribe, when the trial has ended | 4.17 | Everyone |
| Sign out, warning if some changes haven't been sent yet | 4.13 | Everyone |
| The small "?" help sheets | 4.16 | Everyone |

### 4.5 Messages that appear on any screen

- **Undo bar** after every change: "Rent changed for this and all later ones. Undo" (brief Part 3, principle 4).
- **Offline note:** "You're offline. Changes are saved on this phone and will be sent when you're back online." (brief Part 6)
- **Sync down note:** "Changes can't be sent right now. They're saved on this phone." (brief 4.16)
- **Example plan banner:** "This is an example plan. Nothing here is yours." (brief 4.1, D15)
- **Trial ended banner:** "Your free trial has ended. You can still see your plan, update your balance and tick payments." (brief 4.17)
- **Gentle advice note,** after a shortfall three paydays running: "Free, confidential help is available" with a link to Help when money is tight (brief 4.16).

### 4.6 Sketches

Each sketch is about 36 characters wide, roughly a 320px phone. `[Button]` is a button, `(o)` and `( )` are choices, `[x]` and `[ ]` are tick boxes, `(Tight)` is a status pill, `#` is a filled progress bar and a line of dots is a row divider. The real screens use the colours, sizes and parts in `docs/DESIGN.md`.

**Home** (brief 4.9). Balance card, figure cards, payment rows, the 2 by 2 actions and the bottom navigation.

```
Home                              ?
+--------------------------------+
| Current account                |
| £267.54                        |
| Checked today, Sun 25 Oct      |
| ------------------------------ |
| +----------------------------+ |
| | Left to spend until        | |
| | Fri 30 Oct                 | |
| | £30.00                     | |
| | Spend no more than £22.54  | |
| | to keep at least £20 until | |
| | Fri 30 Oct.                | |
| +----------------------------+ |
+--------------------------------+
+--------------------------------+
| Lowest point ahead     (Tight) |
| £4.53                          |
| Sun 1 Nov, after Rent          |
| Under £20 from Mon 26 Oct.     |
+--------------------------------+
+--------------------------------+
| This pay has to cover          |
| Going out by Thu 29 Oct        |
|                       £721.07  |
| Coming in             £500.00  |
+--------------------------------+
 Next due
+--------------------------------+
| 25  Spending money     −£30.00 |
| Oct until payday               |
|     Sun 25 Oct    £237.54 left |
|................................|
| 26  Family loan       −£125.00 |
| Oct Mon 26 Oct    £112.54 left |
|................................|
| 26  Driving lesson    −£100.00 |
| Oct Mon 26 Oct     £12.54 left |
+--------------------------------+
+---------------+ +--------------+
|Update balance | |Add a payment |
+---------------+ +--------------+
+---------------+ +--------------+
|I spent        | |I did overtime|
+---------------+ +--------------+
----------------------------------
 (Home)    Plan    Debts    More
```

**Plan** (brief 4.8), grouped by Sam's pay periods, Friday to Thursday (D14). Since step 2d-2 this page is **Coming up**, built from the owner's "Coming up" board (D208 to D212): this pay open, and each later payday as one line that opens in place. The sketch below is the step 2c layout.

```
Plan                       What if
(Pay periods) Months     [Filters]
+--------------------------------+
| Lowest point ahead     (Tight) |
| £4.53 on Sun 1 Nov, after Rent |
+--------------------------------+
 This week, to Thu 29 Oct
+--------------------------------+
| 25  Spending money     −£30.00 |
| Oct until payday  £237.54 left |
|................................|
| 26  Family loan       −£125.00 |
| Oct               £112.54 left |
|................................|
| 26  Driving lesson    −£100.00 |
| Oct        £12.54 left (Tight) |
|................................|
| 28  From savings      +£500.00 |
| Oct               £512.54 left |
|................................|
| 29  Pay-later card    −£466.07 |
| Oct                £46.47 left |
|................................|
| Left at the end         £46.47 |
+--------------------------------+
 Fri 30 Oct to Thu 5 Nov
+--------------------------------+
| Came in                £603.06 |
|................................|
| 30  Pay               +£603.06 |
| Oct Estimate      £649.53 left |
|................................|
| 30  Spending money     −£45.00 |
| Oct               £604.53 left |
|................................|
| 1   Rent              −£600.00 |
| Nov         £4.53 left (Tight) |
|     Lowest point ahead         |
|................................|
| Left at the end          £4.53 |
+--------------------------------+
 Fri 6 Nov to Thu 12 Nov
+--------------------------------+
| Came in                £618.46 |
| ...                            |
| Left at the end        £155.69 |
+--------------------------------+
     [ Show another month ]
----------------------------------
  Home    (Plan)   Debts    More
```

**Edit a payment** (brief 4.4 and 5.4). Tapping a row opens this sheet. The quick actions at the top are the "two taps".

```
+================================+
|              ----              |
| Rent                     Close |
| Sun 1 Nov, Current account     |
| −£600.00           £4.53 left  |
|................................|
| [Mark as paid]                 |
| [Move to next payday]          |
|  Moves it to Fri 6 Nov         |
| [Skip this one]                |
|................................|
| Amount                         |
| [£ 600.00                    ] |
| Date                           |
| [Sun 1 Nov                   ] |
| Name                           |
| [Rent                        ] |
| Note                           |
| [                            ] |
| [ ] This is an estimate        |
|................................|
| Change                         |
| (o) Just this one              |
| ( ) This and all later ones    |
|                                |
| [            Save            ] |
| Remove                         |
+--------------------------------+
```

**Update balance** (brief 4.2, D33), shown on Fri 30 Oct for brief 8.4 test 5.

```
Step 1 of 3
+================================+
| Update balance           Close |
| Current account                |
| Type what your bank shows now  |
| [£ 600.00                    ] |
| [            Next            ] |
+--------------------------------+

Step 2 of 3
+================================+
| The plan expected £604.53 by   |
| the end of today.              |
| Your bank shows £600.00.       |
| That's £4.53 less.             |
| [            Next            ] |
+--------------------------------+

Step 3 of 3
+================================+
| Tick anything from today or    |
| earlier that has gone out or   |
| come in                        |
| [x] Sun 25 Oct                 |
|     Spending money     −£30.00 |
|     until payday               |
| [x] Mon 26 Oct                 |
|     Family loan       −£125.00 |
| [x] Mon 26 Oct                 |
|     Driving lesson    −£100.00 |
| [x] Wed 28 Oct                 |
|     From savings      +£500.00 |
| [x] Thu 29 Oct                 |
|     Pay-later card    −£466.07 |
| [x] Fri 30 Oct                 |
|     Pay               +£603.06 |
| [x] Fri 30 Oct                 |
|     Spending money     −£45.00 |
| [Tick all]                     |
| [            Done            ] |
+--------------------------------+

Done
+================================+
| Balance updated                |
| £600.00, Fri 30 Oct, 9:14am    |
|................................|
| Lowest point ahead     (Tight) |
| £0.00 on Sun 1 Nov, after Rent |
| [            Close           ] |
+--------------------------------+
```

**Agreed (D46):** "expected" in step 2 is the plan's balance at the end of today, before anything is ticked.

**Debts** (brief 4.6), in order of the date each is paid off.

```
Debts
+--------------------------------+
| Owed now                       |
| £3,214.86                      |
| 6 debts. Family loan counted   |
| at €1.1612 per £1.             |
+--------------------------------+
+--------------------------------+
| Pay-later card         £466.07 |
| Paid off on Thu 29 Oct         |
| [                    ] 0% paid |
|................................|
| Pay in 3               £183.89 |
| Paid off on Sun 6 Dec          |
| [                    ] 0% paid |
|................................|
| Family loan (€)      €1,400.57 |
|                    (£1,206.14) |
| Paid off on Fri 1 Jan 2027     |
| [########            ] 42% paid|
|................................|
| Laptop loan            £484.00 |
| Paid off on Sat 20 Feb 2027    |
| [                    ] 0% paid |
|................................|
| Sofa finance           £453.77 |
| Paid off on Mon 23 Aug 2027    |
| [                    ] 0% paid |
|................................|
| Credit card            £420.99 |
| Paid off on Wed 15 Mar 2028    |
| Estimate                       |
| [                    ] 0% paid |
+--------------------------------+
       [ Add a debt ]
----------------------------------
  Home     Plan   (Debts)   More
```

The bars start at 0% because Sam's starting balances are the ones typed in on Sun 25 Oct, except the Family loan, which started at €2,396.93.

**One debt** (brief 4.6): the Family loan, shown in both currencies.

```
< Debts
Family loan (€)
+--------------------------------+
| Left now                       |
| €1,400.57                      |
| About £1,206.14 at €1.1612     |
| per £1                         |
| ------------------------------ |
| Paid off on Fri 1 Jan 2027     |
| [########            ] 42% paid|
| €996.36 paid of €2,396.93      |
+--------------------------------+
 Payments
+--------------------------------+
| 26  Family loan       −£125.00 |
| Oct €145.15  €1,255.42 left    |
|................................|
| 6   Family loan       −£125.00 |
| Nov €145.15  €1,110.27 left    |
|................................|
| 20  Family loan       −£250.00 |
| Nov €290.30    €819.97 left    |
|................................|
| 4   Family loan       −£250.00 |
| Dec €290.30    €529.67 left    |
|................................|
| 18  Family loan       −£250.00 |
| Dec €290.30    €239.37 left    |
|................................|
| 1   Family loan       −£206.15 |
| Jan €239.38  Paid off          |
| 2027                           |
+--------------------------------+
[Update from statement]
[Change the rate]  [Add a payment]
```

The last payment leaves −€0.01, so it shows "Paid off" (D34).

**Setup, welcome.** Since the shorter setup (D356), setup is 6 screens in 3 parts: money in (screens 1 and 2), money out (3 to 5) and your plan (6). Each screen's top says its part, "Part 2 of 3: Money out", over a bar of three, filled as far as that screen.

```
PrePenny
Plan every penny before payday.

See what's left after every
payment, the lowest point ahead
and when each debt is paid off.

Set it up once, about 5 minutes.
After that, just keep it up to
date.

[        Make my plan        ]
[  Look at an example plan   ]
Already have an account? Sign in
```

**Setup, screen 1: your account**

```
Part 1 of 3: Money in
[######        ][      ][      ]
Your account
Name
[Current account             ]
Type what your bank shows today
[£ 267.54                    ]
Overdraft limit, if you have one
[£ 0.00                      ]
Warn me when it goes under
[£ 20.00                     ]
[+ Add another account]
[            Next            ]
```

**Setup, screen 2: how you're paid**

```
Part 1 of 3: Money in         Skip
[##############][      ][      ]
How you're paid
(o) Weekly
( ) Every 2 weeks
( ) Every 4 weeks
( ) Monthly on a date
( ) Last working day of the month
( ) On chosen dates
( ) It changes: a weekly estimate
Next payday
[Fri 30 Oct                  ]
[x] My pay changes in a pattern
 1 [£ 452.17]   2 [£ 618.46]
 3 [£ 469.06]   4 [£ 592.17]
 [+ Add a payday] (up to 8)
On a weekend or bank holiday
[Keep the date              v]
[+ Add another income]
[            Next            ]
```

Setup and "Add a payment" always ask for the next payment's date, labelled "Next payment", never "First payment" (D86), so nobody types the date their rent started years ago and finds every payment since in "Not ticked yet".

Sam's example keeps every date (D15), so his pay stays on Fridays even on Christmas Day and New Year's Day. When pay follows a pattern, a short extra page offers to link each payday in the pattern to a saved pay week, for example "3-shift week" for paydays 1 and 3 (D5), with "Do this later". When there's more than one income, it asks which is the main pay (D14).

**Setup, screen 3: home and bills** (example bill amounts, not from Sam's plan). Rent or mortgage at the top, then the bills, on one screen (D356).

```
Part 2 of 3: Money out        Skip
[##############][##    ][      ]
Home and bills
+--------------------------------+
| Rent or mortgage               |
| (o) Rent                       |
| ( ) Mortgage                   |
| ( ) I don't pay rent or a      |
|     mortgage                   |
| ( ) I'll add it later          |
| Amount       [£ 550.00       ] |
| Next payment [Sun 1 Nov      ] |
| How often [Monthly on the 1st] |
| From      [Current account   ] |
+--------------------------------+
+--------------------------------+
| Tick the ones you pay          |
| [x] Council tax   [£ 132.00]   |
|     10 payments, Apr to Jan    |
| [ ] Energy                     |
| [ ] Water                      |
| [x] Phone         [£  18.00]   |
|     Monthly on the 14th        |
| [ ] Broadband                  |
| [ ] TV licence                 |
| [ ] Insurance                  |
| [ ] Subscriptions              |
+--------------------------------+
[+ Add another bill]
[            Next            ]
```

**Setup, screen 4: debts**

```
Part 2 of 3: Money out        Skip
[##############][####  ][      ]
Debts
Add anything you're paying off.
+--------------------------------+
| Sofa finance           £453.77 |
| Pay-later plan                 |
| £37.88 on the 23rd             |
+--------------------------------+
[+ Add a debt]
 Pay-later plan, credit card,
 loan, overdraft, owed to a person
[I have no debts]
[            Next            ]
```

**Setup, screen 5: spending money** (example amounts, not from Sam's plan)

```
Part 2 of 3: Money out        Skip
[##############][######][      ]
Spending money
Food    [£ 200.00] [a month    v]
Travel  [£  25.00] [a week     v]
How Food leaves your account
(o) All at the start (safest)
( ) Spread across the days
( ) As one pay-later bill
[+ Add another]
[            Next            ]
```

**Setup, screen 6: here's your plan.** Savings left setup (D356): "Add a goal" opens the same savings goal sheet as under More, which asks what setup's old savings step asked.

```
Part 3 of 3: Your plan
[##############][######][######]
Here's your plan
+--------------------------------+
| Lowest point ahead     (Tight) |
| £4.53 on Sun 1 Nov, after Rent |
+--------------------------------+
+--------------------------------+
| Left to spend until Fri 30 Oct |
| £30.00                         |
+--------------------------------+
+--------------------------------+
| First debt paid off            |
| Pay-later card, Thu 29 Oct     |
+--------------------------------+
From now on: update your balance
when you check your bank, and
tick payments as they go out.
+--------------------------------+
| Saving for something?          |
| Set a target and see the date  |
| you'll get there.              |
| [         Add a goal         ] |
+--------------------------------+
[        Go to my plan         ]
```

The 60-second tour comes with the help centre in Phase 4 (D227, brief 4.16).

**What if** (brief 4.10): Sam tries "What if my pay on Fri 30 Oct is £100 less?"

```
What if                      Close
+--------------------------------+
| Practice mode. Your real plan  |
| doesn't change unless you keep |
| these changes.                 |
+--------------------------------+
 Your changes
 Pay on Fri 30 Oct: £603.06 to
 £503.06                   [Undo]
 [+ Make another change]
+--------------------------------+
|              Real     What if  |
| Lowest point £4.53    −£95.47  |
|              Sun 1 Nov         |
|              (Tight)  (Short)  |
+--------------------------------+
+--------------------------------+
| You'd be £95.47 short on       |
| Sun 1 Nov. Moving one of these |
| payments would fix it.         |
| Pay-later card, Thu 29 Oct     |
|                       −£466.07 |
| Family loan, Mon 26 Oct        |
|                       −£125.00 |
| Driving lesson, Mon 26 Oct     |
|                       −£100.00 |
+--------------------------------+
 Paid off on     Real    What if
 Family loan     1 Jan   1 Jan
 Laptop loan     20 Feb  20 Feb
[Keep changes]     [Throw away]
```

**Pay calculator** (brief 4.15), with Sam's week 26 payslip from brief 8.6.

```
Take-home pay calculator
An estimate, not tax advice.
 Pay
+--------------------------------+
| Basic [34.5] h x [£ 12.71]     |
|                        £438.50 |
| Shift premium          £114.69 |
| [+ Add a line]                 |
| Gross                  £553.19 |
+--------------------------------+
 Tax and deductions
+--------------------------------+
| Tax code [1257L]   Paid weekly |
| (o) Cumulative  ( ) Week 1     |
| Gross for tax so far           |
| [£ 8,463.43                  ] |
| Tax paid so far                |
| [£ 434.60                    ] |
| Pension 4%, before tax, on     |
| earnings £120 to £967 a week   |
| Student loan [None          v] |
+--------------------------------+
+--------------------------------+
| Take-home                      |
| £452.17                        |
| Tax £58.80, National Insurance |
| £24.89, Pension £17.33         |
+--------------------------------+
[Add to plan as Fri 30 Oct estimate]
[Save as a pay week]
[Check my payslip]
```

On the public page, "Add to plan" becomes "Start a free plan with this pay".

**More** (brief 4.11 to 4.17)

```
More
 Your plan
  Accounts                       >
  Budgets                        >
  Savings goals                  >
  Pay calculator                 >
  What if                        >
  Share with my partner          >
  Activity                       >
 You
  Reminders                      >
  App lock                       >
  Subscription                   >
  Free trial, 24 days left
  Account settings               >
  Signed-in devices              >
  Export, import and delete      >
 Help
  Help centre                    >
  Help when money is tight       >
  Contact us                     >
  Something looks wrong          >
  Suggest a feature              >
 [Sign out]
----------------------------------
  Home     Plan    Debts   (More)
```

## 5. Folders

**In plain words.** One repository holds everything: the engine, the app, the database set-up and the documents. Each folder has one job.

```
prepenny/
  apps/
    web/                 The app and the website (Next.js, static export)
      app/               Pages, by web address
        (site)/          Public pages: home, pay calculator, payday check,
                         pricing, organisations, help, legal pages
        app/             The app: Home, Coming up, Debts, More and the screens under More
        setup/           First-time setup steps
        admin/           Support admin and tax year check (staff only; the
                         database decides who can see anything)
      components/        The parts from DESIGN.md: balance card, figure card,
                         payment row, actions, bottom navigation, sheet
      strings/           Every word people read, in one file (en-GB.ts), per VOICE.md
      styles/            Design tokens (colours, sizes, spacing) and the font set-up
      data/              The phone's database (Dexie), the unsent edits queue, sync
      worker/            The background worker that runs the engine
      lib/               Money and date formatting, privacy-safe error reports
      public/
        fonts/           Figtree files, self-hosted (D23)
        data/            Bank holiday copy, refreshed weekly
        manifest.webmanifest  Home-screen app details
      e2e/               Playwright tests: one per person, at 320px and 360px
  packages/
    engine/              The money engine: pure TypeScript, no screens,
                         no network, no clock
      src/
        money/           Pence, rounding (D9), currency conversion
        dates/           Day numbers, months, working days, bank holidays
        schedule/        Series and changes into payments
        balance/         The balance rule, lowest point, warnings, shortfalls
        periods/         Pay periods, calendar months, next main payday
        edit/            Commands, splitting, undo
        budgets/         Budget rows, spreading, pay-later bills, roll-over,
                         left to spend
        debts/           Left now, paid off on, credit card interest and minimums
        goals/           Savings goals
        pay/             Take-home pay, overtime, payslip check
          tax-years/     One file per tax year, with its GOV.UK source links
        whatif/          The real plan beside practice changes
      data/              Built-in bank holiday copy from GOV.UK
      test/
        fixtures/        Sam's plan and each other person's plan
        unit/            One file per rule
        property/        Property tests (fast-check)
        speed/           24 months of 100 series
    model/               Record types and checks shared by the app and server
                         functions: sync fields, database rows to engine inputs
  supabase/
    migrations/          Tables, Row Level Security rules and database
                         functions, in order
    functions/           Server work: Stripe messages, reminders, emails,
                         invites, account deletion, bank holiday refresh
    tests/               Database tests proving who can see what (pgTAP)
    seed.sql             Test data for a local database
  content/
    help/                Help centre articles in Markdown (brief 7.1)
    legal/               Privacy notice, terms and accessibility statement drafts
    emails/              Wording for every email
  sources/
    gov-uk.txt           The GOV.UK addresses the tax figures come from (D120)
    gov-uk/              Each page and HMRC file saved unchanged, with the date
                         it was fetched, by the Fetch sources workflow
  scripts/               Checks: banned words and long dashes, no money in logs,
                         tax year file, bank holiday refresh
  docs/                  BRIEF, DECISIONS, VOICE, DESIGN, ARCHITECTURE
  .github/workflows/     The checks GitHub runs on every push
  CLAUDE.md, PLAN.md, README.md
  package.json, pnpm-workspace.yaml, tsconfig.base.json, biome.json
```

In Phase 6, Capacitor adds `apps/web/ios`, `apps/web/android` and `apps/web/capacitor.config.ts`.

**For future sessions: folders**

- Static export can't build a page per database record, so screens for one record take the ID after a `#`: `/app/debt/#id=…` (step 3c, D337; it was after a question mark before).
- `packages/engine` must never import from `apps/` or `packages/model`. `packages/model` may import the engine's types. Both are checked by a lint rule.
- Server functions in `supabase/functions` import the engine directly (Deno can run it), so reminders and the app always agree.
- **Built in step 2b** (D164 to D175): `apps/web` as sketched above, with these details. Words are in `strings/en-GB.ts`; money and dates go through `lib/money.ts` and `lib/dates.ts`. Home's figures come from `workOutHome` in `lib/home.ts`, run in the background worker (`worker/`), which `scripts/build-worker.ts` builds into `public/engine-worker-<fingerprint>.js` before `next build`, telling the app its name in `.env.local` (D170). The phone's database is `data/db.ts`: one `records` table keyed by plan, kind and key, so an edit's writes (D87) are saved as they are. Sam's example is `data/example-plan.ts` (D165). Figtree comes from `@fontsource/figtree` through `next/font/local`, not `public/fonts` (D169). The service worker is `service-worker/sw.ts`, built by Serwist's command line into `out/sw.js` after `next build`. Cloudflare's settings are `wrangler.jsonc` and `public/_headers`. Unit tests are in `test/unit` (Vitest), end-to-end tests in `e2e` (Playwright, served by Wrangler as Cloudflare serves it), and `pnpm build` comes before `pnpm e2e`. `scripts/check-voice.ts` at the root checks every string.
- **Built in step 2d** (D190 to D203): the four actions on Home are `components/UpdateBalanceSheet.tsx`, `SpentSheet.tsx`, `AddPaymentSheet.tsx` and `OvertimeSheet.tsx`, opened by `components/Actions.tsx`, with the boxes shared in `components/Fields.tsx` and `Form.module.css` (the edit sheet's styles). The worker answers two more questions: `actions` (`lib/actions-view.ts`: each account's expected balance, lowest point and payments to tick, each budget's week or month, the debts, goals and pay) and `pay-preview` (`lib/pay-preview.ts`: an overtime or missed shift made on a copy, giving its payday and change). `lib/new-payment.ts` turns the Add a payment form into the engine's new payment. `lib/test-setting.ts` is the test-only today and plan (D201), read in `components/PlanProvider.tsx`. `components/UpdateNote.tsx` is the update note (D202), in the bottom area of `components/AppShell.tsx` with the undo bar.
- **Built in step 2d-2** (D204 to D215): the Plan page is the Coming up page, `components/ComingUpScreen.tsx` at `app/app/coming-up/`, with `public/_redirects` sending `/app/plan/` there (D208). The worker's `plan` answer (`lib/plan-view.ts`) also gives each account's balance, each period's main pay (`pay`), its lowest end-of-day balance (`lowest`) and whether it's a calendar month (`byMonth`), and the pay week for "Fri to Thu" (`payWeek`). What's shown is one choice in `lib/plan-filters.ts` (D210). `components/Sheet.tsx` takes the one plain sentence under its title (`intro`) and the close button's words (`closeLabel`), and `components/ChoiceList.tsx` a hint beside a choice. `lib/home.ts` gives Home's cover the pay landing today (`payToday`, D206). The end-to-end tests share `e2e/coming-up.ts` to open the page and open a payday. The switch part (`Segmented`) is gone (D213).
- **Built in step 2e** (D216 to D229): first-time setup is `app/setup/page.tsx` and the website's first page `app/page.tsx`, both drawn by `components/setup/` (`SetupScreen.tsx` chooses the welcome or the step; `StepAccounts.tsx` to `StepPlan.tsx` are the steps, 8 then and 6 screens since D356; `StepFrame.tsx` is the frame every step shares). `components/setup/SetupProvider.tsx` loads the person's own plan, makes each step's commands in the background worker as one edit (`runEdits` in `lib/edit.ts`, the worker's `edits` question) and saves it on the phone with how far setup has got (`lib/setup-progress.ts`, kept in the own plan's `setup` field in `data/db.ts`). `lib/setup-forms.ts` turns each step's boxes into the engine's commands, and `lib/setup-view.ts` (the worker's `setup` question) works out the budgets' next week and month and "Here's your plan". The phone keeps which plan is showing (`showing` in `data/db.ts`): `components/PlanProvider.tsx` loads the person's own plan once it's set up, or the example, and otherwise `components/AppShell.tsx` goes to setup (D220). The "when" boxes of Add a payment and setup are `components/WhenFields.tsx`. The setup tests are `e2e/setup.spec.ts`, with the answers as engine commands in `e2e/setup-answers.ts`; the tests from before setup open on the example through `e2e/fixtures.ts`.
- **The shorter setup** (D356 to D358): 6 screens in 3 parts. `lib/setup-progress.ts` has the screens (`SetupStep` 0 to 6), the parts (`SETUP_PARTS`, `partOf`), the screen that lists each kind of thing added (`SCREEN_OF_KIND`), and `upgradeSetup`, which reads progress saved during the old 8 steps (no `layout`) as the matching screen (`OLD_STEP_TO_SCREEN`) with every item moved to its screen; progress saved now has `layout: 2`. `SetupProvider` upgrades what it loads, from the phone or brought down from the account. Screen 3 is `StepHomeBills.tsx`, which replaced `StepRent.tsx` and `StepBills.tsx`; `StepSavings.tsx` has gone, and `StepPlan.tsx` opens `GoalSheet.tsx` under `PlanActionsOverride`, with setup's own plan and a save that adds the goal as one setup item (`madeAt` and `start` are `GoalSheet`'s new props). `StepFrame.tsx` draws "Part 2 of 3: Money out" and the bar of three, and takes `outside` for a sheet, which has a form of its own. The tests are `e2e/setup.spec.ts` (tests 7 to 9, with the tap count from `countTaps` in `e2e/setup.ts`), `e2e/your-plan.spec.ts` (14 and 15) and `test/unit/setup-progress.test.ts`.
- **Built in step 2f** (D230 to D245): the Debts tab is `components/DebtsScreen.tsx` and one debt `components/DebtScreen.tsx` at `app/app/debt/` (`?id=`), with `DebtSheet.tsx` (add or change, from the boxes in `DebtFields.tsx` that setup's debts screen shares), `StatementSheet.tsx`, `RateSheet.tsx`, `CompareCard.tsx` and `ConfirmSheet.tsx`. Budgets, Savings goals and Accounts are `BudgetsScreen.tsx`, `GoalsScreen.tsx` and `AccountsScreen.tsx` at `app/app/budgets/`, `goals/` and `accounts/`, with `BudgetSheet.tsx`, `GoalSheet.tsx` (from `GoalFields.tsx`, which setup's old step 7 shared; since D356 setup opens the sheet itself), `AccountSheet.tsx` and `NationSheet.tsx`; More links to them with `MoreLinks.tsx`. The worker answers `debts` (`lib/debts-view.ts`, 24 months ahead, with each over-payment's fix as engine commands), `compare`, and `budgets`, `goals` and `accounts` (`lib/money-views.ts`), read by `components/useScreenView.ts`. `makeChanges` in `PlanProvider.tsx` makes several commands as one change with one undo (`runEdits`). The edit sheet's "Change how often it repeats" uses `RepeatFields` from `WhenFields.tsx` and `repeatSchedule` in `lib/new-payment.ts`, with each row's schedule in `RowView.repeats`. The engine refuses `close-account` with `account-has-money` unless the account shows £0.00 at the end of today (D234). The tests are `e2e/money-screens.spec.ts` and `test/unit/money-screens.test.ts`.
- **Built in step 2g** (D247 to D259): What if is `components/WhatIfScreen.tsx` at `app/app/what-if/` (`?from=coming-up` for its link back), worked out by the worker's `what-if` question (`lib/what-if-view.ts`, the engine's `whatIf` with the practice commands, the lowest point 12 months ahead and debts 24). It gives its sheets the practice plan through `PlanActionsOverride` in `PlanProvider.tsx`, so `makeChange` there adds a practice change instead of saving; the practice list is `ComingUpScreen` with `practice`. Keep is `makeChanges` with every practice command (D135). Practice changes are kept in a module variable while PrePenny is open. The pay calculator is `components/PayCalculator.tsx`, shared by `PayScreen.tsx` at `app/app/pay/` and `PublicPayScreen.tsx` at `app/pay-calculator/` (outside the app's shell). Its boxes are read and worked out on the main thread by `lib/pay-calculator.ts` (`readCalculator`, `workOutCalculator`, `checkPayslipForm`, `calculatorFromPlan`, `saveWeekCommands`), and the app's plan side comes from the worker's `pay` question (`lib/pay-view.ts`: the main pay's paydays from tomorrow, its tax settings and the saved weeks). "Start a free plan with this pay" goes through `lib/pay-draft.ts`, read once by setup's `StepPay.tsx`. From the owner's answers to step 2f: `lib/debts-view.ts` gives each debt payment its edit sheet row (`edit`), what the fix also removes (`alsoRemoves`) and the planned payments closing can remove (`planned`); `ConfirmSheet.tsx` takes a Yes or No `question`. The tests are `e2e/what-if.spec.ts`, `e2e/pay-calculator.spec.ts` and `e2e/answers-2f.spec.ts`, with `test/unit/what-if.test.ts`, `pay-calculator.test.ts` and `debt-answers.test.ts`.
- **Built in step 2h** (D262 onwards): Your job is `components/JobScreen.tsx` at `app/app/job/`, with `JobSheet.tsx`; its view and the preview of what a change does to paydays still to come are the worker's `job` and `job-preview` questions (`lib/job-view.ts`), the boxes are read by `lib/job-form.ts`, and its words come from `lib/job-words.ts`. The calculator's tax and payslip boxes are shared as `TaxBoxes` and `SoFarBoxes` in `PayCalculator.tsx`, read by `readTaxBoxes` in `lib/pay-calculator.ts`. "Save as a pay week" takes which paydays it's for (`saveWeekCommands(…, weekFor)`, `canChooseOneWeek`), using each payday's `step` from `lib/pay-view.ts`. What if's practice changes are kept on the phone by `data/practice.ts` (the `device` table, one key per plan). `ConfirmSheet.tsx`'s question starts with neither answer. The six people's journeys are `e2e/people.spec.ts`, with their setups in `e2e/people.ts` and the shared steps and balance checks in `e2e/journeys.ts`; every screen and sheet is checked by `e2e/checks.spec.ts`, offline by `e2e/offline.spec.ts`, and speed by `e2e/speed.spec.ts`. GitHub runs the end-to-end tests in three parts side by side.
- **Built in step 3a** (D288 to D299): `supabase/` as sketched above, with `config.toml` from `supabase init` (CLI 2.122.0, Postgres 17, services the tests don't use switched off), `migrations/`, `seed.sql` (test helpers only) and `tests/database/`. No `functions/` yet. The Check workflow's "Database and its privacy rules" job runs the tests on every push; `.github/workflows/database.yml` runs `supabase link` and `supabase db push` from `main` after Check passes (D297). The app's own changes from the owner's answers to step 2h: `lib/bar-words.ts` (an undo bar message with its short words, D284), `UndoBar.tsx`'s `isShortForItsText()`, and `ConfirmSheet.tsx`'s `answers` (D279).
- **Built in step 3b** (D300 to D310): signing in is `lib/account.ts` (Supabase's client, loaded with `import()` only by the sign-in functions or `checkSignIn()` when `localStorage['prepenny-sign-in']` exists; `useAccount()`; `problemOf()` turns Supabase's error codes into `Problem`s; `signOutAndForget()`), with the project from `lib/sign-in-config.ts` (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_KEY`; both unset means the local Supabase, empty means off). The page is `app/sign-in/page.tsx` and `components/SignInScreen.tsx` (`?to=sign-up`, `?from=more`; `#token_hash=` from the email's link, kept in a ref and used only on "Finish signing in", D312; `?code=` or `?error=` from Google, after `startGoogle()` has read `/auth/v1/settings`). `pnpm build:local` builds with the local Supabase; with no address the build has signing in off (D314). `followSignOutInOtherTabs()` reloads other tabs when the small store is cleared. More's card is `components/AccountCard.tsx`; `checkSignIn()` is called by `components/KeepInStep.tsx` on every screen (since the step 3c fix). `StoredPlan.owner` and `claimOwnPlan()` in `data/db.ts`; `data/forget.ts` deletes the phone database and both small stores. `scripts/write-headers.ts` adds the Supabase address to `out/_headers` after the build. Supabase: `supabase/config.toml` (local: code email, Mailpit, a made-up Google client, `site_url` 127.0.0.1:4173), `supabase/templates/sign-in-code.html`, and `supabase/sign-in-settings.json`, sent by `database.yml` to the Management API (`PATCH /v1/projects/{ref}/config/auth`). Tests: `e2e/sign-in.spec.ts` (projects `sign-in-320` and `sign-in-360`, needing `supabase start`), `e2e/sign-in-helpers.ts` (the inbox at 127.0.0.1:54324, `makeCodeRunOut()` through `docker exec supabase_db_prepenny psql`), `test/unit/account.test.ts`. Workflows: `check.yml` (pull requests and `main`; one quick job; `end-to-end.yml` unless a draft), `ready.yml` (`ready_for_review`), `end-to-end.yml` (`workflow_call`; part 3 starts Supabase in the background and runs the sign-in projects).
- **Built in step 3c** (D324 to D345): see 3.5 for the database and the phone's sync. Screens: the sign-in page's `choose` step and the other account's plan removal (`components/SignInScreen.tsx`); More's `where-kept` line and the sign-out sheet (`components/AccountCard.tsx`, the sheet in `SignOutSheet.tsx` since the step 3c fix); the offline and "can't be sent" notes (`components/Notes.tsx`); `components/KeepInStep.tsx` starts `keepInStep` on every screen (the step 3c fix, D351). A sign-in that ends by itself goes through `signInEnded()` in `lib/account.ts` and `planSafelyKept()` in `data/forget.ts`. A record's id is after a `#` (`lib/record-id.ts`). Tests: `e2e/your-plan.spec.ts` (in the `sign-in-320` and `sign-in-360` projects), `test/unit/sync-rows.test.ts`, and the laptop check in `e2e/checks.spec.ts`. GitHub runs the end-to-end tests one at a time (`--workers=1`): two at a time saved no minutes (D343). Every axe check goes through `e2e/axe.ts`, which waits for the page to stop moving first, and the console check leaves out the browser's own `ERR_NETWORK_CHANGED` (D344).
- **Built in step 2c** (D176 to D189): the background worker answers three questions (`worker/messages.ts`): `home` (`lib/home.ts`, 12 months ahead, D178), `plan` (`lib/plan-view.ts`, whole periods and the lowest point, D183) and `edit` (`lib/edit.ts`, the engine's `editPlan` and `applyWrites`). `lib/plan-input.ts` turns the stored records and settings into the engine's input for all three. `lib/rows.ts` is the row both screens show and the edit sheet changes. `components/PlanProvider.tsx` makes every change in turn, saves its writes with `saveChange` in `data/db.ts` (marking a changed example, D182), works the plan out again and keeps the last edit for the undo bar in `components/AppShell.tsx` (D186). `components/EditSheet.tsx` builds the commands (D188), `lib/refusals.ts` turns a refusal code into words (D189), and `components/useEditSheet.ts` puts focus back after a change. Filters are `lib/plan-filters.ts` and only hide rows (D184). New ids come from `lib/ids.ts` (UUID version 7).

## 6. Tests

**In plain words.** Every test from brief Parts 5 and 8, plus the tests in D3, D5, D8 and D31, with the step where each is written. Steps 1a to 1g are in `PLAN.md`. Each test is written in the step that builds its rule, then every test runs on every push from then on. The brief 8.7 tests need sign-in, two phones and Stripe, so they're written in Phases 3 and 5, not Phase 1.

No expected number in these tests is ever changed to make a test pass (CLAUDE.md).

| # | Test | From | Step |
| --- | --- | --- | --- |
| 1 | Money in whole pence; rounding to the nearest penny, halves away from zero, once per pay line or payment | 5.1, D9 | 1a |
| 2 | Dates as `YYYY-MM-DD`, "today" passed in, no clock | 5.1 | 1a |
| 3 | Weekly payment k is start + 7 × every × k days, never from the previous payment | 5.3 | 1a |
| 4 | Monthly: 31 January gives 28 February then 31 March, with no drift | 5.3 | 1a |
| 5 | 31st-of-the-month dates, including leap years (29 Feb 2028) | 5.8 | 1a |
| 6 | Last day, last working day and "first Monday" worked out per month | 5.3 | 1a |
| 7 | Amount: the change, then the last amount, then the cycle with its offset, then the series amount | 5.3 | 1a |
| 8 | Weekend and bank holiday rule, then a changed date; every end rule | 5.3 | 1a |
| 9 | A bank holiday on payday | 5.8 | 1a |
| 10 | Bank holidays: built-in copy, the nation's own list | 5.7 | 1a |
| 11 | Priya: £2,100 on the last working day, moved to the working day before, lands on Thu 31 Dec 2026 then Fri 29 Jan 2027. A yearly payment appears once a year; a quarterly one every 3 months | 8.5 | 1a |
| 12 | Dee: Universal Credit due on the 28th, moved to the working day before, lands on Thu 24 Dec 2026. Council tax in 10 payments, April to January, has nothing in February or March | 8.5 | 1a |
| 13 | A payment on the 31st lands on 30 Nov, 31 Dec, 28 Feb 2027 and 31 Mar 2027 | 8.5 | 1a |
| 14 | The balance rule, steps 1 to 6 and 8: ticked payments inside the balance, overdue first, same-day order, balance after every row, lowest point, Tight and Short | 5.5 | 1b |
| 15 | Update the balance on 30 Oct to £600 and tick everything up to then: the plan works forward from £600, and nothing ticked is counted twice | 8.4 | 1b |
| 16 | Jess and Tom: a £600 transfer on payday lowers one balance and raises the other by £600; the total across accounts is unchanged | 8.5 | 1b |
| 17 | Ali: with a £1,000 overdraft, −£300 is Tight, not Short; only below −£1,000 is Short | 8.5 | 1b |
| 18 | Sam's balance first goes under £20 on Mon 26 Oct 2026, at £12.54 after Driving lesson; the lowest point is still £4.53 on Sun 1 Nov | D8 | 1b |
| 19 | Just this one | 5.4 | 1c |
| 20 | This and all later ones: the split, the cycle position kept, later changes moved by payment number, replaced changes dropped; on the first payment it edits the series | 5.4 | 1c |
| 21 | A cycle continues correctly after a split | 5.8 | 1c |
| 22 | Remove this one; remove this and later | 5.4 | 1c |
| 23 | Every edit is one undoable step | 5.4 | 1c |
| 24 | Rent £560 from 1 Jan 2027, this and all later: January and February are £560; November (£600) and December (£550) don't change | 8.4 | 1c |
| 25 | Only the note on pay from 4 Dec 2026, this and all later: every pay amount stays exactly the same and the 4-week pattern continues | 8.4 | 1c |
| 26 | £640 as the real pay on 6 Nov, just this one: only that payday loses its estimate label, and every balance after it rises by £21.54 | 8.4 | 1c |
| 27 | Remove spending money from 8 Jan 2027, this and all later: the last spending money row is 1 Jan 2027 | 8.4 | 1c |
| 28 | Debts: left now and paid off on | 5.6 | 1d |
| 29 | Credit cards: monthly interest and the minimum from the rule, on the statement day | 5.6, D13 | 1d |
| 30 | Foreign currency: the person's rate, rounded per payment, both currencies shown | 4.6, 5.1 | 1d |
| 31 | A budget leaves at the start of its period, as one row | 5.5 | 1e |
| 32 | Sam on Sun 25 Oct: L = £30.00, M = £12.54 (Mon 26 Oct), W = £20, so "Spend no more than £22.54" | D3 | 1e |
| 33 | £25 a week spread is £3.57 a day for 6 days and £3.58 on the last; in the current period only the unspent amount is spread, over the days left from today | D31 | 1e |
| 34 | Weeks 26 to 29 payslips: pension and tax match to the penny; National Insurance and take-home within 1p | 8.6 | 1f |
| 35 | A Scottish tax code | 8.6 | 1f |
| 36 | Student loan Plan 2 | 8.6 | 1f |
| 37 | A BR code | 8.6 | 1f |
| 38 | An emergency code on week 1/month 1 | 8.6 | 1f |
| 39 | A monthly salary | 8.6 | 1f |
| 40 | A pension taken after tax | 8.6 | 1f |
| 41 | "I did overtime": 11.5 hours at £19.07 worked Mon 26 Oct 2026, with pay one week behind, lands on Fri 6 Nov 2026 (from step 1g, each payday covering work up to 5 days before it, D131) | 8.6, D5 | 1f |
| 42 | With week 27's lines it raises that payday by about £155: £155.23, within £1 (D7) | 8.6, D5 | 1f |
| 43 | The same overtime on week 26's lines gives £150.89, which is how 30 Oct became £603.06 | D5 | 1f |
| 44 | Property: the end balance equals the start balance plus every applied payment | 5.8 | 1b, and again in 1g on the six people's plans |
| 45 | Property: splitting a series without changing anything gives exactly the same payments | 5.8 | 1c (brought forward), and again in 1g on the six people's plans |
| 46 | Property: undo returns the exact earlier state | 5.8 | 1c (brought forward), and again in 1g for What if's Keep |
| 47 | Sam: lowest end-of-day balance £4.53 on Sun 1 Nov 2026, after Rent | 8.3 | 1b, and again in 1g |
| 48 | Sam: current account at the end of Oct, Nov, Dec, Jan, Feb is £604.53, £732.91, £1,024.60, £2,235.89, £3,304.87 | 8.3 | 1b, and again in 1g |
| 49 | Sam: total pay £9,748.96 from 18 paydays | 8.3 | 1g |
| 50 | Sam: Pay-later card paid off on 29 Oct 2026, Pay in 3 on 6 Dec 2026, Family loan on 1 Jan 2027, Laptop loan on 20 Feb 2027 | 8.3, D15 | 1d (brought forward), and again in 1g |
| 51 | Sam: still owed at the end of Feb 2027: Sofa finance £225.25 (paid off 23 Aug 2027 when the view is extended), Credit card £320.99 | 8.3, D15 | 1d (brought forward), and again in 1g |
| 52 | Sam: savings £0 from 28 Oct, £150 from 13 Nov, £0 from 30 Nov | 8.3 | 1b, and again in 1g |
| 53 | Kofi: in what if, removing next week's estimated income shows the new lowest point beside the real one; throwing it away leaves the real plan exactly as before | 8.5 | 1g |
| 54 | Speed: 24 months of 100 series in under 50 milliseconds on a mid-range phone (under 12 on the test machine; a real phone in Phase 4) | 5.8 | 1g |
| 55 | Jess invites Tom with "Can edit"; Tom changes rent and it appears on Jess's phone within 5 seconds, marked "Changed by Tom" | 8.7 | Phase 3 |
| 56 | Jess's personal account isn't shared: no request Tom can make returns any of its data | 8.7 | Phase 3 |
| 57 | Tom is changed to "Can view only": the server refuses his edits, not just the screen | 8.7 | Phase 3 |
| 58 | Both edit the same payment within a second: the newest change wins and the other person is told | 8.7 | Phase 3 |
| 59 | Tom leaves and keeps a copy: Jess's plan is unchanged, and Tom's copy no longer updates | 8.7 | Phase 3 |
| 60 | Signing out removes the plan from the device; "Sign out everywhere" ends every other session within 1 minute | 8.7 | Phase 3 |
| 61 | A free trial ends without payment: nothing is deleted; viewing, updating the balance, ticking and warnings still work; adding or changing a payment asks to subscribe | 8.7 | Phase 5 |
| 62 | Cancelling takes two taps; Stripe sending the same message twice changes nothing the second time | 8.7 | Phase 5 |
| 63 | An organisation buys 10 places and shares its link; each person who joins gets full access until the end date, then is asked to subscribe; the dashboard never shows anyone's money data | 8.7 | Phase 5 |

The brief 8.3 tests use the D15 names, and the brief's view to the end of February 2027, with every payment keeping its date.

**Also written in Phase 1, for today's decisions:**

| Test | From | Step |
| --- | --- | --- |
| Exactly £20.00 is not under a £20 warning level | D10 | 1b |
| "Not ticked yet" lists unticked payments dated before today, whatever the balance date | D11 | 1b |
| Plan periods run from one main payday to the day before the next; irregular main pay uses Monday-to-Sunday weeks | D14 | 1b |
| The same-day order never changes between runs | D12 | 1b |
| A payment ticked, or a spend recorded, after a balance update on the same day isn't inside that balance; a tick made inside the Update balance steps is | D33 | 1b (ticks), 1e (spends) |
| A skipped payment still counts towards "after N payments" and nothing is added at the end | D4 | 1c |
| "Move to next payday" moves to the first main payday after the payment's date | D14 | 1c |
| A payment ticked early comes off a debt once, even after "Update from statement" | D27 | 1d |
| The Family loan ends at −€0.01 and shows "Paid off" and £0.00 | D34 | 1d |
| Spends recorded before the balance update are inside it, later ones are rows on their dates, and the unspent part leaves today; past periods are settled and future ones leave in full | D2 | 1e |
| Left to spend runs to the day before the next main payday and is labelled with that payday | D28 | 1e |
| Budget periods: Sam's weekly budgets start on Friday; a monthly budget runs payday to payday for monthly pay and by calendar month otherwise | D29 | 1e |
| Roll-over adds last period's unspent amount, shown as "£25 + £7 from last week"; off means nothing moves | D30 | 1e |
| Pay-later bills: a bill covers spends from the day after the last statement day up to this one | D32, D61 | 1e |
| Bank holidays worked out by the rules match the official list for every year it covers, apart from the named one-off days; years it doesn't cover use the rules | D74, D75, D76 | 1a |
| With "working day before", a Friday pay lands on Thu 24 Dec 2026 instead of Christmas Day and on Thu 31 Dec 2026 instead of New Year's Day 2027; with "keep the date" it stays on the Fridays | 4.3, D15 | 1a |
| Sam's pay series gives 18 paydays from Fri 30 Oct 2026 to Fri 26 Feb 2027, totalling £9,748.96: first £603.06, then the pattern | 8.3 | 1a |
| Property: a monthly payment never drifts off its day over 10 years, and payment k comes out the same whatever order payments are asked for in | 5.3 | 1a |
| The lint rules keep the engine pure: no Date, no Math.random, no network, no storage and no imports from outside the package | CLAUDE.md | 1a |
| Sam with the Fri 30 Oct pay at £503.06 is £95.47 short on Sun 1 Nov; the payments that could move are Pay-later card −£466.07, Family loan −£125.00 and Driving lesson −£100.00, not Spending money −£30.00 | D69 | 1b |
| Looking 24 months ahead, Sam's Credit card is paid off on Wed 15 Mar 2028, and that payment shows "£4.01 more than what's left" | D70, D63 | 1d |
| Sam's series are made in the order of the brief 8.2 table, so on Mon 26 Oct Family loan goes before Driving lesson | D8, D12 | 1b |
| On Fri 30 Oct, before anything is ticked, Update balance expects £604.53 | D46 | 1b |
| A payment dated before the balance date but ticked after the update goes out at the start with the overdue payments; balances from today on match it going out today | D39 | 1b |
| The next main payday: Sam on Sun 25 Oct gets Fri 30 Oct; Kofi on Wed 28 Oct 2026 gets Mon 2 Nov | D14, D66 | 1b |
| Sam's pay periods on Sun 25 Oct: to Thu 29 Oct ends at £46.47; Fri 30 Oct to Thu 5 Nov came in £603.06 and ends at £4.53; Fri 6 Nov to Thu 12 Nov came in £618.46 and ends at £155.69 | D14, 4.8 | 1b |
| Property: a transfer never changes the total across all accounts | 8.5 | 1b |
| Property: "Payments that could move" matches moving each payment and looking at the new plan | D69 | 1b |
| Property: the plan is the same whatever order its records are given in | D12 | 1b |
| Brief 8.4 tests 1 to 4 on Sam's plan, with balances: rent £560 lowers balances by £10 from the January rent and £20 from the February rent; a new note on pay changes no amount or balance; £640 real pay raises every balance from that pay on by exactly £21.54; removing spending money from Fri 8 Jan raises each later balance by £54 a week | 8.4 | 1c |
| March's rent changed on its own to £580, then rent £560 for this and all later ones from January: March is £560, and a later moved date, note and tick stay | D60 | 1c |
| Move to next payday on Sun 25 Oct: Driving lesson Mon 26 Oct to Fri 30 Oct, Rent Sun 1 Nov to Fri 6 Nov | D14, D81 | 1c |
| Laptop loan's 3 payments from Sun 20 Dec, with the note changed from the second payment for this and all later ones, still give 3 payments, the last £34.00 | 5.4, D89 | 1c |
| "This and all later ones" and "Remove this and later" reach the whole family | D88 | 1c |
| A new amount replaces a pattern but keeps a different last amount; removing the last payment leaves the others' amounts | D90, D92 | 1c |
| A new date for this and all later ones: a new weekday, a new day of the month, a refused date, and an end date kept as the same number of payments | D91 | 1c |
| Update balance on Fri 30 Oct with its ticks is one edit, undone in one step | D33, D87 | 1c |
| A private transfer's two halves still match after every kind of edit, and its undo | D16, D94 | 1c |
| Property: making an edit, undoing it, then making it again gives the same records as the first time | 5.4 | 1c |
| Property: a private transfer's two halves still match after any run of edits | D94 | 1c |
| The Debts sketch: Owed now £3,214.86, counting the Family loan's €1,400.57 as £1,206.14; the Family loan 42% paid, €996.36 of €2,396.93; its payments come off as €145.15, €145.15, €290.30, €290.30, €290.30 and €239.38, leaving €1,255.42, €1,110.27, €819.97, €529.67, €239.37, then Paid off | 4.6, D9, D34, D99 | 1d |
| The Family loan: a tick at 9am on Mon 26 Oct leaves €1,255.42; a statement at 6pm showing €1,255.42 still leaves €1,255.42; a statement at 9am then the tick at 6pm leaves €1,255.42; ticks made inside the statement update count as before it | D27, D62, D103 | 1d |
| A credit card of £420.99 at 24.9% a year, statement day the 10th, payments on the 15th: £8.74 interest and a £12.95 minimum on Tue 10 Nov; the minimum takes 150 payments and £647.14, £25 a month takes 21 and £102.32, the full balance takes 1 and £8.74 | D101, D102 | 1d |
| Only this week of the pattern: Sam's Fri 6 Nov pay at £640.00 changes 6 Nov, 4 Dec, 1 Jan, 29 Jan and 26 Feb, every other payday keeps its amount, and total pay is £9,856.66 | D97 | 1d |
| A new date for this and all later ones follows D96: the new weekday, the new day of the month, or only that one chosen date | D96 | 1d |
| Property: every debt row follows from the one before; Paid off on, More than what's left and Left now agree with the rows; the order of the records changes nothing | D34, D63, D100 | 1d |
| Property: Update from statement and Only this week of the pattern are undone exactly and made again the same way, alongside every other edit | D97, D103 | 1d |
| On Fri 20 Nov, owner test 5's card with the £25.00 on 15 Nov ticked shows £404.73 left now, as an estimate; a card with no rate says "Interest not included" | D104 | 1e |
| A payment due on the statement date itself comes off the debt unless it was ticked at or before the update | D105 | 1e |
| 0% until Mon 30 Nov: Tue 10 Nov adds nothing (£395.99 after 15 Nov), Thu 10 Dec adds £8.22 (£404.21, then £379.21) | D106 | 1e |
| Owner test 1: Travel £25 a week all at the start: −£6.00 and −£15.00 on Sun 25 Oct; ends of day £216.54, −£8.46, £25.47, £558.53, −£41.47; November £586.91, February £2,833.87; short £8.46 on Mon 26 Oct and £41.47 on Sun 1 Nov; Left to spend £45.00, "Spend no more than £16.54" | D2, D3, D28 | 1e |
| Owner test 2: the same budget spread: £3.20 a day from Sun 25 to Wed 28 Oct, £3.21 on Thu 29 Oct; then £3.57 a day and £3.58 on Thu 5 Nov | D31 | 1e |
| Owner test 3: a pay-later food budget keeps every figure in brief 8.3; £230.00 spent makes the bill £230.00 (£702.91 end of November, £3,274.87 end of February); £120.00 spent gives "£80.00 left until Sat 28 Nov", not in Left to spend; February's bill on Sun 28 Feb covers Fri 29 Jan to Sat 27 Feb | D32, D61, D111 | 1e |
| Owner test 4: roll-over makes this week "£25 + £7 from last week", £32.00, and £28.00 leaves on Sun 25 Oct; later weeks are £25.00 | D30, D110 | 1e |
| Owner test 5: balance checked Thu 29 Oct at 8pm, today Sat 31 Oct: −£3.00 on Fri 30 Oct, −£22.00 on Sat 31 Oct, nothing else from Travel before Fri 6 Nov | D67 | 1e |
| Owner test 6: Sam's weekly budgets run Friday to Thursday, Kofi's Monday to Sunday, Priya's monthly one Thu 31 Dec 2026 to Thu 28 Jan 2027 | D29, D108 | 1e |
| Owner test 7: Kofi's £400.00 with 25% set aside moves £100.00 to his Tax account on Mon 2 Nov, and £109.38 when the real £437.50 is typed in | D64, D113 | 1e |
| Owner test 8: a £1,200.00 Holiday goal with £50.00 every Friday from Fri 30 Oct is reached on Fri 9 Apr 2027, with the 24th move | 4.7, D114 | 1e |
| "I spent", changing and removing a spend are each one undo; a pay-later bill is ticked, moved and given its real amount, but not changed for this and all later ones | D111, D115 | 1e |
| Property: budget periods follow on with no gaps; what's left leaves in full from today; spread days add up; spends after the update are rows and those before aren't; bills are the budget or what was spent; Left to spend follows D3 and D28; record order changes nothing; spend and bill edits are undone exactly | D2, D3, D28, D30, D31, D32, D115 | 1e |
| Property: a credit card's Left now matches a second working of the interest since the update | D104 | 1e |
| Money set aside has its own tick: ticking the pay leaves it unticked, and it can be ticked, unticked, split and undone on its own | D116 | 1f |
| With £217.54 on Sun 25 Oct: "You'll go under £20 on Mon 26 Oct, even if you spend nothing." Owner test 2 gives "Spend no more than £17.55", owner test 1 £16.54 and test 32 £22.54 | D117, D118 | 1f |
| "I spent" refuses a date after today; owner test 3 with today Sat 28 Nov and Sun 8 Nov | D119 | 1f |
| Every figure in the 2026-27 tax year file has its www.gov.uk source link and agrees with the GOV.UK pages; the tax year check warns on Mon 1 Mar 2027 without a 2027-28 file and not on Sun 28 Feb 2027 | 4.15, D45, D128 | 1f |
| HMRC's 2026-27 payroll test data, every row used, to the penny: income tax for the rest of the UK, Scotland and Wales, National Insurance category A for every pay period, and every student loan plan | D121, D122, D127 | 1f |
| Week 29's worked check: £10,732.73 − 29 × £241.92 = £3,717.05, so £3,717, £743.40 so far and £140.20 this week | 8.6 | 1f |
| Worked by hand: an emergency code on week 1/month 1, a monthly salary, a pension after tax, Plan 2 on a payslip, a K code held to half the pay, week 53, and pay every 2 weeks | 8.6, D121, D124, D126 | 1f |
| "I missed a shift" on Tue 3 Nov comes off Fri 13 Nov (−£100.43), and changes nothing once that payday's real amount is typed in | D44, D123, D125 | 1f |
| Owner test 3's £120.00 case on Sun 8 Nov: Left to spend is £0.00 | D129 | 1g |
| A missed shift losing £47.43 of shift premium takes £133.17 off Fri 13 Nov; extras are refused on pay with none, and a missed shift can't take off more than the payday has | D130 | 1g |
| Sam, 5 days before payday: overtime on Mon 26 Oct lands on Fri 6 Nov and a missed shift on Tue 3 Nov on Fri 13 Nov, with the step 1f figures; pay every 2 weeks from Fri 6 Nov covering work to the Sunday before puts Tue 3 Nov on Fri 20 Nov; monthly pay on the last working day covering work to the 15th puts Wed 16 Dec 2026 on Fri 29 Jan 2027 | D131 | 1g |
| A new amount for every payday from now on pay linked to pay weeks drops the pattern's pay weeks; Only this week of the pattern keeps a single pay week on every step | D136 | 1g |
| Brief 8.3 in full on Sam's plan with every engine part switched on at once (debts, the pay-later food budget, his pay profile and pay weeks, a savings goal, periods, Left to spend and What if), with the D15 names | 8.3, D15 | 1g |
| What if on Sam: the Fri 30 Oct pay £100 lower gives −£95.47 on Sun 1 Nov (Short) beside £4.53 (Tight), the D69 list, and every paid-off date the same; keeping it is one edit and one undo | 4.10, D69, D135 | 1g |
| Each of the other five people's plans works out with no errors and shows what brief Part 2 says they need most: Priya's yearly car insurance once, Dee's Universal Credit on Thu 24 Dec 2026, Kofi's Monday to Sunday weeks with 25% set aside, Jess and Tom's £600 transfer with the total unchanged, Ali's −£300 as Tight | Part 2, 8.5 | 1g |
| Property, on all six people's plans with any practice changes in What if: tests 44 to 46 again, What if never changes the real plan, and Keep saves exactly the practice plan | 5.8, D135 | 1g |
| A balance, or a debt's statement, typed in with an earlier date: a payment ticked before it but paid after its date comes off on its paid date | D138 | 1g |
| A savings goal that drops back below its target is reached on the day it gets back, or not at all | D139 | 1g |
| Two shifts on one payday: removing one works the other out again, and undoing the first is refused; a shift goes on the payday that covers its work; NONCUM; 1p allowed on National Insurance and take-home pay in Check my payslip; no deduction below zero | D140 | 1g |
| Same-moment balance updates refused in any order; a payment's own date isn't a new date; any pattern position; an end on 31 Dec 2999 | D141 | 1g |
| The owner's answers to step 1g: monthly pay covering last month's work, Ali's Left to spend £525.00 on Mon 11 Jan whatever the view, calendar months after the last main payday, a tick on the last working day kept when a bank holiday is added, 21 card payments on payment day, and an ended roll-over bill at what was spent | D142 to D147 | 2a |
| Owner test 1: Sam's plan built from empty with the commands only gives exactly his fixture's records and every brief 8.3 figure | 8.3, D149 | 2a |
| Owner test 2: the other five people's plans built from empty with the commands give exactly their fixture's records | D149, D157 | 2a |
| Owner test 3, property: undo after every command that builds the six plans, and after any made-up command on them, gives back exactly the plan from before; the same command gives the same edit; the plan still works out; no command breaks the plan | 5.8, D149 | 2a |
| Owner test 4: each refusal has a plain code, such as a transfer to the same account, a budget of £0, a goal with no account and a payment dated before today, and names no amount, name or note | D149 to D156 | 2a |
| Property: take-home is gross less every deduction; no payday takes more than half its pay in tax; week by week gives the same tax as no year so far when every week pays the same; overtime shift by shift adds up to all at once | D121, D124 | 1f |

**After Phase 1:** each of the six people gets an end-to-end test from Phase 2 on, at 320px and 360px wide (brief Part 10, D37): setup, update balance, add a payment, change "this and later", move to next payday, "I spent" and what if. **Built in step 2h:** `apps/web/e2e/people.spec.ts`, in light and dark, checking every day's balance against each person's fixture after setup and after every task.

## 7. Risks

**In plain words.** The parts most likely to go wrong, and what the plan does about each.

| Risk | Why it could go wrong | How the plan handles it |
| --- | --- | --- |
| **Sync between two phones** | Two people change the same thing, one of them offline, or a change is sent twice when the signal drops | Every edit has its own ID, so sending it twice changes nothing. The server saves edits one at a time and checks versions. Clashes run the command again on the newest data, so splits never overlap. Whoever's change loses is told. Unsent edits stay on the phone until the server confirms them. Section 3.5, D59 |
| **Signing other devices out within 1 minute** (D21, D394) | Supabase's sign-in tokens keep working until they expire, even after the session ends | Every database rule checks that the session still exists, so an old phone is refused on its very next request. A message tells the person's other phones to wipe the plan. Live nudges carry no money data, so a connection that stays open leaks nothing. Brief 8.7 test 6 proves it |
| **iPhone home-screen apps** | Sign-in isn't shared with Safari. Reminders only work after "Add to Home Screen". The phone may clear a site's stored data when space runs low. A web app can't hide its preview in the app switcher | 6-digit email codes first, with a link only as a backup (D20). The app explains "Add to Home Screen" when reminders are turned on (D22). The app asks the phone to keep its data, and the server copy is always the real one, so cleared data comes back at the next sign-in. Before sign-out or after a long time offline, it warns about unsent changes. Until Phase 6, the app covers balances when it's hidden, but the phone may still show an older preview; the App lock screen says so plainly. The Phase 6 apps hide it properly |
| **Tax tables** | Rates change every April, Scotland sets its own bands later in the winter, rules sometimes change mid-year, and one wrong threshold changes every payslip | One file per tax year, each figure with its GOV.UK source link. Tested against the four real payslips in brief 8.6 and GOV.UK's worked examples. A file can hold a change part-way through a year. The admin check warns from 1 March. The calculator always says it's an estimate and "Ask your payroll team" |
| **Dates and clock changes** | Treating a date as midnight UTC moves it a day; times shift when the clocks change | The engine uses day numbers, never date objects. "Today" is the person's local date in their time zone. Sun 25 Oct 2026, the day of Sam's example, is the day the clocks go back, so the D33 tests run across it |
| **Money maths** | Floating point makes 0.1 + 0.2 slightly wrong | Whole pence everywhere, exact decimals for rates, one rounding rule (D9), and property tests on thousands of made-up plans |
| **Speed on a cheap phone** | 10,000 payments worked out on every change could make the screen stutter | Section 2.8: a speed budget tested on every push, the engine in a background worker, only changed series redone, small downloads, skeleton screens instead of spinners, and a check on a real mid-range Android phone in Phase 4 |
| **A partner seeing private data** | One missing database rule would show Jess's private account to Tom | Every table starts with everything refused. The database fills in `private_to` itself. A database test for every table, and brief 8.7 test 2 tries every request Tom could make. Nudges, activity, exports and "keep a copy" all leave private records out |
| **Money in logs, error reports or emails** | Error messages often include the data that caused them; database errors can print the whole row | Error reports send only a fixed list of things: an error code, where in the code, the app version and phone type. The database functions check input before saving and return their own codes, never the row. Emails never contain amounts, payment names or notes. A check script looks for logging near money fields |
| **Bank holidays changing** | The government sometimes adds a one-off bank holiday | A weekly job refreshes the copy from GOV.UK, and every release updates the built-in copy |
| **Free plan limits** | A free Supabase project pauses after 7 days without use. Cloudflare's free plan wording is unclear about paid apps. GitHub's free minutes could run out | Supabase Pro before launch (D19). Read Cloudflare's terms before launch, added to the launch checklist. Run the slower tests only on pull requests if minutes run short |
| **App store review** (Phase 6) | Apple wants subscriptions sold inside the app as well, a company account for a money app, and account deletion inside the app | In-app purchases where the rules require them, with RevenueCat keeping one subscription across web and stores. Developer accounts in the company's name (D24). "Delete my account" is already in the app (brief 4.12) |
| **Safety in shared plans** | Money can be used to control a partner | Leaving needs no approval. Private accounts never show. No "last seen" anywhere. If the owner stops sharing, the other person keeps a copy. App lock, and an option to hide amounts in notifications. Help links to Surviving Economic Abuse (brief 4.14, 4.16) |
| **A money rule not decided yet** | Building on a guess would put wrong numbers in front of people | Open questions wait in `PLAN.md` and are asked before the step that needs them. The brief's expected numbers are never changed (CLAUDE.md) |
| **Sign-in emails in spam** | A new web address has no sending history | PrePenny's own web address with the standard email security records set up, Resend for sending, and Google sign-in as a second way in |
| **Static export limits** | No server pages or redirects inside the app | All server work is in Supabase (D17). Pages for one record take the ID after a question mark. Staff-only pages are protected by database rules, not by hiding the page |
