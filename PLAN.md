# Plan

Progress against brief Part 9 (`docs/BRIEF.md`). Each phase is done in small steps, one prompt per step, with a stop after each.

## Progress

- [x] **Step 0: foundations.** Done 27 Oct 2026. The brief, decisions, voice, design and this plan are in the repository. No app code.
- [ ] **Phase 0: plan.** Propose the final structure, data model, screens and folders, then wait for approval. Written 27 Oct 2026 in `docs/ARCHITECTURE.md`. *Waiting for the owner's approval.* Once approved, its proposals go into `docs/DECISIONS.md` as D38 onwards.
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

Questions that need an answer before the step that uses them. Move each one to `docs/DECISIONS.md` once it's answered. Questions 1 to 10 were asked at the end of Phase 0, each with a suggested answer.

1. **Clashes after being offline** (before Phase 3). Tom changes Rent offline at 9am, Jess changes it online at 10am, and Tom's phone reconnects at 11am. Whose change stays? *Suggested:* Jess's, because it was made last. "Newest" means when a change was made, not when it reached the server. Tom is told and can put his back with one tap.
2. **"This and all later ones" and earlier one-off changes** (before step 1c). Brief 5.4 says changes the edit replaces are dropped. Say March's rent was changed on its own to £580, then rent is changed to £560 for this and all later ones from January. *Suggested:* March becomes £560, because the new edit changes the same thing. One-off changes to other things stay: a moved date stays unless the edit changes dates, a note stays unless it changes the note, and ticks always stay.
3. **Pay-later bills: which spends each bill covers** (D32, before step 1e). *Suggested:* each card has a statement day, which starts as the day before the bill day. A bill covers spends from the day after the last statement day up to this one, so a bill on Sun 29 Nov covers spends from Thu 29 Oct to Sat 28 Nov. What's left on that budget is spent on the card, not from the bank account, so it shows on its own line under Left to spend ("On the pay-later card: £80.00 left until Sat 28 Nov"), not inside it. The bill itself pays for spending already done, so it doesn't count in Left to spend even when it falls before payday; it shows in the plan like rent.
4. **"Update from statement" and the time** (before step 1d). Balance updates store a time (D33), but debt updates only have a date (D27), so a payment ticked later on the same day as a statement update wouldn't come off the debt. *Suggested:* debts work like D33. Store the time of each statement update; a payment ticked after it comes off, even on the same day; ticks made inside the update steps count as before.
5. **Paying more than what's left** (before step 1d). Sam's Credit card will have £20.99 left before its payment on Wed 15 Mar 2028, but the planned payment is £25.00, so £4.01 more leaves the bank than the debt needs. *Suggested:* no automatic change. The debt shows "Paid off" (D34), and the payment says "£4.01 more than what's left", with a one-tap fix: "Make it £20.99 and stop after it". A minimum worked out from a rule never goes above the balance.
6. **Kofi's 25% for tax** (before step 1e). Brief Part 2 says Kofi sets money aside for tax automatically, but no rule says how. *Suggested:* an optional "Set aside" on any money coming in. A percentage moves to a chosen account on the same day, rounded to the nearest penny (D9). It follows the estimate, and changes when the real amount is typed in.
7. **A debt or goal that belongs to one person** (before Phase 3). Brief 4.14 marks each as shared or one person's, but doesn't say whether the partner can see one person's debt. *Suggested:* private to that person unless they choose to share it, like an account. A payment to it from a shared account still shows in the shared plan with its name and amount, but the debt's balance and paid-off date stay private.
8. **"Next main payday" for irregular pay** (before step 1b). D14 makes Kofi's plan periods Monday to Sunday, but Left to spend (D28) and "Move to next payday" need a next payday. *Suggested:* use the next Monday, so Kofi sees "Left to spend until Mon 2 Nov".
9. **A balance checked in an earlier budget period** (before step 1e). D2 assumes the balance was checked in the current budget period. If Sam last updated his balance on a Thursday and it's now Saturday, D2 read word for word would take last week's unspent money out today, although D30 says it stays in the account, and it's unclear whether this week's spends count on top of the full budget. *Suggested:* D2's rule applies to the budget period that contains today, with spends recorded at or before the balance update counted as inside the balance. A budget period that ended between the update and today takes nothing more: its spends show on their dates, and anything unspent stays in the account, or rolls over if roll-over is on (D30).
10. **Cloudflare Workers instead of Pages** (D18, before Phase 2). *Suggested:* yes, use Workers. Cloudflare now tells new projects to start there; Pages keeps working but gets no new features. Same company and price, with a preview link for every pull request. Details in `docs/ARCHITECTURE.md` section 1.6.

## Launch checklist (started)

Filled in during Phase 5 from brief Part 7. Items already agreed:

1. Set up a limited company (D24). This goes first, before the Apple and Google developer accounts.
2. Prices say "including VAT" only once the business is VAT-registered (D25).
3. Move Supabase to its paid plan before launch (D19).
Proposed in Phase 0, waiting for the owner's approval:

- Buy the web address by Phase 3, because sign-in emails must come from it (about £10 a year).
- Read Cloudflare's free plan terms to check they allow a paid app. If they don't, Cloudflare's paid Workers plan is US$5 a month.
