# Plan

Progress against brief Part 9 (`docs/BRIEF.md`). Each phase is done in small steps, one prompt per step, with a stop after each. Each step has its own pull request, named after the step (D73).

## Progress

- [x] **Step 0: foundations.** Done 27 Oct 2026. The brief, decisions, voice, design and this plan are in the repository. No app code.
- [x] **Phase 0: plan.** Done 27 Oct 2026. `docs/ARCHITECTURE.md` was approved by the owner. Its 21 proposals are D38 to D58 in `docs/DECISIONS.md`, the answers to the Phase 0 questions are D59 to D68, and the owner's review added D69 to D74.
- [ ] **Phase 1: the money engine**
  - [x] 1a Dates, repeats, month ends and UK bank holidays. Done 29 Oct 2026: money, dates, bank holidays and the schedule in `packages/engine`, with the GitHub check and the bank holiday download. D75 to D78 were decided along the way.
  - [x] 1b The balance rule, lowest point, warnings and shortfalls. Done 29 Oct 2026: accounts, balance updates and ticks; Left after this on every row; each day's balance; Not ticked yet; the lowest point; Tight and Short; shortfalls with the payments that could move; what Update balance expects; the next main payday; and plan periods, in `packages/engine`. D79 to D85 were decided along the way.
  - [ ] 1c Editing: just this one, this and all later, skip, move, undo
  - [ ] 1d Debts, currencies and credit cards
  - [ ] 1e Budgets, spending money and savings goals
  - [ ] 1f Take-home pay calculator and "I did overtime"
  - [ ] 1g Sam's full plan, the other people's tests, property tests and the speed test. Note from 1b: 100 weekly series over 24 months takes about 31 milliseconds on the test machine, against a target of 12. Most of that is writing dates out as text, not the sums, so 1g should speed that up first (ARCHITECTURE.md 2.8).
- [ ] **Phase 2: the app on one device.** Steps set at the start of the phase.
- [ ] **Phase 3: accounts and sync**
- [ ] **Phase 4: polish**
- [ ] **Phase 5: ready to launch**
- [ ] **Phase 6: the app stores**

## Waiting for the owner

Questions that need an answer before the step that uses them. Move each one to `docs/DECISIONS.md` once it's answered.

1. **Check the payment types (D79)** (before Phase 2). Every payment is one of: Pay, Benefits, Rent or mortgage, Bills, Debt, Spending money, Savings, Other. Only Spending money changes a sum (Left to spend). Say if you want a type added, removed or renamed.
2. **A removed payday (D81)** (before step 1c, which builds "Move to next payday"). If a main pay payment is removed, that day stops being a payday: its pay period joins the one before, and "Move to next payday" goes to the payday after. Say if a removed payday should still count.
3. **Shortfalls (D82)** (before Phase 2). Short days in a row count as one shortfall, shown with its first day: "£95.47 short on Sun 1 Nov". A payment is listed as one that could move only if moving it fixes every short day in that run. Say if you'd rather see each short day on its own.
4. **A tick on a removed payment (D83)** (before Phase 3). In a shared plan, Jess could tick a payment just as Tom removes it. The plan then still takes the money off, because the tick says it went. Say if the removal should win instead.
5. **Came in (D84)** (before Phase 2). In the plan view, "Came in" includes money moved in from your other accounts, so Sam's first period shows £500.00 came in from savings. Say if it should count pay and other money in only.

## Launch checklist (started)

Filled in during Phase 5 from brief Part 7. Items already agreed:

1. Set up a limited company (D24). This goes first, before the Apple and Google developer accounts.
2. Prices say "including VAT" only once the business is VAT-registered (D25).
3. Move Supabase to its paid plan before launch (D19).
4. Buy the web address by Phase 3, because sign-in emails must come from it (about £10 a year) (D56).
5. Read Cloudflare's free plan terms to check they allow a paid app. If they don't, Cloudflare's paid Workers plan is US$5 a month (D68).
