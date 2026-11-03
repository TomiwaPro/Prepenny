# Decisions

Decisions made since the brief (`docs/BRIEF.md`). Where this file and the brief disagree, this file wins. Where `docs/VOICE.md` or `docs/DESIGN.md` is stricter than the brief, they win too (D36).

D1 to D26 were agreed by the owner on 27 Oct 2026, before any code was written. D27 to D37 were agreed on 27 Oct 2026 as well, answering the questions left in `PLAN.md`. D38 to D74 were agreed on 27 Oct 2026 too: D38 to D58 are the proposals in `docs/ARCHITECTURE.md`, D59 to D68 answer the Phase 0 questions, and D69 to D74 come from the owner's review of the plan. D75 to D78 were decided while building step 1a, on 29 Oct 2026, and the owner confirmed D75 and D78 the same day. D79 to D85 were decided while building step 1b, on 29 Oct 2026, and the owner confirmed D79 and D81 to D84 the same day. D86 comes from the owner's review of step 1b, on 29 Oct 2026. D87 to D95 were decided while building step 1c, on 29 Oct 2026. D96 and D97 come from the owner's review of step 1c, on 29 Oct 2026, when the owner also confirmed D90 and D92. D98 to D103 were decided while building step 1d, on 29 Oct 2026; D101's minimum rule was set out by the owner. D104 to D106 come from the owner's review of step 1d, on 1 Nov 2026, when the owner also confirmed D98 to D103. D107 to D115 were decided while building step 1e, on 1 Nov 2026. D116 to D119 come from the owner's review of step 1e, on 1 Nov 2026. D120 was agreed by the owner while step 1f was being built, on 1 Nov 2026, and D121 to D128 were decided while building step 1f, the same day. D129 to D133 come from the owner's review of step 1f, on 3 Nov 2026, and D134 onwards were decided while building step 1g, the same day. Add new decisions at the end with the next number, the date and the reason. Never renumber or delete an entry; if a decision changes, add a new one that says which entry it replaces.

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

The sum for X in the third point is replaced by D118, and D117 adds the line for when even spending nothing goes under the warning level.

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

D134 onwards were decided on 3 Nov 2026 while building step 1g.

### D134. How the speed test is measured

Decided 3 Nov 2026 in step 1g. Adds to D72 and ARCHITECTURE.md 2.8.

- The plan: 100 weekly series over 24 months, from Sun 25 Oct 2026 to Wed 25 Oct 2028, on a current account with an overdraft and a savings account. One in ten is money coming in, four move money to savings, a third move to the working day before a weekend or bank holiday, and some have one-off changes and ticks. That's about 10,500 rows.
- It's worked out 5 times to warm up, then 20 times. The time is the middle of the 20: the average of the 10th and 11th fastest. It must be under 12 milliseconds. The target is unchanged.
- It runs on its own, once every other test has finished, so the other tests never compete with it for the machine.
- It loads the engine with Node's own `import`, the way the app's build will run it, not through the test tool's module runner. On the test machine the same plan took 9 to 11 milliseconds through the module runner and 4.5 to 7 milliseconds with Node's own import, because the runner slows down every call from one engine file to another. So the engine is written in TypeScript that Node can run directly, and the type check refuses anything else.
- To get there, the engine writes each date as text once and keeps it, writes payments out without copying, puts each day's rows in a bucket for that day instead of one big sort, collects them in the same-day order so most days need no sorting, and keeps what every row of a series shares once for the series. The order of rows and every figure stay exactly the same: every earlier test passes unchanged.

Result: about 5 milliseconds on the test machine, from about 28 before step 1g.

Why: the test should measure the engine as the app will run it, and nothing else running at the same time. The target leaves room for a phone four times slower to stay under the brief's 50 milliseconds (ARCHITECTURE.md 2.8).
