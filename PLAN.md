# Plan

Progress against brief Part 9 (`docs/BRIEF.md`). Each phase is done in small steps, one prompt per step, with a stop after each. Each step has its own pull request, named after the step (D73).

## Progress

- [x] **Step 0: foundations.** Done 27 Oct 2026. The brief, decisions, voice, design and this plan are in the repository. No app code.
- [x] **Phase 0: plan.** Done 27 Oct 2026. `docs/ARCHITECTURE.md` was approved by the owner. Its 21 proposals are D38 to D58 in `docs/DECISIONS.md`, the answers to the Phase 0 questions are D59 to D68, and the owner's review added D69 to D74.
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

1. **The bank holiday download is blocked** (step 1a). On 27 Oct 2026 this session's network settings refused www.gov.uk, so `https://www.gov.uk/bank-holidays.json` couldn't be downloaded. Step 1a stopped after recording D38 to D74, as the owner asked. *Needed:* allow www.gov.uk in the environment's network settings, then run step 1a's Part 2 again.
2. **One-off bank holidays and the D74 test** (step 1a). D74's test says the rules give exactly the official list for every year it covers. But the official list can include one-off days that no rule can predict: in 2020 the Early May bank holiday moved to Fri 8 May for VE Day; in 2022 the Spring bank holiday moved to Thu 2 Jun, with an extra day on Fri 3 Jun for the Platinum Jubilee, and Mon 19 Sep was the State Funeral of Queen Elizabeth II; and Mon 8 May 2023 was the coronation. *Suggested:* the test names each one-off change and proves every other day in every year matches exactly. The engine always uses the official list for the years it covers, so these days are still right in the plan.

## Launch checklist (started)

Filled in during Phase 5 from brief Part 7. Items already agreed:

1. Set up a limited company (D24). This goes first, before the Apple and Google developer accounts.
2. Prices say "including VAT" only once the business is VAT-registered (D25).
3. Move Supabase to its paid plan before launch (D19).
4. Buy the web address by Phase 3, because sign-in emails must come from it (about £10 a year) (D56).
5. Read Cloudflare's free plan terms to check they allow a paid app. If they don't, Cloudflare's paid Workers plan is US$5 a month (D68).
