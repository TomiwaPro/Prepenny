# Decisions

Decisions made since the brief (`docs/BRIEF.md`). Where this file and the brief disagree, this file wins. Where `docs/VOICE.md` or `docs/DESIGN.md` is stricter than the brief, they win too (D36).

D1 to D26 were agreed by the owner on 27 Oct 2026, before any code was written. D27 to D37 were agreed on 27 Oct 2026 as well, answering the questions left in `PLAN.md`. D38 to D74 were agreed on 27 Oct 2026 too: D38 to D58 are the proposals in `docs/ARCHITECTURE.md`, D59 to D68 answer the Phase 0 questions, and D69 to D74 come from the owner's review of the plan. D75 to D78 were decided while building step 1a, on 29 Oct 2026, and the owner confirmed D75 and D78 the same day. D79 to D85 were decided while building step 1b, on 29 Oct 2026, and the owner confirmed D79 and D81 to D84 the same day. D86 comes from the owner's review of step 1b, on 29 Oct 2026. D87 to D95 were decided while building step 1c, on 29 Oct 2026. D96 and D97 come from the owner's review of step 1c, on 29 Oct 2026, when the owner also confirmed D90 and D92. D98 to D103 were decided while building step 1d, on 29 Oct 2026; D101's minimum rule was set out by the owner. D104 to D106 come from the owner's review of step 1d, on 1 Nov 2026, when the owner also confirmed D98 to D103. D107 to D115 were decided while building step 1e, on 1 Nov 2026. D116 to D119 come from the owner's review of step 1e, on 1 Nov 2026. D120 was agreed by the owner while step 1f was being built, on 1 Nov 2026, and D121 to D128 were decided while building step 1f, the same day. D129 to D133 come from the owner's review of step 1f, on 3 Nov 2026, and D134 to D141 were decided while building step 1g, the same day. D142 to D148 come from the owner's review of step 1g, on 3 Nov 2026, and D149 to D157 were decided while building step 2a, the same day. D158 to D163 come from the owner's review of step 2a, on 3 Nov 2026, and D164 to D175 were decided while building step 2b, the same day. D176 to D182 come from the owner's review of step 2b, on 3 Nov 2026, and D183 to D189 were decided while building step 2c, the same day. D190 to D195 come from the owner's review of step 2c, on 3 Nov 2026, D196 is the owner's instruction for step 2d, and D197 to D203 were decided while building step 2d, the same day. D204 to D207 come from the owner's review of step 2d, on 4 Nov 2026, D208 to D214 are the owner's instructions for step 2d-2, and D215 was decided while building step 2d-2, the same day. D216 to D219 come from the owner's review of step 2d-2, on 4 Nov 2026, and D220 to D229 were decided while building step 2e, the same day. D230 to D233 come from the owner's review of step 2e, on 4 Nov 2026, and D234 to D246 were decided while building step 2f, the same day. D247 to D251 come from the owner's review of step 2f, on 4 Nov 2026, and D252 onwards were decided while building step 2g, the same day. Add new decisions at the end with the next number, the date and the reason. Never renumber or delete an entry; if a decision changes, add a new one that says which entry it replaces.

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

The sum for X is replaced by D118, and the line when even spending nothing goes under the warning level by D117.

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

## The approved plan

D38 to D58 are the 21 proposals in `docs/ARCHITECTURE.md` ("Proposed in this plan"), in the same order. The owner approved the plan on 27 Oct 2026. The section in brackets is where each one is explained.

### D38. A one-off change wins over a different last amount

Agreed 27 Oct 2026 (ARCHITECTURE.md 2.2).

A payment's amount is, in this order: the one-off change's amount, then the different last amount if it's the last payment, then the amount pattern, then the series amount.

Why: a one-off change is the most specific thing the person typed.

### D39. Ticked after a balance update, with an earlier paid date

Agreed 27 Oct 2026 (ARCHITECTURE.md 2.4).

A payment ticked after a balance update, with a paid date before that update's balance date, goes out at the start with the overdue payments, and shows as ticked. Balances from today on come out the same as if it went out today.

Why: it isn't inside the balance the person typed (D33), so it still has to come off, and taking it off first means every balance from today on allows for it.

### D40. Payments that could move

Agreed 27 Oct 2026 (ARCHITECTURE.md 2.4). Replaced by D69.

When the plan shows a shortfall, "Payments that could move" lists the unticked payments going out from today up to the short day that would fix the shortfall on their own if moved to the first main payday after it, biggest first, with "Show all" for the rest. Tapping one shows the new lowest point.

Why: brief 5.5 and principle 7 ask for the payments that could move to fix a shortfall, and showing first the ones that fix it on their own gives one clear thing to do.

### D41. A spread budget folds into one line

Agreed 27 Oct 2026 (ARCHITECTURE.md 2.5).

On screen, a spread budget's daily rows for a period fold into one line ("Travel, £3.57 a day") that opens to show each day. The sums always use the daily rows.

Why: a row for every day would push the other payments off the screen.

### D42. Paid off in another currency

Agreed 27 Oct 2026 (ARCHITECTURE.md 2.6).

A debt in another currency counts as paid off at 1 cent (or that currency's smallest unit) or less, as D34 does with 1p.

Why: converting and rounding each payment (D9) can leave a cent either way, just as it can leave a penny.

### D43. Debts look 24 months ahead

Agreed 27 Oct 2026 (ARCHITECTURE.md 2.6).

The Debts screen looks 24 months ahead for "Paid off on", whatever the Plan screen shows. After that, it says how much is left on the last day it looks at. The brief 8.3 tests keep their own view, to the end of February 2027.

Why: the Plan screen shows 3 months by default, but many debts run for longer, and 24 months is the furthest the plan can show (brief 4.8).

### D44. Overtime changes only an estimate

Agreed 27 Oct 2026 (ARCHITECTURE.md 2.7).

"I did overtime" and "I missed a shift" change a payday only while it's an estimate. Once the real amount is typed in, the real amount stands.

Why: the real amount is what the bank shows, and the plan stays true to the bank (brief Part 3, principle 1).

### D45. The tax year check warns from 1 March

Agreed 27 Oct 2026 (ARCHITECTURE.md 2.7).

The admin check starts warning on 1 March if the file for the tax year starting in April is missing.

Why: a new file is needed every April (brief 4.15), and a month's warning leaves time to add it before the first payday of the new tax year.

### D46. "Expected" in Update balance

Agreed 27 Oct 2026 (ARCHITECTURE.md 4.6).

"Expected" in Update balance is the plan's balance at the end of today, before anything is ticked.

Why: it's what the bank should show once everything planned up to today has gone out or come in, so the person sees one clear difference to check.

### D47. Suggested warning level

Agreed 27 Oct 2026 (ARCHITECTURE.md 3.3).

Setup suggests a warning level of £20.00, and people can change it.

Why: it's the warning level in Sam's plan (brief 8.1), and a starting amount is quicker to set up than an empty box.

### D48. A paid tick is its own record

Agreed 27 Oct 2026 (ARCHITECTURE.md 3.3).

A paid tick is stored as its own record, not as part of a payment change.

Why: then one person ticking Rent and the other changing Rent's amount at the same moment never clash.

### D49. Split series share a family

Agreed 27 Oct 2026 (ARCHITECTURE.md 3.3).

Series split from the same original share a family. Main pay and the same-day order (D12) use the family, so a split changes neither.

Why: a split makes a new series, and without the family it would lose its place as main pay and could move within the same day.

### D50. Change history kept for 12 months

Agreed 27 Oct 2026 (ARCHITECTURE.md 3.5).

Edits are kept for 12 months as the change history (brief 4.12).

Why: long enough to look back over a full year, yearly bills included, without keeping more than needed (brief 7.2).

### D51. "Can view only" includes ticks

Agreed 27 Oct 2026 (ARCHITECTURE.md 3.6).

Someone who can view only can't tick payments either. This narrows brief 4.14's "either person can tick" to people who can edit. The server refuses, not only the screen.

Why: a tick changes the balances and debts in the plan, so it's a change like any other.

### D52. "To Jess"

Agreed 27 Oct 2026 (ARCHITECTURE.md 3.6).

Money from a shared account into a private one shows in the shared plan only as "To Jess" on that date, with the amount: the reverse of D16.

Why: the same privacy as D16, the other way round.

### D53. When the owner of a shared plan leaves

Agreed 27 Oct 2026 (ARCHITECTURE.md 3.6).

If the owner leaves, the person who stays becomes the owner. If the owner stops sharing, the other person keeps a copy automatically.

Why: nobody can be cut off from records they relied on (brief 4.14).

### D54. Hide amounts in notifications

Agreed 27 Oct 2026 (ARCHITECTURE.md 3.7).

A setting hides amounts in notifications.

Why: notifications can show on a locked phone, where someone else might see them.

### D55. Problem report files deleted after 30 days

Agreed 27 Oct 2026 (ARCHITECTURE.md 3.7).

Screenshots and plan copies attached to "Something looks wrong" are deleted after 30 days.

Why: they can hold money data, and 30 days is long enough to look into a problem (brief 7.2 asks to collect the minimum).

### D56. The tools

Agreed 27 Oct 2026 (ARCHITECTURE.md 1).

The tools in ARCHITECTURE.md section 1, including TypeScript 6.0 rather than 7.0, no sheet library, Resend for email, Sentry's EU region, UptimeRobot, and buying the web address by Phase 3. RevenueCat and Codemagic are named for Phase 6 and decided then.

Why: section 1 gives the reason for each. In short: the tools around TypeScript 7.0 don't fully support it yet; the popular sheet library hasn't been updated since Dec 2024 and DESIGN.md bans a library's default look; the free plans are enough for now; Sentry's EU region keeps error reports in Europe; and sign-in emails need PrePenny's own web address from Phase 3.

### D57. Fresh bank holidays from PrePenny's own site

Agreed 27 Oct 2026 (ARCHITECTURE.md 2.9).

The engine has a built-in copy of GOV.UK's bank holiday list. The phone gets fresher copies from PrePenny's own site, which copies GOV.UK's list weekly.

Why: the phone never contacts another site, for the same reason as D23.

### D58. Names for two public pages

Agreed 27 Oct 2026 (ARCHITECTURE.md 4.1).

"Will I make it to payday?" becomes **Payday check**, headed "Check your money lasts until payday". "Worried about money?" becomes **Help when money is tight**. Help articles are titled as statements too.

Why: VOICE.md bans questions as headlines, and it wins over the brief (D36).

## Answers to the Phase 0 questions

D59 to D68 are the owner's answers to the 10 questions asked at the end of Phase 0, in the same order: question 1 is D59. The owner accepted every suggested answer on 27 Oct 2026.

### D59. Clashes after being offline

Agreed 27 Oct 2026. Needed before Phase 3.

"Newest" means when a change was made, not when it reached the server. Tom changes Rent offline at 9am, Jess changes it online at 10am, and Tom's phone reconnects at 11am: Jess's change stays, because she made it last. Tom is told and can put his back with one tap.

Why: the change made last is the newest wish, whatever the signal did, and nobody loses a change without being told (brief 4.14).

### D60. "This and all later ones" and earlier one-off changes

Agreed 27 Oct 2026. Needed before step 1c. Settles which changes brief 5.4 drops.

A one-off change is dropped only where the new edit changes the same thing. If March's rent was changed on its own to £580, and rent is then changed to £560 for this and all later ones from January, March becomes £560. One-off changes to other things stay: a moved date stays unless the edit changes dates, a note stays unless it changes the note, and ticks always stay.

Why: brief 5.4 drops the changes the edit replaces, and a change is only replaced where the new edit sets the same thing.

### D61. Pay-later bills: which spends each bill covers

Agreed 27 Oct 2026. Needed before step 1e. Settles what D32 left open.

Each pay-later card has a statement day, which starts as the day before the bill day and can be changed to match the card. A bill covers spends from the day after the last statement day up to and including this one, so a bill on Sun 29 Nov covers spends from Thu 29 Oct to Sat 28 Nov. "Spent" and "left" for the budget use the same dates.

What's left on that budget is spent on the card, not from the bank account, so it shows on its own line under Left to spend ("On the pay-later card: £80.00 left until Sat 28 Nov"), not inside it. The bill pays for spending already done, so it doesn't count in Left to spend even when it falls before payday. It shows in the plan like rent.

Why: it matches how card statements work, and Left to spend stays about money leaving the bank account.

### D62. "Update from statement" stores the time

Agreed 27 Oct 2026. Needed before step 1d. Adds a time to D27.

Debts work like D33. Each "Update from statement" stores the time as well as the date. A payment ticked after it comes off the debt, even on the same day. Ticks made inside the update steps count as before it.

Why: the same rule as balance updates, so a payment ticked later the same day still comes off, and nothing comes off twice.

### D63. Paying more than what's left

Agreed 27 Oct 2026. Needed before step 1d.

The plan makes no automatic change. Sam's Credit card has £20.99 left before its payment on Wed 15 Mar 2028, but the planned payment is £25.00. The debt shows "Paid off" (D34), and the payment says "£4.01 more than what's left", with a one-tap fix: "Make it £20.99 and stop after it". A minimum worked out from a rule never goes above the balance.

Why: the plan never changes a payment the person set up without asking, and they see the exact amount and a quick fix.

### D64. Setting money aside for tax

Agreed 27 Oct 2026. Needed before step 1e.

Any money coming in can have an optional "Set aside": a percentage that moves to a chosen account on the same day, rounded to the nearest penny (D9). It follows the estimate, and changes when the real amount is typed in. This is how Kofi sets 25% aside for tax.

Why: brief Part 2 says Kofi sets money aside for tax automatically, and no rule said how.

### D65. A debt or goal that belongs to one person

Agreed 27 Oct 2026. Needed before Phase 3.

A debt or goal that belongs to one person is private to them unless they choose to share it, like an account. A payment to it from a shared account still shows in the shared plan with its name and amount, but the debt's balance and paid-off date stay private.

Why: it follows the rule for accounts (brief 4.14, D16), and the shared plan still shows all the money leaving its accounts.

### D66. Next main payday for irregular pay

Agreed 27 Oct 2026. Needed before step 1b. Adds to D14.

When the main pay is irregular, the next main payday is the next Monday, so Kofi sees "Left to spend until Mon 2 Nov".

Why: D14 makes irregular plan periods Monday to Sunday, and Left to spend (D28) and "Move to next payday" need a next payday.

### D67. A balance checked in an earlier budget period

Agreed 27 Oct 2026. Needed before step 1e. Adds to D2.

D2's rule applies to the budget period that contains today, with spends recorded at or before the balance update counted as inside the balance. A budget period that ended between the update and today takes nothing more: its spends show on their dates, and anything unspent stays in the account, or rolls over if roll-over is on (D30).

Why: read word for word, D2 would take last week's unspent money out today, although D30 says it stays in the account.

### D68. Cloudflare Workers instead of Pages

Agreed 27 Oct 2026. Needed before Phase 2. Replaces the choice of Cloudflare Pages in D18.

The website and app are hosted on Cloudflare Workers instead of Cloudflare Pages.

Why: Cloudflare now tells new projects to start on Workers, and Pages gets no new features. It's the same company and price, with a preview link for every pull request (ARCHITECTURE.md 1.6).

## From the owner's review of the plan

### D69. Payments that could move

Agreed 27 Oct 2026. Replaces D40.

"Payments that could move" lists unticked payments dated from today to the day before the short day (brief 5.5 says "before that date"). It includes only those that would fix the shortfall on their own if moved to the first main payday after it, without making any day short that wasn't short before. Biggest first, with "Show all" for the rest.

Test for step 1b: in Sam's plan with the Fri 30 Oct pay £100 lower (£503.06), he is £95.47 short on Sun 1 Nov, and the list is Pay-later card −£466.07, Family loan −£125.00, Driving lesson −£100.00. Spending money −£30.00 is not in it, because moving it still leaves him £65.47 short.

Why: brief 5.5 lists the payments before the short date, and moving a payment shouldn't cause a new shortfall somewhere else.

### D70. Test: Credit card paid off on Wed 15 Mar 2028

Agreed 27 Oct 2026.

Test for step 1d: looking 24 months ahead (D43), Sam's Credit card is paid off on Wed 15 Mar 2028, and that payment shows "£4.01 more than what's left" (D63).

Why: D63 needs a test with an exact date and amount.

### D71. A tick's paid date

Agreed 27 Oct 2026. Adds to D1 and D27.

A tick's paid date is the day it was ticked, if that's earlier than the payment's date. Otherwise it's the payment's date after any weekend, bank holiday or moved-date change.

Why: the paid date has to be the day the money really leaves or arrives, and a payment that was moved goes on its new date, not its original one.

### D72. The speed test uses the middle of 20 runs

Agreed 27 Oct 2026.

The speed test (step 1g) uses the middle time of 20 runs after a warm-up.

Why: one slow moment on GitHub's machines can't fail it.

### D73. One pull request per step

Agreed 27 Oct 2026. Replaces "one pull request per phase" in brief Part 9.

One pull request per step, not per phase. Each pull request is named after its step, for example "Step 1a: dates, repeats and bank holidays".

Why: each step runs in its own session.

### D74. Bank holidays beyond the official list

Agreed 27 Oct 2026. Adds to D57.

When the official bank holiday list doesn't reach a year the plan shows, the engine works out that year's usual bank holidays for each nation by the standard rules, including substitute days. It uses the official list as soon as that list covers the year. A test proves the rules give exactly the official list for every year the list covers.

Why: GOV.UK's list only runs a year or so ahead, and the plan and the Debts screen can look 24 months ahead (D43).

Note, 29 Oct 2026: the official list includes one-off bank holidays that no rule can predict. The test names them as known exceptions: VE Day (Fri 8 May 2020), the Platinum Jubilee (Thu 2 and Fri 3 Jun 2022), the Queen's funeral (Mon 19 Sep 2022) and the coronation (Mon 8 May 2023). Where a one-off moved a usual bank holiday, the usual day it replaced is part of the same exception: Mon 4 May 2020 for VE Day and Mon 30 May 2022 for the Jubilee. Every other day must match the official list exactly. PrePenny always uses the official list for the years it covers.

## Made during step 1a

D75 to D78 were decided on 29 Oct 2026 while building step 1a. The owner confirmed D75 and D78 on 29 Oct 2026.

### D75. Scotland's World Cup bank holiday is a known exception too

Decided 29 Oct 2026 in step 1a. Adds to D74's note. Confirmed by the owner on 29 Oct 2026.

The official list downloaded on 29 Oct 2026 has one more one-off day than D74's note names: Scotland's World Cup bank holiday on Mon 15 Jun 2026. The D74 test names it as a known exception too, for Scotland only. PrePenny uses the official list for 2026, so Scottish plans have it as a bank holiday.

Why: no rule can predict it, like the days in D74's note, so without it the test could never pass.

### D76. When the official list covers a year

Decided 29 Oct 2026 in step 1a. Adds to D74.

A year counts as covered for a nation when the official list has at least one of that nation's bank holidays in January and one in December of that year. Any other year uses the rules. The list downloaded on 29 Oct 2026 covers 2019 to 2028 for all three nations.

Why: every year starts with New Year's Day (or its substitute) in January and ends with Christmas in December, so a year with both is complete, and a year GOV.UK has only started to fill in is never used half-empty.

### D77. Exact tool versions

Decided 29 Oct 2026 in step 1a. Adds to D56.

Pinned exactly: Node 24.22.2, pnpm 12.16.1, TypeScript 6.0.3, Vitest 5.0.5, fast-check 4.10.2, Biome 2.6.3 and @types/node 24.19.2. TypeScript 7.0 is now the default download, but D56 keeps 6.0. Biome is 2.6.3, not 2.6.4, because 2.6.4 came out the day before and pnpm holds back releases that new; no exceptions were added to that rule. Node 26 became the newest long-term support version this month, but Node 24 is still a long-term support version (nodejs.org, 29 Oct 2026), so it stays.

Why: the same versions everywhere, changed only on purpose, and brand-new releases are where attacks on software packages usually land first.

### D78. Where a series' payments start and end

The second point is replaced by D145 for pay on the last working day.

Decided 29 Oct 2026 in step 1a. Confirmed by the owner on 29 Oct 2026.

- The first payment is the first date the schedule gives on or after the series' start date. Monthly on the 1st from Sun 25 Oct starts on Sun 1 Nov.
- A payment's original date is the date its schedule gives, before the weekend and bank holiday rule. For "last working day" it's the last working day itself.
- "After N payments" counts payments by number, and "ends on a date" includes a payment when its original date is on or before that date. So the weekend and bank holiday rule and moved dates never add or remove a payment, and a split by date divides the payments exactly (brief 5.4).
- The different last amount goes on the last payment of a series that ends. A series that never ends has no last payment.
- A moved date is used as it is: the weekend and bank holiday rule isn't applied to it again (brief 5.3 applies the rule first, then the changed date).
- A series can't list the same chosen date twice, because changes and ticks find a payment by its original date (brief 5.2).

Why: each follows from brief 5.3 and 5.4, and the engine needed one exact answer for each.

## Made during step 1b

D79 to D85 were decided on 29 Oct 2026 while building step 1b. The owner confirmed D79 and D81 to D84 on 29 Oct 2026.

### D79. Payment types

Decided 29 Oct 2026 in step 1b. Fixes the list that ARCHITECTURE.md 3.3 left open. Confirmed by the owner on 29 Oct 2026.

Every payment has one of eight types: **Pay, Benefits, Rent or mortgage, Bills, Debt, Spending money, Savings, Other.**

- Spending money counts towards Left to spend (D28). No other type changes any sum. Types are for filters (brief 4.8) and labels.
- Food and Travel (brief 4.5) are budgets with those names. Their rows count as spending money, as D28 already says, so they don't need types of their own.
- In Sam's plan, the monthly food bill on the pay-later card is Bills, not Spending money, because it pays for food already bought (D61). Driving lessons and the driving test are Other.

Why: eight is short enough to pick from with one thumb, every word is plain, and it covers all six people: Pay for Sam, Priya, Jess, Tom and Ali's job, Benefits for Dee's Universal Credit, Rent or mortgage, Bills for everything on the setup checklist, Debt for every debt payment, Savings for moves to and from savings, and Other for the rest, such as Ali's student loan or Kofi's fuel.

### D80. The same-day order when D12 isn't enough

Decided 29 Oct 2026 in step 1b. Adds to D12.

When two payments on the same day are in the same group (money in, transfers or money out), and their families were made at the same moment and have the same name, the one whose family id comes first goes first, then by series id, then by payment number. Names are compared letter by letter, the same on every phone: capital letters before small ones, and a space before a comma. "By name" uses the name shown on the row, so a one-off new name counts.

Why: setup can make several payments in the same instant, and D12 says the order must never change between runs. Comparing letter by letter with no language rules gives the same order on every device.

### D81. Main paydays

Decided 29 Oct 2026 in step 1b. Adds to D14 and D66. Confirmed by the owner on 29 Oct 2026.

- A main payday is a day a payment of the main pay lands, after the weekend and bank holiday rule and any move. A payday that was moved counts on its new date.
- A removed (skipped) main pay payment isn't a payday. The pay period it would have started joins the one before.
- The next main payday is the first one after today. On payday itself, it's the following payday.
- When any series in the main pay's family is irregular, every Monday is a main payday (D14, D66).
- With no main pay, there's no next main payday.

Why: a payday is the day money arrives, so a removed one brings nothing, and "Move to next payday" shouldn't move a payment to a day with no pay. On payday, Left to spend (D28) runs until the next payday, so "next" has to mean after today.

### D82. Shortfalls

Decided 29 Oct 2026 in step 1b. Adds to brief 5.5 and D69. Confirmed by the owner on 29 Oct 2026.

- A shortfall is a run of days in a row, from today on, that end below the floor. "£X short on [date]" uses the first of those days and how much short it ends that day: "£95.47 short on Sun 1 Nov".
- The engine also gives the most it's short by during the run, and the last short day, for when it gets worse before payday.
- "The first main payday after it" in D69 is the first main payday after the first short day: Fri 6 Nov in D69's test.
- A payment that could move must fix the whole run: after the move, no day of the run is short. Moving money out later only raises that account's balance until the new date, so in practice only a transfer can make a new short day, by arriving later in the other account. Such a transfer isn't listed.

Why: one warning for a stretch of short days rather than one a day, with the date the trouble starts (brief Part 3, principle 7). A move that fixed only the first day would leave the person short the next day. D69's test needs the payday after Sun 1 Nov: moving Family loan to Fri 30 Oct, the payday after its own date, would fix nothing.

### D83. Ticks

Decided 29 Oct 2026 in step 1b. Adds to D1, D33, D48 and D71. The owner confirmed the second point on 29 Oct 2026.

- The paid date is worked out once, when the tick is made, as D71 says, and stored with the tick. Moving the payment afterwards doesn't change it.
- A tick on a removed payment still takes the money off. This can happen in a shared plan when one person ticks a payment just as the other removes it (D48).
- A tick made inside one account's Update balance steps counts as inside that account's balance only. For the other account of a transfer, the tick's time is compared with that account's own latest update.
- One tick per payment. A tick for a payment that no longer exists is ignored.

Why: the paid date is the day the money really left (D71), and that doesn't change later. A tick says the money went, and the plan stays true to the bank (brief Part 3, principle 1). Each balance holds only what the person typed for that account.

### D84. Plan periods

Decided 29 Oct 2026 in step 1b. Adds to D14 and brief 4.8. The owner confirmed the first point on 29 Oct 2026.

- Periods are worked out for each account. "Came in" is everything that arrives in that account in the period, including money moved in from the person's other accounts. Sam's first period shows £500.00 came in: the move from savings on Wed 28 Oct.
- Periods show rows from today on. Unticked rows dated before today are in "Not ticked yet" (D11).
- The first period starts on the last main payday on or before today, or today if there's none. Sam's first runs from Sun 25 Oct to Thu 29 Oct, because his pay starts on Fri 30 Oct. The last period is cut at the end of the plan, and "Left at the end" is the balance on the plan's last day.
- Pay periods need a main pay. With none, the plan is grouped by calendar month.

Why: it matches "Coming in £500.00" in the Home sketch (ARCHITECTURE.md 4.6), and each period ends on that account's own balance. Someone with no main pay still sees their plan in groups.

### D85. Smaller rules in the balance rule

Decided 29 Oct 2026 in step 1b.

- When the lowest point is reached on more than one day, the first of them is shown.
- The payment that caused a day's figure is the day's last row, or when the day has none, the last row before it.
- Each row's Tight or Short comes from its own "Left after this", the number beside it. The lowest point, the first day under the warning level and shortfalls use end-of-day balances (brief 5.5).
- The engine refuses a balance date after today, an account with no balance update, and two balance updates for one account at the same moment.
- A main pay with no series left in the plan counts as no main pay.

Why: the first day is the earliest warning, each row's word matches the number next to it, and refusing an impossible balance is safer than guessing which one is right. Phase 3 checks the first refusal for a couple in different time zones, where one person's today can be the other's tomorrow.

## From the owner's review of step 1b

### D86. "Next payment", never "First payment"

Agreed 29 Oct 2026, from the owner's review of step 1b. Phase 2 builds it.

Setup and "Add a payment" ask for the date of the next payment, labelled "Next payment", never "First payment". The series starts on that date (D78).

Why: asked for a first payment, someone might type the date their rent started years ago. Every payment since then would show as "Not ticked yet" and come off the balance.

## Made during step 1c

D87 to D95 were decided on 29 Oct 2026 while building step 1c. The owner confirmed D90 and the last point of D92 on 29 Oct 2026, added a second choice to D90 (D97), and answered the question in D91 (D96).

### D87. How an edit works

Decided 29 Oct 2026 in step 1c. Adds to ARCHITECTURE.md 2.3.

- One engine function makes every edit. It takes the stored records, one command and today, and gives back the records to save and the undo: how each of those records looked before, or a note that it didn't exist. The engine saves nothing itself.
- One-off changes and ticks are found by their series and the payment's original date, as everywhere in the engine (brief 5.2). So the only new ids a command needs are for a new series (a split) and a new balance update, and they come in with the command, because the engine can't make random ids.
- Undo saves the "before" copies as a new edit, so undoing an undo puts the edit back. Undo is refused when anything the edit saved has been changed since, when a change or tick it didn't make would no longer belong to the same payment afterwards, or when it would put a change or tick back on a payment that has been removed or moved since.
- "Update balance", with everything ticked in its steps, is one edit, so one undo.
- A command the engine can't carry out is refused with a short code and a message that names only ids and dates, never amounts, names or notes. As a safety check, any edit that would leave records the plan can't use is refused too.

Why: ARCHITECTURE.md 2.3 asks for exactly this, and the same function can run again on newer records when two phones clash (ARCHITECTURE.md 3.5). People see Update balance as one thing, so one undo should take all of it back, and an undo must never quietly lose a change someone made afterwards.

### D88. "This and all later ones" reaches the whole family

Decided 29 Oct 2026 in step 1c. Adds to brief 5.4 and D49.

After a split, the later payments live in a new series of the same family. A later edit "for this and all later ones", or "Remove this and later", reaches every later series of the family too. Each later series keeps whatever the new edit doesn't change.

Example: rent becomes £560 from January (a split). Then December's rent is changed to £555 for this and all later ones: December, January and every month after are £555. If instead only December's note is changed for this and all later ones, January stays £560 and gets the note. Removing rent from December and later removes the January series as well.

Why: the person sees one list of rent payments, so "all later ones" means all of them, whichever series holds them.

### D89. How a split works

Decided 29 Oct 2026 in step 1c. Adds to brief 5.4, D49 and D78. Changes the last two steps of the D80 order.

- The old series ends just before the payment: by count if it ends after a number of payments, otherwise by date, on the day before the payment's original date. Rent changed from Fri 1 Jan 2027 ends the old series on Thu 31 Dec 2026.
- The new series starts on the payment's original date, in the same family (D49), with the payment number it starts at and the id of the series it was split from. The amount pattern and "after N payments" carry on.
- A different last amount goes with the new series, and the old series loses it. Only the family's last payment counts as last.
- One-off changes and ticks from this payment on move to the new series by payment number. Ticks keep their paid date (D83). A one-off change is dropped only when the parts the edit replaces (D60) were everything it changed.
- On the same day, a family's payments go in payment-number order before series id, so a split never changes the order. D80 said series id, then payment number.

Why: these follow brief 5.4, and a test on thousands of made-up plans proves that splitting a series without changing anything gives exactly the same payments and balances (brief 5.8).

### D90. A new amount for this and all later ones

Decided 29 Oct 2026 in step 1c. Adds to brief 5.4. Confirmed by the owner on 29 Oct 2026, who added a second choice for a pay pattern: D97.

- A new amount for this and all later ones makes every one of them that amount. If the pay follows a pattern, the pattern is replaced by the one amount.
- A different last amount stays, unless the payment being changed is the last one. Laptop loan: £150, £150, then £34. Changing the second to £100 for this and all later ones gives £150, £100, £34.

Why: "this and all later ones" at £600 means each later one is £600. Changing a pay pattern itself, step by step, would be its own option on the edit sheet in Phase 2.

### D91. A new date for this and all later ones

Decided 29 Oct 2026 in step 1c. Adds to brief 5.4. The question in it was answered by the owner on 29 Oct 2026: D96.

- The engine takes the new date of the payment, and the schedule from that date on, from the app. It refuses a date the schedule doesn't give, such as the 3rd for a schedule on the 1st of each month.
- The new date must come after the date of the payment before it. Otherwise payments would double up: rent moved from Fri 1 Jan 2027 back to Tue 1 Dec 2026 would be paid twice on 1 Dec.
- Moving the dates never adds or loses a payment. A series that ended on a date now ends after the same number of payments.
- One-off moved dates on this and later payments are dropped (D60). Notes, amounts and ticks stay.
- Which schedule the later payments follow was answered by the owner: D96.

Why: brief Part 3, principle 4 lets people change the date for this and all later ones, but nothing says how the later dates follow. That decides the day money leaves, so it's a money rule for the owner.

### D92. Removing payments

Decided 29 Oct 2026 in step 1c. Adds to brief 5.4 and D4. The owner confirmed the last point on 29 Oct 2026.

- "Remove this one" skips the payment (D4). Removing one that's already removed is refused.
- "Remove this and later" ends the series just before the payment, the same way a split ends the old series (D89), and removes later series of the family (D88). On the first payment of a series, the series itself is removed. The one-off changes of the removed payments go too.
- The payments left keep their amounts: a different last amount is removed, not moved onto an earlier payment. Laptop loan: removing the £34 payment leaves £150 and £150, not £150 and £34.
- "Remove this and later" is refused when a payment it would remove is ticked as paid. The app asks the person to untick it first.

Why: removing payments should never change the ones left. A tick says the money really went (D83); removing a ticked payment would put that money back into the plan without the person noticing.

### D93. "Just this one" keeps only what differs

Decided 29 Oct 2026 in step 1c. Adds to brief 5.4.

Each part of a one-off change is saved only where it differs from what the series alone would give. A part set back to the series' own value is cleared, and a change with nothing left in it is removed. So moving a payment back to its own date undoes the move.

Why: a payment moved back then follows its series again, even if the weekend rule or the bank holiday list changes later, and the stored records stay small.

### D94. Private transfers

Decided 29 Oct 2026 in step 1c. Adds to D16 and ARCHITECTURE.md 3.6.

- The shared half ("From Jess") records which private half it mirrors. Every command changes both halves in the same edit: amounts, dates, estimate labels, removals, splits and ticks.
- Names and notes belong to the private half only. A name or note aimed at the shared half is refused.
- Splitting a private transfer makes two new series, so the command carries a second new id.
- An edit is refused when the two halves no longer match: their series' amounts, pattern, dates, end, last amount, weekend rule or estimate label, or the payment being changed (its date, amount, estimate label, removal or tick).

Why: D16 lets the shared plan see only the date and the amount, and both accounts must always show the same money moving.

### D95. Ticking and unticking

Decided 29 Oct 2026 in step 1c. Adds to D71 and D83.

- A tick's paid date is worked out when it's made: the day it's ticked, if that's before the payment's date, otherwise the payment's date after any weekend, bank holiday or moved-date change (D71). It doesn't change if the payment moves later (D83).
- Ticking a payment that's already ticked, or unticking one that isn't, is refused.

Why: one tick per payment (D83), and a second tick by another person in a shared plan should be reported, not saved on top.

## From the owner's review of step 1c

D96 and D97 were agreed by the owner on 29 Oct 2026, answering the questions left in `PLAN.md` at the end of step 1c. The owner also confirmed D90 and the last point of D92.

### D96. A new date for this and all later ones: where the later ones go

Agreed 29 Oct 2026, from the owner's review of step 1c. Answers the question left in D91.

When someone changes a payment's date for this and all later ones, the later payments follow the new date like this:

- Weekly or every few weeks: the new date's weekday, every so many weeks from it. An irregular weekly estimate works the same way.
- Monthly (on a date, the last day, the last working day or "the first Monday"): the new date's day of the month, for example "the 3rd". Months left out, like Dee's February and March, stay left out.
- On chosen dates, like Ali's student loan: only that one date changes, and the later chosen dates stay, with any one-off moves they have. The new date must come before the next payment, so no payment changes places.
- A payment that happens once moves to the new date.

The new date is the date from the schedule, before the weekend and bank holiday rule. The edit sheet sends only the new date, and the engine works out where the later ones go, so every phone uses the same rule, and an edit made again after a sync clash uses the records as they are then. Everything else in D91 stays: no payment is added or lost, and a date before the payment before it is refused. A command can still give a schedule of its own, for a later "how often" change, and then it's refused when the new date doesn't fit it.

Why: this is the proposal the owner accepted. The later payments keep the same kind of schedule, starting from the day the person chose.

### D97. "Only this week of the pattern"

Agreed 29 Oct 2026, from the owner's review of step 1c. Adds a second choice to D90. The points after the first were decided in step 1d, following the owner's description.

When a series has an amount pattern and someone changes the amount for this and all later ones, the edit sheet asks "Every payday from now" (D90) or "Only this week of the pattern".

- "Only this week of the pattern" splits the series at this payment and changes only this payment's step of the pattern. Every payment on that step from here on gets the new amount, and the others keep theirs. On a series' first payment, it changes the whole series instead (brief 5.4).
- It reaches later series of the family too (D88). A later series that has one amount instead of a pattern, because of an earlier "Every payday from now", gets a pattern of the same length: its own amount on every step, and the new amount on this one.
- One-off amount changes are dropped only on payments of that step, from this one on (D60). One-off amounts on the other steps stay.
- A different last amount stays, unless the payment being changed is the last one (as in D90).
- It's refused when the series has no pattern, when it comes with "Every payday from now" in the same edit, or when a later series of the family has a pattern of a different length.

Test: Sam changes his Fri 6 Nov pay to £640.00 this way. Fri 6 Nov, 4 Dec, 1 Jan, 29 Jan and 26 Feb become £640.00, every other payday keeps its amount, and total pay in the view becomes £9,856.66.

Why: Sam's pay follows a 4-week rota, so changing one week of the rota should change that week each time it comes round, and leave the other weeks alone.

## Made during step 1d

D98 to D103 were decided on 29 Oct 2026 while building step 1d. The minimum rule in D101 is the owner's, recorded as the owner asked. Two questions for the owner are in `PLAN.md`: whether Left now on a credit card should include the interest added since the last update (D101), and whether a payment due on the statement date itself should come off the debt (D100). The owner answered both on 1 Nov 2026: D104 and D105.

### D98. Debts and the payments linked to them

Decided 29 Oct 2026 in step 1d. Adds to brief 4.6 and 5.2, D13 and D65.

- A debt has the fields in ARCHITECTURE.md 3.3: name, kind, currency, rate, the balance with its date and the time it was typed in or updated from a statement (D62), the starting balance, and for credit cards the interest rate, statement day and minimum (D13). It also says who it belongs to (D65) and whether it's closed.
- Only a credit card has an interest rate, a statement day or a minimum. A loan's or a pay-later plan's instalments already include any interest, so adding interest would count it twice. A credit card needs a statement day when it has an interest rate or a minimum rule (D13).
- A debt in pounds has no rate. A debt in any other currency needs one, above zero. Every currency is counted in hundredths, like pence and cents. Currencies without hundredths, like the yen, are for later (brief Part 10), so until then the app offers only currencies that have them.
- Only money going out can be linked to a debt, because paying a debt is money going out. Neither half of a private transfer can be linked: the shared half has no debt (D16), and the private half's money goes to the joint account, not to the debt.
- A series split from a linked series stays linked (D49), so a split never changes a debt.
- As with an account's balance (D85), a debt's balance date can't be after today.

Why: the debt sums only take payments off, so money coming in linked to a debt would have no clear meaning, and refusing it is safer than guessing. Interest belongs to credit cards in the brief (4.6, 5.6).

### D99. Left now, progress and Owed now

Decided 29 Oct 2026 in step 1d. Adds to brief 5.6, D27, D34 and D62.

- Left now is the balance minus every linked payment ticked after the balance was typed in, by time (D62), whatever the payment's own date. A tick made inside that debt's Update from statement steps counts as before it (D103). Each payment is converted at the debt's rate and rounded once (D9). A tick on a removed payment still comes off (D83).
- For another currency, Left now is also given in pounds, converted once at the debt's rate (D9): €1,400.57 is about £1,206.14 at €1.1612 per £1.
- Progress: paid so far is the starting balance minus Left now, never below zero. The percentage is rounded to the nearest whole percent, halves up, but stays at 99% until the debt is paid off, so a full bar always means Paid off. The Family loan's €996.36 of €2,396.93 is 41.57%, so 42%.
- Owed now adds up every debt that isn't closed, each converted to pounds at its own rate and rounded once. A closed debt is still worked out, but left out of the total.

Why: the brief and the owner define Left now this way. A bar at 100% beside "£2.00 left" would contradict itself, and a closed debt is one the person has finished with.

### D100. Paid off on

Decided 29 Oct 2026 in step 1d. Adds to brief 5.6, D27, D34, D42, D43 and D63.

- The engine starts from the balance on its date and takes off, in date order: every linked payment ticked after the balance was typed in, on its paid date (D27), and every planned payment dated after the balance date (brief 5.6). A payment ticked after the update but paid before the balance date comes off first, as D39 does for a bank balance. A removed payment takes nothing off unless it's ticked (D4, D83). On the same day, payments go in the plan's same-day order (D12).
- Paid off on is the date of the payment that leaves 1p, or 1 cent, or less (D34, D42), and never before the balance date: a payment that comes off at the start pays it off on the balance date. A debt with 1p or less on its balance date is paid off on that date.
- Looking 24 months ahead (D43) means up to and including the same date 24 months after today, or that month's last day when it's shorter. On Sun 25 Oct 2026 the Debts screen looks to Wed 25 Oct 2028.
- More than what's left (D63) is a payment's amount minus what was left before it, in the debt's own currency, counting what was left as nothing once it's 1p or 1 cent or less, as the screen shows it. A penny or cent over is only rounding (D34), so it isn't shown: the Family loan's last payment is €0.01 over and says Paid off. A payment still planned after a debt is paid off is all more than what's left, and says so. Nothing changes on its own (D63).
- Paid off on, or what's still left at the end, is labelled as an estimate when it depends on one: credit card interest added before it's paid off, or a payment marked as an estimate. Sam's Credit card is an estimate because its £25.00 payments are; the Family loan isn't.

Why: these follow brief 5.6 and the decisions it names, and the engine needed one exact answer for each. The 24 months match the furthest the plan can show (brief 4.8).

### D101. Credit card interest and the minimum

Decided 29 Oct 2026 in step 1d. Adds to brief 5.6 and D13. The minimum rule is the owner's, recorded here as the owner asked.

- On each statement day after the balance date, the month's interest is the balance × the yearly rate ÷ 12, rounded once (D9), and it's added to the balance. Nothing is added on a balance of zero or less, or once the debt is paid off.
- The statement day falls on that day of each month, or on the month's last day when the month is shorter, like a monthly payment (brief 5.3). A statement day on the balance date itself adds nothing: the balance typed in already includes it.
- On a statement day, that day's payments come off before the interest is worked out.
- The minimum from a rule like "interest plus 1% of the balance, at least £5" is 1% of the balance before that month's interest is added, rounded once (D9), plus the interest, at least the floor amount, and never more than the balance once the interest is added. £420.99 at 24.9% a year: the interest is £8.74, and the minimum is £4.21 + £8.74 = £12.95.
- A minimum typed from the statement stays as typed. Later months' minimums aren't known, so the statement days ahead don't show one.
- Left now doesn't include estimated interest. It's the balance minus ticked payments, as the brief and the owner set it out (D99). The interest is only in the statement days ahead and in Paid off on. Whether Left now should include it is a question for the owner in `PLAN.md`.
- The interest, and every minimum worked out from a rule, are labelled as estimates (brief 5.6).

Test: owner test 5, below in D102.

Why: the owner set out the rule and the brief sets out the interest. The statement day's own payments come off first because a card's statement includes that day's payments.

### D102. Comparing the minimum, a fixed amount and the full balance

Decided 29 Oct 2026 in step 1d. Adds to brief 4.6.

- The comparison starts from what's left on a day, usually Left now and today, and needs the day of the month payments go out, which the app takes from the card's linked payment. It leaves out the payments already in the plan.
- Each month the statement adds the interest and sets the minimum (D101), and the payment goes out on the next payment day. Paying the minimum pays that statement's minimum. Before the comparison's first statement, the minimum is the rule on what's left, with no interest. A fixed amount pays that amount, or what's left if that's less. The full balance pays everything left.
- It counts the payments until 1p or less is left, and adds up the interest on the way. Payments are monthly, so the number of payments is the number of months to clear it (brief 4.6).
- A way of paying that doesn't clear the card within 100 years shows as never clearing it, for example £5.00 a month against £8.74 interest.
- With a typed minimum, there's no minimum to compare, because later minimums aren't known.
- Numbers only: it never says which way is best (brief Part 3, principle 10).

Test (owner test 5): £420.99 on Sun 25 Oct 2026, 24.9% a year, statement day the 10th, payments on the 15th. Paying the minimum takes 150 payments and £647.14 in interest, £25 a month takes 21 payments and £102.32, and the full balance takes 1 payment and £8.74.

Why: it gives exactly the owner's figures worked out by hand. Taking each payment day as it comes means a comparison started between a statement and its payment still counts that payment.

### D103. Update from statement

Decided 29 Oct 2026 in step 1d. Adds to brief 4.6, D62 and D87.

- Update from statement is one edit: the debt's new balance, its date and the time of the update, with any linked payments ticked in its steps, so one undo takes all of it back (D87).
- A payment ticked in its steps carries the debt's id, so it counts as before the update for that debt, even though it was ticked a few seconds after (D62). For the bank account it's an ordinary tick, compared with that account's own latest update (D83).
- The balance date can't be after today, and the time must be later than the debt's last update, so it's always clear which ticks came before it. Only payments linked to that debt can be ticked in its steps.

Why: people see Update from statement as one thing, as with Update balance (D87), and D62 says ticks made in its steps count as before it.

## From the owner's review of step 1d

D104 to D106 were agreed by the owner on 1 Nov 2026, answering the questions left in `PLAN.md` at the end of step 1d and adding one rule. The owner also confirmed D98 to D103.

### D104. A credit card's Left now includes the interest since the last update

Agreed 1 Nov 2026, from the owner's review of step 1d. Answers the question in D101 and replaces its point that Left now doesn't include estimated interest. Adds to D99.

- A credit card's Left now includes the interest added on each statement day since the last Update from statement, up to and including today, labelled as an estimate.
- It's worked out from the balance on its date: payments ticked after the update come off on their paid dates, and each statement day after the balance date adds the month's interest (D101) on what's left then. On a statement day, that day's payments come off first. Payments not ticked yet don't come off, because the card hasn't seen them. No interest is added once it's paid off.
- Progress and Owed now use this Left now. Owed now is labelled as an estimate when any Left now in it is.
- A card with no rate or a 0% rate never gets interest. A credit card with no rate says "Interest not included". Other kinds of debt don't, because their payments already include any interest (D98).

Test: on Fri 20 Nov, owner test 5's card, with the £25.00 on Sun 15 Nov ticked, shows £404.73: £420.99, plus £8.74 on Tue 10 Nov, minus £25.00.

Why: the card adds interest whether or not the person updates from a statement, so Left now shows what the card itself will say, marked as an estimate until the next statement.

### D105. A payment due on the statement date itself

Agreed 1 Nov 2026, from the owner's review of step 1d. Answers the question in D100. Changes "after its date" in brief 5.6, and "dated after the balance date" in D100, to "on or after".

A payment due on a debt's balance date comes off the debt, unless it was ticked at or before that statement update, or inside its steps (D62, D103). This is the same rule as D33 for the bank balance.

Test: £100.00 typed in at 9am on Sun 1 Nov, with £25.00 due that day: £75.00 is left after it. Ticked at 10am, it comes off once. Ticked at 8am, before the update, it's already inside the balance and never comes off.

Why: a statement typed in on the morning a payment is due doesn't include that payment, so otherwise the debt would never take it off, although the bank balance does.

### D106. 0% until a date

Agreed 1 Nov 2026, from the owner's review of step 1d. Adds to D101 and D102.

A credit card can have "0% until [date]" before its normal rate. A statement day on or before that date adds no interest, and later ones use the normal rate. It applies everywhere interest does: the statement days ahead, Paid off on, Left now (D104) and the comparison (D102). Only a credit card has it (D98). The minimum rule still applies while the card is at 0%: 1% of the balance, at least the floor amount.

Test (the owner's): £420.99 on Sun 25 Oct 2026, 0% until Mon 30 Nov 2026, then 24.9% a year, statement day the 10th, £25.00 paid on the 15th. Tue 10 Nov adds nothing, leaving £395.99 after the 15 Nov payment. Thu 10 Dec adds £8.22, so £404.21, then £379.21 after 15 Dec.

Why: many cards start with a 0% offer, and working out interest at the normal rate during it would show more owed than the card does.

## Made during step 1e

D107 to D115 were decided on 1 Nov 2026 while building step 1e. The owner answered its three questions the same day: D116 to D119.

### D107. Budgets

Decided 1 Nov 2026 in step 1e. Adds to brief 4.5, ARCHITECTURE.md 3.3 and D79.

- A budget has the fields in ARCHITECTURE.md 3.3: the account it leaves, its name, the amount, every week or every month, how it leaves (all at the start, spread across the days, or a pay-later bill), roll-over and the day it was switched on, the day it starts, an end day if it has one, and for a pay-later budget its bill day and, if set, the card's own statement day. It also keeps when it was made, for the same-day order (D12).
- A budget has no payment type of its own. Its rows count as Spending money, as D79 says for Food and Travel, and a pay-later budget's bills count as Bills, like Sam's food bill (D61, D79).
- A budget's first period is the one with its start day in it, at the full amount, and its last period is the one with its end day in it.
- A pay-later bill comes once a month (brief 4.5), so a pay-later budget is always monthly.
- On the same day, a budget's own spends come first, then the rest of the budget.

Why: these follow brief 4.5 and ARCHITECTURE.md 3.3. A budget that starts part-way through a week leaves its whole amount, because "all at the start" is the safest choice (brief 4.5).

### D108. Budget periods, in more detail

Decided 1 Nov 2026 in step 1e. Adds to D29.

- A weekly budget starts on the weekday of the main pay's schedule when that's weekly or every few weeks, so Sam's run Friday to Thursday. The schedule is the one the main pay follows today.
- A monthly budget runs from one main payday to the day before the next when the main pay comes every month, using the real paydays after the weekend and bank holiday rule: Priya's runs from Thu 31 Dec 2026 to Thu 28 Jan 2027.
- Before the first main payday, and after the last one, monthly budget periods carry on in whole months from the nearest payday. Priya, setting up on Sun 25 Oct with her next payday on Fri 30 Oct, has a month from Wed 30 Sep to Thu 29 Oct.
- Pay every 2 months or more, pay on chosen dates and pay once use calendar months and Monday weeks. Irregular pay uses Monday weeks too (D14).
- A removed main payday isn't a payday (D81), so the budget month around it runs on to the next payday, as plan periods do.

Why: D29 says how budget periods line up with pay, and these are the cases it didn't cover, worked out the same way as plan periods (D84).

### D109. Budgets and the bank balance, in more detail

The third point is replaced by D119.

Decided 1 Nov 2026 in step 1e. Adds to D2, D33 and D67.

- D2's rule applies to every period from the one with today in it on. Spends recorded after the account's latest balance update are rows on their days. What's left, the budget minus every spend dated in the period, leaves today for this period, and on the first day for each later one. So a later period with no spends leaves in full at the start (D2).
- A spend recorded after the update but dated before the balance date comes off at the start, as D39 does for a tick.
- Spends can be dated after today, because owner test 3 has spends in a statement period that hasn't started yet. Whether "I spent" should take a date after today is a question for the owner in `PLAN.md`.
- Budget rows and spends are never ticked, so they're never in Not ticked yet. They aren't in Payments that could move either: moving them would mean changing the budget.
- A row of £0.00 isn't shown.

Why: the plan and the bank agree (D2), the same rule works for this period and later ones, and a later period with a spend already in it never takes more than the budget or the spends, whichever is more.

### D110. Roll-over, in more detail

Decided 1 Nov 2026 in step 1e. Adds to D30.

- Only a period that has ended rolls over. What's left of it, its budget and anything that rolled into it, minus its spends, is added to the next period. Periods still to come get nothing yet (ARCHITECTURE.md 2.5).
- It rolls over from the budget's first period on, or, when the day roll-over was switched on is set, only from periods that ended on or after that day.
- Spending more than the budget takes nothing off the next period.
- In a pay-later budget, roll-over raises the next bill's estimate.

Test (owner test 4): £18.00 spent from Fri 16 to Thu 22 Oct makes this week "£25 + £7 from last week", £32.00, and £28.00 leaves on Sun 25 Oct after £4.00 spent before the update. The weeks after are £25.00.

Why: D30 adds the unspent amount at the end of a period, which is only known once the period has ended, and it never says an overspend comes off.

### D111. Pay-later bills, in more detail

Decided 1 Nov 2026 in step 1e. Adds to D32 and D61. The first point is the owner's, given with step 1e.

- Without the card's own statement day, a bill covers spends from the day of the bill before it to the day before this one: the bill on Sun 28 Feb 2027 covers Fri 29 Jan to Sat 27 Feb. With a statement day, the bill covers spends up to that statement day, in the bill's month when the statement day comes before the bill day and in the month before otherwise, but never up to or past the bill date itself.
- The bill is on the bill day, or the month's last day when the month is shorter, and keeps its date on weekends and bank holidays.
- The bill is a payment like any other. It can be ticked, moved, removed just this one, and given its real amount, found by the budget's id and the bill's date. The real amount always stands, even when it's the same as the budget. Changing or removing this and all later bills is refused: that's a change to the budget.
- Until the real bill is typed in, it's the budget for the period, including anything that rolled over, or what was spent if that's more, labelled as an estimate.
- The line under Left to spend ("On the pay-later card: £80.00 left until Sat 28 Nov") is for the period with today in it, or the first period when the budget starts later.

Why: the bill is what leaves the bank account, so it needs a tick and a real amount like rent (D61). A card's statement can't be made on or after the day it's paid.

### D112. Left to spend, in more detail

The sum for X in the third point is replaced by D118, and D117 adds the line for when even spending nothing goes under the warning level. "Or to the plan's last day if that comes first" in the second point is replaced by D143.

Decided 1 Nov 2026 in step 1e. Adds to D3 and D28.

- Left to spend is worked out for each account. It counts the rows dated from today to the day before the next main payday that are budget rows, or payments of the type Spending money not ticked yet. Spends already recorded, pay-later bills and anything already ticked aren't in it.
- M is the lowest end-of-day balance from today to the day before the next main payday, or to the plan's last day if that comes first.
- The "Spend no more than" line appears when M is under the warning level (D10), with X = max(0, L + M − W) as D3 says.
- With no main pay there's no next payday (D81), so there's no Left to spend.

Test (owner test 1): Left to spend until Fri 30 Oct is £45.00, £30.00 spending money and £15.00 travel, with "Spend no more than £16.54 to keep at least £20 until Fri 30 Oct".

Why: these follow D3 and D28. Two points about the line are questions for the owner in `PLAN.md`.

### D113. Set aside, in more detail

The point that money set aside is ticked with its payment is replaced by D116.

Decided 1 Nov 2026 in step 1e. Adds to D64.

- Only money coming in can have money set aside, to another account in the plan, at a percentage above 0 and up to 100. The shared half of a private transfer can't, because it carries only the date and amount (D16).
- The money set aside moves between the two accounts on the same day, after the money comes in (D12), with a row in each account. Its type is Savings.
- It goes with its payment: the same date, tick, removal and estimate label. Ticking the payment ticks the money set aside too. Whether it should be ticked on its own is a question for the owner in `PLAN.md`.

Test (owner test 7): Kofi's £400.00 estimate on Mon 2 Nov with 25% set aside moves £100.00 to his Tax account the same day. Typed in as £437.50, it moves £109.38.

Why: D64 says the money moves on the same day and follows the estimate, so it's part of the payment.

### D114. Savings goals

Decided 1 Nov 2026 in step 1e. Adds to brief 4.7 and ARCHITECTURE.md 3.3.

- A goal has a name, a target, a target date if there is one, the account the money is kept in, the amount already saved when it was made, and who it belongs to (D65).
- A payment linked to a goal must move money into or out of the goal's account. Money into it adds to the goal, and money out of it takes off.
- Saved so far is the starting amount plus every linked payment ticked as paid. Progress is to the nearest whole percent, and stays at 99% until the goal is reached, as D99 does for debts.
- The date it's reached: from the starting amount, each linked payment is added in date order. A ticked payment counts on its paid date, one still to come on its date, and one dated before today that isn't ticked yet counts on today. The goal is reached on the day of the payment that first takes it to the target. That date is labelled as an estimate when it depends on a payment marked as an estimate.
- The goals screen looks 24 months ahead, like the Debts screen (D43).
- What each person has put into a shared goal (brief 4.14) comes in Phase 3 with shared plans, when the engine knows whose account each payment came from.

Test (owner test 8): a £1,200.00 Holiday goal by Fri 30 Jul 2027, from £0, with £50.00 moved every Friday from Fri 30 Oct, is reached on Fri 9 Apr 2027 with the 24th move.

Why: brief 4.7 asks for progress and the date at the current plan. Counting only ticked payments as saved keeps it true to the bank, as Left now does for debts (D99).

### D115. "I spent" as an edit

Decided 1 Nov 2026 in step 1e. Adds to D87.

- "I spent", changing a spend and removing a spend are each one edit, so one undo (D87).
- A spend's amount must be above zero.
- Changing a spend keeps the time it was recorded, so it stays inside the same balance update, or outside it (D33).

Why: brief Part 3, principle 4 says every change can be undone, and D87 says one engine function makes every edit.

## From the owner's review of step 1e

D116 to D119 were agreed by the owner on 1 Nov 2026, answering the questions left in `PLAN.md` at the end of step 1e. They were built in step 1f.

### D116. Money set aside gets its own tick

Agreed 1 Nov 2026, from the owner's review of step 1e. Replaces the point of D113 that money set aside is ticked with its payment.

- Money set aside has a tick of its own, separate from the tick of the pay it comes from. Ticking Kofi's £400.00 on Mon 2 Nov leaves the £100.00 for his Tax account unticked, so it still moves on its date, and shows in Not ticked yet once that date has passed, until he ticks it.
- The tick is stored as its own record, for the same series and original date, marked as the money set aside's. A set-aside tick for pay with no money set aside is ignored, like any tick with no payment (D83).
- Ticking, unticking, ticks inside Update balance, splits, removals and undo treat a set-aside tick exactly like a payment's tick. "Remove this and later" is refused while either is ticked (D92). A set-aside tick can't be made inside Update from statement, because money set aside never pays a debt.
- A removed payment whose money set aside is ticked still moves that money, because the tick says it really moved (D83).
- Debts and savings goals use only payments' own ticks.

Why: the money set aside only leaves the account when the person moves it. Ticked with its pay, the plan would count it in both accounts until then.

### D117. "You'll go under £20 on Mon 26 Oct, even if you spend nothing."

Agreed 1 Nov 2026, from the owner's review of step 1e. Adds to D3 and D112.

When even spending none of Left to spend takes the balance under the warning level before the next main payday, the line under Left to spend says "You'll go under £20 on Mon 26 Oct, even if you spend nothing." instead of "Spend no more than £0.00". The date is the first day from today when that day's end balance, plus the spending money due by that day, is under the warning level (D10).

Test: Sam's plan with £217.54 on Sun 25 Oct instead of £267.54: he's at −£7.46 on Mon 26 Oct even spending none of his £30.00, so the line gives Mon 26 Oct.

Why: "Spend no more than £0.00 to keep at least £20" wouldn't be true, because even £0.00 doesn't keep £20.

### D118. "Spend no more than" counts only the spending money due by each day

Agreed 1 Nov 2026, from the owner's review of step 1e. Replaces the sum for X in D3 and D112.

X is the smallest value, over each day from today to the day before the next main payday, of (that day's end balance + the Left to spend due by that day − the warning level), and never below 0. The line still appears only when spending all of Left to spend would take the balance under the warning level.

Tests: owner test 2 (Travel spread across the days) gives £17.55: Mon 26 Oct ends at £1.15 with £36.40 of spending money due by then, so £1.15 + £36.40 − £20.00. Owner test 1 still gives £16.54 and test 32 still £22.54.

Why: spending money due after the lowest day can't be spent before it, so counting it would let someone spend money that takes them under their warning level.

### D119. "I spent" takes only today or an earlier date

The question in the third point is answered by D129.

Agreed 1 Nov 2026, from the owner's review of step 1e. Replaces the third point of D109.

- The I spent sheet takes today or an earlier date. The engine refuses a new spend dated after today, and a change that moves a spend to a day after today.
- A spend already stored with a later date is still worked out by the plan, and can still have its amount or note changed. In a shared plan, a partner's today can be a day ahead (D85).
- Owner test 3 moves "today" to after the spends: Sat 28 Nov 2026 for the £230.00 case and Sun 8 Nov 2026 for the £120.00 case. Every expected figure stays the same except one: in the £120.00 case, Left to spend is £0.00, not £30.00, because on Sun 8 Nov it runs to Thu 12 Nov and Sam has no spending money due then. The test checks that the pay-later card's £80.00 still isn't in Left to spend by comparing with the same plan without the food budget. This is a question for the owner in `PLAN.md`.

Why: a spend dated after today and recorded before the next Update balance would count as already inside that balance, although the money hasn't gone yet.

## Made during step 1f

D120 was agreed by the owner on 1 Nov 2026 while step 1f was being built. D121 to D128 were decided on 1 Nov 2026 while building step 1f. The questions for the owner are in `PLAN.md`.

### D120. Where the tax figures come from

Agreed by the owner on 1 Nov 2026, during step 1f. Adds to brief 4.15.

- Every figure in a tax year file comes from GOV.UK, never from memory or another site. The build container can't reach GOV.UK, so a GitHub workflow (`.github/workflows/fetch-sources.yml`) fetches the addresses listed in `sources/gov-uk.txt` and saves each page unchanged in `sources/gov-uk/`, with a small file beside it giving the address, the date it was fetched and a checksum. It commits them back to the branch it ran on.
- It contacts only www.gov.uk, and GOV.UK's own file store, assets.publishing.service.gov.uk, for a file that one of the www.gov.uk pages on the list links to. Any other address, or a redirect anywhere else, is refused.
- HMRC publishes the exact rules for tax-free pay (the Specification for PAYE tax table routines and Tables A), its National Insurance guidance for software developers and its payroll test data only as files on GOV.UK's file store, linked from www.gov.uk. The owner agreed they can be fetched that way.
- GOV.UK pages change slightly every time they're fetched, so each run saves a fresh copy of every page with its date.

Why: the brief asks for the figures from GOV.UK, and the exact rounding for tax-free pay is only in HMRC's own files.

### D121. Income tax follows HMRC's PAYE tax table routines

Decided 1 Nov 2026 in step 1f. Adds to brief 4.15.

- Income tax follows HMRC's Specification for PAYE tax table routines, version 24.0, step by step, with the 2026-27 bands from its appendices for England and Northern Ireland, Scotland and Wales. Tax-free pay for week 1 is worked out from the code number in 500s and a remainder, each rounded up to the penny: 1257L is £49.60 + 2 × £96.16 = £241.92 a week. Thresholds are taken to 4 decimal places of a pound, taxable pay to date is rounded down to the pound, and tax down to the penny.
- Codes: a number and L, M, N or T (including 0T), K codes, BR, D0 and the D codes above it up to the top rate, and NT, each with S for Scotland or C for Wales (there's no SNT or CNT). A code ending in W1, M1 or X is an emergency code and works on the week 1/month 1 basis. Any other letter is refused, with a message asking for the code as it is on the payslip.
- No payday takes more than half its pay in tax (the regulatory limit), on every code. On the cumulative basis, the tax it holds back is taken later where it can be.
- Pay every 2 weeks uses the tables for week 2 on the year's first payday, then week 4 and so on; pay every 4 weeks uses week 4, then 8 (CWG2 1.7). Week 53, 54 or 56 is worked out on its own with the tables for week 1, 2 or 4, and takes no tax when the free pay to week 52 covers the whole year's pay (CWG2 1.13).
- HMRC's 2026-27 payroll test data for the rest of the UK, Scotland and Wales gives the same tax to the penny on every row.

Why: HMRC's payroll software follows this specification, so following it exactly gives the payslip's own figures.

### D122. National Insurance by the exact percentage method

Decided 1 Nov 2026 in step 1f. Adds to brief 4.15.

- Employee National Insurance uses the exact percentage method from HMRC's National Insurance guidance for software developers 2026 to 2027: the earnings from the primary threshold to the upper earnings limit at the category's main rate, rounded, plus the earnings above the limit at its upper rate, rounded. It's worked out on gross pay: a pension taken before tax doesn't lower it.
- Rounding: HMRC looks only at the third decimal place of a pound, rounding down at 5 or less and up at 6 or more. Week 26's (£553.19 − £242) × 8% = £24.8952 is £24.89, as on Sam's payslip. HMRC's manual NIM11002 words the rule as "amounts of less than £0.005 are disregarded", but its software guidance and CWG2 say "£0.005 or less", and its own test data confirms that: £242.32 a week gives 2p, not 3p.
- The thresholds for weekly, every 2 weeks, every 4 weeks and monthly pay are HMRC's own table. The category letter is A unless the payslip shows another.

Why: it's the method HMRC prefers, and it matches all four of Sam's payslips to the penny.

### D123. "I did overtime" and "I missed a shift" are pay adjustments

The last point's "a shift premium or other fixed pay isn't changed" is replaced by D130.

Decided 1 Nov 2026 in step 1f. Adds to D5, D44 and ARCHITECTURE.md 3.4.

- Each is saved as a pay adjustment with the change to take-home pay worked out when it's saved (D5). It's found by the pay series' family and the payday's payment number, not by series and original date, so a split or a new date for this and all later ones never loses it (D49, D89).
- While the payday is an estimate, its adjustments are added to its amount, and the row says how much of it they are. Once the real amount is typed in, they no longer count (D44), but they're kept, so they come back if the real amount is removed. A payday never goes below £0.00.
- "I did overtime", "I missed a shift" and removing either are each one edit, so one undo (D87). Both are refused once the payday has its real amount.
- Overtime adds a line of the hours at the overtime rate, which is the pay profile's unless another is given. A missed shift adds a line of minus the hours at the rate of the pay week's first basic line, unless another is given, rounded once like every line (D9). A shift premium or other fixed pay isn't changed.

Why: the change to a payday has to come from the pay calculator (D5), and the real amount is what the bank shows (D44).

### D124. The year so far, for exact tax and for a week in the future

Decided 1 Nov 2026 in step 1f. Adds to brief 4.15. The owner asked for this to be recorded as a decision.

- On the cumulative basis, "Gross for tax so far" and "Tax paid so far" from the payslip just before this payday make the tax exact. Week 1/month 1 needs no year so far, so it's exact too.
- When they're from an earlier payslip, each pay period in between counts as paid this payday's pay for tax, with the tax the cumulative basis would have taken, and the result is labelled an estimate. Without them, the same is done from the start of the tax year. When they're from the tax year before, the new year starts from nothing.
- For "I did overtime" and "I missed a shift", the pay periods in between count as paid the payday's own pay week, with no overtime or missed shifts, both with and without the change. So the change is what the overtime or missed shift alone does to that payday, and two shifts on one payday add up to exactly both together.
- Test 3 shows it: Fri 6 Nov is tax week 31, and Sam's last payslip is week 29, so week 30 counts as week 27's pay. 11.5 hours at £19.07 raise Fri 6 Nov by £155.12, within £1 of the brief's £155.23 (D7). On week 26's payslip, with the year so far to week 25, it's £150.79, within £1 of £150.89. The brief's figures take the tax on the overtime as exactly 20% of the extra pay for tax; the tax tables round taxable pay down to whole pounds first, which explains the 10p or so.

Why: what someone will really earn in the weeks before a future payday isn't known, and their usual week is the best guess. The overtime's own effect is what the person asked for.

### D125. Which payday a shift is paid on

The first point, the working week and how many weeks behind pay is, is replaced by D131.

Decided 1 Nov 2026 in step 1f. Adds to D5 and ARCHITECTURE.md 3.4.

- A pay profile says which day its working week starts and how many weeks behind the shifts pay is. A shift is paid on the first payday, on or after the first day of its working week moved on by that many weeks. Sam's shift on Mon 26 Oct, in a week from Monday, one week behind, is paid from Mon 2 Nov: on Fri 6 Nov. A week from Saturday gives Fri 6 Nov too.
- The payday is the day the pay lands, after the weekend and bank holiday rule and any move. A removed payday isn't a payday (D81).
- The payday's pay week is the one linked to its step of the amount pattern (D5), or the one pay week of pay with no pattern. With none, "I did overtime" is refused, and the app asks once for the usual hours and rate and saves them as a pay week (D5).

Why: the brief's test lands on Fri 6 Nov, and the same rule works for any working week and any number of weeks behind.

### D126. Pension and other deductions

Decided 1 Nov 2026 in step 1f. Adds to brief 4.15.

- The pension is a percentage of the gross pay inside the profile's band for the pay period, such as £120 to £967 a week, rounded once to the nearest penny (D9). Without a band, it's the whole of the gross pay.
- Taken before tax, it lowers the pay for tax (HMRC's "net pay" arrangement), but not National Insurance or student loans (CWG2 2.1). Taken after tax, it comes off take-home pay and the pay for tax stays as it is.
- The percentage is what comes off the pay, as the payslip shows it. For a pension taken after tax, the pension company claims the tax relief itself, so it isn't added to take-home pay.
- Other deductions typed in, such as union fees, come off after tax.

Why: it matches Sam's four payslips to the penny, and it's how CWG2 describes the two ways of taking a pension.

### D127. Student loans

Decided 1 Nov 2026 in step 1f. Adds to brief 4.15.

- A pay profile has at most one of Plans 1, 2, 4 and 5, and can also have a Postgraduate loan, because an employer takes only one of the plans through payroll (HMRC, "Collection of student loans from 6 April 2026"). Two plans are refused, asking for the one on the payslip.
- Each is worked out on the earnings National Insurance is due on, for this payday only: the plan's rate on the earnings above its threshold for the pay period, rounded down to the whole pound. The threshold is the annual one ÷ the paydays in a year, rounded down to the penny: Plan 2 is £565.09 a week.

Why: these are HMRC's rules, and HMRC's 2026-27 student loan test data gives the same figures for every plan and pay period.

### D128. Tax year files and pay records

Decided 1 Nov 2026 in step 1f. Adds to D45 and ARCHITECTURE.md 2.7 and 3.4.

- Each tax year file is a data file in `packages/engine/src/pay/tax-years`, named like `2026-27.json`. Every figure has its value, its www.gov.uk source link, where on the page it is and, when it's in one of GOV.UK's files, that file. The engine checks the file before using it, and refuses a figure without a GOV.UK link.
- Pay on a day with no tax year file is refused, saying which tax year is missing.
- The tax year check gives the files needed and the ones missing: the file for the tax year we're in, and from 1 March the file for the year starting on 6 April. On Mon 1 Mar 2027 it warns that 2027-28 is missing; on Sun 28 Feb 2027 it doesn't (D45).
- A pay series links to its pay profile and to a pay week for each step of its amount pattern (D5). A pay profile also keeps the year so far, with the tax year and the tax week or month it's from.

Why: the brief asks for one file per tax year with its source links, and the app and the server can then use the same check.

## From the owner's review of step 1f

D129 to D133 were agreed by the owner on 3 Nov 2026, answering the four questions left in `PLAN.md` at the end of step 1f and adding one rule. They were built in step 1g.

### D129. Left to spend on Sun 8 Nov is £0.00

Agreed 3 Nov 2026, from the owner's review of step 1f. Answers the question in D119.

In owner test 3's £120.00 case, with today on Sun 8 Nov 2026, Left to spend until Fri 13 Nov is £0.00. Sam's spending money for that week left on payday, Fri 6 Nov. The test only needed the pay-later card's line ("On the pay-later card: £80.00 left until Sat 28 Nov") to be separate from Left to spend, and it is.

Why: the owner confirmed it. Left to spend runs from today to the day before the next payday (D28), and nothing of Sam's spending money is due then.

### D130. A change to the extras with overtime or a missed shift

Agreed 3 Nov 2026, from the owner's review of step 1f. Replaces the last point of D123 that a shift premium or other fixed pay isn't changed. The points after the first were decided in step 1g.

- When a payday's pay week has fixed extras (a shift premium, bonus or allowance), "I did overtime" and "I missed a shift" take an optional change to those extras. Leave it empty and the extras stay as they are. People whose pay has no extras are never asked, and the engine refuses a change to extras on pay without them.
- The change is typed as an amount above zero: how much more the extras are with the overtime, or how much less with the missed shift. £0.00 is the same as leaving it empty.
- It's worked out with the hours by the pay calculator, so the tax, National Insurance and pension on it are right, and saved on the pay adjustment.
- A missed shift can't take off more in extras than the payday has, counting changes already saved for that payday.

Test: Sam misses his shift on Tue 3 Nov and loses £47.43 of shift premium: Fri 13 Nov goes down by £133.17 instead of £100.43, to £335.89.

Why: the owner's answer. Sam's shift premium isn't the same for every shift, so only the person knows how much of it a shift was worth.

### D131. Which payday a shift is paid on: the last day of work each payday covers

The question about monthly pay that covers work in the month before is answered by D142.

Agreed 3 Nov 2026, from the owner's review of step 1f. Replaces the first point of D125: the working week and how many weeks behind pay is, and the pay profile fields for them. The owner's message named D124, but those are in D125; D124, the year so far, stays as it is. The points marked "decided in step 1g" weren't in the owner's answer.

- Setup asks once for the last day of work the next payday covers, for example "Fri 6 Nov pays for work up to Sun 1 Nov".
- For monthly pay, it's stored as a day of the month, such as the 15th, or the last day. For any other pay, it's stored as a number of days before payday: 5 for Sam.
- A shift goes on the first payday whose last day covered is on or after the shift's date.
- Decided in step 1g: the last day covered is worked out from the payday's date from its schedule, before any weekend or bank holiday move, so a payday moved for Christmas still covers the same work. For monthly pay it's in the payday's own month, and a day the month is too short for is its last day. Days before payday can be 0 to 62, the same 8 weeks and 6 days the working week and weeks behind allowed. A day of the month for pay that isn't monthly, or days before for monthly pay, is refused. A removed payday isn't a payday (D81).

Tests:

- Sam, 5 days before payday: overtime on Mon 26 Oct lands on Fri 6 Nov, and a missed shift on Tue 3 Nov lands on Fri 13 Nov. Every step 1f figure stays the same (£155.12 and −£100.43).
- Pay every 2 weeks on Fridays from Fri 6 Nov, covering work up to the Sunday before: a shift on Tue 3 Nov goes on Fri 20 Nov.
- Monthly pay on the last working day, covering work up to the 15th: a shift on Wed 16 Dec 2026 goes on Fri 29 Jan 2027.

Why: it's the owner's answer, and one question in setup works the same for weekly, fortnightly, four-weekly and monthly pay. The schedule's date is used because payroll decides what a payday covers before the bank moves it. A question about monthly pay that covers work in the month before is in `PLAN.md`.

### D132. A pension taken after tax: confirmed

Agreed 3 Nov 2026, from the owner's review of step 1f. Confirms the third point of D126.

The percentage typed in is what the payslip takes. Nothing else changes.

Why: the owner confirmed it.

### D133. Sam's example plan always shows Sun 25 Oct 2026 as today

Agreed 3 Nov 2026, from the owner's review of step 1f. Adds to D15. Phase 2 builds it.

Sam's example plan always shows Sun 25 Oct 2026 as today, whatever the date really is, so every number matches the tests and the website's screenshots.

Why: the example and the tests stay the same plan (D15), and the screenshots never go out of date.

## Made during step 1g

D134 to D141 were decided on 3 Nov 2026 while building step 1g. The owner answered its questions the same day: D142 to D148.

### D134. How the speed test is measured

Decided 3 Nov 2026 in step 1g. Adds to D72 and ARCHITECTURE.md 2.8.

- The plan: 100 weekly series over 24 months, from Sun 25 Oct 2026 to Wed 25 Oct 2028, on a current account with an overdraft and a savings account. One in ten is money coming in, four move money to savings, a third move to the working day before a weekend or bank holiday, and some have one-off changes and ticks. That's about 10,500 rows.
- It's worked out 5 times to warm up, then 20 times. The time is the middle of the 20: the average of the 10th and 11th fastest. It must be under 12 milliseconds. The target is unchanged.
- It runs in a group of its own, never at the same time as the other tests, so they never compete with it for the machine.
- It loads the engine with Node's own `import`, the way the app's build will run it, not through the test tool's module runner. On the test machine the same plan took 9 to 11 milliseconds through the module runner and 4.5 to 7 milliseconds with Node's own import, because the runner slows down every call from one engine file to another. So the engine is written in TypeScript that Node can run directly, and the type check refuses anything else.
- To get there, the engine writes each date as text once and keeps it, writes payments out without copying, puts each day's rows in a bucket for that day instead of one big sort, collects them in the same-day order so most days need no sorting, and keeps what every row of a series shares once for the series. The order of rows and every figure stay exactly the same: every earlier test passes unchanged.

Result: about 5 milliseconds on the test machine, from about 28 before step 1g, and 3.30 milliseconds on GitHub's machine.

Why: the test should measure the engine as the app will run it, and nothing else running at the same time. The target leaves room for a phone four times slower to stay under the brief's 50 milliseconds (ARCHITECTURE.md 2.8).

### D135. What if

Decided 3 Nov 2026 in step 1g. Adds to brief 4.10 and ARCHITECTURE.md 2.1.

- Practice changes are ordinary edit commands, made one after another on a copy of the plan's records, each on the records the ones before it left. Anything that can be edited for real can be practised, including "I did overtime" and Update balance.
- What if gives the real plan and the practice plan side by side: for each account its lowest point, the first day under the warning level and each shortfall with the payments that could move; for each debt "Paid off on", or what's still left at the end; and for each savings goal the date it's reached. Debts and goals look 24 months ahead, like the Debts screen (D43), unless told otherwise.
- The real records are never changed. To throw the practice away, the app forgets it.
- Keeping it gives one edit holding every practice change: for each record, how it was before the first practice change and how it is after the last. It's one undo step (brief 5.4, D87). A record that ends up as it started isn't in it.
- Before keeping, the app works What if out again on the newest real records with the same practice commands, as a sync clash runs a command again (ARCHITECTURE.md 3.5), so a partner's change that arrived in the meantime is never overwritten.
- A practice change the engine can't make is refused with its usual code, and the message says which practice change it was.

Tests: owner test 2 (Kofi with no work next week: from a lowest point of £156.00 to £237.75 short on Thu 5 Nov, beside each other) and owner test 3 (Sam's Fri 30 Oct pay £100 lower: −£95.47 Short on Sun 1 Nov beside £4.53 Tight, the D69 list, and every paid-off date the same). Property tests on all six people's plans prove the real plan never changes, Keep saves exactly the practice plan, and one undo puts it back.

Why: the brief asks for a practice mode with the same changes as real ones, side by side, then kept or thrown away. Using the same commands means practice and real changes always agree, and one edit for Keep follows the rule that every change can be undone straight away.

### D136. Pay weeks after a new amount for this and all later ones

Decided 3 Nov 2026 in step 1g. Adds to D5, D90 and D97.

- A new amount for every payday from now (D90) replaces an amount pattern with one amount. The pay weeks linked to each step of the pattern (D5) go with the pattern, so those paydays have no pay week. "I did overtime" and "I missed a shift" on them then ask once for the usual hours and rate, as D5 says for pay with no linked week. A series with one amount and one pay week keeps it.
- "Only this week of the pattern" (D97) on a series that has one amount and one pay week gives every step of its new pattern that same pay week.

Why: the step 1g property tests found that a new amount for every payday from now, on pay linked to pay weeks, left four pay weeks on a series with one amount, so the edit was refused. With one amount, which step's week to use can't be known, and guessing would put a wrong overtime figure in the plan. A single week was already used for every payday, so it carries on.

### D137. The other five people's plans

Decided 3 Nov 2026 in step 1g. Adds to brief Part 2 and D15.

The plans for Priya, Dee, Kofi, Jess and Tom, and Ali in `packages/engine/test/fixtures/people.ts` use the details in brief Part 2 and amounts made up to fit each person. They're test data for Phase 2's end-to-end tests, not example plans people see: Sam's is the only example (D15).

- Priya: today Sun 25 Oct 2026, looking a year ahead so the yearly bills show. Salary £2,100 on the last working day, moved to the working day before (brief 8.5), rent, council tax over 10 months, energy, a quarterly water bill, yearly car insurance and TV licence, subscriptions, monthly food and weekly spread travel budgets, and £150 to a holiday fund each payday, reached on Fri 28 May 2027. No debts.
- Dee: today Mon 2 Nov 2026. Her main pay is Universal Credit on the 28th, moved to the working day before, as an estimate, with October's real £812.46 typed in. Café wages every 2 weeks (32 hours at £12.71), with a pay profile so "I missed a shift" works. Council tax in 10 instalments, April to January, weekly childcare, and a weekly food budget. A £50 warning level, so she's Tight from Mon 9 Nov and never overdrawn.
- Kofi: today Wed 28 Oct 2026. Three platforms as irregular weekly estimates, with Rides as his main pay, so his weeks run Monday to Sunday. 25% of each set aside to his Tax account, which pays his Self Assessment. Van finance as a loan with 24 payments left, rent, insurance, phone, and weekly fuel and food budgets.
- Jess and Tom: today Sun 25 Oct 2026. Three accounts: Jess's, Tom's and the joint one. Jess is paid on the 28th and Tom on the 15th, both moved to the working day before. Jess moves £600 to the joint account on her payday (brief 8.5) and Tom £950 on his. The joint account pays the rent, bills and a monthly food budget. Tom's car loan belongs to Tom (D65). Jess's pay is the main pay here; Tom's own view uses his. Sharing between their phones, with private accounts, comes in Phase 3.
- Ali: today Mon 2 Nov 2026, £300 into a £1,000 overdraft with a warning level of £0. His main pay is the student loan, three termly payments on chosen dates, so his plan runs term by term and Left to spend lasts until Mon 11 Jan. A weekly shop job, rent each term, a phone contract, a bus pass and a weekly food budget.
- Everything paid before each person's balance was checked is ticked, so nothing is in Not ticked yet.

Why: the brief asks for all six people as personas and end-to-end tests. Each plan has what that person needs most, and every engine part is used by at least one of them.

### D138. A tick made before an update, for money paid after its balance date

Decided 3 Nov 2026 in step 1g, from the engine review. Follows brief 5.5 rule 1 and D1 where the engine didn't. Adds to D33, D62 and D99.

- A payment's tick is inside an account's balance when it was ticked at or before the balance update and its paid date is on or before the balance date (brief 5.5 rule 1, D1, D33), or when it was ticked inside that account's Update balance steps.
- So a payment ticked before an update, but paid after the balance date, isn't inside it. It goes out on its paid date. This only happens when the balance is typed in with a date before today.
- Debts work the same way (D62, D99): a payment ticked before an Update from statement, but paid after the statement's balance date, comes off the debt on its paid date. Ticks made inside the update's steps are still inside it (D103).

Test: on Tue 3 Nov at 9am a balance of £500.00 is typed in as it was on Sun 1 Nov. The £25.00 phone bill paid on Mon 2 Nov, ticked at 6pm that day, comes off on Mon 2 Nov, leaving £475.00. A loan updated the same way from a £100.00 statement dated Sun 1 Nov shows £75.00 left now, and is paid off on Tue 2 Feb 2027, not Tue 2 Mar.

Why: the engine counted every tick made before an update as inside it, whatever the paid date, so a balance dated before today showed money that had already gone: £25.00 too much in the test.

### D139. A savings goal that drops back below its target

Decided 3 Nov 2026 in step 1g, from the engine review. Adds to D114.

- The date a goal is reached is the day of the payment that takes it to the target and keeps it there to the last day looked at. Money taken out again, below the target, starts it over: the date is the day it gets back to the target, or none if it doesn't.
- A goal that starts at its target, and never drops below it, has no date, as before (D114).
- The date is labelled an estimate when a payment marked as an estimate comes before it.

Test: a £1,000.00 goal starting at £1,000.00, with £300.00 taken out on Tue 20 Oct and £50.00 a week in from Fri 6 Nov, is reached again on Fri 11 Dec 2026, with its 7th linked payment counting the £300.00 out. One that went over its target then back under, and stays under, has no date, beside 70%. D114's test still gives Fri 9 Apr 2027 with the 24th move.

Why: D114's "first takes it to the target" said a goal was reached on a date it later fell back from, so the screen could show "Reached on 10 Oct" beside 70%, and missed the real date when money was taken out first.

### D140. Overtime and missed shifts on the same payday, and smaller pay rules

Decided 3 Nov 2026 in step 1g, from the engine review. Adds to D5, D121, D123, D124, D130 and D131.

- **Every shift on one payday is worked out together.** The overtime and missed shifts on one payday are worked out in the order they were saved (by id, which is made in time order), each on top of the ones before it, so they add up to exactly all of them together (D124). Removing one works the others out again. An undo that would take away or change one that a later one was worked out on top of is refused, as is an undo that would take away the payday of one saved since (D87). Removing overtime is refused when a missed shift on that payday would then take off more extras than the payday has (D130).
- **The payday that covers the shift.** A shift goes on the payday whose last day covered is the earliest on or after the shift (D131). Paydays usually land in that order anyway; this matters only when a payday has been moved before another one, which still covers the same work.
- **NONCUM.** A tax code ending in NONCUM is an emergency code on the week 1/month 1 basis, like W1, M1 and X. GOV.UK's "Emergency tax codes" page says payslips can show it (D121).
- **Check my payslip** doesn't list National Insurance or take-home pay that's 1p away from the calculator, because some payroll software uses HMRC's National Insurance tables (brief 8.6). Any other difference, even 1p, is listed.
- **Other deductions** typed in can't be below zero, because a deduction below zero would add to take-home pay.

Tests: with two overtimes on Fri 6 Nov, removing the first leaves £773.58, the same as the second alone. With Fri 13 Nov's pay moved to Thu 5 Nov, overtime on Mon 26 Oct still lands on Fri 6 Nov.

Why: each was found by the review with an example that put a wrong figure in the plan or refused something valid: removing one of two shifts left Fri 6 Nov £16.00 too high.

### D141. Smaller fixes to records and edits

Decided 3 Nov 2026 in step 1g, from the engine review.

- Two balance updates for one account at the same moment are refused whatever order they come in (D85). Before, it depended on the order.
- A payment's own date from its schedule, sent as the new date for this and all later ones, isn't a new date: the schedule and any one-off moved dates stay as they are (D60, D91). Before, the later dates were worked out again from it, so a payment on the 31st became the 30th in later months.
- A pattern's step is worked out without losing accuracy whatever the pattern position stored, and a payment number above 100,000 is refused: weekly payments from 1900 to 2999 are about 57,400.
- A series ending on Tue 31 Dec 2999, the last day a date can be, counts as never ending. Before, it was refused.

Why: each could refuse a valid plan or change payments nobody asked to change.

## From the owner's review of step 1g

D142 to D148 were agreed by the owner on 3 Nov 2026, answering the seven questions left at the end of step 1g. They were built in step 2a. Points marked "decided in step 2a" weren't in the owner's answer.

### D142. Pay that covers last month's work

Agreed 3 Nov 2026, from the owner's review of step 1g. Answers the question in D131. Adds to D131.

- Setup works out from the date picked whether monthly pay covers work in its own month or the month before. "Fri 5 Dec pays for work up to Mon 30 Nov" means last month's work. Nothing extra is asked.
- Decided in step 2a: the engine stores the day of the month and, for last month's work, that it's the month before. A day picked that's its month's last day is stored as "the last day", so it's the 31st in a long month and the 28th in February. Any other day is stored as that day of the month. For pay that isn't monthly, the days before payday are stored, 0 to 62, as before.
- Decided in step 2a: monthly work that ends more than a month before payday, or in the month after it, is refused, and so is weekly or fortnightly work that ends after payday or more than 62 days before it.

Test: monthly pay on the 5th covering work up to the last day of last month puts a shift on Mon 30 Nov 2026 on Sat 5 Dec, and shifts on Tue 1 Dec and Thu 31 Dec on Tue 5 Jan 2027.

Why: the owner's answer. One question in setup still works for every kind of pay.

### D143. Left to spend always counts to the day before the next main payday

Agreed 3 Nov 2026, from the owner's review of step 1g. Replaces "or to the plan's last day if that comes first" in D112's second point.

Left to spend, and the "Spend no more than" line, always count from today to the day before the next main payday, however far the Plan screen looks.

Ali on Mon 11 Jan 2027: £525.00 until Mon 26 Apr (15 weeks of his £35.00 food budget), whatever the view length. Before, it was £455.00 with a view to Sat 10 Apr.

Why: the owner's answer. Left to spend says "until" a payday, so it has to count every day until then.

### D144. When the main pay stops

Agreed 3 Nov 2026, from the owner's review of step 1g. Adds to D14, D28 and D84.

- After the main pay's last payday, the plan is grouped by calendar month. The period that starts on the last payday runs to the end of that month.
- When the main pay has no payday after today, Left to spend runs to the end of this month.
- The app gently suggests choosing another main pay, with these words, for Phase 2: "Your main pay has no more paydays planned. Choose another to plan by payday."
- Decided in step 2a: the engine says so with `mainPayEnded` on the plan, and Left to spend says whether it runs to a payday or to the end of the month. Periods that ended before today aren't shown.

Test: Ali on Tue 27 Apr 2027, the day after his last student loan payment: Left to spend £35.00 to Fri 30 Apr, and periods Mon 26 Apr to Fri 30 Apr, then May, June and July.

Why: the owner's answer. Without it, the plan showed one long period from the last payday to the end, with no Left to spend.

### D145. Pay on the last working day is stored against the month

Agreed 3 Nov 2026, from the owner's review of step 1g. Replaces the second point of D78 for pay on the last working day.

- A payment on the last working day has the month's last day as its original date, so a tick or a one-off change is stored against the month and a new bank holiday can never move it.
- It lands on the working day on or before the month's last day, whatever its weekend and bank holiday rule says. Nothing people see changes.
- Decided in step 2a: landing on the last working day isn't shown as a move by the weekend rule, and sending a payday's own date for this and all later ones changes nothing, whether it's the working day or the month's last day.

Test: Priya's October salary is ticked against Sat 31 Oct and paid on Fri 30 Oct. With Fri 30 Oct made a bank holiday, it lands on Thu 29 Oct and is still ticked.

Why: the owner's answer. Ticks always stay with their payday.

### D146. The credit card comparison counts today's planned payment

Agreed 3 Nov 2026, from the owner's review of step 1g. Adds to D102.

On payment day, the comparison counts that day's payment when it isn't ticked yet, as the bank balance does. Once it's ticked, Left now has it taken off, so the comparison starts after it.

Test: owner test 5's card on Sun 15 Nov, with £429.73 left before the payment is ticked: £25.00 a month takes 21 payments, the last on Sat 15 Jul 2028. Ticked, with £404.73 left, it takes 20 more, ending the same day.

Why: the owner's answer. Before, it showed 22 payments on payment day.

### D147. Pay-later bills with roll-over

Agreed 3 Nov 2026, from the owner's review of step 1g. Adds to D32 and D111.

With roll-over on, once a card's statement period has ended, its bill is estimated at what was really spent, and the unspent amount rolls into the next period. The real bill still replaces the estimate. Without roll-over, the estimate stays the budget, or what was spent if that's more (D32).

Test: owner test 3's food budget with roll-over, £120.00 spent by Sat 28 Nov, on Sun 29 Nov: that day's bill is £120.00 and the next is £280.00 (£200.00 + £80.00).

Why: the owner's answer. The unspent part now counts once, in the next bill, not twice.

### D148. NONCUM: confirmed

Agreed 3 Nov 2026, from the owner's review of step 1g. Confirms the NONCUM point of D140.

A tax code ending in NONCUM is an emergency code on the week 1/month 1 basis.

Why: the owner confirmed it.

## Made during step 2a

D149 to D157 were decided on 3 Nov 2026 while building step 2a. D150 is the owner's, given with the step. Questions for the owner are in `PLAN.md`.

### D149. Commands for adding and changing records

Decided 3 Nov 2026 in step 2a. Adds to D87 and ARCHITECTURE.md 2.3.

- Setup, "Add a payment" and the add and edit sheets change the plan only through engine commands: accounts, payments, debts, budgets, savings goals, pay profiles, pay weeks, the main pay and the nation. Each is one edit, so one undo, and every id comes in with the command.
- Each command checks what it's given and refuses with a plain code, such as `same-account`, `budget-zero`, `needs-account` or `payment-before-today`, and a message with ids and dates only, never amounts, names or notes. It then checks the plan would still work out with it, so it never saves a record the plan can't use.
- Anything a person types a name for needs a name with something in it.
- Edits work on a plan with no accounts yet, so setup can start from nothing. Working out a plan still needs an account.
- An undo is refused when something saved since depends on what the edit changed, such as a payment added since in an account the edit added.

Why: brief Part 3, principle 4 says every change can be undone, and D87 says one engine function makes every edit, so every phone and every replayed edit after a sync clash checks the same things.

### D150. A payment dated before today is refused

Agreed 3 Nov 2026, from the owner's step 2a instructions. Adds to D86.

"Add a payment" and setup refuse a payment whose next payment is before today: if it has already gone, Update balance covers it. Decided in step 2a: this counts the day it lands, so a payment due today that the weekend rule moves to Friday is refused on a Sunday too, and setup offers the one after it.

Why: the owner's instruction. A payment before today would show in "Not ticked yet" and come off the balance, although the bank balance already has it.

### D151. Accounts

Decided 3 Nov 2026 in step 2a. Adds to brief 4.2 and ARCHITECTURE.md 3.3.

- An account is added with the balance its bank shows, as one edit, because every account needs a balance to start from (D85).
- An account has a name, and its name, kind, overdraft limit and warning level can change.
- An account can be closed once nothing is planned in it: no payment, money set aside or pay-later bill still to come or not ticked yet, no budget that hasn't ended and no savings goal kept in it. It keeps its balance updates for the history, and nothing new can use it. Whether an account with money left in it can be closed is a question for the owner in `PLAN.md`.

Why: brief 4.2 lists each account's name, balance, overdraft limit and warning level. Closing an account that still has payments would lose them from the plan.

### D152. Budgets

Decided 3 Nov 2026 in step 2a. Adds to brief 4.5, D30, D107 and D110.

- A budget starts today or later, like a payment's next date (D86, D150), and its amount is above zero.
- A new amount counts from the period with today in it. Periods that have ended keep the amount they had, for roll-over and pay-later bills: Sam's Travel, £25.00 with £7.00 left last week, changed to £30.00 on Sun 25 Oct, is £30.00 + £7.00 this week. This is a question for the owner in `PLAN.md`.
- Switching roll-over on counts from today (D110), and switching it off clears that day.
- How it leaves can change between all at the start and spread across the days at any time.
- A change that moves a pay-later budget's bills (to or from a pay-later bill, a new bill day, or a new statement day for the card) is refused once its first bill has come, or a bill has a tick or a change, because a bill is found by its date (D111) and pays for its statement period's spends (D61). To or from a pay-later bill, and a new bill day, are refused once it has spends too. It's ended and a new budget added instead. A change that would make a bill dated before today is refused, as a payment is (D150).
- Ending a budget sets its last period: the one with the end date in it, today or later.

Why: a budget's past periods are settled (D2, D67), and changing the past would change what rolled over and what a bill was planned at.

### D153. Debts and savings goals

Decided 3 Nov 2026 in step 2a. Adds to brief 4.6, 4.7, D98 and D114.

- A debt is added with everything in ARCHITECTURE.md 3.3, including 0% until a date (D106) and the minimum rule (D101), and checked like a stored one. Anything but its balance can change; its balance changes with "Update from statement" (D103). Changing a credit card to another kind needs its card fields cleared.
- Currencies that aren't counted in hundredths, such as the yen or the Kuwaiti dinar, are refused (D98).
- A closed debt is still worked out but left out of Owed now (D99). No new payment can be linked to it.
- A savings goal needs an account, a target above zero, and a target date of today or later if it has one. It can change, and moving it to another account is refused while its payments don't move money into or out of that account (D114).
- A goal can be closed. Payments stay linked to it, and no new one can be.
- A payment is linked to a debt or a goal. Whether it can be linked to a budget, as ARCHITECTURE.md 3.3 lists, is a question for the owner in `PLAN.md`: a budget already puts its own money in the plan (D107).

Why: these follow the brief and the decisions named, so a record added later is checked exactly like one already in the plan.

### D154. Pay profiles and pay weeks

Decided 3 Nov 2026 in step 2a. Adds to D5, D123, D130, D131 and D140.

- A pay profile and a pay week each have a name, such as "Warehouse job" and "3-shift week".
- A pay profile's last day covered must suit its pay: a day of the month for monthly pay, days before payday otherwise (D131, D142). Setup works it out from the payday and the last day picked.
- A pay week has at least one line or one extra, and no hours, rate or extra below zero. Its extras are its fixed pay, such as a shift premium (D130).
- Pay is linked to its pay profile and pay weeks for its whole family: each series gets the pay weeks when its pattern has that many steps.
- Changing a pay profile, a pay week or the pay's links works out every overtime and missed shift saved on them again, on paydays still to come that are still estimates, so they always match what they're worked out from, as D140 does when one is removed. An undo that puts them back does the same. Shifts on paydays that have gone, or that have their real amount (D44), stay as they were saved, and so do those on a payday a newer payslip's year so far already covers. This is a question for the owner in `PLAN.md`.
- A new last day covered (D131) is refused while a shift saved on a payday still to come would then go on another payday. The person removes the shift and adds it again.

Why: brief 4.15 names each job's settings and saved weeks, and an overtime figure worked out from a week that has since changed would put a wrong amount in the plan.

### D155. The main pay and the nation are one settings record

Decided 3 Nov 2026 in step 2a. Adds to D14 and ARCHITECTURE.md 3.2.

- The plan's nation for bank holidays and the main pay are saved as one settings record, so choosing either is one undoable edit. The app passes them to the engine as the bank holidays and the main pay.
- The main pay is a family of money coming in, or none.
- In a shared plan each person's main pay moves to their own plan member record in Phase 3 (ARCHITECTURE.md 3.2). Until then, nothing checks that the main pay passed in is the one saved, so Tom's own view of Jess and Tom's plan still works.

Why: brief Part 3, principle 4 says every change can be undone, and the main pay and nation change how the whole plan is worked out.

### D156. Deleting a payment that hasn't started yet

Decided 3 Nov 2026 in step 2a. Adds to D92.

A payment whose first payment is after today can be deleted: its whole family, with its one-off changes and any overtime or missed shifts saved for it. From the day its first payment is due, "Remove this and later" is used instead (D92).

Why: the owner's instruction says a payment that hasn't started can be deleted. Once one is due it may already have gone, so it's removed the way D92 says, which refuses a ticked payment.

### D157. The people's plans as the commands build them

Decided 3 Nov 2026 in step 2a. Adds to D137.

The fixture plans now look exactly as the commands would build them, and every figure in every test stays the same:

- Every account, pay profile and pay week has a name.
- Priya, Kofi, and Jess and Tom set up the day before their balances were checked, Dee on Tue 27 Oct and Ali on Sun 20 Sep, so each has a balance from the day they set up as well as the latest one. A balance can't be dated after the day it's typed in, and a payment can't be added for a day before (D150).
- Priya's salary and holiday savings start on her next payday, Fri 30 Oct, not Thu 1 Oct (D86). They give the same payments.
- Dee's payments were made on Tue 27 Oct, so her October Universal Credit, due on Wed 28 Oct, could be added. Her balance on 27 Oct is £121.22, which gives her £427.40 on Mon 2 Nov once her Universal Credit, wages, rent and council tax have gone in and out.

Why: the owner's test 2 builds each plan from empty with the commands and expects exactly the records in the fixture files.

## From the owner's review of step 2a

D158 to D163 were agreed by the owner on 3 Nov 2026, answering the six questions left at the end of step 2a. Each is built in the step that uses it.

### D158. An account is closed only at £0.00

Agreed 3 Nov 2026, from the owner's review of step 2a. Answers the question in D151 and adds to it. Built in step 2f, with the account screens.

- An account can be closed only when the plan shows £0.00 in it at the end of today, as well as nothing planned in it (D151).
- When money is left, the app offers one tap: "Move £3.12 to another account first". That adds a transfer today from this account to one the person picks, for the whole amount left. Then the account can be closed.
- The engine refuses to close an account with money left in it, so no phone can do it by mistake.

Why: the owner's answer. Money never quietly drops out of the plan.

### D159. "The last day" of the month: confirmed

Agreed 3 Nov 2026, from the owner's review of step 2a. Confirms the second point of D142. Built in step 2a; setup uses it in step 2e.

When the last day of work picked for monthly pay is a month's last day, it follows each month's end: "Fri 5 Dec pays for work up to Mon 30 Nov" means January's pay covers work to Thu 31 Dec and March's to Sun 28 Feb. Any other day stays that day each month.

Why: the owner confirmed it.

### D160. Payments link to debts and goals only, for now

Agreed 3 Nov 2026, from the owner's review of step 2a. Answers the question in D153. Changes ARCHITECTURE.md 3.3, which listed a linked budget on a payment.

- A payment can be linked to a debt or a savings goal. Linking a payment to a budget is left for later.
- The records keep room for it: the Phase 3 database keeps an empty `budget_id` beside `debt_id` and `goal_id` on each payment, so it can be added without starting again. "Add a payment" (step 2d) offers only debts and goals.

Why: the owner's answer. A budget already puts its own money in the plan (D107), so a linked payment would count the same money twice until a rule for it is agreed.

### D161. Changing a budget part-way through: confirmed

Agreed 3 Nov 2026, from the owner's review of step 2a. Confirms the second and fifth points of D152. Built in step 2a; the budget sheet uses it in step 2f.

- A new amount counts from this week or month, the period with today in it. Periods that have ended keep what they had: Sam's Travel, £25.00 with £7.00 left last week, changed to £30.00 on Sun 25 Oct, is £30.00 + £7.00 this week.
- A budget with spending recorded can't switch to or from a pay-later card. The person ends it and adds a new one.

Why: the owner confirmed it.

### D162. Overtime is worked out again when its pay week changes: confirmed

Agreed 3 Nov 2026, from the owner's review of step 2a. Confirms the fifth point of D154. Built in step 2a; "I did overtime" uses it in step 2d.

When the tax code, the year so far or the usual week changes, every overtime and missed shift saved on it, on a payday still to come that's still an estimate, is worked out again.

Why: the owner confirmed it. A figure worked out from a week that has since changed would put a wrong amount in the plan.

### D163. Setup can't skip the account and balance

Agreed 3 Nov 2026, from the owner's review of step 2a. Replaces "every step can be skipped" in brief 4.1 for the first step of setup. Built in step 2e.

- In setup, the account and balance step can't be skipped, because every plan starts from a balance (D85, D151). Someone who only wants budgets still types one balance.
- Every other step can be skipped and changed later (brief 4.1).
- "Look at an example plan" still needs no balance: it's Sam's plan (D15).

Why: the owner's answer. A plan with no balance can't show anything left after a payment.

## Made during step 2b

D164 to D175 were decided on 3 Nov 2026 while building step 2b. The owner approved D164 and answered the questions the same day: D176 to D182.

### D164. Dark mode colours, the text box border and the focus outline (proposed)

Approved by the owner on 3 Nov 2026: D176.

Decided 3 Nov 2026 in step 2b. Proposed for the owner's approval (DESIGN.md: "Propose its values in Phase 2"). Adds to DESIGN.md.

Dark mode uses the same roles as light mode. Two roles are new: **Navy as text** (links, outlined buttons, the wordmark and the active navigation item, `#14213D` in light mode, as the approved sample has them) and the two lines DESIGN.md left to choose.

| Role | Light | Dark |
| --- | --- | --- |
| Paper (page background) | #F4EFE6 | #0E1424 |
| Card | #FFFDF8 | #172036 |
| Sunk (date tiles) | #EFE8DA | #212B44 |
| Ink (main text) | #1A2238 | #F2ECE0 |
| Ink muted (second lines) | #4A5060 | #B9B2A3 |
| Navy (main button, balance card) | #14213D | #22345E |
| Navy raised (block inside the balance card) | #22304F | #2E4272 |
| Text on navy | #F4EFE6 | #F4EFE6 |
| Muted text on navy | #C9BFA8 | #D3C9B3 |
| Brass (lines only) | #A8864B | #B08E55 |
| Row dividers | #EDE5D6 | #27314B |
| Card edges | #E3D9C6 | #2C3752 |
| Button borders | #D9D2C3 | #3B4662 |
| Active navigation pill | #E6E2D6 | #2B3757 |
| Money in | #1E6B3A | #74CC92 |
| Tight | #7A4E00 on #FBF0D9 | #F2C46A on #3B2D0F |
| Short | #A1281E on #FBE4E1 | #FFB2A6 on #4B1D18 |
| Navy as text | #14213D | #F2ECE0 |
| **Text box border** (new) | #7A7365 | #8790A6 |
| **Focus outline** (new) | #14213D | #F4EFE6 |

- Every text pair passes WCAG 2.2 AA at 4.5:1 in both modes. The lowest in dark mode is Ink muted on the active navigation pill, 5.57:1; in light mode the lowest is still Money in on Sunk, 5.35:1.
- The text box border passes 3:1 against Paper, Card and Sunk: 3.86:1 at its lowest in light mode (on Sunk) and 4.40:1 in dark (on Sunk). The focus outline is 3px wide, 2px outside the control, and passes 3:1 against all three: 13.10:1 and 12.28:1 at their lowest.
- `apps/web/test/unit/colours.test.ts` reads the colours from `apps/web/styles/tokens.css` and checks every pair, so a changed colour can't slip through.
- Dark mode follows the phone. The More screen also has Colours: Match this phone, Light or Dark (D173).

Why: DESIGN.md asks for dark mode values and the two lines in Phase 2, for the owner's approval. Dark mode keeps navy and cream: a deep navy page, cream text, and a lighter navy for the balance card and main button so they still stand out.

### D165. What's in Sam's example plan

The three pay weeks in the first point are replaced by four in D196.

Decided 3 Nov 2026 in step 2b. Adds to D15 and D133.

- The example plan is brief 8.1 and 8.2 with the D15 names, exactly the engine's tested fixture, plus Sam's pay profile and his three pay weeks from brief 8.6, linked to his pay as in step 1f, so "I did overtime" works on it in step 2d. None of these changes a figure.
- It has no budgets and no savings goals, because brief 8.2 has none: his food is the monthly "Pay-later card (food)" payment brief 8.2 lists. Whether the example should show a budget and a goal is a question for the owner in `PLAN.md`.
- It lives in `apps/web/data/example-plan.ts`, and a test proves its records are exactly the fixture's. It's saved in the phone's database on first open. Its version is a fingerprint of its records, so whenever they change, every phone replaces its copy the next time the app opens.
- The phone's database keeps each record's place among its kind, so lists come back in the order they were made: the first account added stays first.

Why: the example and the brief's tests stay the same plan (D15), and every figure on Home comes out of the engine, not out of the screen.

### D166. A warning level in a sentence has no ".00"

Decided 3 Nov 2026 in step 2b. Adds to VOICE.md.

A warning level inside a sentence is written in whole pounds when it has no pence: "keep at least £20", "Under £20 from Mon 26 Oct." Every other amount shows its pence: figures, rows and amounts in sentences, such as "Spend no more than £22.54".

Why: the owner's wording for Home and the Home sketch write the warning level as £20, and it's a round number the person chose, while amounts that line up in columns always need their pence (brief Part 6).

### D167. Home looks 3 months ahead

Replaced for Home by D178: Home looks 12 months ahead. The Plan screen still shows 3 months by default.

Decided 3 Nov 2026 in step 2b. Adds to brief 4.8 and 4.9. A question for the owner in `PLAN.md`.

Home works the plan out to the same date 3 months after today, or that month's last day when it's shorter: Sun 25 Oct 2026 looks to Mon 25 Jan 2027. That's the Plan screen's default (brief 4.8: "Three months shown by default"), so Lowest point ahead on Home and on the Plan screen always agree. Left to spend counts to the next payday whatever the view (D143).

Why: the brief doesn't say how far ahead Home's lowest point looks. For Sam it's £4.53 on Sun 1 Nov whichever way, but for a yearly bill, such as Priya's car insurance, it decides whether Home warns months early.

### D168. Home's account, "This pay has to cover" and "Next due"

On payday, D206 adds the pay that came in today to "This pay has to cover".

The third point is confirmed by D179.

Decided 3 Nov 2026 in step 2b. Adds to brief 4.9.

- Home shows one account: the one the main pay arrives in, otherwise the first current account, otherwise the first account. For Sam, his current account.
- "This pay has to cover" is that account's first pay period (D84) from today: "Going out by" its last day, with every row going out in it, transfers out included; and "Coming in", its Came in. It's shown only when the plan has pay periods: with no main pay, or after the main pay stops (D144), there's no pay to cover anything.
- "Next due" is that account's next three rows from today that aren't ticked, coming in or going out, in the plan's order, each with what's left after it and a Tight or Short pill when it's under. A row's second line is its date, with ", estimate" when it is one. Money coming in is green, with a plus sign (brief Part 6). With nothing due, it says "Nothing is due up to Mon 25 Jan 2027.", the last day Home looks at (D167).

Why: brief 4.9 asks for "what this pay has to cover" and "the next three things due" without saying which account or which rows. Sam's figures (£721.07, £500.00, and the three rows) are the owner's.

### D169. The font files

Decided 3 Nov 2026 in step 2b. Adds to D23 and DESIGN.md.

Figtree comes from the Fontsource package (`@fontsource/figtree` 5.3.0), weights 400, 500, 600 and 700, the Latin set only, which has every English letter, the £ sign, the proper minus sign and tabular figures. Next.js serves the files from PrePenny's own site, beside the app's other files, rather than from a `public/fonts` folder as ARCHITECTURE.md 5 sketched. Letters outside the Latin set, such as ł, fall back to the phone's own font.

Why: the files come from one pinned package instead of copies in the repository, and Next.js adds the matching fallback font sizes so the page doesn't jump when Figtree arrives.

### D170. The engine's background worker is built on its own

Decided 3 Nov 2026 in step 2b. Adds to ARCHITECTURE.md 2.8 point 7.

- The worker that runs the engine is built by esbuild into one file before Next.js builds the app (`apps/web/scripts/build-worker.ts`). Its name has a fingerprint of its contents, such as `/engine-worker-913faec53e82.js`, so a page can only ever start the worker it was built with, even while a newer version of the app arrives.
- Home waits up to 20 seconds for an answer. If none comes, or the worker fails, Home says "Your plan couldn't be worked out. Close PrePenny and open it again." instead of waiting for ever.

Why: Next.js's own workers read their settings from the end of their web address. When the offline helper serves the file from the phone, that part is lost and the worker can't start, so Home would fail on every visit after the first. The end-to-end test that opens the app with no signal found it. The fingerprint and the time limit came from the outside review.

### D171. Patched versions for four tool packages

Decided 3 Nov 2026 in step 2b. Adds to D77.

`pnpm audit` found 11 known problems, all in packages used only by the build and test tools (Serwist's build step and Wrangler's local server), none in anything that runs on a phone. `pnpm-workspace.yaml` pins patched versions: zod 4.6.7, undici 7.30.1, glob 14.0.2 and minimatch 11.0.1. `pnpm audit` now finds none, and the build and every test pass.

Why: brief 7.2 asks for a dependency and security check. Each fix is the smallest version that has the patch.

### D172. The exact versions for the app

Decided 3 Nov 2026 in step 2b. Adds to D56 and D77.

Next.js 16.4.3, React and React DOM 19.3.1, Dexie 4.4.7, Serwist 9.5.13, Fontsource Figtree 5.3.0, Playwright 1.64.1, axe for Playwright 4.14.0, Wrangler 4.151.3, esbuild 0.28.2, fake-indexeddb 6.2.6, and the React types 19.3.0, all pinned exactly. Next.js 16.4.4 and 16.4.5 came out on 2 and 3 Nov, so 16.4.3 (23 Oct) is used, and `pnpm audit` lists no problem in it. Node is 24.22.2, as before.

Why: the same rule as D77: the same versions everywhere, changed only on purpose, and nothing brand new.

### D173. Light or Dark on this phone

Decided 3 Nov 2026 in step 2b. Adds to ARCHITECTURE.md 3.8.

More has Colours: Match this phone (the default), Light or Dark. The choice is kept in the browser's own small store on this phone, not in the plan's database, so the page is drawn in the right colours from the very first moment.

Why: the plan's database opens a moment after the page appears, so a choice kept there would flash the wrong colours first.

### D174. The offline note, while nothing is sent anywhere

Decided 3 Nov 2026 in step 2b. Replaces the offline note's wording in ARCHITECTURE.md 4.5 until Phase 3.

Until Phase 3, the offline note says "You're offline. PrePenny keeps working with what's on this phone." From Phase 3, when changes are sent to the server, it says what ARCHITECTURE.md 4.5 has: "You're offline. Changes are saved on this phone and will be sent when you're back online."

Why: in Phase 2 nothing is sent anywhere, so saying changes "will be sent" wouldn't be true. It doesn't say "your plan is saved" either: the example isn't the person's plan, and in some private windows nothing can be saved.

### D175. Smaller choices on Home and the parts

Decided 3 Nov 2026 in step 2b. Adds to DESIGN.md and the Home sketch in ARCHITECTURE.md 4.6.

- Home's top line is the PrePenny name, as in the approved sample; "Home" is its heading for screen readers. The sample's "?" help button waits for the help sheets in Phase 4 (brief 4.16).
- A row's Tight or Short pill sits under "£12.54 left", so the row fits at 320px.
- The balance and the lowest point grow with the phone's text size, up to the widest they can be on one line in their card, worked out from Figtree's own character widths. At 200% text the lowest point reaches its full 60px, and the balance reaches 63px at 320px wide and 73px at 360px, where 92px wouldn't fit on one line.
- The actions are always 2 by 2, on a phone or a laptop, unless big text needs the room: then each has its own row.
- When something goes wrong while drawing a screen, PrePenny shows its own screen, "This screen couldn't be shown", with "Try again" and "Go to Home", and no details of the problem.
- Spacing keeps to DESIGN.md's 4px scale, so the sample's 10px and 11px gaps are 12px, and Left to spend's amount is 17px, the section heading size, where the sample had 18px.
- A page at `/app/parts/`, not linked from the app, shows every part with the example's figures, including a Short lowest point worked out by the engine (D69's case), the undo bar, the offline note and a sheet, for checking the look. It's removed before launch.
- Hosting: Cloudflare serves the built files as they are, with a security policy that allows no script, font or connection from anywhere but PrePenny's own site. Next.js's own small scripts are written into each page, so the policy has to allow scripts written into pages; listing each one instead is for Phase 4. A pull request's preview link is `pr-<number>-prepenny.<your workers.dev name>.workers.dev/app/`.
- The live app is updated from `main` only after GitHub's checks have passed on that exact commit. The very first time, before anything is merged, a pull request's version also goes live once, but only when Cloudflare says the app doesn't exist yet; any other problem stops the workflow with Cloudflare's own message. The Cloudflare key is given only to the steps that use it.

Why: each follows the sample, DESIGN.md or the brief where they didn't say exactly, and keeps every screen working at 320px and at 200% text (D37). The last five points came from the outside review.

## From the owner's review of step 2b

D176 to D182 were agreed by the owner on 3 Nov 2026, answering the seven questions left at the end of step 2b (all but the Cloudflare set-up, which is still waiting). They were built in step 2c, or are built in the step named.

### D176. Dark mode colours, the text box border and the focus outline: approved

Agreed 3 Nov 2026, from the owner's review of step 2b. Approves D164 as proposed.

The dark mode colours in D164, the text box border (#7A7365 light, #8790A6 dark) and the focus outline (#14213D light, #F4EFE6 dark, 3px wide, 2px outside the control) are approved. They're DESIGN.md's dark mode, and every text box from step 2c on uses them.

Why: the owner approved them.

### D177. The icon marks its lowest point with a brass dot

Agreed 3 Nov 2026, from the owner's review of step 2b. Adds to the icon in step 2b.

The icon stays: a navy square with a cream penny and a navy line that dips and rises again. A small brass dot sits at the bottom of the dip, so the line reads as "lowest point", not a tick or a smile. It's checked at 48px, the size of an icon on a phone's home screen. Brass is a line and border colour in DESIGN.md; here it's a mark in a drawing, not text, so it doesn't need text contrast.

Why: the owner's answer.

### D178. Home looks 12 months ahead

Agreed 3 Nov 2026, from the owner's review of step 2b. Replaces D167's 3 months for Home. The Plan screen still shows 3 months by default (brief 4.8).

- Home's lowest point, its first day under the warning level, its shortfall and Next due look 12 months ahead: to the same date 12 months after today, or that month's last day when it's shorter. Sun 25 Oct 2026 looks to Mon 25 Oct 2027.
- Sam's Home still shows £4.53 on Sun 1 Nov.
- Left to spend still counts to the day before the next payday (D143), and "This pay has to cover" is still this pay period (D168).

Why: the owner's answer, so a yearly bill is never missed.

### D179. Next due includes money coming in: confirmed

Agreed 3 Nov 2026, from the owner's review of step 2b. Confirms the third point of D168.

Next due lists the next three rows, money coming in as well as going out, each with the payment's full name, never shortened.

Why: the owner confirmed it.

### D180. Sam's example stays exactly as the brief: confirmed

Agreed 3 Nov 2026, from the owner's review of step 2b. Confirms the second point of D165.

The example has no budget and no savings goal, so it always matches the tests (D15). The Budgets and Savings goals screens (step 2f) show what they say when there are none.

Why: the owner confirmed it.

### D181. Closing an account that's overdrawn

Agreed 3 Nov 2026, from the owner's review of step 2b. Adds to D158. Built in step 2f, with the account screens.

When an account ends today below £0.00, the account sheet offers one tap the other way to D158: "Move £3.12 into it from another account first". That adds a transfer today from an account the person picks into this one, for the whole amount it's under. Then the account can be closed. The engine refuses to close it until it shows £0.00 (D158).

Why: the owner's answer. Money owed never quietly drops out of the plan either.

### D182. The example can be changed on this phone, and started again

Agreed 3 Nov 2026, from the owner's review of step 2b. Adds to D15, D133 and D165. The points after the first were decided in step 2c.

- Sam's example can be changed to try things out. Every change is saved on this phone only, like any change, and is never sent anywhere.
- More has "Start again with the example". It asks once more ("Your changes to the example will go."), then puts the example back exactly as it is in the app, and clears the undo.
- Decided in step 2c: an example that has been changed is kept when a new version of the app brings a changed example (D165). It's replaced only by "Start again with the example". An example that hasn't been changed is still replaced straight away, as before.
- Decided in step 2c: today is still Sun 25 Oct 2026 in the example (D133), so ticks and moves are worked out for that day. The time stored with a tick is the phone's own clock, which only orders it after the example's balance update (D33).

Why: the owner's answer. Someone trying the example shouldn't lose what they tried because the app was updated.

## Made during step 2c

D183 to D189 were decided on 3 Nov 2026 while building step 2c. Questions for the owner are in `PLAN.md`.

### D183. The Plan screen shows whole periods, and its lowest point looks as far as Home's

How the periods are shown is replaced by D211, and the lowest point card and the account switch by D209 and D210, on the Coming up page (D208). Whole periods, and how far the lowest point looks, stay.

Decided 3 Nov 2026 in step 2c. Adds to brief 4.8, D84 and D178.

- Three months at first, and "Show another month" adds one, up to 24 (brief 4.8).
- Pay periods: every pay period up to the date that many months after today, the last one in full, so "Left at the end" is always the true end of a period. Sam on Sun 25 Oct, 3 months: to Thu 28 Jan 2027. Each month added shows at least one more period, so "Show another month" never does nothing: Dee, paid on the 28th, on Wed 25 Nov sees to Wed 27 Jan 2027 with 1 month and to Thu 25 Feb 2027 with 2.
- Calendar months: the month with today in it and the next ones, that many in all: October, November and December for 3 months. Each shows its rows from today on (D84).
- The first pay period is headed "Today to Thu 29 Oct", because its rows start today; the sketch's "This week" wouldn't be true for monthly pay. The others are "Fri 30 Oct to Thu 5 Nov", and months are "October" or "January 2027".
- "Lowest point ahead" at the top looks as far as Home does, 12 months (D178), or as far as the plan is shown when that's further. So up to 12 months shown, Home and the Plan screen always show the same lowest point; with more shown, the Plan screen also looks at the months beyond. The row it's after says "Lowest point ahead" when it's on screen.
- One account at a time, Home's account first (D168), with a switch between the open accounts.
- "Not ticked yet" is above the periods, and only there when something is in it (D11).

Why: brief 4.8 asks for three months and up to 24, but a period cut off part of the way through would show a "Left at the end" that isn't the end. The owner's test 2 lists October, November and December, then January and February after two taps.

### D184. Filters only hide rows

The Filters button, "Showing only" and "Clear filters" are replaced by the View sheet (D210). What's shown still only hides rows.

Decided 3 Nov 2026 in step 2c. Adds to brief 4.8.

- Show: Everything, Still to pay (going out and not ticked), Money in (coming in, money moved in from another account included), or Debt payments (linked to a debt, or of the type Debt, D79). And a type: all types, or one of the eight (D79). Together, a row has to match both.
- Every figure stays the whole plan's: Came in, Left after this, Left at the end and the lowest point are worked out from every row, so a filter never changes a number. A period with nothing that matches says "Nothing here matches the filters."
- "Showing only: Debt payments." and "Clear filters" sit under the Filters button while any filter is on.
- The account is the switch at the top, not one of the filters.

Why: a number that changed with a filter would no longer match the bank (brief Part 3, principle 1).

### D185. Typing the real amount of an estimate

Decided 3 Nov 2026 in step 2c. Adds to brief 4.3 and 8.4 test 3.

When the amount of an estimate is changed for just this one, "This is an estimate" unticks itself, because the real amount has arrived, and the sheet says how far it is from the estimate: "£21.54 more than the estimate." The person can tick the box again. For this and all later ones the box stays as it was, because a new amount for paydays still to come is still an estimate.

When the real amount is the same as the estimate, the person unticks the box and saves: the amount shown is saved as the real amount, so it stands from then on. For a pay-later bill this matters: until a real amount is typed in, the bill follows what's spent (D111).

Why: brief 4.3 says the person types the real amount when pay lands and sees the difference, and brief 8.4 test 3 (the owner's step 2c test 4) expects the payday to lose its Estimate label.

### D186. The undo bar

Decided 3 Nov 2026 in step 2c. Adds to brief Part 3, principle 4, D87 and ARCHITECTURE.md 4.5.

- After every change the bar says what changed: "Rent changed for this and all later ones.", "Driving lesson moved to Fri 30 Oct.", "Family loan marked as paid.", "Driving lesson skipped.", "Rent removed for this and all later ones." and so on, with Undo. One tap undoes the whole change (D87), then it says "Change undone."
- It stays until the next change, or until the person goes to another screen. There's no time limit, so nobody has to be quick (WCAG 2.2.1).
- After Undo, focus moves to the bar's words, because the Undo button has gone. Each message is read out by screen readers, even the same words twice in a row, and a row that gets focus is never hidden behind the bar.
- Undo takes back the change the bar names. If a newer change has been made since, it says so: "A newer change has been made since, so this one can no longer be undone here."
- Once the phone's database has failed, nothing more is saved there until PrePenny opens again or the example starts again, so a plan is never saved half one way and half another.
- Only the last change can be undone from the bar. Older changes will be in Activity (brief 4.12).
- When an undo is refused, the bar says why: "This can't be undone, because something it changed has been changed again since."
- When the phone can't save a change, as in some private windows, the bar says: "This phone couldn't save it, so it will go when PrePenny closes."

Why: brief Part 3, principle 4 asks for undo straight after any change, and a bar that vanished on a timer would be missed by someone slow to read it.

### D187. What the Plan screen remembers

Decided 3 Nov 2026 in step 2c. Changes ARCHITECTURE.md 3.8, which planned to keep the filters and the number of months on the phone.

Pay periods or Months is kept on this phone, like Light or Dark (D173). The filters, the extra months and the account chosen are kept while PrePenny is open, and go back to the start the next time it opens: everything, 3 months, Home's account.

Why: the plan should always open the way brief 4.8 describes it, with nothing hidden by a filter set days ago.

### D188. The edit sheet

Decided 3 Nov 2026 in step 2c. Adds to brief 4.4 and 5.4 and the edit sketch in ARCHITECTURE.md 4.6.

- At the top: the payment's name, its date and account ("Sun 1 Nov, Current account", or "Wed 28 Oct, Savings to Current account" for money moved between accounts), the amount, and what's left after it with Tight or Short.
- Quick actions: Mark as paid, or Mark as not paid once it's ticked. Move to next payday, saying where it goes ("Moves it to Fri 6 Nov"); it isn't offered for money coming in, where it would put two paydays on one day, or once a payment is ticked. Skip this one.
- Change it: the amount (after a £), the date (with the date written PrePenny's way under the box, because each phone shows the box its own way), name, note and "This is an estimate". Then "Just this one" or "This and all later ones", and for pay with a pattern and a new amount for later ones, "Every payday from now" or "Only this week of the pattern" (D97). Only what was changed is sent (D60, D93). Saving with nothing changed says "Change something first, then save."
- Remove asks "Remove just this one" or "Remove this and all later ones", with "Don't remove it".
- A pay-later card's bill can be changed one bill at a time only (D111), money set aside can only be ticked (D116), and a budget's own rows are changed on the budget (step 2f).
- A mistake is explained beside its box ("Type an amount, for example 25."), and a refusal beside what was tapped (D189).
- A ticked payment's row says so: "Sun 25 Oct, paid".
- Focus goes into the sheet. Escape and Close put it back on the row. After a change it goes back to the row, or to Undo when the row has gone.
- Rows in Home's Next due open the same sheet.
- New ids are made on the phone as UUID version 7 (ARCHITECTURE.md 3.3), and the time stored with a tick is the phone's own clock (D182).

Why: these follow the brief and the sketch where they didn't say exactly.

### D189. The engine's refusals, in words

Decided 3 Nov 2026 in step 2c. Adds to D87 and D149.

The edit sheet never shows the engine's code. Each code people could meet has a sentence in the strings file:

| Code | What the sheet says |
| --- | --- |
| `ticked` | One of these payments is ticked as paid. Untick it first. (D92) |
| `already-ticked` | This payment is already ticked as paid. |
| `not-ticked` | This payment isn't ticked as paid. |
| `already-removed` | This payment is already removed. |
| `no-main-pay` | There's no main pay in the plan, so there's no next payday to move it to. |
| `no-next-payday` | There's no payday after this one in the plan, so it can't move to the next payday. |
| `date-before-earlier-payment` | Choose a date after the payment before this one. (D91) |
| `date-after-later-payment` | Choose a date before the next payment. (D96) |
| `date-not-in-schedule`, `dates-dont-fit` | Choose a date that fits how often it repeats. |
| `changed-since` | This can't be undone, because something it changed has been changed again since. |
| `budget-bills` | This is a pay-later card bill. To change later bills, change the budget. (D111) |
| `shared-half` | This half of a transfer has no name or note of its own. (D94) |
| `no-pattern` | This pay doesn't follow a pattern. Choose every payday from now. |
| `patterns-differ` | The pay pattern has changed part of the way along. Choose every payday from now. (D97) |
| `not-last-change` | A newer change has been made since, so this one can no longer be undone here. (D186) |
| anything else | That change couldn't be made, so nothing was changed. Try again. |

Why: CLAUDE.md asks for plain English, and a code means nothing to someone tired at 11pm.

## From the owner's review of step 2c

D190 to D195 were agreed by the owner on 3 Nov 2026, answering the six questions left at the end of step 2c. D190's tap is built in step 2d.

### D190. The Plan screen's lowest point looks 12 months ahead, and tapping it shows those months

The button's words are replaced by D209: "Show everything up to Thu 1 Jul 2027". Tapping it now also opens the payday it's in.

Agreed 3 Nov 2026, from the owner's review of step 2c. Confirms D183's lowest point and adds to it. Built in step 2d.

- The Plan screen's lowest point looks 12 months ahead, the same as Home's (D178), or further when more months are shown (D183).
- When it falls after the months shown, the line under "Lowest point ahead" is a button with "Show the plan up to Thu 1 Jul 2027" under it. Tapping it shows the months up to that date, counting this month: 10 months from Sun 25 Oct 2026 for Thu 1 Jul 2027, at most 24. Focus then goes to the row it's after, which says "Lowest point ahead".
- When it's in the months shown, nothing changes: the line isn't a button.

Why: the owner's answer. The two screens always agree on the lowest point, and the Plan screen shows it with one tap.

### D191. "Today to Thu 29 Oct": confirmed

Agreed 3 Nov 2026, from the owner's review of step 2c. Confirms D183's heading for the first pay period.

Why: the owner confirmed it.

### D192. Typing the real pay: confirmed

Agreed 3 Nov 2026, from the owner's review of step 2c. Confirms D185.

Typing the real amount of an estimate for just this one takes off the Estimate label, and the sheet says "£21.54 more than the estimate."

Why: the owner confirmed it.

### D193. No "Move to next payday" for money coming in: confirmed

Agreed 3 Nov 2026, from the owner's review of step 2c. Confirms D188.

Why: the owner confirmed it. Moving pay to the next payday would put two paydays on one day.

### D194. What the Plan screen remembers: confirmed

Agreed 3 Nov 2026, from the owner's review of step 2c. Confirms D187.

Filters and extra months go back to the start each time PrePenny opens. Pay periods or Months is kept on the phone.

Why: the owner confirmed it.

### D195. Cloudflare is set up

Agreed 3 Nov 2026, from the owner's review of step 2c. Completes D68 and D175.

The owner set up Cloudflare. The live app is at https://prepenny.prepenny.workers.dev/app/, and each pull request gets its own preview link, posted on it by the Deploy workflow (step 2c's pull request got one). README.md has the link.

Why: the owner's answer.

## Made during step 2d

D196 is the owner's instruction for step 2d. D197 to D203 were decided on 3 Nov 2026 while building step 2d. Questions for the owner are in `PLAN.md`.

### D196. Sam's example has his four pay weeks, one for each step of his pattern

The owner's instruction for step 2d, 3 Nov 2026. Replaces D165's three pay weeks.

- The example has Sam's pay profile and four pay weeks, from his payslips for weeks 26 to 29 in brief 8.6, linked to his pattern's steps as D5 says: steps 1 and 3 are 3-shift weeks, steps 2 and 4 are 4-shift weeks.
  - Rota week 1, 3 shifts: 34.5 hours at £12.71, shift premium £114.69 (week 26).
  - Rota week 2, 4 shifts: 46 hours at £12.71, shift premium £210.23 (week 27).
  - Rota week 3, 3 shifts: 34.25 hours at £12.71, shift premium £142.29 (week 28).
  - Rota week 4, 4 shifts: 46 hours at £12.71, shift premium £172.01 (week 29).
- Week 29's 11.5 hours of overtime aren't in its lines: overtime is what "I did overtime" adds, so the pay week is the usual week. Before, step 4 used week 27's lines.
- Overtime is at £19.07, remembered on the pay profile, and each payday covers work up to the Sunday 5 days before it (D131), as before.
- The engine's fixture has the same four weeks, so the example is still exactly the tested plan (D165). No figure changes: every brief 8.3 test passes, and so do the owner's overtime figures (+£155.12 on Fri 6 Nov, −£100.43 on Fri 13 Nov), which fall on steps 2 and 3.
- The pattern's amounts stay as the owner typed them. For step 4 the tax tables give £592.03 from week 29's lines, against the pattern's £592.17: the pattern is Sam's own estimate, and only overtime and missed shifts use the pay weeks.

Why: the owner's instruction. Each payday's overtime is worked out from the week it really is.

### D197. Update balance

Decided 3 Nov 2026 in step 2d. Adds to brief 4.2, D33, D46, D87 and the Update balance sketch in ARCHITECTURE.md 4.6.

- Step 1: the account, Home's first (D168), and "Type what your bank shows now". A balance below zero is typed with a minus sign, or with "It's overdrawn, below £0.00" ticked, because a phone's number keyboard often has no minus key.
- The balance is for today. Typing a balance from an earlier day isn't offered; that's a question for the owner in `PLAN.md`.
- Step 2: "The plan expected £604.53 by the end of today." (D46), "Your bank shows £600.00." and "That's £4.53 less.", "That's £4.53 more." or "They match."
- Step 3: every payment, pay-later bill and money set aside for that account dated today or earlier and not ticked, oldest first, in the plan's order. Budget rows and spends aren't listed, because they're never ticked (D109). Each box starts unticked, so nothing is ticked without a tap; "Tick all" ticks them all, then says "Untick all". Whether they should start ticked is a question for the owner.
- Done saves the new balance with everything ticked as one change, with each tick marked as made inside the update, so one Undo takes all of it back (D33, D87). The time stored is the phone's clock (D182).
- Then: "Balance updated", "£600.00, Fri 30 Oct, 9:14am", how many were ticked, and the account's new lowest point ahead with Tight or Short. The undo bar says "Current account balance updated, and 7 payments ticked."
- Each step's heading takes focus, and Back goes to the step before.

Why: these follow the brief and the sketch where they didn't say exactly. Ticking needs the person's own tap, because a tick says the money really went.

### D198. I spent

With no budgets, D207 adds "Add a budget" once the Budgets screen exists (step 2f).

Decided 3 Nov 2026 in step 2d. Adds to brief 4.5, D2, D115 and D119.

- Pick the budget (when there's more than one), type how much, and it's saved for today. The date can be changed to an earlier day, never a later one (D119).
- The sheet shows that budget's week or month: "This week, to Thu 29 Oct", Spent and Left, and "£25 + £7 from last time" when something rolled over (D30). With an amount typed: "With this: £10.00 spent, £15.00 left." A spend dated before this week or month says it goes in an earlier one.
- The undo bar says "£6.00 spent on Travel. This week: £10.00 spent, £15.00 left."
- With no budgets, the sheet says "There's no budget to spend from yet. Budgets, such as Travel at £25 a week, come with the Budgets screen, which is still being built." The Budgets screen is built in step 2f, and the words change then to say where it is.
- A spend's amount must be above zero (D115). No note is asked, to keep it to two taps.

Why: brief 4.5 asks for "I spent" in two taps with spent and left for the week or month.

### D199. Add a payment

Decided 3 Nov 2026 in step 2d. Adds to brief 4.3 and 4.4, D86, D150 and D160.

- Going out, Coming in, or Between accounts (only with two accounts or more), then the name, amount and account.
- "Next payment" starts at today. A date before today says "Pick today or a later date. If it's already gone, update your balance instead." (D150), and the engine refuses it too.
- How often: once; every 1 to 52 weeks, on the next payment's weekday ("Every 2 weeks, on a Tuesday."); every 1 to 12 months; or on chosen dates. For monthly, the choices come from the next payment's date, so the next payment is always the date typed: "The 13th of the month", "The second Friday of the month", "The last Friday of the month" in a month's last 7 days, "The last day of the month" on the last day, and "The last working day of the month" on that day, which then hides the weekend rule (D145). Months can be left out, but not the next payment's month. Chosen dates are the next payment and the dates added after it, each once.
- When it ends (for weekly and monthly only): never, after a number of payments, or on a date. A different last amount only when it ends (D78).
- The weekend and bank holiday rule, the type (D79: it starts as Other, or Savings between accounts), a debt it pays off (money going out only, D98) or a savings goal whose account it moves money into or out of (D114), never a budget (D160), "This is an estimate" and a note.
- Every mistake is explained beside its box, and focus goes to the first one. The undo bar says "Car MOT added."
- Not offered here: an irregular weekly estimate, a pay pattern and money set aside. Setup asks for those (step 2e).

Why: these are the choices brief 4.3 and 4.4 list, in the order a person thinks of them, with the monthly choices tied to the date so the "Next payment" is never a different day from the one typed.

### D200. I did overtime and I missed a shift

The "Overtime" or "Missed a shift" switch is replaced by D213's question: "What happened?" with "I worked extra hours" and "I missed a shift".

Decided 3 Nov 2026 in step 2d. Adds to brief 4.3, D5, D44, D124, D130, D131 and D140.

- One sheet, opened by Home's "I did overtime", with "Overtime" or "Missed a shift" at the top. Its title follows the choice.
- The day starts as today and can be any day. The hours start as the hours of the last one saved of that kind. Overtime and a missed shift each keep their own hours and rate while the sheet is open, and choosing another pay starts from that pay's own.
- The rate is remembered: overtime uses the rate of the last overtime saved, or the pay profile's (£19.07 for Sam), shown as "At £19.07 an hour." with "Change the rate". A missed shift uses the pay week's basic rate (D123), shown the same way. Remembering the rate this way needs no second change, so one Undo takes the shift back.
- Before saving, the engine makes the change on a copy of the plan and the sheet says what it does: "This adds £155.12 to your pay on Fri 6 Nov, making it £773.58." or "This takes £100.43 off your pay on Fri 13 Nov, making it £368.63." Save makes exactly that change. The undo bar says "Overtime added. Your pay on Fri 6 Nov goes up by £155.12."
- The box for extras shows only when that payday's pay week has extras, such as a shift premium (D130). It stays while the hours or extras are typed, and goes, with anything typed in it, when the day moves to a payday without them.
- With no pay details, the sheet says they come with the pay calculator (step 2g). A payday with no saved pay week gets the engine's refusal in words; asking once for the usual hours and rate (D5) is for setup and the pay calculator.
- Refusals in words: a payday with its real pay in (D44), no payday for that day, no pay week, no rate, and too much in extras.

Why: brief 4.3 asks for two taps, the rate remembered, and the payday's new balance. Working it out on a copy means the sheet never shows a figure that Save wouldn't make.

### D201. A test-only "today" and test plan

Decided 3 Nov 2026 in step 2d, from the owner's instruction for the tests.

- The end-to-end tests can set another today (Fri 30 Oct for brief 8.4 test 5) and a plan to use in place of the example (the example with a Travel budget), in `apps/web/lib/test-setting.ts`.
- It's read only in a browser driven by test software, which says so with `navigator.webdriver`, from a value the tests put on the page before PrePenny starts. People's own browsers never set it, and nothing on screen, no web address and nothing stored on the phone turns it on.
- A test plan is treated as the example: the banner says so, and changes made in a test are kept until the test ends.

Why: the owner asked for a test-only setting the real app can't reach. The tests use the same build that's put online, so the setting can't be left out of it; checking for test software keeps it out of reach.

### D202. "PrePenny has been updated. Tap to reload."

Decided 3 Nov 2026 in step 2d, from the owner's instruction.

- When a new version of PrePenny has arrived on the phone and taken over, a small note shows at the bottom, above the undo bar: "PrePenny has been updated. Tap to reload." Tapping it loads the new version straight away. Screen readers hear it appear.
- The very first time PrePenny is put on a phone isn't a new version, so no note shows then.
- PrePenny also looks for a new version each time it comes back on screen, because a phone can keep it open for days.
- The new version still takes over as soon as it arrives, as before; the note says the screen open now is the old one.

Why: the owner's instruction. Without it, someone could keep using an old screen for days after an update.

### D203. Smaller choices in step 2d

Decided 3 Nov 2026 in step 2d.

- Every sheet uses the same boxes and styles as the edit sheet (D188): a label above each box, a hint or the mistake under it, the date written PrePenny's way under each date box, and an amount after a "£".
- A sheet starts afresh each time it opens, with the plan's figures worked out again then, never the ones from the last time it was open. Closing it puts focus back on its button (WCAG 2.4.3).
- Every mistake moves focus to its box, or to the choice in a group, and is read out with it.
- The engine's random test of every command (step 2a's owner test 3) also runs one fixed case that adds an account and then closes it. Random runs alone made a close about 1 time in 20 too few, so the test failed by chance on GitHub; its checks are unchanged.
- Amounts in the sheets' sentences have no plus or minus sign, so a line never breaks between "+" and "£" on a 320px screen.
- Months to leave out are in two columns, so "September" fits at 320px.

Why: the same look everywhere (DESIGN.md), and every screen works at 320px (D37).

## From the owner's review of step 2d

D204 to D207 were agreed by the owner on 4 Nov 2026, answering the four questions left at the end of step 2d. D206 was built in step 2d-2; D207 is built in step 2f.

### D204. Update balance's tick boxes start unticked: confirmed

Agreed 4 Nov 2026, from the owner's review of step 2d. Confirms the third point of D197.

In Update balance's third step, every payment starts unticked, and "Tick all" ticks them all at once.

Why: the owner confirmed it. A tick says the money really went, so it needs the person's own tap.

### D205. Update balance records today's balance only, for now

Agreed 4 Nov 2026, from the owner's review of step 2d. Answers the question in the second point of D197.

Update balance records the balance for today. A balance from an earlier day, such as last night's, isn't offered for now. It can come later if people ask for it; the engine already works one out correctly (D138).

Why: the owner's answer.

### D206. On payday, "This pay has to cover" shows the pay that came in today

Agreed 4 Nov 2026, from the owner's review of step 2d. Answers the question about D168 and adds to it. Built in step 2d-2. The points marked "decided in step 2d-2" weren't in the owner's answer.

- On payday, "This pay has to cover" shows the pay that came in today, such as "Pay £603.06, came in today", and what it has to cover until the day before the next payday: "Going out by Thu 5 Nov". It never says "Coming in £0.00" on payday.
- Decided in step 2d-2: before the pay is ticked, the line says "Pay £603.06, coming in today", because the bank may not show it yet. Once it's ticked, in Update balance or on the edit sheet, it says "came in today".
- Decided in step 2d-2: the pay is the main pay landing in Home's account today (D81, D168), after any weekend rule or move, with any overtime while it's an estimate. "Coming in" still shows when other money comes in during that pay, such as money moved from savings, and today's pay isn't counted in it again.

Test: on Fri 30 Oct, after brief 8.4 test 5 (£600.00 and Tick all), Home says "Pay £603.06, came in today" and "Going out by Thu 5 Nov £600.00", with no "Coming in". After Undo it says "Pay £603.06, coming in today".

Why: the owner's answer. On payday the pay is what everything until the next one is paid from, and "Coming in £0.00" read as if no pay had come.

### D207. "I spent" with no budgets offers "Add a budget", once budgets can be added

Agreed 4 Nov 2026, from the owner's review of step 2d. Answers the question about D198. Built in step 2f.

Once the Budgets screen exists (step 2f), "I spent" with no budgets offers "Add a budget", which opens the budget form straight away. Until then the sheet says what D198 says.

Why: the owner's answer. Someone who wants to record a spend shouldn't have to go looking for where budgets are made.

## The owner's instructions for step 2d-2

D208 to D214 are the owner's instructions for step 2d-2, given on 4 Nov 2026 after finding the Plan page hard to understand: its two switches looked like four unlabelled buttons, and the page didn't say what it's for. The design is the "Coming up" board, with the View sheet on the "Option 2: what View opens" board, at https://claude.ai/artifact/WHH7uQgMVdBkAMBCBJ2qek. The points marked "decided in step 2d-2" weren't in the owner's instructions.

### D208. The Plan page is called "Coming up"

The owner's instruction for step 2d-2, 4 Nov 2026. Replaces the brief's name for this tab (brief Part 6, ARCHITECTURE.md 4.3) and the bottom navigation in DESIGN.md.

- The tab and the page are called "Coming up", everywhere the app says "Plan". The bottom navigation is Home, Coming up, Debts, More, with the list icon from the board.
- Decided in step 2d-2: the page's address is `/app/coming-up/`, and an old link to `/app/plan/` goes there (`public/_redirects`, which Cloudflare reads). "Plan" meaning the whole money plan stays, as in "the example plan" or "Your plan couldn't be worked out". Home's link under Next due says "See everything coming up".

Why: the owner's instruction. "Coming up" says what the page shows.

### D209. The top of the Coming up page

The owner's instruction for step 2d-2, 4 Nov 2026. Replaces the lowest point card of D183, and the button words of D190, on this page.

- The heading "Coming up", and under it: "Your bank shows money that's gone. This shows money that's going to go, and what you'll have left each time."
- An account card with the account's name and balance: "Current account", "£267.54, checked today". A "Switch account" button only when there's more than one account.
- One line saying what's showing, such as "By payday, showing everything", with a "View" button (D210).
- One line for the lowest point ahead, looking 12 months ahead (D178, D190), such as "Lowest point: £4.53 on Sun 1 Nov, after Rent", marked Tight or Short. Tapping it opens the payday it's in.
- "Not ticked yet", when there is anything in it (D11).
- The example banner stays as it is: "This is an example plan. Nothing here is yours."
- Decided in step 2d-2: the first warning stays under the lowest point, "Under £20 from Mon 26 Oct." or "£95.47 short on Sun 1 Nov.", because brief 4.8 asks for the first day under the warning level and principle 7 for a shortfall's amount and date. Then words say what a tap does (D213): "Open Fri 30 Oct below", "See it below, in this pay", or, when it's after the months shown, "Show everything up to Thu 1 Jul 2027" (D190). Focus then goes to the row it's after. When the lowest point is today's balance before any payment, there's nothing to open, so it isn't a button.
- Decided in step 2d-2: "Switch account" opens a sheet with one button for each account, with its balance, and "Showing now" on the one shown. Choosing one closes the sheet and focus goes back to "Switch account". The account's name is a heading, for screen readers.

Why: the owner's instruction. The page says what it's for, which account it shows and what's showing, in words.

### D210. The View sheet

The owner's instruction for step 2d-2, 4 Nov 2026. Replaces the Pay periods or Months switch and the account switch (D183), and the Filters sheet with "Clear filters" (D184).

- "View" opens a sheet with "Group payments" (By payday, By calendar month) and "Show" (Everything, Still to pay, Money coming in, Debt payments, One type).
- Decided in step 2d-2: "One type, such as Bills" shows "Which type", with the eight types (D79), starting on Bills. Show is one choice of the five: a type no longer combines with another choice. Every choice applies at once, so the sheet's button says "Done". Its sentence (D213): "Choose how payments are grouped, and which ones to show."
- Decided in step 2d-2: beside "By payday" are the days a pay runs, "Fri to Thu", for pay every week or every few weeks ("Mon to Sun" for irregular pay, D14). Monthly pay has none, because its days change from month to month. With no main pay it says "By payday needs a main pay, so payments are grouped by calendar month." (D84).
- What's shown still only hides rows; every figure is worked out from the whole plan (D184). The line at the top says "showing everything", "showing only what's still to pay", "showing only money coming in", "showing only debt payments" or "showing only Bills". By payday or by calendar month is kept on the phone, and what's shown while PrePenny is open (D187, D194).

Why: the owner's instruction. The old switches looked like four unlabelled buttons.

### D211. This pay open, and each later payday as one line

The owner's instruction for step 2d-2, 4 Nov 2026. Replaces how D183 shows the periods.

- "This pay, until Thu 29 Oct" is open, with every payment and what's left after it, then "Left at the end".
- Under "Next paydays", with "Tap one to see every payment in it.", each later payday is one line: its date, the pay coming in ("Pay £603.06 in"), and the lowest it gets in that pay ("Lowest £4.53"), marked Tight or Short when it is. Tapping a line opens it in place to show every payment and "Left at the end"; tapping again closes it.
- Grouped by calendar month it works the same way: "This month, until Sat 31 Oct" open, and later months one line each under "Next months": "November", "January 2027".
- "Show another month" still adds more, up to 24 months (D183).
- Decided in step 2d-2: "Pay £603.06 in" is the main pay arriving in that account in that pay or month, with any overtime while it's an estimate. When none arrives there, as in Savings, the line says what else comes in, "£150.00 coming in", or "Nothing coming in". A separate "Came in" total (D84) isn't shown any more: the pay is on the line, and any other money coming in is a row with a plus.
- Decided in step 2d-2: "Lowest" is the lowest end-of-day balance in that pay from today on, the same way the lowest point ahead is worked out (D85).
- Decided in step 2d-2: each line is a button inside a heading, and tells screen readers whether it's open; the payments it opens are a part of the page named after it. An arrow beside it points right when it's closed and down when it's open. The paydays opened are kept while PrePenny is open, like the months shown (D187); choosing another grouping or another account closes them. After the main pay stops (D144), later lines are named by month.

Why: the owner's instruction. One open pay and a short line for each later one shows months ahead on one screen.

### D212. How to read this

The owner's instruction for step 2d-2, 4 Nov 2026.

- On the first visit, a card titled "How to read this" with these points and a "Got it" button. After "Got it" it doesn't come back by itself, but a "?" beside the heading opens it again.
  - This pay shows every payment from today until the day before your next payday.
  - Each line under Next paydays is one later pay. Tap it to see its payments.
  - A minus (−£30.00) is money going out. A plus (+£500.00) is money coming in.
  - "Left" is what will be in your account after that payment.
  - "Tight" means under the amount you want to keep. "Short" means you'd run out of money.
  - Tap any payment to change it, move it or skip it.
- Decided in step 2d-2: grouped by calendar month, the first two points say "This month shows every payment from today until the end of the month." and "Each line under Next months is one later month. Tap it to see its payments.", so the card always matches the page.
- Decided in step 2d-2: "Got it" is remembered on this phone only, like Light or Dark (D173). In a private window that keeps nothing, the card shows again the next time. The "?" says "How to read this" to screen readers, and whether the card is open; tapping it while the card is open closes it too. After "Got it", focus goes to the "?". The card has a thin brass edge, as in the sample (DESIGN.md: brass for lines and borders only).

Why: the owner's instruction. Someone new sees how to read the page once, and can always find it again.

### D213. Each screen says what it's for, and every control says what it does

The owner's instruction for step 2d-2, 4 Nov 2026. A rule for every screen from now on, added to `docs/DESIGN.md` and `docs/VOICE.md`.

- Each screen starts with one plain sentence saying what it's for, so a 16-year-old understands it straight away. Every control says in words what it does. No switch whose options look like separate buttons.
- Checked and fixed in step 2d-2, as the owner asked:
  - Home: "How much you have, how much you can spend, and what's due next."
  - Debts: "What you owe, and the date each debt will be paid off.", then "This page is still being built."
  - More: "Settings for PrePenny on this phone.", then "Help and your account are still being built."
  - The four sheets from step 2d, each under its title. Update balance: "Tell PrePenny what your bank shows now, so everything ahead starts from the right amount." I spent: "Write down what you've spent from a budget, to see what's left in it." Add a payment: "Add a payment that's coming up, once or every so often." I did overtime: "Tell PrePenny about extra hours or a missed shift, and it works out your new pay."
  - The overtime sheet's "Overtime | Missed a shift" switch is now a question with two clear choices: "What happened?" with "I worked extra hours" and "I missed a shift". VOICE.md bans questions as headlines; this is a choice to answer, not a headline, and the owner asked for it.
- Decided in step 2d-2: the other sheets follow the rule too. The edit sheet: "Change this payment, move it or skip it.", or "Mark this as paid once the money has moved." for money set aside; a budget's own row already has its note saying where it's changed. View and Switch account have theirs (D209, D210).
- Decided in step 2d-2: the switch part that drew options as side-by-side buttons is gone from the app. Every choice is now a list with a round button beside each word.
- Decided in step 2d-2: the one control without a word is the "?" the owner asked for beside Coming up's heading (D212). Screen readers hear "How to read this", and brief 4.16 asks for a small "?" beside anything that might confuse people.

Why: the owner's instruction. Nobody should have to guess what a screen is for or what a button does.

### D214. "PrePenny has been updated. Tap to reload."

The owner's instruction for step 2d-2, 4 Nov 2026. Confirms D202, built in step 2d.

When a new version of PrePenny is ready, a small note at the bottom says "PrePenny has been updated. Tap to reload.", and tapping it loads the new version straight away. Checked again in step 2d-2: its end-to-end test passes at 320px and 360px, with axe.

Why: the owner's instruction. Without it, someone could keep using an old screen for days after an update.

## Made during step 2d-2

D215 was decided on 4 Nov 2026 while building step 2d-2.

### D215. Smaller choices in step 2d-2

Decided 4 Nov 2026 in step 2d-2.

- The same-day order on Fri 6 Nov: the owner's test 3 listed Spending money before Family loan. D12 puts payments going out on the same day in the order they were first set up, and Family loan was set up first (brief 8.2's table order), so PrePenny shows Family loan −£125.00 (£497.99 left), then Spending money −£54.00 (£443.99 left). The day ends at £443.99 either way. The owner was asked on 4 Nov 2026 and chose to keep D12; every other figure in the test is the owner's.
- "Switch account" is a little smaller than other outlined buttons (14px words, 44px tall), as in the sample, so it fits beside the account at 360px.
- A choice in the View sheet follows the tap at once, before the plan is worked out again. Before, it could jump back for a moment, which the tests found.
- Home's "This pay has to cover" card takes an optional line under its heading, for the payday line (D206).

Why: each follows the owner's design or an earlier decision where the instructions didn't say exactly.

## From the owner's review of step 2d-2

D216 to D219 were agreed by the owner on 4 Nov 2026, answering the four questions left at the end of step 2d-2. D216 was built in step 2e.

### D216. "? How to read this", in words

Agreed 4 Nov 2026, from the owner's review of step 2d-2. Replaces the last point of D213 and the "?" of D212.

- The button beside Coming up's heading shows a small "?" mark followed by "How to read this", following the rule that every control says what it does (D213). Screen readers hear "How to read this"; the mark is skipped.
- Checked in step 2e: there's no other "?" in the app. Home's "?" from the approved sample waits for the help sheets in Phase 4 (D175), and will say what it opens in words too.

Why: the owner's answer. Every control says in words what it does.

### D217. "Pay £603.06, coming in today", then "came in today": confirmed

Agreed 4 Nov 2026, from the owner's review of step 2d-2. Confirms the second point of D206.

Why: the owner confirmed it.

### D218. No "Came in" total in an opened payday: confirmed

Agreed 4 Nov 2026, from the owner's review of step 2d-2. Confirms the fourth point of D211.

Why: the owner confirmed it. The pay is on the payday's line, and any other money coming in is a row with a plus.

### D219. "Under £20 from Mon 26 Oct." stays under the lowest point: confirmed

Agreed 4 Nov 2026, from the owner's review of step 2d-2. Confirms the first point of D209 that was decided in step 2d-2.

Why: the owner confirmed it. Brief 4.8 asks for the first day under the warning level.

## Made during step 2e

D220 to D229 were decided on 4 Nov 2026 while building step 2e, first-time setup. Questions for the owner are in `PLAN.md`.

### D220. The person's own plan and the example are kept apart

Decided 4 Nov 2026 in step 2e. Adds to D15, D133, D163, D182 and ARCHITECTURE.md 3.8.

- The phone keeps the person's own plan and Sam's example as two plans. It also keeps which one PrePenny shows: the person's own, unless they chose to look at the example.
- Opening PrePenny with no plan of its own, or one part-way through setup, goes to setup: the welcome, or the step the person got to.
- "Look at an example plan", on the welcome, shows the example. Its banner keeps "This is an example plan. Nothing here is yours." and adds a button back: "Go back to my plan" once the person's plan is set up, "Go back to making my plan" part-way through, or "Make my plan" before they've started.
- Looking at the example, or changing it, never touches the person's own plan. The example keeps its own today, Sun 25 Oct 2026 (D133); the person's own plan uses the phone's date.
- More has "Look at the example plan" while the person's own plan is showing, and "Start again with the example" while the example is showing (D182).

Why: the owner's instruction that the example plan stays separate, and the rule that every plan starts from a balance (D163).

### D221. How setup saves

Decided 4 Nov 2026 in step 2e. Adds to brief 4.1, D87 and D149.

- The welcome is PrePenny's first page (`/`) and the start of setup (`/setup/`): the name, the tagline, one sentence, "Make my plan" and "Look at an example plan". Part-way through setup, the first button says "Carry on making my plan".
- Each step is one screen: "Step 2 of 8", "Skip this step" (not on step 1, D163, and not on step 8, which has nothing to skip), its title with one plain sentence, the step, then Next and Back. Back on step 1 goes to the welcome. The title takes focus when a step opens.
- Next saves what the step's boxes say through the engine's commands, straight away, on the phone, with the step to show next. So leaving part-way keeps what's done, and opening PrePenny again carries on at that step. An empty form is left out, except on step 1, which needs an account.
- Each thing added, such as an account, an income, a bill or a debt with its payments, is one change, however many commands it takes, made the same way as What if's Keep (D135). Setup lists what each step has added, with "Remove", which takes it back as one undo (D87). Something used by a later thing can't be removed: "Something added after this uses it. Remove that first."
- Setup can't change what it has added: Remove it and add it again, or change it later from the plan.

Why: the owner asked that leaving part-way keeps what's done and that everything goes through the step 2a commands. Undo already refuses to take away something saved since depends on (D149), so Remove can never break the plan.

### D222. Step 1: your account

Decided 4 Nov 2026 in step 2e. Adds to brief 4.1 and 4.2, D47 and D163.

- Each account asks its name ("Current account" filled in for the first), what kind it is (current, savings or joint, current for the first and savings for the others), what the bank shows today, with "It's overdrawn, below £0.00" as in Update balance (D197), an overdraft limit that can be left empty, and "Warn me when it goes under" at £20.00 (D47).
- "Which part of the UK do you live in?" starts on England and Wales, the most people.

Why: brief 4.2 lists each account's name, balance, overdraft limit and warning level, and the kind decides which account Home shows (D168).

### D223. Step 2: how you're paid

Decided 4 Nov 2026 in step 2e. Adds to brief 4.1 and 4.3, D5, D14, D64, D86, D131, D142, D145 and D199.

- Each income asks its name ("Pay" for the first), what kind of money it is (pay from work, benefits, or something else such as a student loan, D79), how often (every choice in brief 4.1), "Next payday", the amount after tax, "My pay changes in a pattern" with up to 8 amounts, each labelled with its payday ("Payday 2, Fri 6 Nov"), the weekend and bank holiday rule, which account it arrives in, "This is an estimate", and "Put part of it aside, such as for tax" with a percentage and an account (D64) when there's more than one account.
- The weekend and bank holiday rule starts on "Move to the working day before", because most pay arrives early. Pay on the last working day doesn't ask: it always lands on the month's last working day (D145), so it's stored as moving to the working day before, as brief 8.5 says. Add a payment now stores it the same way. Its next payday must be a month's last working day.
- "It changes: plan with a weekly estimate" is always an estimate, every week on the next payday's weekday (D14).
- With more than one income, "Which is your main pay?" must be answered. With one, it is the main pay. Removing the main pay in setup leaves no main pay until another is chosen (D14).
- "Do you ever work extra hours or miss shifts?" is asked only when there's pay from work every week, 2 weeks, 4 weeks or month. If yes: which pay, when there's more than one; the overtime rate; the tax code, starting at 1257L; "Fri 30 Oct pays for work up to", worked out as D131 and D142 say; and the usual week (D5): one rate, and the hours and any extras for each payday of the pattern, each saved as a pay week linked to its step, or one for pay with no pattern. "Do this later" saves the rate and the days covered, without a usual week. Pension, student loan and the year so far come with the pay calculator (step 2g), so until then "I did overtime" works its figures out without them.

Why: these are the brief's choices, with the details setup needs to make "I did overtime" work (D5).

### D224. Steps 3 to 5: rent, bills and debts

The first point is replaced by D231 for rent and bills. The minimum rule comes in step 2f (D238).

Decided 4 Nov 2026 in step 2e. Adds to brief 4.1, 4.4 and 4.6, D98 and D153. The weekend rule is a question for the owner in `PLAN.md`.

- Payments going out that setup adds keep their date on a weekend or bank holiday. Setup doesn't ask, to stay under 5 minutes; Add a payment does.
- Rent or mortgage: which one, the amount, the next payment, how often (every month, every week or few weeks, or on chosen dates, for rent paid each term) and from which account. Or "I don't pay rent".
- Bills: the checklist in the brief's order. Each one ticked asks its name, filled in from the list so Insurance can be "Car insurance", the amount, the next payment, how often (every month starts picked, every week, once, or on chosen dates), from which account and "This is an estimate". Council tax's "10 payments, April to January" starts ticked, and leaves out February and March.
- Debts: its name, kind (brief 4.6), what's owed now, what it started at if known (for the progress bar, D99), and its payments, with when they end and a different last amount, or "I don't have payments planned for it yet". Money owed to a person can be in pounds, euros or US dollars, at the rate the person types (brief 4.6). A credit card asks its interest rate and statement day (D13); its minimum rule comes with the Debts screen (step 2f). Each payment is named after its debt, of the type Debt, and linked to it.

Why: these are brief 4.1's boxes for each step, with what the engine needs.

### D225. Step 6: each budget starts with its next week or month

Replaced by D230: budgets in setup start this week or month.

Decided 4 Nov 2026 in step 2e. Adds to brief 4.5, D29, D107, D108 and D152. A question for the owner in `PLAN.md`.

- Food (monthly) and Travel (weekly) are ready to fill in, and "Add another" adds more. One left without an amount isn't added.
- A budget starts on the first day of its next week or month, on or after today, worked out as D29 and D108 say: for Priya, Mon 26 Oct for Travel and Fri 30 Oct, her payday, for Food. The date shows under "Starts" with "The start of your next week. Before then, it plans nothing.", and can be changed to another day, today or later.
- A pay-later bill is monthly (D107) and asks the day the bill is paid. Roll-over is off (D30) until the Budgets screen (step 2f).

Why: a budget that started today would take the whole of this week's or month's money out today, although some of it is already spent and inside the bank balance. Starting with the next one plans nothing already gone. The people's test plans start their budgets the same way (D137).

### D226. Step 7: savings

Decided 4 Nov 2026 in step 2e. Adds to brief 4.7, D114 and D153.

- A goal asks what it's for, the target, "By, if you have a date", the account it's kept in (a savings account if there is one), or "A new savings account" with its name and what it has in it today, what's already saved, and how much moves into it.
- The money moves "Each payday", following the main pay's own schedule from its next payday (pay on the last working day from the day it lands), or another way, from the person's other account. It's named "Saving for Holiday".

Why: brief 4.7 asks for the target, an optional date and the planned transfers, and most people save on payday.

### D227. Step 8: here's your plan

Decided 4 Nov 2026 in step 2e. Adds to brief 4.1 and the sketch in ARCHITECTURE.md 4.6.

- The lowest point ahead in Home's account, looking 12 months ahead (D178), with its first warning; Left to spend, when there's a main pay; the first debt paid off and the first savings goal reached, looking 24 months ahead (D43, D114). Then "Go to my plan", which opens Home.
- The first savings goal reached is added to the sketch's cards, so someone with no debts, like Priya, sees their goal's date: "Holiday, Fri 28 May 2027".
- The 60-second tour in the sketch comes with the help centre in Phase 4 (brief 4.16).

Why: the owner's list for step 8, and Priya's test asks for her holiday fund's date.

### D228. A date before today in setup

Decided 4 Nov 2026 in step 2e. Adds to D150 and D199.

- A payment's date before today says the step 2d words: "Pick today or a later date. If it's already gone, update your balance instead." That's every next payday and next payment, and the money moved into a savings goal.
- A budget's start before today says "Pick today or a later date.", because nothing of a budget is already gone. A goal's date says "Pick today or a later date, or leave it empty."
- Every mistake is explained beside its box, and focus goes to the first one (D203).

Why: the owner's test 6. The second sentence of the step 2d words is about money already gone, which only a payment can be.

### D229. Smaller choices in step 2e

Decided 4 Nov 2026 in step 2e.

- Tests: the end-to-end tests from before setup open on the example, with a test-only "open on the example" setting (D201). The setup tests start from a phone with nothing on it. The test-only today is also the person's own plan's today.
- Records made one after another in setup are given times a moment apart, so the same-day order (D12) keeps the order they were made in.
- When the phone can't save at all, as in some private windows, setup says "This phone couldn't save your plan, so it will go when PrePenny closes."
- Add a payment and setup share the same boxes for when a payment happens, so they always ask the same way. An amount box can show another currency's sign, for a debt in euros or dollars.

Why: each follows an earlier decision where the instructions didn't say exactly.

## From the owner's review of step 2e

D230 to D233 were agreed by the owner on 4 Nov 2026, answering the five questions left at the end of step 2e. D230 and D231 were built in step 2f.

### D230. Budgets in setup start this week or month, with "Already spent"

Agreed 4 Nov 2026, from the owner's review of step 2e. Replaces D225, and D228's words for a budget's start in setup.

- A budget added in setup starts today, so its first week or month is the one with today in it (D107), not the next one.
- Each has one optional box: "Already spent this week", or "this month". That amount is saved as a spend for today, recorded just before the account's latest balance was typed in, so it's inside the balance (D2, D33), and only what's left leaves today. Left empty, the whole amount leaves today, the safe choice.
- Decided in step 2f: the "Starts" date box is gone from setup, because a budget always starts this week or month. A line says which: "It starts this week, Mon 19 Oct to Sun 25 Oct." A pay-later card's budget says "It starts with the card bill for this month." Something typed that isn't an amount says "Type an amount, for example 6, or leave it empty."

Figures that changed in the setup tests, and why:

- Priya on Sun 25 Oct, with £230.00 already spent from this month's £260.00 Food and £20.00 from this week's £25.00 Travel: £35.00 leaves today (£30.00 Food and £5.00 Travel), because her month (Wed 30 Sep to Thu 29 Oct) and week (Mon 19 Oct to Sun 25 Oct) now have a budget. Her lowest point ahead goes from £1,222.73 to £1,187.73, still on Thu 29 Oct, and Left to spend until Fri 30 Oct from £14.28 to £49.28. Every balance from Sun 25 Oct is £35.00 lower than before, apart from the days D231 moves.
- Kofi on Tue 27 Oct, with £30.00 already spent from this week's £70.00 Fuel and £15.00 from £45.00 Food: £70.00 leaves today. His lowest point ahead goes from £156.00 to £86.00, still on Thu 5 Nov, and Left to spend until Mon 2 Nov from £0.00 to £70.00.
- The tests now check every day's balance against each person's test plan with these two answers made on it, and pin the new figures above.

Why: the owner's answer. Starting with the next week planned nothing for the days already in this one, though money still leaves for them; asking what's already gone keeps the plan true to the bank.

### D231. Rent and bills in setup move to the next working day

Agreed 4 Nov 2026, from the owner's review of step 2e. Replaces the first point of D224 for rent and bills.

- Rent and bills added in setup move to the next working day when they fall on a weekend or bank holiday, as Direct Debits and standing orders usually do.
- Debt payments added in setup keep their date. Add a payment still lets people choose (D199).

Figures that changed in the setup tests, and why: Priya's rent and council tax on Sun 1 Nov now go out on Mon 2 Nov, and 23 more of her payments in the next year move off a weekend or bank holiday, such as Cloud storage on Sat 27 Feb 2027 to Mon 1 Mar 2027, so her February ends £2.99 higher than it would with only D230. Kofi's rent on Sun 1 Nov now goes out on Mon 2 Nov, and 10 more of his payments move; his van finance keeps its dates.

Why: the owner's answer. That's when the money really leaves the bank.

### D232. Pay at weekends moves to the working day before: confirmed

Agreed 4 Nov 2026, from the owner's review of step 2e. Confirms the second point of D223.

Why: the owner confirmed it.

### D233. "First savings goal reached" and "Saving for Holiday": confirmed

Agreed 4 Nov 2026, from the owner's review of step 2e. Confirms D226's name for money moved into a goal and D227's card.

Why: the owner confirmed it.

## Made during step 2f

D234 to D246 were decided on 4 Nov 2026 while building step 2f, the Debts, Budgets, Savings goals and Accounts screens; D246 came from the outside review. Questions for the owner are in `PLAN.md`.

### D234. Closing an account at £0.00, and the move before it

Decided 4 Nov 2026 in step 2f. Builds D158 and D181. Adds to D151.

- The engine works out the account's balance at the end of today and refuses the close with the code `account-has-money` unless it's £0.00, naming only the account and the date (D87). It's checked after D151's "nothing planned", so an account still in use says that first.
- "Move £3.12 to another account first" adds a payment between accounts for today, for the whole amount, named "From Old account to Current account", of the type Savings, and ticks it as paid in the same change, so one Undo takes both back. It's marked as done because D151 counts an unticked payment as still planned, and an account closes only once the money has really moved. The line under the button says "This adds a move today, marked as done. Make the same move in your bank." When it's overdrawn, the button says "Move £3.12 into it from another account first" and the move goes the other way (D181).
- With more than one other account, "Move it to" (or "Move it from") picks which. With none, it says "There's no other account to move it to. Add one first."
- A closed account is listed under "Closed accounts", "Closed. Kept for its history."

Why: D158 asks the engine to refuse, so no phone can do it by mistake, and the owner's test 7 closes the account once it's at £0.00.

### D235. The Debts screens

The third point is replaced by D251: a debt's payments open the edit sheet.

Decided 4 Nov 2026 in step 2f. Adds to brief 4.6, D43, D99, D100 and the Debts sketches in ARCHITECTURE.md 4.6.

- Debts: "Owed now", with "6 debts. Family loan counted at €1.1612 per £1." and "Estimate" when it includes a card's interest (D104). Then "Each debt", "In the order they're paid off. Tap one to see its payments.": paid off first, first; those still owed after 24 months last, in the order they were added. Each shows what's left now, "about £1,206.14" for another currency, "Paid off on", "Paid off" or "£225.25 still left on Wed 25 Oct 2028", "Estimate" where it applies (D100), and the bar with "42% paid". Closed debts are listed after, "Closed. Not counted in Owed now."
- One debt, at `/app/debt/?id=…`: "Back to Debts", the kind ("Money owed to a person, in euros"), Left now with "About £1,206.14 at €1.1612 per £1", the interest added since the last update when there is some (D104), "Interest not included" for a card with no rate, Paid off on, the bar and "€996.36 paid of €2,396.93". Then every linked payment and, for a card, each statement day with interest, as "Interest, estimate", with what's left after it. A payment in another currency shows what comes off in that currency on its second line: "Mon 26 Oct, €145.15".
- Its rows aren't buttons: "To change one payment, tap it on Coming up." The edit sheet works from the plan's rows, which look 12 months ahead, and these look 24.
- Actions: Update from statement, Change the rate (another currency only), Add a payment (linked to this debt, named after it, of the type Debt), Change its details, and Close this debt. A closed debt shows none of them.
- The progress bar is a picture only; its words say the same (brief Part 6).

Why: these follow the brief, the sketches and the decisions named where they didn't say exactly.

### D236. "Make it £20.99 and stop after it"

D249 adds the words that say first what else goes.

Decided 4 Nov 2026 in step 2f. Builds D63.

- The fix is offered on the first payment not ticked that's more than what's left, when more than 1p (or 1 cent) was left before it. Payments after it are all more than what's left and say so, without a fix of their own.
- The payment's new amount is what was left before it, converted to pounds at the debt's rate for another currency, rounded once (D9). The change is that amount for just this one, then "Remove this and later" from the next payment of every series linked to the debt, so nothing more is paid to it. It's one change, so one Undo puts all of it back (D87).
- The undo bar says "Credit card made £20.99, and later payments to it removed."

Why: D63 names the fix but not what "stop after it" removes; a debt that's paid off needs no more payments from any of its series.

### D237. A credit card's details and comparing ways to pay

Decided 4 Nov 2026 in step 2f. Adds to brief 4.6, D101, D102, D104, D106 and D146.

- "Interest and minimum": the rate a year, "0% until" when it has one, the statement day, the minimum rule or the typed minimum, and the next statement's interest and minimum, each "an estimate".
- "Compare ways to pay" shows for a card with a statement day. The fixed amount starts at the card's planned monthly payment and can be changed. The day payments go out comes from that payment; with none, it asks "Day of the month you pay".
- Each way says "150 payments, £647.14 interest", or "It never clears: the interest is more than the payment." The minimum says "Not known: later minimums need a rule, such as interest plus 1% of the balance." when the minimum is typed or not known (D102). Under it: "Estimates from the card's interest rate. PrePenny shows the numbers, not which to choose." (brief Part 3, principle 10).

Why: the owner's test 4 compares £25 a month, the card's own payment, and the comparison needs a payment day.

### D238. Adding and changing a debt

Decided 4 Nov 2026 in step 2f. Adds to brief 4.6, D98, D101, D106, D153 and D224.

- The add and change sheets ask the same as setup's step 5, from one shared set of boxes: every kind in brief 4.6, a currency and rate for money owed to a person, what's owed now (adding only), what it started at, and for a credit card the interest rate, "0% until, if it has an offer", the statement day and "Minimum payment": "I don't know it", "As on my statement" with the amount, or "A rule, such as interest plus 1%" with the percentage (1 to start) and "At least" (£5.00 to start). Setup asks these too now.
- The statement day is needed with an interest rate or a minimum rule (D13). A new debt can come with its payments, which keep their date, as in setup (D231).
- Changing a debt sends only what differs (D153). Its balance changes with Update from statement, so the change sheet doesn't ask for it. A card that becomes another kind has its card details cleared.

Why: the owner asked for every kind in brief 4.6, and setup and the Debts screen should ask the same way.

### D239. Update from statement, Change the rate and Close

Close's words are replaced by D250, which also offers to remove the debt's planned payments.

Decided 4 Nov 2026 in step 2f. Adds to brief 4.6, D62, D103 and D153.

- Update from statement asks "What the statement shows now", in the debt's own currency, for today, as Update balance does (D205). Linked payments from today or earlier that aren't ticked are listed with "Tick any payment to it that has already gone"; each starts unticked (D204). It's saved as one change with its ticks (D103).
- Change the rate asks "How many EUR to £1", starting at the rate now. Every payment is converted again at the new rate.
- Close asks once: "Closing it takes it out of Owed now. Its payments stay in your plan until you remove them." (D153).

Why: these follow the decisions named; the brief doesn't say how each looks.

### D240. The Budgets screen

Its point that "Add a budget" doesn't ask "Already spent" is replaced by D247.

Decided 4 Nov 2026 in step 2f. Adds to brief 4.5, D30, D61, D107, D152 and D161.

- Each budget: "£25.00 a week, from Current account", how it leaves ("All leaves at the start of the week or month.", "Spread across the days: £3.57 a day." or the pay-later card's bill day), "Roll-over on" when it is, then "This week, to Thu 29 Oct" (or "Starts Fri 30 Oct" for one that starts later) with Spent and Left, and what rolled over as "£25 + £7 from last week", in whole pounds when there are no pence (D166). A pay-later budget adds "On the pay-later card: £80.00 left until Sat 28 Nov." and its bill.
- A budget that starts after the plan's usual 3 months still shows its first week or month (PLAN.md, left for later 3).
- "Add a budget" asks its name, amount, every week or month, how it leaves (with the bill day, and the card's own statement day if known, for a pay-later bill), which account, "Starts" (today, or later), and roll-over. It starts today unless changed, so this week's or month's whole amount is planned, the safe choice (D230). It doesn't ask "Already spent": outside setup, the latest balance may be days old, so what's already spent may not be inside it. This is a question for the owner in `PLAN.md`.
- "Change Travel" changes its name, amount ("From this week on."), how it leaves, roll-over and the pay-later days, sending only what differs; the engine refuses what D152 and D161 refuse, in words. "End this budget" sets its last week or month, today or later.

Why: these follow the brief and the decisions named, where they didn't say how the screen looks.

### D241. "Add a budget" from I spent

Decided 4 Nov 2026 in step 2f. Builds D207.

With no budgets, I spent says "There's no budget to spend from yet. Add one, such as Travel at £25 a week, then write down what you spend from it." with "Add a budget". It opens the budget form straight away; once the budget is added, I spent opens again with it, ready for the spend.

Why: the owner's D207; coming back to I spent finishes what the person set out to do.

### D242. The Savings goals screen

Decided 4 Nov 2026 in step 2f. Adds to brief 4.7, D114, D139 and D153.

- Each goal: "£350.00 saved of £1,500.00", the bar with "23% saved", "Reached on Fri 28 May 2027" (", an estimate" when it depends on one), or "Not reached in the next 24 months: £900.00 saved by Wed 25 Oct 2028.", its date with "That's on time for your date." or "That's after your date.", where it's kept, and "No money is planned to move into it yet." when there's none.
- "Add a savings goal" asks the same as setup's step 7 (D226), from one shared set of boxes. "Change Holiday" changes what it's for, the target, the date, the account and what was already saved. "Add a payment into Holiday" opens Add a payment as a move into its account, linked to it. "Close Holiday" asks once.

Why: these follow the brief and the decisions named.

### D243. The Accounts screen, and where you live

Decided 4 Nov 2026 in step 2f. Adds to brief 4.2, D151 and D155.

- Each account: its name and kind, "£267.54, checked today" or "checked Fri 30 Oct", "No overdraft" or its limit, and "Tight under £20.00".
- "Add an account" asks the same as setup's step 1 (D222). "Change Current account" changes its name, overdraft limit and warning level, as the owner listed; its kind isn't changed here, because it decides which account Home shows (D168).
- "Bank holidays": "Payments that move on bank holidays follow England and Wales." with "Change where you live", a sheet with the three parts of the UK and Save (D155).

Why: the owner's list for the Accounts screen.

### D244. Changing how often a payment repeats

Decided 4 Nov 2026 in step 2f. Builds PLAN.md's left for later 16. Adds to D91, D96 and D199.

- With "This and all later ones" chosen, a payment that repeats every few weeks or months offers "Change how often it repeats", "From this payment on. The date above is the first one." It opens the same boxes as Add a payment: every week or few weeks, or every month or few months, on a day the date above gives ("The 3rd of the month"), with months left out.
- The new schedule is sent with the date (D96's "a command can still give a schedule of its own"). When it comes out the same as now, it isn't sent. How it ends stays: an end date becomes the same number of payments (D91).
- Not offered for a payment that happens once, on chosen dates or as a weekly estimate, or for just this one.

Why: the owner's instruction, using the engine's way of taking a new schedule from step 1c.

### D245. Smaller choices in step 2f

Decided 4 Nov 2026 in step 2f.

- More's sentence is now "Your accounts, budgets and savings goals, and settings for PrePenny on this phone.", with "Your plan" first: Accounts, Budgets and Savings goals, each a whole row with a line saying what's there. "Help and your account are still being built." comes last.
- The bottom navigation marks Debts on a debt's page and More on the screens under it.
- A budget's row and a pay-later bill in the edit sheet say to change them on the Budgets screen, with "Go to Budgets" (PLAN.md, left for later 15).
- Each sheet that closes because another opened in its place closes only itself, so "Add a budget" from I spent stays open.
- The screenshots of Budgets and Savings goals use the example with the owner's test 5 Travel budget and test 6 Holiday goal added, because the example has none (D180).
- The setup tests compare a spend's budget like any other id, now that setup saves spends.

Why: each follows the owner's instructions or an earlier decision where they didn't say exactly.

### D246. Fixes from the outside review of step 2f

Decided 4 Nov 2026 in step 2f, from an outside review of the step. Adds to D230, D234, D238, D240, D244 and D245.

- **A debt's currency stays as it is.** Changing a debt's kind used to switch it to pounds, so the Family loan's €1,400.57 became £1,400.57 and Owed now went from £3,214.86 to £3,409.29. Its balance is kept in its own currency, so the change sheet no longer offers the currency: it says "It's in euros. That stays as it is, so what's owed doesn't change.", and the rate can still be changed.
- **How often starts from the payment's own date.** For a payment moved off a weekend or bank holiday, such as rent due on Sun 1 Nov and paid on Mon 2 Nov, the new schedule is worked out from Sun 1 Nov, its date before the move, so it repeats on the 1st. Before, the engine refused it. The hint now also says "If it ends on a date, it now ends after the same number of payments." (D91).
- **A budget offers only the changes that can work.** A pay-later bill is monthly and starts afresh (D107, D161), so a weekly budget, or one with spending recorded, isn't offered "As one pay-later bill each month", and the sheet says "To move it to a pay-later card, end it and add a new monthly budget...". A pay-later budget says it stays on the card.
- **"Already spent" in setup only where it can be inside the balance.** A pay-later card isn't asked, because its spending never leaves the bank. When the account's balance was typed on an earlier day, as when setup is finished another day (D221), PrePenny can't tell how much of the spending that balance shows, so the spend is recorded now and the whole amount still leaves today, the safe choice (D230).
- **The move before closing can't be made twice.** A quick second tap, before the figures are worked out again, does nothing. The line under the button names the other account: "This adds a move to Current account today, marked as done. Make the same move in your bank."
- **Focus and headings.** When "Make it £20.99 and stop after it", or closing a debt or a goal, takes away the button that was tapped, focus goes to Undo. The confirm sheet starts afresh each time it opens. Closed accounts and goals are a heading level below "Closed accounts" and "Closed goals", and with only closed goals the screen no longer says "No savings goals yet".
- **The progress bar in dark mode** is filled with Navy as text, cream on the dark track, so it shows; in light mode it's the same navy as before.

Why: the review found each with a case that misled about money, refused something valid or made the screen harder to use.

## From the owner's review of step 2f

D247 to D251 were agreed by the owner on 4 Nov 2026, answering the five questions left at the end of step 2f. They were built in step 2g. Points marked "decided in step 2g" weren't in the owner's answer.

### D247. Add a budget asks "Already spent this week", like setup

Agreed 4 Nov 2026, from the owner's review of step 2f. Answers the question in D240 and replaces its point that Add a budget doesn't ask.

- Adding a budget from the Budgets screen asks the same optional "Already spent this week" (or "this month") as setup, with the same words, saved the same way (D230, D246): a spend for today, recorded just before the account's balance was typed in when that was today, so only what's left leaves today; otherwise recorded now, so the whole amount still leaves today.
- Decided in step 2g: it's asked only when the budget starts today, because a budget that starts later has no week or month under way, and not for a pay-later card, whose spending never leaves the bank (D246). The "Starts" hint is now "Its first week or month is the one with this day in it."

Test: Travel at £25.00 a week added on Sun 25 Oct with £4.00 already spent shows £4.00 spent and £21.00 left this week, and only £21.00 leaves on Sun 25 Oct.

Why: the owner's answer. Setup and the Budgets screen should ask the same way.

### D248. The move before closing an account is added ticked, with a reminder

Agreed 4 Nov 2026, from the owner's review of step 2f. Confirms the second point of D234 and adds to it.

- "Move £3.12 to another account first" adds the move already ticked, as D234 says.
- Once it's added, the account sheet and the undo bar say "Now move £3.12 in your banking app too."
- Decided in step 2g: the line under the button says "Make the same move in your banking app." rather than "in your bank", to match.

Why: the owner's answer. The account can only close once the money has really moved, and the person must make the same move themselves.

### D249. "Make it £20.99 and stop after it" says first what else goes

Agreed 4 Nov 2026, from the owner's review of step 2f. Confirms D236 and adds to it.

- The fix still removes every later payment to the debt, from every series linked to it (D236).
- Before the tap, the line under the button says what else goes, for example "This also removes 2 later payments to Laptop loan. Undo puts them back." Undo puts them back, as one change (D87).
- Decided in step 2g: the payments are counted as far ahead as the debt looks, 24 months (D43). When a linked series carries on after that, as a credit card's monthly payment does, the line says "This also removes every later payment to Credit card." instead of a number that wouldn't be all of them. With none after it: "No other payment to Credit card is planned, so nothing else changes." It stays one tap (D63): the words come before it, not in a second step.

Test: Sam's Laptop loan at £250.00 says "This also removes 2 later payments to Laptop loan.", the fix leaves two payments, and Undo puts back all four. Sam's Credit card says "every later payment".

Why: the owner's answer. Nobody should be surprised by payments going.

### D250. Closing a debt offers to remove its planned payments

Agreed 4 Nov 2026, from the owner's review of step 2f. Answers the question in D239 and replaces its words "Its payments stay in your plan until you remove them."

- "Close this debt" asks "Also remove its 3 planned payments?" with Yes and No. Yes removes them and closes the debt as one change, so one Undo puts all of it back. No closes it and keeps them, as before.
- Decided in step 2g:
  - No starts chosen, so nothing more goes without a tap.
  - The planned payments are the linked payments from today on that aren't ticked: each linked series is removed from its first payment from today with nothing ticked after it ("Remove this and later", D92). Payments from before today that aren't ticked stay in Not ticked yet.
  - They're counted 24 months ahead (D43). When a series carries on after that, it asks "Also remove every payment planned to it?" With one, "Also remove its planned payment?" With none, nothing more is asked.
  - The undo bar says "Family loan closed, and its planned payments removed."

Test: Sam's Family loan asks "Also remove its 6 planned payments?"; Yes takes away all six, and Undo puts them back.

Why: the owner's answer. A closed debt usually needs no more payments, but only the person knows.

### D251. A debt's payments open the same edit sheet as on Coming up

Agreed 4 Nov 2026, from the owner's review of step 2f. Replaces the third point of D235.

- On a debt's own page, each payment can be tapped and opens the same edit sheet as on Coming up: Mark as paid, Move to next payday, Skip this one, a new amount, date, name or note, and Remove. The page says "Tap a payment to change it, move it or skip it."
- Decided in step 2g: the sheet's rows come from the plan worked out as far ahead as the debt looks, 24 months, so every payment the page shows can be changed. A payment ticked before the account's balance was last updated has no row in the plan, so it isn't a button. Statement days, which are interest, aren't buttons either.

Test: tapping the Family loan's Mon 26 Oct payment opens its edit sheet with "£112.54 left", and Move to next payday moves it to Fri 30 Oct.

Why: the owner's answer. A person looking at a debt shouldn't have to go to another page to change one of its payments.

## Made during step 2g

D252 to D259 were decided on 4 Nov 2026 while building step 2g, What if and the take-home pay calculator. Questions for the owner are in `PLAN.md`.

### D252. The What if screen

Decided 4 Nov 2026 in step 2g. Builds brief 4.10 and D135, with the What if sketch in ARCHITECTURE.md 4.6.

- What if is at `/app/what-if/`. It opens from a "What if" button on Coming up, under the lowest point, beside "Try changes in practice, then keep them or throw them away.", and from More. Its link back says "Back to Coming up" or "Back to More", for where it was opened from.
- The top says plainly: "Practice mode. Try changes here. Your real plan doesn't change unless you keep them."
- Practice changes are made with the same sheets as real ones. Under "Make a practice change": Add a payment, I did overtime and Update balance. Below, "Payments, with your practice changes" is the Coming up list for the practice plan, where tapping a payment opens the edit sheet. The sheets are given the practice plan, so each change is worked out on it and nothing is saved.
- "Your practice changes" lists each one, in the words the undo bar would use ("Pay changed for just this one."), with "Take back the last change".
- "Keep these changes" makes every practice change on the real plan as one change, so one Undo takes all of it back (D87). It works them out again on the real plan as it is then (D135). The undo bar says "Your practice change is now in your plan." and takes focus.
- "Throw them away" forgets them at once: the real plan was never changed, and an undo of nothing isn't needed. It says "Practice changes thrown away. Your real plan is exactly as it was."
- Practice changes stay on this phone, in memory, while PrePenny is open (ARCHITECTURE.md 3.8), so going to another screen and back keeps them. Closing PrePenny throws them away. When the real plan changes in the meantime, they're made again on it; if one can't be made any more, all of them are thrown away and the screen says so.
- The bottom navigation marks More on What if and on the pay calculator (D245).

Why: the owner's instructions, with the engine's What if from step 1g. Using the very same sheets means a practice change and a real one always agree.

### D253. What What if shows side by side

Decided 4 Nov 2026 in step 2g. Adds to D135.

- "Your real plan and practice, side by side", in two columns: "Your real plan" and "Practice".
- The lowest point ahead looks 12 months ahead, like Home and Coming up (D178), with its date, the payment it's after, and Tight or Short in words. It's shown for Home's account (D168), and for any other account whose lowest point or shortfall the practice changes. An account the practice doesn't change isn't shown. Kofi's Tax account gets less with no work, but its lowest point stays the same, so it isn't shown.
- A shortfall: "In practice, you'd be £95.47 short on Sun 1 Nov. Moving one of these payments to Fri 6 Nov would fix it." with the payments that could move, biggest first (D69): the first three, and "Show all" for the rest. When the real plan has a shortfall of its own that's different, it's shown too: "Your real plan is £X short on [date]." When no single payment would fix it: "Moving one payment to the next payday wouldn't fix it on its own."
- "Paid off on": each debt, looking 24 months ahead (D43), in the Debts screen's order (D235), with "an estimate" where it is one, or "£225.25 left on Wed 25 Oct 2028". Savings goals show the date each is reached the same way. Closed debts and goals aren't shown.

Tests: the owner's tests 1 and 2.

Why: the owner's list, "the lowest point with Tight or Short, any shortfall with the payments that could move, and each debt's paid-off date", kept to what the practice can change.

### D254. The calculator's boxes

Decided 4 Nov 2026 in step 2g. Builds brief 4.15 with D120 to D128, D140 and the Pay calculator sketch in ARCHITECTURE.md 4.6.

- Pay: each kind of hours with its kind (Basic, Overtime, Nights, Weekends, Holiday), hours and pay an hour, up to 8, and fixed amounts such as a shift premium, each with what it's for. Rates take up to 4 decimal places, as typed.
- Tax and deductions: the payday, with "That's tax week 30 of the 2026 to 2027 tax year." under it; how often (every week, 2 weeks, 4 weeks or month); the tax code, as on the payslip; "The usual way, cumulative" or "Week 1 or month 1, on an emergency code"; a workplace pension with its percentage, the earnings it's worked on for each pay period (which can be left empty for all pay), and before or after tax; one student loan plan and a Postgraduate loan (D127); and other deductions by name (D126).
- From your last payslip: "The tax week on it" (or month), which starts as the week before the payday, "From your last payslip: gross for tax so far" and "From your last payslip: tax paid so far". Both figures, or neither. The week must be before the payday's.
- National Insurance uses category A and doesn't ask (D122); almost everyone is A.
- "Work out take-home pay" works it out on the phone. Changing any box afterwards clears the result and says "You changed something, so work it out again.", so a figure on screen always matches the boxes.
- The result: "Take-home pay" and the amount, then "Tax £58.80, National Insurance £24.89, Pension £17.33" (with student loans and other deductions when there are any), "Gross pay £553.19", and "An estimate, not tax advice." always. When it's an estimate, it says why: without the payslip's figures; a payslip from an earlier week ("Your last payslip is from tax week 25, so weeks 26 to 29 are counted as the same pay as this one. That makes it an estimate.", D124); or a payslip from the tax year before. A tax refund says "Tax refund"; tax held back by the half-of-pay limit says so (D121).
- "An estimate, not tax advice." is also at the top of the calculator.

Why: these are brief 4.15's boxes, with what the engine needs, asked in the order a payslip shows them.

### D255. "Add to plan as the Fri 30 Oct estimate"

Decided 4 Nov 2026 in step 2g. Builds brief 4.15 ("One tap adds it to the plan as the next payday's estimate").

- In the app, the calculator starts from the plan's own pay: the next payday (D81), the main pay's tax settings, that payday's saved week (D5) and the last payslip's figures when they're from the same tax year.
- "Add to plan as the Fri 30 Oct estimate" makes that payday's pay the take-home amount, marked as an estimate, for just this one (`takeHomeAsEstimate`), as one change with one Undo. It's for the payday in the box, which starts on the next payday. When the box holds a date that isn't one of the main pay's paydays from tomorrow on, it says "To add it to your plan, choose one of your paydays as the payday above, such as Fri 30 Oct."
- A payday whose real amount is in already isn't changed (D44): "Your pay on Fri 30 Oct already has its real amount, £603.06, so it stays as it is." Overtime already added for that payday stays on top, and the line says so.
- With no main pay: "There are no paydays in your plan to add it to yet."

Test (the owner's test 3 and 4): week 26's lines with week 25's payslip on Fri 30 Oct give £452.17, labelled an estimate because Fri 30 Oct is tax week 30 (D124). The figures are the same as on week 26 itself: Fri 2 Oct gives £452.17 exactly. Added as the Fri 30 Oct estimate, it replaces £603.06, and Home's lowest point is −£146.36 on Sun 1 Nov, Short. Undo puts back £4.53.

Why: a result worked out for one payday's tax week should go on that payday. The box starts on the next payday, so the owner's one tap is still one tap.

### D256. "Save as a pay week"

Decided 4 Nov 2026 in step 2g. Builds brief 4.15 ("Save a person's usual lines as a template") and PLAN.md's left for later 17. Adds to D5 and D154.

- It asks a name ("Usual week" to start), and saves the pay lines and fixed amounts as a pay week on the main pay's tax settings, as one change with one Undo.
- When the main pay has no tax settings saved yet, the calculator's are saved for it first, with the last payslip's figures when they were typed.
- When the main pay has no saved week linked, this one is linked to every payday, so "I did overtime" can work out its figures (D5). A main pay that already has weeks linked keeps them, as Sam's does: the new week is saved for starting from.
- Saved weeks are listed at the top of the calculator, "Start from a saved week", each with "Use Rota week 1, 3 shifts", which fills in its lines.
- The calculator never changes tax settings already saved: those change where they're shown, so overtime figures never change without the person seeing why (D162).

Why: a saved week is only useful if the person can find it again, and changing tax settings from a calculator someone was only trying out would change overtime they saved earlier.

### D257. Check my payslip

Decided 4 Nov 2026 in step 2g. Builds brief 4.15 and D140.

- "Check my payslip" opens under the calculator. It asks for the payslip's gross pay, pension (when there's one), tax, National Insurance, student loan and Postgraduate loan (when there are any), take-home pay, gross for tax so far and tax paid so far, each of which can be left empty. The pay lines and settings are the calculator's.
- Each figure that differs is listed: "Tax: £105.40 on your payslip, £105.20 worked out by PrePenny. That's £0.20 more on your payslip.", after "These are different from what PrePenny worked out:", and it ends with "Ask your payroll team." It never says which is right, and never says the employer is wrong. National Insurance and take-home pay 1p away aren't listed (D140).
- When nothing differs: "Every figure you typed is what PrePenny worked out."
- Amounts under £1 are written as money, "£0.20", as VOICE.md says.

Test (the owner's test 5): week 27's payslip with tax as £105.40 lists only tax, £0.20 more, and "Ask your payroll team."

Why: the owner's words, and the brief's rule that the app never says the employer is wrong.

### D258. The public calculator

Decided 4 Nov 2026 in step 2g. Builds brief 4.15 and 4.17 ("Always free, no account needed").

- The public page is `/pay-calculator/`, titled "Take-home pay calculator", with PrePenny's name linking to the first page. It says: "It all happens on this phone: nothing you type is sent anywhere."
- It uses the same calculator as the app, starting from 1257L on the cumulative basis, paid weekly, on today's date. It works with nothing saved on the phone, keeps nothing, and the engine works everything out on the phone: no request is made when it works out the pay or checks a payslip. Its links are plain links, so nothing is fetched ahead of a tap.
- "Start a free plan with this pay" keeps the take-home pay, how often and the payday in the browser's own small store on the phone, never in the web address, so no amount reaches a server or its logs (CLAUDE.md). Then it opens setup. Setup's pay step fills in its first income with it, marked as an estimate, with the payday when it's today or later, and says "Your take-home pay from the calculator is filled in below, as an estimate." The kept pay is forgotten once setup has read it.

Test (the owner's test 6): on a phone with nothing saved, the page works out £452.17 and checks a payslip with no request at all, still with nothing saved, and "Start a free plan with this pay" fills in setup's pay step with £452.17, every week, as an estimate.

Why: the owner's instructions, and the privacy rule that amounts never go to logs.

### D259. Smaller choices in step 2g

Decided 4 Nov 2026 in step 2g.

- More lists Pay calculator ("Take-home pay from your hours, and Check my payslip") and What if ("Try changes in practice before you make them") under "Your plan".
- The confirm sheet can ask one Yes or No question before its button (D250).
- After a practice change takes away the row that was tapped, focus goes to "Your practice changes", because What if has no undo bar (WCAG 2.4.3).
- The Coming up list in What if keeps its own months and opened paydays, apart from the real Coming up page's (D187).
- The calculator's figures are worked out on the phone's main thread, not in the background worker: one payday's take-home pay is a small sum, and the public page has no plan to send the worker.
- Add a budget, Add a debt and Add a savings goal wait for the plan before their boxes start. Before, a tap made while the plan was still loading started them with no date and no account. The end-to-end tests found it when the machine was busy.

Why: each follows an earlier decision or the owner's instructions where they didn't say exactly.

