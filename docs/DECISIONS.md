# Decisions

Decisions made since the brief (`docs/BRIEF.md`). Where this file and the brief disagree, this file wins. Where `docs/VOICE.md` or `docs/DESIGN.md` is stricter than the brief, they win too (D36).

D1 to D26 were agreed by the owner on 27 Oct 2026, before any code was written. D27 to D37 were agreed on 27 Oct 2026 as well, answering the questions left in `PLAN.md`. D38 to D74 were agreed on 27 Oct 2026 too: D38 to D58 are the proposals in `docs/ARCHITECTURE.md`, D59 to D68 answer the Phase 0 questions, and D69 to D74 come from the owner's review of the plan. D75 to D78 were decided while building step 1a, on 29 Oct 2026, and the owner confirmed D75 and D78 the same day. D79 to D85 were decided while building step 1b, on 29 Oct 2026, and the owner confirmed D79 and D81 to D84 the same day. D86 comes from the owner's review of step 1b, on 29 Oct 2026. D87 to D95 were decided while building step 1c, on 29 Oct 2026. D96 and D97 come from the owner's review of step 1c, on 29 Oct 2026, when the owner also confirmed D90 and D92. Add new decisions at the end with the next number, the date and the reason. Never renumber or delete an entry; if a decision changes, add a new one that says which entry it replaces.

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
- On chosen dates, like Ali's student loan: only that one date changes, and the later chosen dates stay.
- A payment that happens once simply moves.

The new date is the date from the schedule, before the weekend and bank holiday rule. The engine works out the new schedule itself, so every phone and every later step uses the same rule. Everything else in D91 stays: no payment is added or lost, and a date before the payment before it is refused.

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
