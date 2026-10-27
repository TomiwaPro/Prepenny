# Plan

Progress against brief Part 9 (`docs/BRIEF.md`). Each phase is done in small steps, one prompt per step, with a stop after each.

## Progress

- [x] **Step 0: foundations.** Done 27 Oct 2026. The brief, decisions, voice, design and this plan are in the repository. No app code.
- [ ] **Phase 0: plan.** Propose the final structure, data model, screens and folders, then wait for approval. *Next.*
- [ ] **Phase 1: the money engine**
  - [ ] 1a Dates, repeats, month ends and UK bank holidays
  - [ ] 1b The balance rule, lowest point, warnings and shortfalls
  - [ ] 1c Editing: just this one, this and all later, skip, move, undo
  - [ ] 1d Debts, currencies and credit cards
  - [ ] 1e Budgets, spending money and savings goals
  - [ ] 1f Take-home pay calculator and "I did overtime"
  - [ ] 1g Sam's full plan, the other people's tests, property tests and the speed test
- [ ] **Phase 2: the app on one device.** Steps set at the start of the phase.
- [ ] **Phase 3: accounts and sync**
- [ ] **Phase 4: polish**
- [ ] **Phase 5: ready to launch**
- [ ] **Phase 6: the app stores**

## Waiting for the owner

Questions that need an answer before the step that uses them. Move each one to `docs/DECISIONS.md` once it's answered.

- **Budgets: "spread across the days" and "pay-later bill"** (D2). Confirm the rules before step 1e.
- **Paying a debt early** (before 1d). D1 uses the tick date for the bank balance, but brief 5.6 still uses the due date for debts. A payment ticked early, then "Update from statement" before its due date, would come off the debt twice. Suggested: debts follow D1 too.
- **Ticks and spends later on the same day as a balance update** (before 1b). Dates have no time, so a payment ticked or a spend recorded after the update, on the same day, counts as already inside that balance (D1, D2) and the plan shows too much. Suggested: store the moment of each balance update; anything ticked or recorded after it counts as not yet gone.
- **Left to spend for people paid monthly** (before 1e). Brief 4.9 says "this week"; D3 uses the plan period, which is a month for Priya, Jess and Tom. Suggested: label it "Left to spend until Fri 30 Oct" as in the approved sample, and say how a weekly budget counts inside a monthly period and the other way round.
- **Budget roll-over and budget periods** (before 1e). Brief 4.5 lets unspent budget roll over; D2 doesn't say how it joins the next period. Also: does a weekly budget run Monday to Sunday or payday to payday, and a monthly one by calendar month or pay month?
- **A debt paid 1p too much** (before 1d). With rounding per payment (D9), Family loan ends at −€0.01. Suggested: show "Paid off", never a negative amount left.
- **The word "unlock"** (before Phase 2). It's banned in VOICE.md, but brief 4.13's app lock needs a word for it. Suggested: "Open with your PIN" and similar.
- **Which document wins.** VOICE.md and DESIGN.md are stricter than the brief in places (no emoji anywhere). Suggested: they win over the brief too. Also, the brief wants screens to work down to 320px and CLAUDE.md checks at 360px. Suggested: check both.

## Launch checklist (started)

Filled in during Phase 5 from brief Part 7. Items already agreed:

1. Set up a limited company (D24). This goes first, before the Apple and Google developer accounts.
2. Prices say "including VAT" only once the business is VAT-registered (D25).
3. Move Supabase to its paid plan before launch (D19).
