# Architecture

How PrePenny will be built. Written for the owner in plain English. The parts marked **For future sessions** hold the technical detail later Claude Code sessions need.

**Status: proposed on Tue 27 Oct 2026 (Phase 0). Nothing here is built yet.** Once the owner approves it, each choice marked **Proposed** goes into `docs/DECISIONS.md` as a decision, and this file becomes the map every later step follows. Where this file and `docs/DECISIONS.md` disagree, `docs/DECISIONS.md` wins.

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

<!-- PROPOSALS -->

## 2. The engine

**In plain words.** The engine is the calculator at the heart of PrePenny. You give it what's stored (accounts, balances, payments, debts, budgets) and today's date. It gives back every row of the plan with the balance after it, the lowest point ahead, any warning, left to spend, and when each debt is paid off. It never saves anything, never goes online and never looks at a clock. That makes it easy to test: Sam's plan from brief Part 8 goes in, and the exact numbers from the brief must come out.

It's built first, in Phase 1, before any screen (brief Part 9).

### 2.1 Main functions

| What it does | What goes in | What comes out |
| --- | --- | --- |
| **Work out payments** | Series, one-off changes, ticks, bank holidays, a start and end date | Every payment in that window: date, amount, account, and whether it's an estimate, ticked, moved or skipped, plus the series and payment number it came from |
| **Work out the plan** | Everything stored for the plan, today's date, how far ahead to look | For each account: every row with "Left after this", each day's closing balance, the "Not ticked yet" list, the lowest point ahead (amount, date and the payment that caused it), the first day under the warning level, and each shortfall with its amount, date and the payments before it that could move |
| **Group into periods** | The plan, and pay periods or calendar months | Each period's "Came in", its rows in date order, and "Left at the end" |
| **Left to spend** | The plan and today | The amount, the payday it lasts until (D28), and the "Spend no more than" line when it's needed (D3) |
| **Debts** | A debt, its linked payments, today | Left now, Paid off on (or what's still left at the end), progress, and for credit cards the interest and minimum estimates and the minimum, fixed and full comparison |
| **Budgets** | A budget, its spends, today | The rows it puts in the plan, spent and left this period, and any roll-over |
| **Savings goals** | A goal and the transfers linked to it | Saved so far, the date it's reached at the current plan, and what each person has put in |
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

1. **Date.** Worked out from the series start and k, never from the previous payment, so dates never drift (brief 5.3). Weekly: start + 7 × every × k days. Monthly: the start day in month k, or the month's last day when the month is shorter (31 Jan, 28 Feb, 31 Mar). "Last day", "last working day" and "first Monday" are worked out for each month. Specific dates (Ali's student loan) come from the list. Months set to be skipped (Dee's council tax in February and March) are left out.
2. **Amount.** The change's amount if there is one; otherwise the different last amount if this is the last payment; otherwise `cycle[(k + offset) mod cycle length]` if the amount follows a pattern; otherwise the series amount (brief 5.3). **Proposed:** a one-off change wins over the last amount, because it's the most specific thing the person typed.
3. **Weekend and bank holiday rule.** Move to the working day before or after, or keep the date (brief 4.3).
4. **Changed date, skip.** A changed date replaces the result. A skipped payment is left out but still counts towards "after N payments" (D4).
5. **Stop** at the end rule or the end of the view.

The date from step 1, before any move, is the payment's **original date**. Changes and ticks are attached to the series and the original date (brief 5.2), so they stay attached even if the bank holiday list or the series' rule changes later.

Sam's pay shows the pattern working. The series has the cycle £452.17, £618.46, £469.06, £592.17 with offset 0, plus one change: the first payment (Fri 30 Oct) is £603.06. Payment 5 is Fri 4 Dec: cycle[5 mod 4] = cycle[1] = £618.46.

### 2.3 Editing and undo

Every edit goes in as a command and comes out as records to save. The engine never changes anything itself.

- **Just this one:** save a change for that payment (brief 5.4).
- **This and all later ones:** split the series. The old series now ends just before this payment: by count if it ends after a number of payments, otherwise by date. A new series starts at this payment with the edits. It remembers which payment number it starts at, so the amount pattern and the "after N payments" count carry on. Later changes and ticks move across to it by payment number. On the first payment of a series, this edits the whole series instead.
  - Brief 8.4 test 1: rent £560 from 1 Jan 2027. The old series ends after 2 payments (November and December), and keeps the November £600 change. The new series is £560 from 1 Jan 2027.
  - Brief 8.4 test 2: a new note on pay from Fri 4 Dec. The new series starts at payment 5, so its pattern position is (0 + 5) mod 4 = 1: £618.46, the same as before. Every amount stays the same.
- **Remove this one:** mark it skipped. **Remove this and later:** end the series before it.
- **Move:** a changed date. **Move to next payday:** a changed date on the first main payday after the payment's current date (D14).
- **Tick:** a tick record with the paid date and time (D1, D33).

**Undo.** Each edit returns two lists: the records to save, and a copy of how those records looked before (or a note that they didn't exist). Undo saves the "before" copy as a new edit. This means:

- one edit is one undo step, however many records it touched (brief 5.4)
- an undo reaches the other phone like any other change
- in a shared plan you can undo your own change as long as nobody has changed the same records since. Otherwise the app says "Tom has changed Rent since, so this can't be undone", and nothing is lost
- the change history (brief 4.12) is the list of edits.

A property test proves that an edit followed by its undo gives back exactly the records from before (brief 5.8).

### 2.4 The balance rule, step by step

For each account (brief 5.5, with D1, D10, D11, D12 and D33):

1. **Start** from the latest balance update: amount B, typed on date D at time T.
2. **Already inside B, so ignored:** payments ticked at or before T, payments ticked inside that update's steps (D33), and spends recorded at or before T (D2, D33).
3. **Overdue:** unticked payments dated before D. These are applied first, oldest first. On screen, "Not ticked yet" lists unticked payments dated before today (D11).
4. **Ticked after T:** counts as going out on its paid date, the day it was ticked (D1, D33).
5. **Everything from D onwards,** in date order. On the same day: money in, then transfers, then money out. Within each group, by when the series was created, then by name (D12).
6. **Balance after every row.** The day's figure is the balance after its last row.
7. **Lowest point ahead:** the lowest end-of-day balance from today on, with its date and the payment that caused it.
8. **Warnings.** Strictly below the warning level is Tight. Strictly below the floor (zero, or minus the overdraft limit) is Short: "£X short on [date]", with the payments before that date that could move (D10). **Proposed:** "could move" lists unticked money going out from today up to the short day, biggest first, and tapping one shows the new lowest point if it moved to the next payday.
9. **Transfers** leave one account and arrive in the other on the same date. A transfer between a private account and a shared one is stored as two linked halves (section 3.6, D16).
10. **Budgets** add their rows (section 2.5).

Brief 8.4 test 5 checks steps 2 to 4: a balance of £600 on Fri 30 Oct with everything up to then ticked inside the update steps. The plan works forward from £600 and nothing is counted twice.

### 2.5 Budgets and spending money

Each budget has a period (D29), an amount, a way of leaving the account, and roll-over on or off (D30).

- **All at the start** (the default, brief 5.5): a future period leaves in full on its first day, as one row. In the period that contains today, spends recorded after the balance update are rows on their own dates, and the unspent part, max(0, budget minus all spends this period), leaves as one row today (D2).
- **Spread across the days** (D31): equal daily amounts, rounded down to the penny, with the leftover pennies on the last day. £25 a week is £3.57 a day for 6 days and £3.58 on the 7th. In the period that contains today, only the unspent part is spread, over the days left from today. **Proposed:** on screen, a period's daily rows fold into one line ("Travel, £3.57 a day") that opens to show each day; the maths always uses the daily rows.
- **Pay-later bill** (D32): spends on the card never leave the bank account. One bill row leaves on the bill date: the budget, or what was really spent in the period the bill covers if that's more. When the real bill arrives, the person types it in and it replaces the estimate.
  - **Proposed, waiting for the owner (D32):** each pay-later budget stores a bill day and a statement day. A bill covers spends dated from the day after the previous statement day up to and including this statement day. The statement day starts as the day before the bill day, and can be changed to match the card. Example: bill on the 29th, statement day the 28th, so the bill on Sun 29 Nov covers spends from Thu 29 Oct to Sat 28 Nov. "Spent" and "left" for this budget use the same dates.
  - **Proposed:** what's left on a pay-later budget isn't part of "Left to spend", because it doesn't leave the bank before payday (D28). It shows on its own line underneath: "On the pay-later card: £80.00 left until Sat 28 Nov".
- **Roll-over** (D30): when on, a period's budget is the budget plus the unspent amount at the end of the period before, shown as "£25 + £7 from last week". Future periods in the plan assume the current one is spent in full, so roll-over appears once a period has ended.
- **Left to spend** (D28): all spending money due to leave from today to the day before the next main payday. That's unspent budget rows (including spread days and any full future period that starts inside that window) plus payments of the type Spending money. The extra line from D3 appears only when spending it all would take the balance under the warning level: X = max(0, L + M − W).
- **A balance checked in an earlier budget period** isn't covered by D2 yet. See question 9 in `PLAN.md`.

### 2.6 Debts

- **Left now** = the balance on its date, minus every linked payment ticked as paid with a paid date after that date (brief 5.6, D27). Each payment is converted with the debt's rate and rounded once (D9).
- **Paid off on** = the first date where the balance minus the planned linked payments after its date, in order, reaches 1p or less (1 cent for a debt in euros). If that never happens in the view, show what will still be left at the end.
- **Never less than nothing** (D34): 1p or less, including a small minus from rounding, shows "Paid off" and £0.00. Family loan: €1,400.57 minus 6 payments converted at €1.1612 per £1 leaves −€0.01, so it shows "Paid off on Fri 1 Jan 2027".
- **Credit cards with an interest rate:** monthly interest (balance × yearly rate ÷ 12) is added on the statement day (D13), rounded once (D9), and the minimum is worked out from the rule, for example interest plus 1% of the balance, at least £5, never more than the balance. Both are labelled as estimates.
- **Compare** minimum, fixed amount and full balance: months to clear and interest paid. Numbers only (brief 3.10).
- **Proposed:** the Debts screen looks 24 months ahead for "Paid off on", whatever the Plan screen shows, and after that says how much is left on the last day it looks at. The brief 8.3 tests keep their own view to the end of February 2027.

### 2.7 Take-home pay

- **Pay lines:** hours × rate worked out exactly, then rounded once per line (D9). 34.5 h × £12.71 = £438.495, which rounds to £438.50. Fixed amounts are added as typed.
- **Pension:** a percentage of the earnings between a lower and upper limit for the pay period, taken before tax or after tax. Week 26: 4% × (£553.19 − £120.00) = £17.3276, which rounds to £17.33.
- **Income tax:** from the tax code, on the cumulative basis or week 1/month 1. The cumulative sum follows the worked check in brief 8.6: gross for tax so far, minus tax-free pay to date, rounded down to the pound, taxed by band, minus tax already paid. Scottish S and Welsh C codes use their own bands. K codes, BR, D0, D1, NT and emergency codes are covered.
- **National Insurance, student loans (Plans 1, 2, 4, 5 and Postgraduate) and other deductions,** with every threshold and rounding rule taken from GOV.UK and written in the tax year file.
- **The tax year file:** one data file per tax year (`2026-27.json`) holding every rate and threshold, with the GOV.UK source link written in it (brief 4.15). **Proposed:** the admin check starts warning on 1 March if the file for the tax year starting in April is missing.
- **Overtime** (D5): the change to the payday is take-home with the overtime minus take-home without it, using the payday's linked pay week. 11.5 h × £19.07 on week 27's lines raises that payday by £155.23 (within £1). On week 26's lines it gives £150.89, which is how Fri 30 Oct became £603.06.
- **Proposed:** "I did overtime" and "I missed a shift" change a payday only while it's an estimate. Once the real amount is typed in, the real amount stands.

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
8. **A speed test in every test run** (step 1g): 100 series over 24 months must finish in under 12 milliseconds on the test machine, which leaves room for a phone four times slower. Phase 4 checks it on a real mid-range Android phone.

### 2.9 Bank holidays

The engine has a built-in copy of the official list from `https://www.gov.uk/bank-holidays.json` for England and Wales, Scotland and Northern Ireland (brief 5.7). The app also fetches a fresher copy from PrePenny's own website, which a weekly job refreshes from GOV.UK, and keeps it on the phone. The phone itself never contacts GOV.UK. Each plan has one nation, chosen in setup.

### For future sessions: the engine

- Package `@prepenny/engine` in `packages/engine`: TypeScript, ES modules, no runtime dependencies. It must run in the browser, in a Web Worker, in Node (Vitest) and in Deno (Supabase Edge Functions use it to work out reminders).
- **Money** is `Pence`, a whole number; check `Number.isSafeInteger` at the edges. Rates, percentages and hours are exact decimal strings ("1.1612", "4", "34.5"), parsed into whole-number fractions. Multiply first, then round once, halves away from zero (D9), with whole-number maths (`BigInt` where a product could pass 2^53). Never floating point for money.
- **Dates** are `Day` numbers inside the engine and `"YYYY-MM-DD"` strings at its edges. Never `new Date("2026-10-25")`: that is midnight UTC and lands on the wrong day in some time zones.
- **Times** (balance updates, ticks, spends, D33) are ISO strings in UTC. The engine only compares stored times with each other, so it still needs no clock.
- **Pure:** no `Date.now()`, no `Math.random()`, no network, no storage. A lint rule blocks them inside the package.
- **Edits** are commands: `editPlan(plan, command, today) → { writes, undo }`. The same function runs again when a sync clash needs an edit replayed on newer data (section 3.5).
