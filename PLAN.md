# Plan

Progress against brief Part 9 (`docs/BRIEF.md`). Each phase is done in small steps, one prompt per step, with a stop after each. Each step has its own pull request, named after the step (D73).

## Progress

- [x] **Step 0: foundations.** Done 27 Oct 2026. The brief, decisions, voice, design and this plan are in the repository. No app code.
- [x] **Phase 0: plan.** Done 27 Oct 2026. `docs/ARCHITECTURE.md` was approved by the owner. Its 21 proposals are D38 to D58 in `docs/DECISIONS.md`, the answers to the Phase 0 questions are D59 to D68, and the owner's review added D69 to D74.
- [ ] **Phase 1: the money engine**
  - [x] 1a Dates, repeats, month ends and UK bank holidays. Done 29 Oct 2026: money, dates, bank holidays and the schedule in `packages/engine`, with the GitHub check and the bank holiday download. D75 to D78 were decided along the way.
  - [x] 1b The balance rule, lowest point, warnings and shortfalls. Done 29 Oct 2026: accounts, balance updates and ticks; Left after this on every row; each day's balance; Not ticked yet; the lowest point; Tight and Short; shortfalls with the payments that could move; what Update balance expects; the next main payday; and plan periods, in `packages/engine`. D79 to D85 were decided along the way.
  - [x] 1c Editing: just this one, this and all later, skip, move, undo. Done 29 Oct 2026: one engine function makes every edit and gives back the records to save and the undo. Just this one, this and all later ones (a split that keeps the pay pattern and the payment count, and reaches series split off earlier), remove this one, remove this and later, move, move to next payday, tick, untick, a balance update with its ticks, and undo, with a private transfer's two halves kept in step. Brief 8.4 tests 1 to 4 pass with balances, and the property tests for splits and undo were brought forward from 1g. D87 to D95 were decided along the way.
  - [x] 1d Debts, currencies and credit cards. Done 29 Oct 2026: debts in `packages/engine/src/debts`, with payments linked to them. For each debt: Left now (ticks after the statement update, even on the same day), Paid off on or what's still left at the end, progress, and every linked payment with what's left after it, saying how much more a payment is than what's left. Other currencies at the person's rate, rounded once per payment, and Owed now in pounds. Credit card interest and the minimum from a rule on each statement day, and the minimum, fixed and full comparison. Update from statement is one undoable edit with its ticks. Also from the owner's review of 1c: "Only this week of the pattern" (D97) and where later payments go after a new date (D96). All six owner tests for 1d pass, and brief 8.3's debt tests were brought forward from 1g. D96 and D97 record the owner's answers to step 1c, and D98 to D103 were decided along the way.
  - [ ] 1e Budgets, spending money and savings goals
  - [ ] 1f Take-home pay calculator and "I did overtime"
  - [ ] 1g Sam's full plan, the other people's tests, property tests and the speed test. Note from 1b: 100 weekly series over 24 months takes about 31 milliseconds on the test machine, against a target of 12. Most of that is writing dates out as text, not the sums, so 1g should speed that up first (ARCHITECTURE.md 2.8). Tests 45 and 46 (splits and undo) were brought forward to 1c; 1g runs them again.
- [ ] **Phase 2: the app on one device.** Steps set at the start of the phase.
- [ ] **Phase 3: accounts and sync**
- [ ] **Phase 4: polish**
- [ ] **Phase 5: ready to launch**
- [ ] **Phase 6: the app stores**

## Waiting for the owner

Questions that need an answer before the step that uses them. Move each one to `docs/DECISIONS.md` once it's answered.

Nothing waiting right now.

## Launch checklist (started)

Filled in during Phase 5 from brief Part 7. Items already agreed:

1. Set up a limited company (D24). This goes first, before the Apple and Google developer accounts.
2. Prices say "including VAT" only once the business is VAT-registered (D25).
3. Move Supabase to its paid plan before launch (D19).
4. Buy the web address by Phase 3, because sign-in emails must come from it (about £10 a year) (D56).
5. Read Cloudflare's free plan terms to check they allow a paid app. If they don't, Cloudflare's paid Workers plan is US$5 a month (D68).
