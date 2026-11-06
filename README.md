# PrePenny

Plan every penny before payday.

PrePenny is a money planner for people in the UK who live payday to payday. You type in what your bank shows today and every payment coming up, and it shows the balance left after each one, the lowest point ahead and when each debt is paid off.

Phase 2 is done (4 Nov 2026): the money engine, and the whole app on one phone. Someone can make their own plan in eight steps, or look around Sam's example plan; see Home, Coming up and their debts; update their balance, add, change, move, tick or remove any payment and undo it; record what they spend from a budget; add overtime or a missed shift; keep savings goals; practise changes in What if; and work out take-home pay, in the app or on the free public calculator. Everything is saved on the phone only, and it works with no signal. Phase 3 has started: step 3a built the database in London and its privacy rules (5 Nov 2026), and step 3b added signing up, signing in and signing out (6 Nov 2026), with a code by email or with Google. The plan still stays on the phone: keeping it on the server and sharing it come in the next steps. See `PLAN.md` for progress.

## Where the documents are

| Document | What it's for |
| --- | --- |
| [`docs/BRIEF.md`](docs/BRIEF.md) | The full product brief. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every decision made since the brief, and why. Wins over the brief. |
| [`docs/VOICE.md`](docs/VOICE.md) | How all text is written, and the banned words. |
| [`docs/DESIGN.md`](docs/DESIGN.md) | How every screen looks: font, sizes, colours, parts. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How it's built: tools, the engine, the data, screens, folders, tests and risks. |
| [`PLAN.md`](PLAN.md) | Progress, questions waiting for the owner, and the launch checklist. |
| [`CLAUDE.md`](CLAUDE.md) | Rules for every Claude Code session on this repository. |

## Checks

GitHub checks every change, once for each commit, on its pull request and again on `main` (D300). To see them, open the repository on GitHub and tap **Actions**, then **Check**. A green tick means everything passed.

GitHub runs two sets of checks:

- **Lint, type checks, tests and the database** checks the code, runs every engine and app test, and builds a fresh copy of the database on GitHub's machine to test who can see and change what (see "The database" below). About 2 minutes, on every push.
- **Build and end-to-end tests** builds the app and uses it in a real browser at 320px and 360px wide, in light and dark, as a phone would, in three parts side by side so it finishes sooner: "part 1 of 3", "part 2 of 3" and "part 3 of 3". Part 3 also signs up, signs in and signs out against a copy of Supabase on GitHub's machine, which catches the emails instead of sending them. About 12 minutes for parts 1 and 2, and about 21 for part 3.

GitHub's minutes cost money once the free ones are used, so the end-to-end tests wait until a pull request is ready. Claude Code opens each step's pull request as a **draft**, which gets the first set on every push, and marks it **Ready for review** when the step is done, which starts the end-to-end tests and the preview link. Every push after that runs both, and so does `main`, always, before anything goes live. A newer push stops the older checks on a pull request, never on `main`.

To run them on a computer, install Node 24, pnpm 12, Docker and the Supabase command line (version 2.122.0), then run:

```
pnpm install
pnpm lint
pnpm typecheck
pnpm test
supabase start
supabase test db
pnpm build:local
pnpm --filter @prepenny/web exec playwright install chromium
pnpm e2e
```

To look at the app on a computer while working on it, run `pnpm --filter @prepenny/web dev` and open http://localhost:3000/. A browser with nothing saved starts at the welcome and setup.

## Putting PrePenny online

The app is hosted on Cloudflare Workers (D68), on Cloudflare's free plan. GitHub puts it online by itself, with the **Deploy** workflow (`.github/workflows/deploy.yml`): every pull request gets its own preview link, and every change merged into `main` goes to the live app once GitHub's checks have passed on it.

The live app is at https://prepenny.prepenny.workers.dev/app/ (set up by the owner on 3 Nov 2026, D195), and at https://prepenny.co.uk/app/ once part A of "Signing in" is done (D304).

### How to put an update online

You don't need to type any commands. Everything is done on github.com, on a phone or a computer. An update arrives as a **pull request**: a proposed change, with a name such as "Step 2h: Phase 2 complete".

1. **Open the pull request.** Go to https://github.com/TomiwaPro/Prepenny and tap **Pull requests**, then the update's name.
2. **Try the preview.** A few minutes after the pull request is marked ready, a comment appears on it from **github-actions** with a preview link, such as `https://pr-19-prepenny.prepenny.workers.dev/app/`. Open it on your phone and try the update. It's a separate copy: nothing you do there touches the live app. If no link appears after 15 minutes, see "If something goes wrong" below.
3. **Check the ticks.** Scroll to the bottom of the pull request. Wait until every check has a green tick. There are five: "Lint, type checks, tests and the database", "Build and end-to-end tests" parts 1, 2 and 3, and "Put the app online". A yellow dot means it's still running (about 20 minutes). A red cross means a check failed: don't merge, and see "If something goes wrong". If it still says **Draft**, Claude Code hasn't finished the step yet.
4. **Merge it.** When you're happy with the preview and every tick is green, tap **Merge pull request**, then **Confirm merge**. GitHub may say **Squash and merge** or **Create a merge commit** instead; either is fine.
5. **Wait for it to go live.** Merging starts the checks again, on `main` this time. When they pass, the Deploy workflow puts the update on the live app, about 20 minutes after merging in all, and the Database workflow sends any database changes to the real database. To watch it, tap **Actions**: the newest **Check** run, then the newest **Deploy** run, each get a green tick when they're done.
6. **See it on your phone.** Open the live app. If PrePenny was already open, a note at the bottom says "PrePenny has been updated. Tap to reload." Tap it. People's plans stay as they were: they're saved on their own phones, and an update never changes them.

### If something goes wrong

- **A check has a red cross.** Don't merge. Tap **Details** beside it to see which test failed, and ask Claude Code to fix it: say "the checks failed on pull request" and its number. The live app is unchanged.
- **No preview link.** Tap **Actions**, then **Deploy**, then the newest run for the pull request. If it says "Cloudflare isn't set up yet", the Cloudflare key has expired or been removed: follow "Setting it up the first time" below to make a new one.
- **The live app didn't change after merging.** Tap **Actions**. If the **Check** run on `main` has a red cross, nothing went live, which is on purpose: ask Claude Code to fix it. If **Deploy** has a red cross, tap it, then **Re-run all jobs**. You can also put `main` online by hand: **Actions**, then **Deploy**, then **Run workflow**, keeping **Branch: main**, then **Run workflow** again.
- **Take an update back.** Open the merged pull request and tap **Revert**, then **Create pull request**. That makes a new pull request that undoes it; merge it the same way, from step 3.

### Setting it up the first time (the owner does this once)

GitHub needs permission to put the app on your Cloudflare account. Cloudflare changes its menus now and then, so a label may be slightly different from these.

1. Go to https://dash.cloudflare.com/sign-up and make a free account, or sign in if you have one. Confirm your email address if Cloudflare asks.
2. In the menu on the left, open **Workers & Pages** (it may be under **Compute**). The first time, Cloudflare asks you to choose a **workers.dev subdomain**: a short name that becomes part of the app's web address, such as `prepenny-yourname`. Choose one and confirm it.
3. Copy your **Account ID**. On the **Workers & Pages** page it's on the right, under **Account details**, with a copy button. Keep it somewhere for step 6.
4. Make a key for GitHub. Tap the person icon at the top right, then **My Profile**, then **API Tokens**, then **Create Token**. Beside **Edit Cloudflare Workers**, tap **Use template**.
5. Under **Account Resources**, choose **Include** and your account. Under **Zone Resources**, choose **Include** and **All zones**. Tap **Continue to summary**, then **Create Token**. Copy the token straight away: Cloudflare shows it only once.
6. In GitHub, open the repository, then **Settings**, then **Secrets and variables**, then **Actions**, then **New repository secret**. Add two secrets, one at a time:
   - Name `CLOUDFLARE_API_TOKEN`, with the token from step 5.
   - Name `CLOUDFLARE_ACCOUNT_ID`, with the Account ID from step 3.
7. Open the pull request, then **Checks**, then **Deploy**, and tap **Re-run all jobs** (or push any new commit). A few minutes later the pull request gets a comment with its preview link.

Until the two secrets are added, the Deploy workflow still builds the app but says "Cloudflare isn't set up yet, so nothing was put online".

The first time, before anything has been merged, the Deploy workflow puts the pull request's version online once as the live app too, because Cloudflare needs a live app before it can make previews of it.

## The database

PrePenny's database is a Supabase project in London, on Supabase's free plan for now (D17, D19). It will hold each person's plan once they sign in (Phase 3). Its tables and privacy rules are in `supabase/migrations`, and the tests that prove who can see and change what are in `supabase/tests` (step 3a, D288 to D298).

Nobody changes the real database by hand. GitHub does it, the same way it puts the app online:

- On every pull request, the **Lint, type checks, tests and the database** check builds a fresh copy of the database on GitHub's own machine, with made-up people (Jess, Tom and Alex), and runs every test on it. Nothing there touches the real database.
- When a pull request is merged into `main` and every check has passed on it, the **Database** workflow (`.github/workflows/database.yml`) sends the changes to the real database in London. The made-up people and the tests never go there.

### Setting it up the first time (the owner does this once)

GitHub needs permission to change your Supabase project. Supabase changes its menus now and then, so a label may be slightly different from these.

1. Go to https://supabase.com/dashboard/sign-up and make an account. **Continue with GitHub** is the quickest; an email address and password works too. Confirm your email address if Supabase asks.
2. Supabase asks you to make an **organisation**. Call it `PrePenny`, choose **Personal** if it asks what kind, and choose the **Free** plan. Tap **Create organization**.
3. Make the project. Tap **New project** and choose the PrePenny organisation. Fill in:
   - **Project name:** `prepenny`
   - **Database password:** tap **Generate a password**, then copy it into your password manager straight away. You need it in step 6.
   - **Region:** the one that says **London** (its code is `eu-west-2`).
   - Leave everything else as it is, then tap **Create new project**. It takes a minute or two; wait until the project's page no longer says it's being set up.
4. Copy the **Project ID**. Tap the gear icon at the bottom of the menu on the left (**Project Settings**), then **General**. The Project ID is 20 letters, such as `abcdefghijklmnopqrst`. It's also in the web address of every page of your project.
5. Make a key for GitHub. Go to https://supabase.com/dashboard/account/tokens and tap **Generate new token**. Call it `GitHub, PrePenny`. If it asks when the token should expire, choose the longest time offered. Tap **Generate token**, and copy it straight away: Supabase shows it only once. It starts with `sbp_`.
6. In GitHub, open the repository, then **Settings**, then **Secrets and variables**, then **Actions**, then **New repository secret**. Add three secrets, one at a time:
   - Name `SUPABASE_ACCESS_TOKEN`, with the token from step 5.
   - Name `SUPABASE_PROJECT_REF`, with the Project ID from step 4.
   - Name `SUPABASE_DB_PASSWORD`, with the database password from step 3.
7. Tell Claude Code it's done. The real database gets its tables when the step 3a pull request is merged.

Until the three secrets are added, the Database workflow says "Supabase isn't set up yet, so the real database wasn't changed".

Keep the token and the password only in GitHub's secrets and your password manager: anyone with the token can change your Supabase projects. PrePenny never needs Supabase's "service role" key in the app.

### If something goes wrong with the database

- **The Database workflow has a red cross saying it couldn't reach the database.** On the free plan, a project that hasn't been used for a week is paused, and Supabase emails you first. Open the project on supabase.com and tap **Restore project**, wait a few minutes, then open **Actions**, then **Database**, then **Run workflow**, keeping **Branch: main**, then **Run workflow** again. Moving to Supabase's paid plan before launch stops the pausing (D19).
- **It says a secret is wrong.** Make the token again (step 5) and replace `SUPABASE_ACCESS_TOKEN`, or reset the database password under **Project Settings**, then **Database**, and replace `SUPABASE_DB_PASSWORD`. Then run the workflow again as above.
- **The "Lint, type checks, tests and the database" check has a red cross on a pull request.** Don't merge: ask Claude Code to fix it. The real database is unchanged.

## Signing in

People sign up and sign in with a 6-digit code sent by email, or with Google (step 3b). Four services work together, each set up once by the owner. Do parts A to D in any order. Menus change now and then, so a label may be slightly different from these. Keys and passwords go only into GitHub's secrets, never into a chat or a message.

When the step 3b pull request is merged, the **Database** workflow sends the sign-in settings to Supabase itself (`supabase/sign-in-settings.json`). If you add a secret after that, send them again: in GitHub tap **Actions**, then **Database**, then **Run workflow**, keeping **Branch: main**, then **Run workflow** again.

### What to do before merging, and what can wait

- **Before merging:** B (Resend) and D (the two GitHub variables), and steps 1 to 3 of A (the app at prepenny.co.uk). Then the live app is built with signing in on, the sign-in emails come from hello@prepenny.co.uk to anyone, and the email's link opens.
- **Can wait:** C (Google). Until then, "Continue with Google" says "Google sign-in isn't switched on yet. Use your email address instead." Also the rest of A (www and prepenny.com sending people on, and replies forwarded), and E (Supabase's paid plan, before launch).
- **If you merge first,** nothing breaks, and nobody's plan is touched: plans stay on phones until step 3c.
  - The live app says "Signing in isn't switched on yet." until D is done and the app is put online again: **Actions**, then **Deploy**, then **Run workflow**, keeping **Branch: main**, then **Run workflow** again.
  - Supabase gets PrePenny's sign-in settings at the merge. Until B, Supabase's own test sender sends the emails, only to people in your Supabase team and only two an hour; once the Resend key is added, run **Database** by hand as above.
  - Until steps 1 to 3 of A, the email's link leads to prepenny.co.uk, which doesn't open yet. The code in the same email works.
- **Try signing in on the live app after merging,** not on the preview: Supabase only has PrePenny's email and settings once this is merged.

### A. The web addresses, in Cloudflare

prepenny.co.uk is the main address: the app, and the address sign-in emails come from. prepenny.com sends people there (D304).

The app at prepenny.co.uk:

1. Go to https://dash.cloudflare.com and sign in. Tap **Workers & Pages** (it may be under **Compute**), then **prepenny**.
2. Tap **Settings**, then under **Domains & Routes**, tap **Add**, then **Custom domain**.
3. Type `prepenny.co.uk` and tap **Add domain**. After a minute or two, https://prepenny.co.uk/app/ opens PrePenny.

www.prepenny.co.uk sends people to prepenny.co.uk:

4. Go back to the start of the dashboard (**Account home**) and tap **prepenny.co.uk**. Tap **DNS**, then **Records**, then **Add record**.
5. Choose **Type** `AAAA`, **Name** `www`, **IPv6 address** `100::`, and leave **Proxy status** on (an orange cloud). Tap **Save**.
6. Tap **Rules**, then **Overview** (or **Templates**). Find **Redirect from WWW to root** and tap it, then **Deploy** (or **Save**).

prepenny.com, and www.prepenny.com, send people to prepenny.co.uk:

7. Go back to **Account home** and tap **prepenny.com**. Tap **DNS**, then **Records**, and add two records, as in step 5: **Type** `AAAA`, **Name** `@`, **IPv6 address** `100::`, proxied; then **Type** `AAAA`, **Name** `www`, **IPv6 address** `100::`, proxied.
8. Tap **Rules**, then **Redirect Rules** (it may be under **Rules**, **Overview**), then **Create rule**. Call it `To prepenny.co.uk`. Under **If incoming requests match**, choose **All incoming requests**.
9. Under **Then**, choose **Dynamic**, and in **Expression** type `concat("https://prepenny.co.uk", http.request.uri.path)`. Choose **Status code** `301` and tick **Preserve query string**. Tap **Deploy**.
10. Try it: open https://prepenny.com/app/ and https://www.prepenny.co.uk/app/ on your phone. Both should end up at https://prepenny.co.uk/app/.

Replies to sign-in emails (optional, free):

11. In **prepenny.co.uk**, tap **Email**, then **Email Routing**, then **Get started**. Make the address `hello`, send it to your own email address, and confirm that address from the email Cloudflare sends. Cloudflare adds the records it needs. Anyone who replies to a sign-in email then reaches you.

The old address, https://prepenny.prepenny.workers.dev/app/, keeps working. A browser keeps a plan for each address on its own, so a plan you made at the old address stays there.

### B. Resend, which sends the sign-in emails

1. Go to https://resend.com/signup and make a free account (3,000 emails a month). Confirm your email address if Resend asks.
2. Tap **Domains**, then **Add domain**. Type `prepenny.co.uk`, and choose the region **Ireland (eu-west-1)**, so emails are sent from Europe. Tap **Add**.
3. Resend lists a few records (MX, and TXT for SPF and DKIM). If it offers to add them to Cloudflare for you (**Sign in to Cloudflare** or **Auto configure**), use that and sign in to Cloudflare. Otherwise, in Cloudflare open **prepenny.co.uk**, then **DNS**, then **Records**, and add each one exactly as Resend shows it, with **Proxy status** off (a grey cloud).
4. Also add this record in Cloudflare, which tells email providers what to do with emails that pretend to be from you: **Type** `TXT`, **Name** `_dmarc`, **Content** `v=DMARC1; p=none;`. Tap **Save**.
5. Back in Resend, tap **Verify DNS records**. Wait until prepenny.co.uk says **Verified** (usually a few minutes, sometimes an hour).
6. Tap **API Keys**, then **Create API key**. Call it `Supabase sign-in`, choose **Sending access**, and the domain `prepenny.co.uk`. Tap **Add**, and copy the key straight away: Resend shows it only once. It starts with `re_`.
7. In GitHub, open the repository, then **Settings**, then **Secrets and variables**, then **Actions**, then **New repository secret**. Name `RESEND_API_KEY`, with the key from step 6.

Until this is done, Supabase's own test sender sends the emails, but only to the people in your Supabase team, and only two an hour.

### C. Google, for "Continue with Google"

First, find the address Google sends people back to:

1. In Supabase (https://supabase.com/dashboard), open the **prepenny** project, then **Authentication**, then **Sign In / Providers** (or **Providers**), then **Google**. Copy the **Callback URL (for OAuth)**. It looks like `https://abcdefghijklmnopqrst.supabase.co/auth/v1/callback`. Don't change anything there: GitHub does that.

Then the Google Cloud project:

2. Go to https://console.cloud.google.com and sign in with the Google account you want to own it. At the top, tap the project list, then **New project**. Call it `PrePenny` and tap **Create**. Make sure PrePenny is the project shown at the top.
3. In the menu, open **Google Auth Platform** (it may be under **APIs & Services**, then **OAuth consent screen**) and tap **Get started**.
4. **App name** `PrePenny`; **User support email**: your email address. Tap **Next**. **Audience**: **External**. Tap **Next**. **Contact information**: your email address. Tap **Next**, agree to the policy, and tap **Create**.
5. Tap **Branding**. Under **Authorised domains**, add `prepenny.co.uk` and `supabase.co`. Under **App home page**, type `https://prepenny.co.uk`. Tap **Save**. Leave the privacy policy link empty for now (see question 5 in PLAN.md).
6. Tap **Data access**, then **Add or remove scopes**. Tick only these three: `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `openid`. Tap **Update**, then **Save**. Supabase asks Google for these: the email address, and the name and the address of the profile picture, which Google always sends with it. Supabase keeps them with the sign-in; PrePenny doesn't use or show them.
7. Tap **Clients**, then **Create client**. **Application type**: **Web application**. **Name** `PrePenny`. Under **Authorised JavaScript origins**, add `https://prepenny.co.uk`. Under **Authorised redirect URIs**, add the Callback URL from step 1. Tap **Create**.
8. Copy the **Client ID** and the **Client secret** straight away (or download them): Google may show the secret only once.
9. In GitHub's **New repository secret** (as in B7), add two secrets: name `GOOGLE_CLIENT_ID` with the Client ID, and name `GOOGLE_CLIENT_SECRET` with the Client secret.
10. Back in Google, tap **Audience**. While it says **Testing**, only the people you list under **Test users** (up to 100) can use Google sign-in: add your own Google address there to try it. Opening it to everyone (**Publish app**) is question 5 in PLAN.md.

### D. Telling the app which Supabase project to use

These two aren't secret: they're in the app every phone downloads.

1. In Supabase, open the **prepenny** project, then **Project Settings** (the gear), then **Data API** (or **API**). Copy the **Project URL**, such as `https://abcdefghijklmnopqrst.supabase.co`.
2. Still in **Project Settings**, tap **API Keys**. Copy the **Publishable key**, which starts with `sb_publishable_`. Never copy the **Secret key** or the **service_role** key: PrePenny never needs them.
3. In GitHub, open the repository, then **Settings**, then **Secrets and variables**, then **Actions**, then the **Variables** tab, then **New repository variable**. Add two: name `SUPABASE_URL` with the Project URL, and name `SUPABASE_PUBLISHABLE_KEY` with the publishable key.
4. The next preview or live version has signing in switched on. Until then it says "Signing in isn't switched on yet."

### E. In Supabase itself

Nothing else to change by hand: the Database workflow sets the sign-in settings with the key it already has. Two things only you can do, later:

- **Move to the paid plan before launch** (D19, about £20 a month). That also switches on "signed out after 90 days without opening PrePenny": the Database workflow asks for it every time, Supabase refuses it on the free plan, and it comes on by itself the next time the workflow runs.
- **Supabase's custom domain add-on**, if you want Google's page to say prepenny.co.uk (question 4 in PLAN.md).

To check it worked, once the step 3b pull request is merged: open https://prepenny.co.uk/app/ on your phone, tap **More**, then **Sign up or sign in**, type your email address and tap **Send me a code**. The email comes from PrePenny, hello@prepenny.co.uk, with a 6-digit code.

## Bank holidays

The engine's copy of the UK bank holiday list is `packages/engine/data/bank-holidays.json`, downloaded unchanged from https://www.gov.uk/bank-holidays.json by the **Bank holidays** workflow on GitHub. The file beside it, `bank-holidays.source.json`, says where it came from and when. To get a fresh copy, open **Actions**, then **Bank holidays**, then **Run workflow**. It only saves a new commit if the list has changed.

## Tax figures

The take-home pay calculator's figures for each tax year are in `packages/engine/src/pay/tax-years`, one file per tax year, with the GOV.UK page each figure comes from. The GOV.UK pages and HMRC's files they come from are saved unchanged in `sources/gov-uk/` by the **Fetch sources** workflow on GitHub, from the list of addresses in `sources/gov-uk.txt`. To fetch them again, open **Actions**, then **Fetch sources**, then **Run workflow**. A new tax year file is needed every April, and the tax year check warns from 1 March when next year's is missing.
