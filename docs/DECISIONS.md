# Decisions

Decisions made since the brief (`docs/BRIEF.md`). Where this file and the brief disagree, this file wins. Where `docs/VOICE.md` or `docs/DESIGN.md` is stricter than the brief, they win too (D36).

D1 to D26 were agreed by the owner on 27 Oct 2026, before any code was written. D27 to D37 were agreed on 27 Oct 2026 as well, answering the questions left in `PLAN.md`. Add new decisions at the end with the next number, the date and the reason. Never renumber or delete an entry; if a decision changes, add a new one that says which entry it replaces.

## Money rules

### D1. Paying early

A payment ticked as paid before its due date counts as gone on the day it was ticked. Store that date with the tick and use it in the balance rule: on or before the balance date means it's already inside the balance.

Why: otherwise the next balance update counts it twice.

### D2. Budgets and the bank

For the budget period that contains the balance date:

- spends recorded on or before the balance date are already inside the balance
- spends recorded after it appear as their own rows on their dates
- whatever is still unspent, max(0, budget minus all spends this period), leaves as one row on today.

Past periods are settled. Future periods leave in full at the start.

The rules for the "spread across the days" and "pay-later bill" options must be confirmed with the owner before they are built.

Why: the plan and the bank always agree.

### D3. Left to spend this week

The main number is this period's spending money (budgets, plus payments of the type Spending money) minus what has been spent.

Add one line only when spending all of it would take the balance under the warning level before the next main payday: "Spend no more than £X to keep at least £20 until Fri 30 Oct."

X = max(0, L + M − W), where L is left to spend, M is the lowest end-of-day balance from today to the day before the next main payday, and W is the warning level.

Test: Sam's plan on Sun 25 Oct gives L = £30.00, M = £12.54 (Mon 26 Oct), W = £20, so X = £22.54.

Why: people see one number they can spend, and the extra line only appears when spending it all would take them under their warning level, with the exact amount and date.

### D4. Skipping removes only that payment

Nothing is added at the end, and skipped payments still count towards "after N payments". The linked debt then shows what's still owed. To push a payment later, use Move.

Why: the plan never adds a payment the person didn't ask for, and the debt still shows the truth.

### D5. Overtime

Each step of a repeating pay pattern can be linked to a saved pay week from the pay calculator (for Sam: steps 1 and 3 are 3-shift weeks, steps 2 and 4 are 4-shift weeks). Setup asks for this when pay follows a pattern.

"I did overtime" adds the hours to that payday's linked week and changes the payday by (take-home with overtime) minus (take-home without). If no week is linked, ask once for usual hours and rate.

Tests:

- 11.5 hours at £19.07 worked Mon 26 Oct 2026, with pay one week behind, lands on Fri 6 Nov 2026.
- With week 27's lines (46 h × £12.71, shift premium £210.23) it raises that payday by £155.23, within £1.
- The same overtime on week 26's lines (34.5 h × £12.71, premium £114.69) gives £150.89, which is how 30 Oct became £603.06.

Why: overtime is taxed together with the rest of that week's pay, so the change to the payday has to come from the pay calculator, not from hours × rate.

### D6. Payslip dates in brief 8.6

The four payslips in brief 8.6 were paid on Fridays 2, 9, 16 and 23 Oct 2026, not 3, 10, 17 and 24 Oct. Tax weeks 26 to 29 and every figure stay the same.

Why: 3, 10, 17 and 24 Oct 2026 are Saturdays, and Sam is paid on Fridays.

### D7. "About £155"

"About £155" in brief 8.6 means within £1.

Why: a test needs an exact tolerance.

### D8. First day under the warning level

Add to Sam's tests: the balance first goes under the £20 warning level on Mon 26 Oct 2026, at £12.54 after Driving lesson. The lowest point is still £4.53 on Sun 1 Nov.

Why: the warning starts days before the lowest point, and the app must show that, so it needs a test.

### D9. Rounding

Round to the nearest penny, halves away from zero. Hours × rate is worked out exactly for each pay line, then rounded once per line. Currency conversion is rounded once per payment.

Why: the same inputs always give the same pence, and it matches the real payslips in brief 8.6 (34.5 h × £12.71 = £438.495, and week 26's gross of £553.19 only adds up if that line is £438.50).

### D10. "Below" means strictly below

"Below" means strictly below, for both the warning level and the shortfall floor. Exactly £20.00 is not under a £20 warning level.

Why: one meaning everywhere, so warnings always start at the same point.

### D11. Not ticked yet

On screen, "Not ticked yet" lists unticked payments dated before today. The balance maths follows brief 5.5 exactly.

Why: anything that should have gone by today needs a tick, whatever date the balance was checked, and the maths stays as the brief sets it out.

### D12. Same-day order

Money in, then transfers, then money out. Within each group, by when the series was created, then by name, so the order never changes between runs.

Why: "Left after this" on each row must be the same every time the plan is worked out.

### D13. Credit card statement day

Credit cards store a statement day, used for interest and the minimum payment.

Why: brief 5.6 adds interest and works out the minimum on the statement day, so the card needs to know which day that is.

### D14. Main pay

Each person picks one main pay. Plan periods run from one main payday to the day before the next. "Move to next payday" moves a payment to the first main payday after its current date. If the main pay is irregular, periods are weeks from Monday to Sunday.

Why: plan periods, left to spend and "Move to next payday" all need one payday to work from, even for people with more than one income.

### D15. Sam's plan is the public example

Sam's plan is the public example, with brand names changed and every number, date and result kept:

- Monzo Flex → Pay-later card (its monthly food bill: Pay-later card (food))
- Clearpay → Pay in 3 (two orders: £165.20 order and £79.99 order)
- Lemfi → Laptop loan
- Klarna → Sofa finance
- Capital One → Credit card
- Partner loan → Family loan (€)

Tests use these names, for example "Sofa finance is paid off on 23 Aug 2027".

Every payment keeps its date (no weekend or bank holiday moves), so the example always matches the tests.

Why: a public example shouldn't name real companies, and keeping every number means the example and the tests stay the same plan.

### D16. Couples

Money moving from a private account into a shared one appears in the shared plan only as "From Jess, £600" on that date. No account name, no balance, nothing else from the private account.

Why: private accounts stay private (brief 4.14), and the shared plan still shows the money arriving.

## Technology and costs

### D17. One app, built once for web and phones

One Next.js app built as a static export, so the same build becomes the iPhone and Android apps with Capacitor in Phase 6. No server inside the app. Server work (Stripe webhooks, emails, reminders, account deletion) runs in Supabase Edge Functions. Supabase project in London. A pnpm monorepo with `packages/engine` and `apps/web`.

Why: the brief's default setup would need reworking at Phase 6.

### D18. Hosting

Hosting on Cloudflare Pages.

Why: it's free for commercial use and gives a preview link for every pull request.

### D19. Costs

Keep costs as low as possible: free plans until real users arrive. Before launch, move Supabase to its paid plan (about £20 a month). Error tracking and email on free plans. Analytics only after launch, opt-in, counts only.

Why: free Supabase projects pause after a week without use and lack longer backups and the 90-day sign-out setting, which real users need.

### D20. Sign-in

Sign-in uses a 6-digit email code first, with a link as backup. Google sign-in in Phase 3. Sign in with Apple moves to Phase 6, when the Apple developer account is set up.

Why: on iPhone, an app added to the home screen doesn't share sign-in with Safari, so a link opened from email wouldn't sign the app in.

### D21. Sign out everywhere within 1 minute

The server must also check on each request that the session still exists, and close live-update connections. Plan for this in Phase 3.

Why: Supabase sign-in tokens stay valid until they expire, so ending a session alone doesn't sign anyone out within 1 minute.

### D22. iPhone reminders before Phase 6

Until Phase 6, iPhone reminders only work after "Add to Home Screen". The app says so when someone turns reminders on.

Why: iPhones only allow notifications from a web app once it has been added to the home screen.

### D23. Self-hosted fonts

Fonts are self-hosted, never loaded from Google or another service while the app runs.

Why: loading a font from another service tells that service who is using the app, and the app must work offline.

## Business

### D24. Limited company first

There's no limited company yet. Setting one up goes first on the launch checklist, before the Apple and Google developer accounts.

Why: the developer accounts are registered to the company (brief Part 9, Phase 6), and Apple may require a company for a money app (brief 7.3).

### D25. VAT wording

Prices say "including VAT" only once the business is VAT-registered. Until then the price is simply the price. Add this to the launch checklist.

Why: saying "including VAT" when no VAT is charged would be wrong.

## Design

### D26. The look

The look is sample C's modern layout in sample A's navy and cream, with one font (Figtree) throughout. Details in `docs/DESIGN.md`.

Why: it's the look the owner approved (the "Your pick" board).

## Answers agreed on 27 Oct 2026

### D27. Paying a debt early

Agreed 27 Oct 2026. Replaces the due date in brief 5.6.

Debts follow D1. A payment ticked early counts against the debt on the day it was ticked, so "Update from statement" never takes it off twice.

Why: the debt and the bank balance use the same paid date, so neither counts a payment twice.

### D28. Left to spend

Agreed 27 Oct 2026. Replaces how D3 works out the main number.

"Left to spend" covers today until the day before the next main payday, labelled with that payday, for example "Left to spend until Thu 31 Dec". It is the total of spending money still due to leave the account in that window: unspent budget rows plus payments of the type Spending money.

The D3 line and formula stay as they are.

Why: it works the same for weekly and monthly pay, and the label says exactly how long the money has to last.

### D29. Budget periods

Agreed 27 Oct 2026.

- A weekly budget starts on the main payday's weekday when the main pay is weekly, every 2 weeks or every 4 weeks (Friday for Sam), and on Monday otherwise.
- A monthly budget runs from one main payday to the day before the next when the main pay is monthly, and by calendar month from the 1st otherwise.

Why: budgets line up with the day the money arrives, and everyone else gets the usual week and month.

### D30. Roll-over

Agreed 27 Oct 2026.

Roll-over is off unless it's switched on for that budget.

- When it's off, unspent money stays in the account.
- When it's on, the unspent amount at the end of a period is added to the next period's budget, shown as "£25 + £7 from last week".

Why: nothing moves unless the person asks for it, and when it does, they can see where the extra came from.

### D31. Spread across the days

Agreed 27 Oct 2026. Settles the "spread across the days" rule left open in D2.

The budget leaves in equal daily amounts, rounded down to the penny, with the leftover pennies on the last day. £25 a week is £3.57 a day for 6 days and £3.58 on the last.

In the current period, only the unspent amount (D2) is spread over the days left, from today.

Why: the daily amounts always add up to the exact budget, and only money not yet spent is spread.

### D32. Pay-later bill

Agreed 27 Oct 2026. Settles most of the "pay-later bill" rule left open in D2.

Spends on the card don't leave the bank account when they're made. The bill, on its bill date, is the budget for the period, or what was really spent if that's more. When the real bill arrives, the person types it in and it replaces the estimate.

Still open: which spends each bill covers. The proposal is in `docs/ARCHITECTURE.md`, and the owner approves it before it's built.

Why: the bank only sees the bill, and planning for at least the budget keeps the plan on the safe side.

### D33. Balance updates store the time

Agreed 27 Oct 2026. Adds a time to D1 and D2.

A balance update stores the time as well as the date. A payment ticked, or a spend recorded, after the latest update counts as not yet inside that balance, even on the same day. Ticks made inside the "Update balance" steps count as before the update.

Why: anything ticked or recorded after the update isn't in the number the person typed, so counting it as inside would show too much money.

### D34. A debt never shows less than nothing

Agreed 27 Oct 2026.

When 1p or less is left, including a small minus from rounding, show "Paid off" and £0.00.

Why: rounding each payment (D9) can leave a penny either way, and "−€0.01 left" on a paid debt would only confuse.

### D35. App lock wording

Agreed 27 Oct 2026.

The app lock says "Open with your PIN", "Open with fingerprint" or "Open with face", never "unlock".

Why: "unlock" is banned in `docs/VOICE.md`, and these words say exactly what to do.

### D36. Voice and design win over the brief

Agreed 27 Oct 2026.

`docs/VOICE.md` and `docs/DESIGN.md` also win over the brief where they're stricter.

Why: they were written after the brief to set exact rules, for example no emoji anywhere, where the brief only bans them on money screens.

### D37. Screen widths

Agreed 27 Oct 2026.

Every screen is checked at 320px and 360px wide.

Why: the brief asks for screens that work down to 320px, and its end-to-end tests run at 360px.
