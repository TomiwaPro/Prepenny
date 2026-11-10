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
- **Build and end-to-end tests** builds the app and uses it in a real browser at 320px and 360px wide, in light and dark, as a phone would, in three parts side by side so it finishes sooner: "part 1 of 3", "part 2 of 3" and "part 3 of 3". Each part also takes a third of the tests that sign up, sign in and sign out, send plans up and bring them down on second phones, make changes with no signal and on two phones at once, and from step 3e sign out other devices, use two-step sign-in, change email addresses, get back in with a backup email (with its 24-hour wait and its stop link, from step 3e hardening) and update an old version, against a copy of Supabase on GitHub's machine, with its function runner, which catches the emails instead of sending them. Each part runs one test at a time (D343, D389).

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

The live app is at https://prepenny.co.uk/app/ (D304). Its old address, https://prepenny.prepenny.workers.dev/app/ (set up by the owner on 3 Nov 2026, D195), sends people to the same page there since step 3f-2 (D428).

### How to put an update online

You don't need to type any commands. Everything is done on github.com, on a phone or a computer. An update arrives as a **pull request**: a proposed change, with a name such as "Step 2h: Phase 2 complete".

1. **Open the pull request.** Go to https://github.com/TomiwaPro/Prepenny and tap **Pull requests**, then the update's name.
2. **Try the preview.** A few minutes after the pull request is marked ready, a comment appears on it from **github-actions** with a preview link, such as `https://pr-19-prepenny.prepenny.workers.dev/app/`. Open it on your phone and try the update. It's a separate copy, and says "Test version: don't use real details." at the top: nothing you do there touches the live app or the real database. **What a preview can do for now** (D411): everything kept on the phone, such as the welcome, setup, the example plan, and every screen and change. **What it can't:** signing in is off on previews until the preview database is set up, with Supabase's paid plan before launch, so signing in, saving the plan in an account and keeping two devices in step are tried on the live app after merging, with a spare email address. If no link appears after 15 minutes, see "If something goes wrong" below.
3. **Check the ticks.** Scroll to the bottom of the pull request. Wait until every check has a green tick. There are five: "Lint, type checks, tests and the database", "Build and end-to-end tests" parts 1, 2 and 3, and "Put the app online". "Get the preview database ready, and try the preview" shows as skipped until the preview database is set up (D411), and is a sixth tick after that. A yellow dot means it's still running (about 20 minutes). A red cross means a check failed: don't merge, and see "If something goes wrong". If it still says **Draft**, Claude Code hasn't finished the step yet.
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
5. Under **Account Resources**, choose **Include** and your account. Under **Zone Resources**, choose **Include** and **All zones**. Under **Permissions**, check there's a line for **Zone**, **Zone**, **Read**, and add it with **+ Add more** if not: the live app needs it to keep its own address (D322). Tap **Continue to summary**, then **Create Token**. Copy the token straight away: Cloudflare shows it only once.
6. In GitHub, open the repository, then **Settings**, then **Secrets and variables**, then **Actions**, then **New repository secret**. Add two secrets, one at a time:
   - Name `CLOUDFLARE_API_TOKEN`, with the token from step 5.
   - Name `CLOUDFLARE_ACCOUNT_ID`, with the Account ID from step 3.
7. Open the pull request, then **Checks**, then **Deploy**, and tap **Re-run all jobs** (or push any new commit). A few minutes later the pull request gets a comment with its preview link.

Until the two secrets are added, the Deploy workflow still builds the app but says "Cloudflare isn't set up yet, so nothing was put online".

Cloudflare needs a live app before it can make previews of it, and a pull request's version is never put online as the live app (D409). If a preview's Deploy run ever says "The live app isn't on Cloudflare yet", put `main` online first: **Actions**, then **Deploy**, then **Run workflow**, keeping **Branch: main**, then **Run workflow** again.

## The database

PrePenny's database is a Supabase project in London, on Supabase's free plan for now (D17, D19). From step 3c it holds each person's plan once they sign in: the phone sends every change there, and brings the plan down on another phone. Its tables and privacy rules are in `supabase/migrations`, and the tests that prove who can see and change what are in `supabase/tests` (step 3a, D288 to D298).

Nobody changes the real database by hand. GitHub does it, the same way it puts the app online:

- On every pull request, the **Lint, type checks, tests and the database** check builds a fresh copy of the database on GitHub's own machine, with made-up people (Jess, Tom and Alex), and runs every test on it. Nothing there touches the real database.
- When a pull request is merged into `main` and every check has passed on it, the **Database** workflow (`.github/workflows/database.yml`) sends the changes to the real database in London. The made-up people and the tests never go there. Then it checks the project's **Data API** shows PrePenny's public part only, never its private checks (`app`), and says exactly what to do if it ever does (D341).
- A pull request's preview never uses the real project. For now its signing in is off, and each step's database changes are tried on the live app after merging (D411). Once a second project, **prepenny-preview**, is set up with Supabase's paid plan, previews use it, and database changes can be tried before merging. See "The preview database" below.
- Before changing anything, the Database workflow checks its key has every permission in step 5 below. If any are missing, it stops with one message listing all of them, and nothing is changed (D406).

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
5. Make a key for GitHub. Go to https://supabase.com/dashboard/account/tokens and tap **Generate new token**. Call it `GitHub, PrePenny`. If it asks when the token should expire, choose the longest time offered. Give it these permissions on the **prepenny** project, named as Supabase's token page names them (checked on 9 Nov 2026). Each is something a run of the Database workflow does:
   - **Project Settings: Read-write**: to find the project, and, with Auth Config, to send the sign-in settings.
   - **Auth Config: Read-write**: to send the sign-in settings.
   - **Database: Read-write**: to give the database the Resend key.
   - **Migrations: Read-write**: for Supabase's command line, which sends the database changes.
   - **Edge Functions: Read-write**: to put the get-back-in function online.
   - **API Keys: Read** and **API Key Secrets: Read**: for Supabase's command line, to connect to the project.
   - **Data API Config: Read**: to check the Data API shows only PrePenny's public part.
   - **Database Config: Read**, **Connection Pooling: Read** and **Storage Config: Read**: for Supabase's command line, to connect to the database.

   Leave every other permission as **No access**. Tap **Generate token**, and copy it straight away: Supabase shows it only once. It starts with `sbp_`. Each run checks the key has all eleven before it changes anything, and if any are missing it stops with one message listing them all, such as "Migrations: Read-write, Edge Functions: Read-write" (D406).
6. In GitHub, open the repository, then **Settings**, then **Secrets and variables**, then **Actions**, then **New repository secret**. Add three secrets, one at a time:
   - Name `SUPABASE_ACCESS_TOKEN`, with the token from step 5.
   - Name `SUPABASE_PROJECT_REF`, with the Project ID from step 4.
   - Name `SUPABASE_DB_PASSWORD`, with the database password from step 3.
7. Tell Claude Code it's done. The real database gets its tables when the step 3a pull request is merged.

Until the three secrets are added, the Database workflow says "Supabase isn't set up yet, so the real database wasn't changed".

Keep the token and the password only in GitHub's secrets and your password manager: anyone with the token can change your Supabase project. PrePenny never needs Supabase's "service role" key in the app.

### If something goes wrong with the database

- **The first Database step says the key is missing permissions.** It lists every one missing, as Supabase's token page names them, and nothing was changed. Make a new key with every permission in step 5 above, replace `SUPABASE_ACCESS_TOKEN` with it as in step 6, then run the workflow again: **Actions**, then **Database**, then **Run workflow**, keeping **Branch: main**, then **Run workflow** again. Until it has run, the live app says "Changes can't be sent right now. They're saved on this phone." if the update changed the database, and nothing on anyone's phone is lost (D386).
- **A later Database step says Supabase refused it (403, "forbidden" or "not allowed").** Supabase needs a permission the check didn't know of: tell Claude Code what the step says.

- **The Database workflow has a red cross saying it couldn't reach the database.** On the free plan, a project that hasn't been used for a week is paused, and Supabase emails you first. Open the project on supabase.com and tap **Restore project**, wait a few minutes, then open **Actions**, then **Database**, then **Run workflow**, keeping **Branch: main**, then **Run workflow** again. Moving to Supabase's paid plan before launch stops the pausing (D19).
- **It says a secret is wrong.** Make the token again (step 5) and replace `SUPABASE_ACCESS_TOKEN`, or reset the database password under **Project Settings**, then **Database**, and replace `SUPABASE_DB_PASSWORD`. Then run the workflow again as above.
- **The "Lint, type checks, tests and the database" check has a red cross on a pull request.** Don't merge: ask Claude Code to fix it. The real database is unchanged.
- **The Database workflow says "The Data API shows app".** On supabase.com, open the **prepenny** project, then **Project Settings** (the gear), then **Data API**. Under **Exposed schemas**, remove `app`, keep `public` and `graphql_public`, and tap **Save**. Then run the workflow again as above. To check by hand at any time, look at the same list: it should show `public` and `graphql_public` only.

## The preview database

**Waiting for Supabase's paid plan** (D411). Supabase's free plan allows two active projects, and both are in use, so prepenny-preview is made when PrePenny moves to the paid plan before launch: the steps below are on the launch checklist in `PLAN.md`. Until then, previews are built with signing in off, the job below is switched off (it shows as skipped, never red), and each step's database changes are tried on the live app after merging, with a spare email address. Everything is ready for the day its three secrets and two variables are added: nothing else needs changing.

A second Supabase project, **prepenny-preview**, in London, used only by pull request previews (step 3e-2, D403). It never holds real people's data, and each preview says so at the top of every page: "Test version: don't use real details." The live app and the real database never use it, and it never gets the real project's key.

When a pull request is marked ready, and at every push after that, GitHub's **Deploy** workflow:

1. puts the preview online, built to use prepenny-preview only, and posts its link on the pull request;
2. checks, before changing anything, that the project is prepenny-preview and not the real one, and that the preview key has every permission it needs;
3. gives prepenny-preview the pull request's database changes, its sign-in settings (emails come through Resend from "PrePenny (test version)", with the key GitHub already has) and the get-back-in function;
4. tries the preview on two phones: signs in, saves a plan and keeps it in step between them, checking neither phone asks the real project anything and the live app isn't the preview;
5. updates the link's comment, saying how that went.

On a preview, sign in by typing the 6-digit code from the email. The email's link opens whichever preview was put online last, which may be another pull request's.

**Two pull requests open at once** (D405). There's one preview database, so it follows the pull request whose preview went online last, one at a time:

- Most pull requests don't change the database. When the preview database already has exactly a pull request's database changes, nothing in it changes, and anyone signed up on it stays signed up. Any number of these share it.
- A pull request with database changes of its own takes the preview database over: it gets that pull request's changes, adding them when it can and otherwise starting again, empty. Starting again removes test accounts too, so sign up again on the preview.
- The other pull requests' previews then say "Changes can't be sent right now. They're saved on this phone." until theirs are put online again, and GitHub comments on each to say so. To try one again: **Actions**, then **Deploy**, then its newest run, then **Re-run all jobs**.
- GitHub keeps only one waiting in line: if three are put online at once, the middle one's "Get the preview database ready, and try the preview" check is cancelled. Its link is still there; tap **Re-run all jobs** on it as above.

On the paid plan, each project has its own monthly cost: check Supabase's pricing when it's made.

### Setting it up (the owner does this once, with the paid plan)

Supabase changes its menus now and then, so a label may be slightly different from these. Keys and passwords go only into your password manager and GitHub's secrets, never into a chat or a message.

Make the project:

1. Go to https://supabase.com/dashboard and sign in. Choose the **PrePenny** organisation, then tap **New project**.
2. Fill in:
   - **Project name:** `prepenny-preview`, exactly. GitHub changes only a project with this name, so it can never change the real one.
   - **Database password:** tap **Generate a password**, then copy it into your password manager straight away, as "PrePenny preview database". You need it in step 9.
   - **Region:** the one that says **London** (its code is `eu-west-2`).
   - Leave everything else as it is, as for the real project, then tap **Create new project**. Wait until its page no longer says it's being set up.
3. Copy the **Project ID**: tap the gear icon at the bottom of the menu on the left (**Project Settings**), then **General**. It's 20 letters. Keep it for step 9.
4. Still in **Project Settings**, tap **Data API** (or **API**) and copy the **Project URL**, such as `https://abcdefghijklmnopqrst.supabase.co`. Keep it for step 10.
5. Still in **Project Settings**, tap **API Keys** and copy the **Publishable key**, which starts with `sb_publishable_`. Keep it for step 10. Never copy the **Secret key**: GitHub reads it itself when it needs it.

Make its own key for GitHub, separate from the real project's:

6. Go to https://supabase.com/dashboard/account/tokens and tap **Generate new token**. Call it `GitHub, PrePenny preview`. If it asks when the token should expire, choose the longest time offered.
7. Give it permissions on the **prepenny-preview** project only, never on **prepenny**. The same eleven as the real project's key, named as Supabase's token page names them:
   - **Project Settings: Read-write**
   - **Auth Config: Read-write**
   - **Database: Read-write**
   - **Migrations: Read-write**
   - **Edge Functions: Read-write**
   - **API Keys: Read**
   - **API Key Secrets: Read**
   - **Data API Config: Read**
   - **Database Config: Read**
   - **Connection Pooling: Read**
   - **Storage Config: Read**

   Leave every other permission as **No access**. "The database", step 5, above says what each is for.
8. Tap **Generate token**, and copy it straight away: Supabase shows it only once. It starts with `sbp_`.

Give GitHub the secrets and variables. Don't change `SUPABASE_ACCESS_TOKEN` or any other secret or variable already there: those are the real project's.

9. On github.com, open the repository, then **Settings**, then **Secrets and variables**, then **Actions**. On the **Secrets** tab, tap **New repository secret** and add three, one at a time:
   - Name `PREVIEW_SUPABASE_ACCESS_TOKEN`, with the key from step 8.
   - Name `PREVIEW_SUPABASE_PROJECT_REF`, with the Project ID from step 3.
   - Name `PREVIEW_SUPABASE_DB_PASSWORD`, with the database password from step 2.
10. On the **Variables** tab, tap **New repository variable** and add two:
    - Name `PREVIEW_SUPABASE_URL`, with the Project URL from step 4.
    - Name `PREVIEW_SUPABASE_PUBLISHABLE_KEY`, with the publishable key from step 5.
11. Tell Claude Code it's done.

Until the two variables are there, previews are put online with signing in off. Until the three secrets are there too, the preview database isn't got ready, and the pull request's comment says so. Nothing changes on the real project either way.

### If something goes wrong with the preview database

Open **Actions**, then **Deploy**, then the pull request's newest run, then **Get the preview database ready, and try the preview**. The first step with a red cross says what to do:

- **The key is missing permissions.** It lists every one missing. Make a new key for prepenny-preview with all eleven (steps 6 to 8), replace `PREVIEW_SUPABASE_ACCESS_TOKEN` with it, and tap **Re-run all jobs**.
- **"Not the preview project", "Preview address", or a project "called" something else.** `PREVIEW_SUPABASE_PROJECT_REF` or `PREVIEW_SUPABASE_URL` holds another project's: put prepenny-preview's in (steps 3 and 4). Nothing was changed on any project.
- **The check says cancelled.** Another pull request's preview took its turn (see above): tap **Re-run all jobs**.
- **"Couldn't reach the preview database".** The password is wrong, or the project is paused. Reset its database password under **Project Settings**, then **Database**, and replace `PREVIEW_SUPABASE_DB_PASSWORD`; or, if supabase.com shows prepenny-preview as paused, tap **Restore project** and wait a few minutes. Then **Re-run all jobs**.
- **The try on two phones failed.** The step says which part, and a report is kept with the run, under **Artifacts**. Tell Claude Code.

Resend's free plan sends 100 emails a day, shared between the live app and previews.

## Signing in

People sign up and sign in with a 6-digit code sent by email, or with Google (step 3b). Four services work together, each set up once by the owner. Do parts A to D in any order. Menus change now and then, so a label may be slightly different from these. Keys and passwords go only into GitHub's secrets, never into a chat or a message.

When the step 3b pull request is merged, the **Database** workflow sends the sign-in settings to Supabase itself (`supabase/sign-in-settings.json`). If you add a secret after that, send them again: in GitHub tap **Actions**, then **Database**, then **Run workflow**, keeping **Branch: main**, then **Run workflow** again.

### What to do before merging, and what can wait

- **Before merging:** B (Resend), D (the two GitHub variables), and steps 1 to 4 of A (the Cloudflare key's permissions). Then the live app is built with signing in on and put online at prepenny.co.uk too, the sign-in emails come from hello@prepenny.co.uk to anyone, and the email's link opens.
- **Can wait:** C (Google). Until then, "Continue with Google" says "Google sign-in isn't switched on yet. Use your email address instead." Also the rest of A (www and prepenny.com sending people on, and replies forwarded), and E (Supabase's paid plan and its custom domain, before launch).
- **If you merge first,** nothing breaks, and nobody's plan is touched: plans stay on phones until step 3c.
  - The live app says "Signing in isn't switched on yet." until D is done and the app is put online again: **Actions**, then **Deploy**, then **Run workflow**, keeping **Branch: main**, then **Run workflow** again.
  - Supabase gets PrePenny's sign-in settings at the merge. Until B, Supabase's own test sender sends the emails, only to people in your Supabase team and only two an hour; once the Resend key is added, run **Database** by hand as above.
  - Until steps 1 to 4 of A, the live app can't be put online at prepenny.co.uk: the **Deploy** run on `main` gets a red cross saying the Cloudflare key isn't allowed to, although the new version is online at the old workers.dev address. The email's link leads to prepenny.co.uk, which doesn't open yet; the code in the same email works. Once the key can do it, run **Deploy** by hand as above.
- **Try signing in on the live app after merging,** not on the preview: Supabase only has PrePenny's email and settings once this is merged.

### A. The web addresses, in Cloudflare

prepenny.co.uk is the main address: the app, and the address sign-in emails come from. prepenny.com sends people there (D304).

The app at prepenny.co.uk. You don't add it yourself: it's written into the app's hosting settings (`apps/web/wrangler.jsonc`), so each time GitHub puts the live app online it adds prepenny.co.uk if it's missing and keeps it (D322). GitHub's Cloudflare key needs permission to do that. The key made from the **Edit Cloudflare Workers** template (in "Putting PrePenny online") should have all of it except possibly the last one below:

1. Go to https://dash.cloudflare.com and sign in. Tap the person icon at the top right, then **My Profile**, then **API Tokens**.
2. Find the key you made for GitHub (it may be called **Edit Cloudflare Workers**). Tap the three dots beside it, then **Edit**.
3. Under **Permissions**, check these three lines are there. Add any that's missing with **+ Add more**, choosing the three boxes in this order:
   - **Account**, **Workers Scripts**, **Edit**
   - **Zone**, **Workers Routes**, **Edit**
   - **Zone**, **Zone**, **Read**

   Under **Zone Resources**, keep **Include**, **All zones** (or choose **Specific zone**, `prepenny.co.uk`). No permission to change DNS records is needed.
4. Tap **Continue to summary**, then **Update token**. The key itself stays the same, so nothing changes in GitHub.
5. After this pull request is merged and GitHub has put the live app online (**Actions**, then **Deploy**, a green tick), open https://prepenny.co.uk/app/. The first time, it can take a few minutes while Cloudflare makes its certificate.

Don't add prepenny.co.uk by hand under the app's **Domains & Routes** as well: it does no harm, but the app's hosting settings are what keep it. Any other address added there by hand would be taken off at the next deploy, because the settings list them all.

www.prepenny.co.uk sends people to prepenny.co.uk:

6. Go back to the start of the dashboard (**Account home**) and tap **prepenny.co.uk**. Tap **DNS**, then **Records**, then **Add record**.
7. Choose **Type** `AAAA`, **Name** `www`, **IPv6 address** `100::`, and leave **Proxy status** on (an orange cloud). Tap **Save**.
8. Tap **Rules**, then **Overview** (or **Templates**). Find **Redirect from WWW to root** and tap it, then **Deploy** (or **Save**).

prepenny.com, and www.prepenny.com, send people to prepenny.co.uk:

9. Go back to **Account home** and tap **prepenny.com**. Tap **DNS**, then **Records**, and add two records, as in step 7: **Type** `AAAA`, **Name** `@`, **IPv6 address** `100::`, proxied; then **Type** `AAAA`, **Name** `www`, **IPv6 address** `100::`, proxied.
10. Tap **Rules**, then **Redirect Rules** (it may be under **Rules**, **Overview**), then **Create rule**. Call it `To prepenny.co.uk`. Under **If incoming requests match**, choose **All incoming requests**.
11. Under **Then**, choose **Dynamic**, and in **Expression** type `concat("https://prepenny.co.uk", http.request.uri.path)`. Choose **Status code** `301` and tick **Preserve query string**. Tap **Deploy**.
12. Try it: open https://prepenny.com/app/ and https://www.prepenny.co.uk/app/ on your phone. Both should end up at https://prepenny.co.uk/app/.

Replies to sign-in emails (optional, free):

13. In **prepenny.co.uk**, tap **Email**, then **Email Routing**, then **Get started**. Make the address `hello`, send it to your own email address, and confirm that address from the email Cloudflare sends. Cloudflare adds the records it needs. Anyone who replies to a sign-in email then reaches you.

The old address, https://prepenny.prepenny.workers.dev/app/, sends people to the same page on prepenny.co.uk since step 3f-2 (D428). A browser keeps a plan for each address on its own: a phone with something at the old address that isn't saved in an account yet stays there, and says so, until it's sent.

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
5. Tap **Branding**. Under **Authorised domains**, add `prepenny.co.uk` and `supabase.co`. Under **App home page**, type `https://prepenny.co.uk`. Tap **Save**. Leave the privacy policy link empty for now: it's added once the privacy notice is reviewed in Phase 5 (D317).
6. Tap **Data access**, then **Add or remove scopes**. Tick only these three: `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `openid`. Tap **Update**, then **Save**. Supabase asks Google for these: the email address, and the name and the address of the profile picture, which Google always sends with it. Supabase keeps them with the sign-in; PrePenny doesn't use or show them.
7. Tap **Clients**, then **Create client**. **Application type**: **Web application**. **Name** `PrePenny`. Under **Authorised JavaScript origins**, add `https://prepenny.co.uk`. Under **Authorised redirect URIs**, add the Callback URL from step 1. Tap **Create**.
8. Copy the **Client ID** and the **Client secret** straight away (or download them): Google may show the secret only once.
9. In GitHub's **New repository secret** (as in B7), add two secrets: name `GOOGLE_CLIENT_ID` with the Client ID, and name `GOOGLE_CLIENT_SECRET` with the Client secret.
10. Back in Google, tap **Audience**. While it says **Testing**, only the people you list under **Test users** (up to 100) can use Google sign-in: add your own Google address there to try it. It stays that way until Phase 5, when the privacy notice is ready and you tap **Publish app** (D317).

### D. Telling the app which Supabase project to use

These two aren't secret: they're in the app every phone downloads.

1. In Supabase, open the **prepenny** project, then **Project Settings** (the gear), then **Data API** (or **API**). Copy the **Project URL**, such as `https://abcdefghijklmnopqrst.supabase.co`.
2. Still in **Project Settings**, tap **API Keys**. Copy the **Publishable key**, which starts with `sb_publishable_`. Never copy the **Secret key** or the **service_role** key: PrePenny never needs them.
3. In GitHub, open the repository, then **Settings**, then **Secrets and variables**, then **Actions**, then the **Variables** tab, then **New repository variable**. Add two: name `SUPABASE_URL` with the Project URL, and name `SUPABASE_PUBLISHABLE_KEY` with the publishable key.
4. The next live version has signing in switched on. Until then it says "Signing in isn't switched on yet." Previews use the preview project's own two variables instead ("The preview database").

### E. In Supabase itself

Nothing else to change by hand: the Database workflow sets the sign-in settings with the key it already has. Two things only you can do, later:

- **Move to the paid plan before launch** (D19, about £20 a month). That also switches on "signed out after 90 days without opening PrePenny": the Database workflow asks for it every time, Supabase refuses it on the free plan, and it comes on by itself the next time the workflow runs.
- **Supabase's custom domain add-on, just before launch** (D321, about US$10 a month, on the paid plan), so Google's page says a PrePenny address such as auth.prepenny.co.uk instead of the project's supabase.co one. The steps come with it.

To check it worked, once the step 3b pull request is merged: open https://prepenny.co.uk/app/ on your phone, tap **More**, then **Sign up or sign in**, type your email address and tap **Send me a code**. The email comes from PrePenny, hello@prepenny.co.uk, with a 6-digit code.

### F. Step 3e: devices, two-step sign-in, email addresses and the backup email

There's nothing new to set up: the Database workflow does it all at the merge, with the three Supabase secrets and the Resend key you added for steps 3a and 3b. It adds the new tables, switches on two-step sign-in with an authenticator app (Supabase's own, free), sends Supabase the email for changing an email address (`supabase/templates/email-change.html`), and gives the database the Resend key, kept in Supabase's Vault, so it can email the codes for a backup email (D384). GitHub's Supabase key needs the permissions listed in "The database", step 5.

To check it worked, after merging: open **Actions**, then **Database**, then the newest run. It should have a green tick, and its last step, **Let the database send PrePenny's own emails**, should say "PrePenny's own emails go through Resend."

**If the backup email step fails** (a red cross on that step only, the rest is done):

1. In Resend, tap **API Keys**, then **Create API key**. Call it `Supabase database`, choose **Sending access** and the domain `prepenny.co.uk`, and tap **Add**. Copy the key; it starts with `re_`.
2. On supabase.com, open the **prepenny** project, then **SQL Editor** in the menu on the left, then **New query**.
3. Paste this, putting your key between the two quote marks in place of `re_YOUR_KEY`, and tap **Run**:
   `select app.use_resend('re_YOUR_KEY');`
4. It should say **Success. No rows returned**. Close the query without saving it, so the key isn't kept there, and tell Claude Code.

Resend's free plan sends 100 emails a day and 3,000 a month. Adding a backup email sends 2 (the code, and a note to the sign-in address), and getting back in sends 5 (the code that starts the wait, the note with the stop link to the sign-in address, the code that finishes it a day later, a sign-in code, and a note to the old address), or 3 when it's stopped (the code, the note, and a note to the backup that it was stopped).

### G. Step 3e hardening: getting back in waits 24 hours

When the pull request is merged, the **Database** workflow changes the database, then puts a small function online on Supabase, **get-back-in**, which finishes getting back in through Supabase's own admin route (D393). Supabase gives the function the project's own secret key, so no key is copied anywhere.

The one thing to set up: putting a function online needs GitHub's Supabase key to have **Edge Functions: Read-write** (`edge_functions_write` in Supabase's API). Done by the owner on 9 Nov 2026, with a new key in `SUPABASE_ACCESS_TOKEN`. A key made later needs every permission in "The database", step 5.

To check it worked, after merging:

1. On GitHub, open **Actions**, then **Database**, then the newest run. It should have a green tick, with a step called **Put the get-back-in function online**.
2. On supabase.com, open the **prepenny** project, then **Edge Functions** in the menu on the left. **get-back-in** should be listed.

**If the function step fails** (a red cross on that step only; the database is changed already): if it says Supabase refused it (403), the key is missing **Edge Functions: Read-write**: make a new key as in "The database", step 5, and replace `SUPABASE_ACCESS_TOKEN`. Then open **Actions**, then **Database**, then **Run workflow**, keeping **Branch: main**, then **Run workflow** again. Until it's online, a code typed on the **Get back in** page can't be used, and the page says PrePenny couldn't reach its server. Nothing on anyone's account changes meanwhile. If it fails twice, tell Claude Code what the step says.

### H. Step 3f: shared plans, invite and join

**Nothing new to set up.** When the pull request is merged, the **Database** workflow adds step 3f's changes to the database with the key it already has, and the **Deploy** workflow puts the app online, as for every step. Checked in this step's own changes, one by one:

- No new GitHub secret or variable, and no workflow changed: the new end-to-end tests run in the sign-in tests' parts, which already start a local Supabase.
- No new Supabase setting: no new sign-in setting, web address or email template, no new function to put online, and no new permission for GitHub's Supabase key (the Database run's key check tries all eleven before changing anything, D406). The database's new steps use only what step 3e switched on: sending its own emails through Resend, with the key kept in Supabase's Vault (part F), and the live nudges (step 3c).
- Invite emails go through Resend like step 3e's, from hello@prepenny.co.uk, at most 3 a day for a plan. Resend's free plan allows 100 emails a day and 3,000 a month (part F).
- Nothing new in Cloudflare: the join page, `/join/`, is an ordinary page of the app.

This sandbox couldn't open Supabase's, Resend's or GitHub's own websites to compare their lists today, so the check above is of what this step uses. If any of those services has renamed a setting since, nothing here depends on it.

To check it worked, after merging: open **Actions**, then **Database**, then the newest run: a green tick. Then **Deploy**: a green tick.

#### Trying it on two phones, with your partner

Use **two spare email addresses that have never been used with PrePenny**, one on each phone, so your own plan isn't touched. Sharing an account can't be undone yet. Since step 3f-2, someone with a plan of their own brings it with them (part I).

On your phone (phone A), first:

1. Open https://prepenny.co.uk/app/, tap **More**, then **Sign out**, then **Sign out** again. Your own plan is safe in your account and comes back when you sign in again.
2. Tap **Make my plan**. Make a quick plan: an account called `Joint` with `100` as its balance, skip the other screens, then **Go to my plan**.
3. Tap **More**, then **Sign up or sign in**, and sign up with the first spare address (the 6-digit code comes by email).

Sharing an account:

4. On phone A, tap **More**, then **Share with my partner**. It says "You (…), Made this plan" under "Who's in this plan".
5. Tap **Choose shared accounts**, tick **Joint**, tap **Share these accounts**, then **Yes, share**. It says "Shared: Joint." Go back.

A forwarded link, and "Don't allow":

6. Under **Invite your partner**, type your name, keep **Can edit** and **A link I send myself**, and tap **Make the invite link**. Tap **Copy the link** and send it to your partner, in a message.
7. On your partner's phone (phone B), open the link. It says "Join a shared plan". Tap **Sign up or sign in** and sign up with the second spare address. It says "… has invited you to share their plan." Type their name and tap **Ask to join**. It says "Waiting for … to allow it."
8. On phone A, within a few seconds, a sheet says "… wants to join your plan", with the address your partner signed up with. Tap **Don't allow**.
9. On phone B, within a few seconds: "… didn't let you in, so you haven't joined." Open the same link again: "This invite has been used already."

By email, and "Allow":

10. On phone A, in **Share with my partner**, choose **Can edit** and **An email from PrePenny**, type the second spare address, and tap **Send the invite**.
11. On phone B, the email comes from PrePenny: "… has invited you to share a plan in PrePenny". Tap **Open the invite**, type the name, and tap **Ask to join**.
12. On phone A, tap **Allow**. On phone B, within a few seconds, Home opens with the Joint account and £100.

"From Jess", and what stays private:

13. On phone B, tap **More**, then **Accounts**, then **Add an account**: call it `My own account`, with `500` as its balance.
14. On phone B, on Home, tap **Add a payment**: **Between accounts**, name `For the bills`, amount `60`, from **My own account** to **Joint**, **Once**, on any day this week. Tap **Add payment**.
15. On phone A, tap **Coming up**. Within a minute, the Joint account shows "From …, +£60.00". Tap it: "Only … can change this." Tap **More**, then **Accounts**: there's no "My own account".

"Can view only" was tried on this computer, with both phones (`apps/web/e2e/sharing.spec.ts`, test 2). To try it here as well, remove the two accounts (below) and do steps 1 to 12 again with **Can view only**: on phone B, changing an amount in the Joint account says "A change wasn't saved … You can look at this plan but not change it."

When you're done, sign out on both phones, and sign in again on yours with your own address.

#### Removing the two test accounts afterwards

Until "Delete my account and all my data" comes in step 3h, this removes two accounts and everything of theirs, and nothing else. It refuses unless it finds exactly the two addresses typed, and unless their plans have nobody else in them.

1. On supabase.com, open the **prepenny** project, then **SQL Editor** in the menu on the left, then **New query**.
2. Paste this, and type the two spare addresses in place of the two on the first line, keeping the quote marks:

   ```sql
   do $$
   declare
     addresses text[] := array['first-spare@example.com', 'second-spare@example.com'];
     found_people uuid[];
     their_plans uuid[];
     plans_removed integer;
     people_removed integer;
   begin
     select array_agg(id) into found_people from auth.users
       where lower(email) in (select lower(btrim(a)) from unnest(addresses) a);
     if coalesce(cardinality(found_people), 0) <> cardinality(addresses) then
       raise exception 'Found % of the % addresses. Nothing was removed.',
         coalesce(cardinality(found_people), 0), cardinality(addresses);
     end if;
     select coalesce(array_agg(distinct m.plan_id), '{}') into their_plans
       from public.plan_members m where m.person_id = any (found_people);
     if exists (select 1 from public.plan_members m
         where m.plan_id = any (their_plans) and not (m.person_id = any (found_people))) then
       raise exception 'Someone else is in one of their plans. Nothing was removed.';
     end if;
     delete from public.plans where id = any (their_plans);
     get diagnostics plans_removed = row_count;
     delete from public.invites
       where created_by = any (found_people) or asked_by = any (found_people) or accepted_by = any (found_people);
     delete from auth.users where id = any (found_people);
     get diagnostics people_removed = row_count;
     raise notice 'Removed % plans and % accounts.', plans_removed, people_removed;
   end $$;
   ```

3. Tap **Run**. It should say **Success. No rows returned**, and under it "Removed 1 plans and 2 accounts." If it says "Found 1 of the 2 addresses", check the spelling of the addresses: nothing was removed.
4. Close the query without saving it. On each phone, PrePenny notices within a minute that the sign-in has ended.

It removes the accounts' plans with everything in them, the invites they made or used, their sign-ins, devices and backup emails. It writes no amount, name or email address anywhere: it says only how many it removed.

### I. Step 3f-2: bring your plan with you, and four fixes

**What you need to set up: nothing new.** Checked one by one, in this step's own changes:

- **Cloudflare.** The live app now has a few lines of code of its own in front of its files (`apps/web/cloudflare/worker.ts`), which send a page opened at the old address to prepenny.co.uk. The **Deploy** workflow puts them online with the same Cloudflare key and the same command as before. Checked in Wrangler 4.151.3's own code, which the workflow uses: it uploads code and files through the same address as files alone (`workers/scripts/prepenny`), so the key's **Account, Workers Scripts, Edit** (part A, step 3) covers it. Nothing to add by hand in Cloudflare's dashboard: no route, rule or setting, and prepenny.co.uk stays as part A set it up. Cloudflare's own pages couldn't be opened from the computer this was built on, so this was checked in Wrangler itself, and by running Wrangler locally the way the tests serve the app.
- **Cloudflare's free plan.** Each time those few lines run counts towards Workers' free daily allowance (100,000 a day when last known; Cloudflare's pricing page couldn't be opened from here to confirm it). They run for the app's pages and a few small files, not its other files, so a visit is a handful. To see the count any time: **Workers & Pages**, then **prepenny**, then **Metrics**. It's on the launch checklist with Cloudflare's plan (item 5, PLAN.md item 59).
- **Supabase.** The **Database** workflow adds this step's database changes with the key it already has, as every step does; the key check tries all eleven permissions first (D406). No new sign-in setting, web address, email template, function or permission. No new emails are sent.
- **GitHub.** No new secret or variable, and no workflow changed. The end-to-end tests start a second local copy of the app on GitHub's machine for the old-address test, from the test settings (`playwright.config.ts`), with nothing to set up.
- **Resend.** Nothing new.

To check it worked, after merging: **Actions**, then **Database**, then the newest run: a green tick. Then **Deploy**: a green tick. Then open https://prepenny.prepenny.workers.dev/app/ on your phone: it should end up at https://prepenny.co.uk/app/. A phone that had the old address installed moves itself once it has fetched the new version, the next time it's opened with a signal.

#### Trying "bring your plan" on the live app, alone, with two devices

You need your phone (device A, playing Jess) and a computer or a second browser where you can open a **private or incognito window** (device B, playing Sam). Use two new Gmail "+" addresses: Gmail delivers mail for `tomiwaprofficial+jess2@gmail.com` and `tomiwaprofficial+sam@gmail.com` to your own inbox, but PrePenny treats them as two new people. Your own plan isn't touched.

Jess's plan, on device A:

1. Open https://prepenny.co.uk/app/, tap **More**, then **Sign out**, then **Sign out** again. Your own plan is safe in your account.
2. Tap **Make my plan**. On **Your account**, tap **Joint account**: the name changes to "Joint account" by itself (fix A). Type `800` as what the bank shows. Under **Which part of the UK do you live in?** choose **Scotland**. Tap **Next**, then **Skip this step** on each screen, then **Go to my plan**.
3. Tap **More**, then **Sign up or sign in**, and sign up with `tomiwaprofficial+jess2@gmail.com` (the code comes to your Gmail).
4. Tap **More**, then **Share with my partner**, then **Choose shared accounts**. Tick **Joint account**, tap **Share these accounts**, then **Yes, share**.
5. Back on **Share with my partner**, under **Invite your partner**, type `Jess`, keep **Can edit** and **A link I send myself**, and tap **Make the invite link**. The link starts with `https://prepenny.co.uk/join/` (fix B). Tap **Copy the link** and send it to yourself, for example by email, so you can open it on device B.

Sam's own plan, on device B, in a private or incognito window:

6. Open https://prepenny.co.uk/ and tap **Make my plan**. Keep **Current account**, type `267.54`, keep **England and Wales**, tap **Next**, then **Skip this step** on each screen, then **Go to my plan**.
7. On Home, under the account card, tap **+ Add an account** (fix C). It starts as **Savings**; tap **Joint account** and back to **Savings**: the name follows (fix A). Type `500` as what the bank shows, and tap **Add account**.
8. Tap **Add a payment**: name `Phone bill`, amount `20`, from **Current account**, with today's date, **Once**. Tap **Add payment**. Home's big figure now says "About £247.54 now", with "Your bank showed £267.54 today" under it (fix D): the bill is due today and not ticked yet.
9. Tap **More**, then **Sign up or sign in**, and sign up with `tomiwaprofficial+sam@gmail.com`. More says "Your plan is saved in your account."
10. Paste the invite link into the address bar. The page says "Jess has invited you to share their plan.", "You have a plan of your own, and it comes with you…", and "Bank holidays: Jess's plan uses Scotland, and yours uses England and Wales…". Type `Sam` and tap **Ask to join**. It says "Waiting for Jess to allow it."

Allowing, on device A:

11. Within a few seconds, a sheet says "Sam wants to join your plan", with "Signed in as tomiwaprofficial+sam@gmail.com". Tap **Allow**. It says "Sam can join now. It finishes on Sam's phone, as soon as PrePenny is open there." Tap **Got it**.

Bringing the plan in, on device B:

12. Within a few seconds the page says "Jess let you in.", the bank holidays line again, and **Bring my plan and join**. Tap it. Home opens with your Current account, "About £247.54 now" and "Your bank showed £267.54 today", and the phone bill under **Next due**.
13. Tap **More**, then **Accounts**: **Current account**, **Savings** and Jess's **Joint account**, and "Payments that move on bank holidays follow Scotland." Under **Share with my partner**, **Choose shared accounts** lists Current account and Savings: yours to share when you choose. Don't share them for this test.

What Jess sees, on device A:

14. **More**, then **Share with my partner**: "Who's in this plan" lists you and **Sam, Can edit**.
15. **More**, then **Accounts**: only **Joint account**. **Coming up**: no phone bill. Nothing of Sam's plan is on Jess's phone.

To try "Finish joining" too: remove the two accounts (below) and do it again, but at step 10, after **Ask to join**, open https://prepenny.co.uk/app/ in the same window instead of waiting. After step 11, Sam's Home shows "Jess has let you into their plan" with **Finish joining**; tap it, then **Bring my plan and join**.

When you're done, close the private window, and on device A sign out and sign in again with your own address.

#### Removing every test account afterwards

This removes the test accounts and everything of theirs, and nothing else, with the query in part H ("Removing the two test accounts afterwards"), which takes any number of addresses. It refuses to do anything unless it finds every address typed, and unless their plans have nobody else in them.

1. On supabase.com, open the **prepenny** project, then **SQL Editor** in the menu on the left, then **New query**.
2. Paste the query from part H. On its first line, put all four test addresses, keeping the quote marks:

   `addresses text[] := array['tomiwaprofficial+tom@gmail.com', 'tomiwaprofficial+jess@gmail.com', 'tomiwaprofficial+jess2@gmail.com', 'tomiwaprofficial+sam@gmail.com'];`

3. Tap **Run**. It should say **Success. No rows returned**, and under it how many plans and accounts it removed, such as "Removed 2 plans and 4 accounts." (step 3f's plan, Tom's with Jess in it, and this step's, Jess's with Sam in it; Sam's own plan went when he joined).
4. If it says "Found 3 of the 4 addresses", one of them was never used or is gone already: nothing was removed. Take that address out of the first line and run it again. If it says "Someone else is in one of their plans", someone not on the list joined one of them: nothing was removed; tell Claude Code.
5. Close the query without saving it. Any device still signed in as one of them notices within a minute that the sign-in has ended.

Your own account is never touched: the query only finds the addresses typed on its first line.

## Bank holidays

The engine's copy of the UK bank holiday list is `packages/engine/data/bank-holidays.json`, downloaded unchanged from https://www.gov.uk/bank-holidays.json by the **Bank holidays** workflow on GitHub. The file beside it, `bank-holidays.source.json`, says where it came from and when. To get a fresh copy, open **Actions**, then **Bank holidays**, then **Run workflow**. It only saves a new commit if the list has changed.

## Tax figures

The take-home pay calculator's figures for each tax year are in `packages/engine/src/pay/tax-years`, one file per tax year, with the GOV.UK page each figure comes from. The GOV.UK pages and HMRC's files they come from are saved unchanged in `sources/gov-uk/` by the **Fetch sources** workflow on GitHub, from the list of addresses in `sources/gov-uk.txt`. To fetch them again, open **Actions**, then **Fetch sources**, then **Run workflow**. A new tax year file is needed every April, and the tax year check warns from 1 March when next year's is missing.
