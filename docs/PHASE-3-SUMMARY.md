# Phase 3 summary

Where PrePenny stands at the end of Phase 3, accounts and sync (13 Nov 2026), in plain English. The details are in `PLAN.md` and `docs/DECISIONS.md`.

## What PrePenny can do now

**On one phone, with or without an account** (Phases 1 and 2):

- Set up a plan in 6 screens, about 5 minutes: accounts and balances, every kind of pay, rent and bills, debts, spending money. Or look around Sam's example plan first.
- See the balance after every payment, the lowest point ahead, Tight and Short with the exact amount and date, and what each payday has to cover.
- Update the balance from the bank, tick payments, add, change, move or remove any payment, for one or for all later ones, and undo it.
- Record "I spent", overtime and missed shifts; keep debts with the date each is paid off; keep budgets and savings goals.
- Practise changes in What if, and work out take-home pay with the calculator, also free at `/pay-calculator/` with no account.
- Work with no signal, and fast on a slow phone.

**With an account** (Phase 3):

- Sign up and sign in with a 6-digit code by email, or with Google. Sign out in two taps, which leaves nothing on the phone.
- The plan is kept in the account, in London, and follows the person to any phone or computer. A change on one reaches the others within seconds.
- Changes made with no signal wait on the phone and go when the signal is back. When two phones change the same payment, the newest change is kept and the other person is told, with "Put mine back".
- See every signed-in device, sign any of them out, or all the others at once; two-step sign-in with an authenticator app; change the email address; a backup email for getting back in, with a 24-hour wait anyone signed in can stop; an App lock with a PIN.
- **Share with a partner**: invite by link or email, "Can edit" or "Can view only"; choose which accounts are shared, while the rest stay private; "Changed by Tom" on each payment; Activity, with undo for your own changes; a History on every payment, kept for as long as the plan exists; shared or private debts and goals, with what each person has put in; change a partner's role; make an account private again; leave at any time, with or without a copy.
- **Your data**: download a spreadsheet and a backup, import a backup, and delete the account and everything in it, in a shared plan too, where your changes stay as made by "Someone who has left".

**Proved by step 3i, on this computer, before it was marked ready:**

- Brief 8.7 tests 1 to 6, on two phones, at both phone widths, in light and dark.
- A security test that tried every request a partner, a stranger with an account, and someone signed out could make for Jess's private records, through every table, every database step, GraphQL, every live-update channel and the get-back-in function, with her real ids: none gave anything or changed anything.
- The six people's journeys again, signed in, on two phones, with a change made with no signal, every day's balance a year ahead checked on both phones.
- An outside review of everything Phase 3 added found seven problems, none of them showing anyone's private records to anyone else. All are fixed, each with a test.

## What's left

**Phase 4, polish:** reminders (payday, a bill tomorrow, "You'll be £40 short on Sunday", a weekly summary); the help centre, "Something looks wrong", Contact us and the support tools; fresh bank holidays from PrePenny's own site; a full accessibility check against WCAG 2.2 AA; a speed check on a real mid-range Android phone; installing to the home screen. Also the smaller items moved there (`PLAN.md` items 10, 21, 22, 38, 52, 57 and others).

**Phase 5, ready to launch:** subscriptions with Stripe, in test mode first: the free trial, Solo, Couple, founders, referrals and organisation places; the privacy notice, terms and accessibility statement, drafted for a legal review; the front page with the tagline and a link to the free calculator; opt-in, counts-only analytics; error reports and monitoring; and your launch checklist.

**Phase 6, the app stores:** the iPhone and Android apps from the same code, with Apple and Google sign-in, notifications and fingerprint or face to open, in-app subscriptions where the stores' rules need them, and both store listings, through review until they're live.

**Waiting for you** (`PLAN.md`, "Waiting for the owner"):

1. Testing with three people (`docs/TESTING-WITH-PEOPLE.md`).
2. When a shared budget's money leaves: on each person's own payday, as now, or the payday of the person who added it (recommended), or one payday for the plan.
3. Whether to switch GraphQL off on the live database (recommended): PrePenny never uses it.

## The launch checklist, as it stands

1. Set up a limited company, before the Apple and Google developer accounts.
2. Prices say "including VAT" only once the business is VAT-registered.
3. Move Supabase to its paid plan, and with it make the preview database and its key.
4. Buy the web address. **Done 6 Nov 2026**: prepenny.co.uk, and prepenny.com sending people there.
5. Read Cloudflare's free plan terms to check they allow a paid app; if not, its paid plan.
6. With the move to Supabase's paid plan, its custom domain add-on, so Google's sign-in page says a PrePenny address.
7. Once the privacy notice is reviewed, add its link in Google Cloud and open "Continue with Google" to everyone.
8. Decide again whether to add a backup phone number for getting back in (text messages cost money).
9. Check how long Resend keeps sent emails; if it's longer than 30 days, change "within 30 days" in the app, the deletion email and the privacy notice.

Phase 5 adds the rest from the brief: checking the name PrePenny on the UK trademark register and at Companies House, registering with the Information Commissioner's Office if needed, the privacy notice, terms and accessibility statement, and a short legal review.

## What it costs you each month

These are the services' published prices, as written in `docs/ARCHITECTURE.md` section 1 on 27 Oct 2026, in pounds at roughly today's rate. The sandbox step 3i was built in couldn't open the services' own websites, so check each one before launch (the checklist above says which).

**Now: about £2 a month.**

| Service | Now | Why |
| --- | --- | --- |
| Supabase (database, sign-in, live updates) | £0 | Free plan |
| Cloudflare (hosting the app) | £0 | Free plan |
| Resend (emails) | £0 | Free plan: 3,000 emails a month, 100 a day |
| Google sign-in | £0 | Free |
| GitHub (the code and its checks) | £0 | The repository is public since 12 Nov 2026, and GitHub's checks are free for public repositories; your Billing page shows it |
| The two web addresses | about £2 a month | About £10 a year each; what you paid on 6 Nov is the real figure |

**After launch: about £40 a month, plus Stripe's share of each payment.**

| Service | After launch | Why |
| --- | --- | --- |
| Supabase paid plan | about £20 | Backups, no pausing, the 90-day sign-out (US$25) |
| Supabase custom domain | about £8 | auth.prepenny.co.uk on Google's sign-in page (US$10) |
| Cloudflare paid plan | about £4, if needed | Only if its free plan's terms don't allow a paid app (US$5) |
| Apple Developer Program | about £7 | £79 a year, for the App Store |
| Google Play | £0 a month | US$25 once |
| The two web addresses | about £2 | As now |
| Resend | £0 at first | Its paid plan, about £16 (US$20), only once PrePenny sends more than 100 emails a day |
| Stripe | no monthly fee | About 1.5% + 20p of each UK card payment, plus 0.7% for subscriptions: about 27p on a £2.99 Solo month |

Error reports (Sentry) and the status page (UptimeRobot) are planned on their free plans. Setting up and running the limited company has costs of its own, outside PrePenny's services.
