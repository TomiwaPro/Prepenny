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

- **Lint, type checks, tests and the database** checks the code, runs every engine and app test, and builds a fresh copy of the database on GitHub's machine to test who can see and change what (see "The database" below). Its last step, **Check every building block for known security problems**, checks every package PrePenny uses against the list of known security problems (from step 4b, D527). About 2 minutes, on every push.
- **Build and end-to-end tests** builds the app and uses it in a real browser at 320px and 360px wide, in light and dark, as a phone would, in three parts side by side so it finishes sooner: "part 1 of 3", "part 2 of 3" and "part 3 of 3". Each part also takes a third of the tests that sign up, sign in and sign out, send plans up and bring them down on second phones, make changes with no signal and on two phones at once, and from step 3e sign out other devices, use two-step sign-in, change email addresses, get back in with a backup email (with its 24-hour wait and its stop link, from step 3e hardening) and update an old version, against a copy of Supabase on GitHub's machine, with its function runner, which catches the emails instead of sending them. From step 3i, they also run brief 8.7's tests 1 to 6 on two phones, a security test that tries every request a partner could make for someone's private records, and the six people's journeys signed in on two phones. Each part runs one test at a time (D343, D389), with up to 60 minutes (D499), and a test that fails isn't tried a second time: it fails, and its report is kept (D498).

### Known security problems in PrePenny's building blocks

PrePenny is built from about 330 packages other people wrote: Next.js, React, Supabase's code and the tools that build and test them. Two things look out for known security problems in them (step 4b, D527, D528):

- **The check on every change.** The step **Check every building block for known security problems** asks npm about every package, on every pull request and on `main`. A **serious** problem (high or critical) that the change brings in gives a red cross, so the change can't be merged with a green tick, and on `main` it doesn't go live. Its message says which package and version, how serious, the version that fixes it, and whether it comes in through the app or only through the tools that build and test it. A serious problem that was already there before the change, because it was found after that package was added, shows as a yellow warning on every run, and doesn't stop other changes, as stopping them wouldn't take the package off the live site: ask Claude Code to update it soon. A less serious one (moderate or low) is a yellow warning too.
- **Dependabot alerts,** GitHub's own watch, between changes. After every change to `main`, the **Dependabot's list** workflow sends GitHub the list of every package (it can't read pnpm 12's lockfile itself, D528). When GitHub learns of a new problem in one of them, or in a GitHub action the workflows use by its version number, the repository gets an alert: on GitHub, **Security and quality**, then under **Findings**, **Dependabot**, then **Vulnerabilities**. For a new critical or high one, GitHub tells people who can change the repository and watch it with security alerts on: by email, on GitHub, or both. To choose which, open https://github.com/settings/notifications and change the setting for Dependabot alerts ("There are new Dependabot alerts in your repository.").

**What to do when either finds something:** ask Claude Code to update the package, naming the alert or the failed check, such as "the building block check failed on pull request 41" or "Dependabot alert for minimist". Nothing else needs doing: the live app keeps working as it was. If a problem ever has no fix yet and can't reach PrePenny, Claude Code can accept it on purpose with a decision; every run then says so.

GitHub's minutes cost money once the free ones are used, so the end-to-end tests wait until a pull request is ready. Claude Code opens each step's pull request as a **draft**, which gets the first set on every push, and marks it **Ready for review** when the step is done, which starts the end-to-end tests and the preview link. Every push after that runs both, and so does `main`, always, before anything goes live. A newer push stops the older checks on a pull request, never on `main`.

To run them on a computer, install Node 24, pnpm 12, Docker and the Supabase command line (version 2.122.0), then run:

```
pnpm install
pnpm lint
pnpm typecheck
pnpm test
supabase start
supabase test db
pnpm build:update-test
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
3. **Check the ticks.** Scroll to the bottom of the pull request. Wait until every check has a green tick. There are five: "Lint, type checks, tests and the database", "Build and end-to-end tests" parts 1, 2 and 3, and "Put the app online". "Get the preview database ready, and try the preview" shows as skipped until the preview database is set up (D411), and is a sixth tick after that. A yellow dot means it's still running (about an hour since step 4h). A red cross means a check failed: don't merge, and see "If something goes wrong". If it still says **Draft**, Claude Code hasn't finished the step yet.
4. **Merge it.** When you're happy with the preview and every tick is green, tap **Merge pull request**, then **Confirm merge**. GitHub may say **Squash and merge** or **Create a merge commit** instead; either is fine.
5. **Wait for it to go live.** Merging starts the checks again, on `main` this time. When they pass, the Deploy workflow puts the update on the live app, about an hour after merging in all, then checks every live page is exactly PrePenny's own (step 4b); the Database workflow sends any database changes to the real database; and **Dependabot's list** tells GitHub which building blocks PrePenny now uses. To watch it, tap **Actions**: the newest **Check** run, then the newest **Deploy** run, each get a green tick when they're done.
6. **See it on your phone.** Open the live app. If PrePenny was already open, a note at the bottom says "PrePenny has been updated. Tap to reload." Tap it. People's plans stay as they were: they're saved on their own phones, and an update never changes them.

### If something goes wrong

- **A check has a red cross.** Don't merge. Tap **Details** beside it to see which test failed, and ask Claude Code to fix it: say "the checks failed on pull request" and its number. The live app is unchanged.
- **"Check every building block for known security problems" has a red cross.** The change brings in a building block with a serious known security problem, named in the message. Don't merge; ask Claude Code to update it, quoting the message. On `main`, the live app stays as it was until it's fixed. A yellow warning naming a serious problem "already in PrePenny" doesn't stop anything, but ask Claude Code to update it soon. See "Known security problems in PrePenny's building blocks" above.
- **"Check the live pages are PrePenny's own" has a red cross, in Deploy.** The update is online, but a live page isn't exactly as built: the message says what. If it names something of Cloudflare's, part N below says how to switch it off; then open the run and tap **Re-run all jobs**. Anything else, ask Claude Code, quoting the message.
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
- When a pull request is merged into `main` and every check has passed on it, the **Database** workflow (`.github/workflows/database.yml`) sends the changes to the real database in London. The made-up people and the tests never go there. Then it checks the project's **Data API** shows PrePenny's public part only, never its private checks (`app`), and says exactly what to do if it ever does (D341). And it checks GraphQL, a second way into the database that PrePenny never uses, is still switched off, and switches it off again if it isn't (step 4a, D509).
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
   - **Database: Read-write**: to give the database the Resend key, and to check GraphQL is still off and switch it off again if it isn't (step 4a). Supabase's own description of its API says looking at the database needs "database_read" and changing it "database_write": both are this one.
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
- **The Database workflow says "GraphQL was on".** It had been switched on again, from Supabase's own pages perhaps, and the workflow has switched it off. Nothing to do. If it says so again on the next run, tell Claude Code.
- **If the GraphQL check fails** (a red cross on **Check GraphQL is still off**). Switch it off by hand: on supabase.com, open the **prepenny** project, then **Database** in the menu on the left, then **Extensions**. Search for `pg_graphql`, and if its switch is on, switch it off and confirm. Or open **SQL Editor**, then **New query**, paste `drop extension if exists pg_graphql;` and tap **Run**: that's what Supabase's own guide to pg_graphql gives for switching it off. Then run the workflow again: **Actions**, then **Database**, then **Run workflow**, keeping **Branch: main**, then **Run workflow** again. If it fails again, tell Claude Code what the step says.
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

Use **Delete my account** on each phone (step 3h, part K), in either order:

1. On the phone signed in as one of them, tap **More**. Under **Your data**, tap **Delete my account and all my data**. In a shared plan it says what happens: the shared accounts stay with the other person, and your changes stay in their history as made by "Someone who has left".
2. Tap **Send me a code**, type the 6-digit code from the email, type `delete`, and tap **Delete my account and all my data**. The welcome says "Your account and all your data have been deleted…", and the email "Your PrePenny account has been deleted" arrives.
3. Do the same on the other phone. Once both are deleted, nothing of either is left.

**Only if that can't be done**, for example when one of the addresses can't receive email any more, this query in Supabase is the fallback. It removes two accounts and everything of theirs, and nothing else. It refuses unless it finds exactly the two addresses typed, and unless their plans have nobody else in them.

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
- **Cloudflare's free plan.** Each time those few lines run counts towards Workers' free daily allowance (100,000 a day when last known; Cloudflare's pricing page couldn't be opened from here to confirm it). They run only when a page is opened, never for the app's files, including the one each phone checks every minute. To see the count any time: **Workers & Pages**, then **prepenny**, then **Metrics**. It's on the launch checklist with Cloudflare's plan (item 5, PLAN.md item 59).
- **Supabase.** The **Database** workflow adds this step's database changes with the key it already has, as every step does; the key check tries all eleven permissions first (D406). No new sign-in setting, web address, email template, function or permission. No new emails are sent.
- **GitHub.** No new secret or variable, and no workflow changed. The end-to-end tests start a second local copy of the app on GitHub's machine for the old-address test, from the test settings (`playwright.config.ts`), with nothing to set up.
- **Resend.** Nothing new.

To check it worked, after merging: **Actions**, then **Database**, then the newest run: a green tick. Then **Deploy**: a green tick. Then open https://prepenny.prepenny.workers.dev/app/ on your phone: it should end up at https://prepenny.co.uk/app/. A phone that had the old address installed moves itself once it has fetched the new version, the next time it's opened with a signal.

#### Trying "bring your plan" on the live app, alone, with two devices

You need your phone (device A, playing Jess) and a computer or a second browser where you can open a **private or incognito window** (device B, playing Sam). Use two new Gmail "+" addresses made from your own: if your address is `yourname@gmail.com`, Gmail delivers mail for `yourname+jess2@gmail.com` and `yourname+sam@gmail.com` to your own inbox, but PrePenny treats them as two new people. Put your own name where these steps say `yourname`. Your own plan isn't touched.

Jess's plan, on device A:

1. Open https://prepenny.co.uk/app/, tap **More**, then **Sign out**, then **Sign out** again. Your own plan is safe in your account.
2. Tap **Make my plan**. On **Your account**, tap **Joint account**: the name changes to "Joint account" by itself (fix A). Type `800` as what the bank shows. Under **Which part of the UK do you live in?** choose **Scotland**. Tap **Next**, then **Skip this step** on each screen, then **Go to my plan**.
3. Tap **More**, then **Sign up or sign in**, and sign up with `yourname+jess2@gmail.com` (the code comes to your Gmail).
4. Tap **More**, then **Share with my partner**, then **Choose shared accounts**. Tick **Joint account**, tap **Share these accounts**, then **Yes, share**.
5. Back on **Share with my partner**, under **Invite your partner**, type `Jess`, keep **Can edit** and **A link I send myself**, and tap **Make the invite link**. The link starts with `https://prepenny.co.uk/join/` (fix B). Tap **Copy the link** and send it to yourself, for example by email, so you can open it on device B.

Sam's own plan, on device B, in a private or incognito window:

6. Open https://prepenny.co.uk/ and tap **Make my plan**. Keep **Current account**, type `267.54`, keep **England and Wales**, tap **Next**, then **Skip this step** on each screen, then **Go to my plan**.
7. On Home, under the four buttons, tap **+ Add an account** (fix C; it was under the account card until D442). It starts as **Savings**; tap **Joint account** and back to **Savings**: the name follows (fix A). Type `500` as what the bank shows, and tap **Add account**.
8. Tap **Add a payment**: name `Phone bill`, amount `20`, from **Current account**, with today's date, **Once**. Tap **Add payment**. Home's big figure now says "About £247.54 now", with "Bank: £267.54 today" under it (fix D, in D450's words): the bill is due today and not ticked yet.
9. Tap **More**, then **Sign up or sign in**, and sign up with `yourname+sam@gmail.com`. More says "Your plan is saved in your account."
10. Paste the invite link into the address bar. The page says "Jess has invited you to share their plan." and "You have a plan of your own, and it comes with you…". It says nothing about Jess's plan itself, not even its bank holidays, until Jess lets you in. Type `Sam` and tap **Ask to join**. It says "Waiting for Jess to allow it."

Allowing, on device A:

11. Within a few seconds, a sheet says "Sam wants to join your plan", with "Signed in as yourname+sam@gmail.com". Tap **Allow**. It says "Sam can join now. It finishes on Sam's phone, as soon as PrePenny is open there." Tap **Got it**.

Bringing the plan in, on device B:

12. Within a few seconds the page says "Jess let you in.", "Bank holidays: Jess's plan uses Scotland, and yours uses England and Wales…", and **Bring my plan and join**. Tap it. Home opens with your Current account, "About £247.54 now" and "Bank: £267.54 today", and the phone bill under **Next due**.
13. Tap **More**, then **Accounts**: **Current account**, **Savings** and Jess's **Joint account**, and "Payments that move on bank holidays follow Scotland." Under **Share with my partner**, **Choose shared accounts** lists Current account and Savings: yours to share when you choose. Don't share them for this test.

What Jess sees, on device A:

14. **More**, then **Share with my partner**: "Who's in this plan" lists you and **Sam, Can edit**.
15. **More**, then **Accounts**: only **Joint account**. **Coming up**: no phone bill. Nothing of Sam's plan is on Jess's phone.

To try "Finish joining" too: remove the two accounts (below) and do it again, but at step 10, after **Ask to join**, open https://prepenny.co.uk/app/ in the same window instead of waiting. After step 11, Sam's Home shows "Jess has let you into their plan" with **Finish joining**; tap it, then **Bring my plan and join**.

When you're done, close the private window, and on device A sign out and sign in again with your own address.

#### Removing every test account afterwards

Sign in as each test account in turn and use **Delete my account**, as part H says ("Removing the two test accounts afterwards"), in any order.

**Only if that can't be done**, this removes the test accounts and everything of theirs, and nothing else, with the query in part H, which takes any number of addresses. It refuses to do anything unless it finds every address typed, and unless their plans have nobody else in them.

1. On supabase.com, open the **prepenny** project, then **SQL Editor** in the menu on the left, then **New query**.
2. Paste the query from part H. On its first line, put all four test addresses, keeping the quote marks:

   `addresses text[] := array['yourname+tom@gmail.com', 'yourname+jess@gmail.com', 'yourname+jess2@gmail.com', 'yourname+sam@gmail.com'];`

3. Tap **Run**. It should say **Success. No rows returned**, and under it how many plans and accounts it removed, such as "Removed 2 plans and 4 accounts." (step 3f's plan, Tom's with Jess in it, and this step's, Jess's with Sam in it; Sam's own plan went when he joined).
4. If it says "Found 3 of the 4 addresses", one of them was never used or is gone already: nothing was removed. Take that address out of the first line and run it again. If it says "Someone else is in one of their plans", someone not on the list joined one of them: nothing was removed; tell Claude Code.
5. Close the query without saving it. Any device still signed in as one of them notices within a minute that the sign-in has ended.

Your own account is never touched: the query only finds the addresses typed on its first line.

### J. Step 3g: living together

**What you need to set up: nothing new.** Checked one by one, in this step's own changes:

- **Supabase.** The **Database** workflow adds this step's database changes with the key it already has, as every step does, after its key check of all eleven permissions (D406). No new sign-in setting, web address, email template, function or permission. The new steps (Activity, undo, roles, making something private or shared, leaving, and a payment's History) are database functions only, which the Data API offers by itself. History is kept for as long as each plan exists (D469): roughly 5 to 15 MB a year for a plan two people use every day, inside the free plan's 500 MB for now (PLAN.md item 67). "Changed by" uses the live nudges step 3c switched on.
- **GitHub.** No new secret or variable, and no workflow changed. The new end-to-end tests run in the sign-in tests' parts, which already start a local Supabase.
- **Resend.** No new emails.
- **Cloudflare.** Nothing new: Activity and Leave this plan are ordinary pages of the app.
- **Google.** Nothing new.

This sandbox couldn't open Supabase's, Resend's, Cloudflare's or GitHub's own websites to compare their lists today, so the check above is of what this step uses. If any of those services has renamed a setting since, nothing here depends on it.

To check it worked, after merging: **Actions**, then **Database**, then the newest run: a green tick. Then **Deploy**: a green tick.

#### Trying it on the live app, alone, with two devices

You need your phone (device A, playing Jess) and a computer or a second browser with a **private or incognito window** (device B, playing Tom). Use two new Gmail "+" addresses made from your own: if your address is `yourname@gmail.com`, Gmail delivers mail for `yourname+jess3@gmail.com` and `yourname+tom3@gmail.com` to your own inbox, but PrePenny treats them as two new people. Put your own name where these steps say `yourname`. Your own plan isn't touched.

Jess's plan, on device A:

1. Open https://prepenny.co.uk/app/, tap **More**, then **Sign out**, then **Sign out** again. Your own plan is safe in your account.
2. Tap **Make my plan**. Keep **Current account**, type `500`, tap **Next**, then **Skip this step** on each screen, then **Go to my plan**.
3. Tap **More**, then **Sign up or sign in**, and sign up with `yourname+jess3@gmail.com`.
4. On Home, tap **Add a payment**: name `Dentist`, amount `65`, a day next week, **Once**, then **Add payment**. Tap **Undo** on the bar at the bottom. (These are changes made while the account is yours alone.)
5. Tap **Add a payment** again: name `Rent`, amount `550`, the 1st of next month, **Every month, or every few months**, then **Add payment**.
6. Tap **More**, then **Share with my partner**, then **Choose shared accounts**. Tick **Current account**, tap **Share these accounts**, then **Yes, share**. Go back.
7. Under **Invite your partner**, type `Jess`, keep **Can edit** and **A link I send myself**, tap **Make the invite link**, then **Copy the link**, and send it to yourself so you can open it on device B.

Tom joins, on device B, in a private or incognito window:

8. Open the link. Tap **Sign up or sign in** and sign up with `yourname+tom3@gmail.com`. Type `Tom` and tap **Ask to join**.
9. On device A, within a few seconds, "Tom wants to join your plan": tap **Allow**, then **Got it**. On device B, Home opens.

"Changed by Tom", within 5 seconds:

10. On device A, stay on **Home**, with Rent under **Next due**.
11. On device B, on Home, tap **Rent**, change the amount to `560`, and tap **Save**.
12. On device A, within 5 seconds and without touching it, Rent shows **−£560.00** and "Changed by Tom, just now" under its date. Tap it: the sheet says "Changed by Tom, just now" too. Tap **Close**.

Activity, and undo for your own changes only:

13. On device B, tap **More**, then **Activity**. It says "You changed Rent on … from £550.00 to £560.00." with **Undo this change**, and "Jess shared Current account." with no Undo. There's nothing about Dentist: that was Jess's while the account was hers alone.
14. On device A, tap **More**, then **Activity**: "Tom changed Rent on … from £550.00 to £560.00." with no Undo, and your own changes, Dentist included, with Undo on those that can still be undone.
15. On device B, tap **Undo this change** on the Rent change. It says "Change undone.", and the change says **Undone**. On device A, Rent on Home is back to −£550.00 within a few seconds.

A payment's History:

16. On device A, on Home, tap **Rent**. At the bottom of the sheet, under **History**, tap **Show its history**. Newest first, with the day and time of each: "Tom undid a change to it", "Tom changed it from £550.00 to £560.00" with **Undone since** beside it, and "You added it". Tap **Close**.

Changing what Tom can do:

17. On device A, tap **More**, then **Share with my partner**, then **Change what Tom can do**. Choose **Can view only** and tap **Save**: "Tom can view only now."
18. On device B, tap **More**, then **Share with my partner**: "You can see everything shared, but change nothing. Only Jess can change that." Go to Home, tap **Rent**, change the amount to `999` and tap **Save**. Within a few seconds a sheet says "A change wasn't saved" and "You can look at this plan but not change it." Tap **Got it**: Rent is back as it was. Activity on device B says "Jess changed what you can do to Can view only."
19. On device A, do step 17 again with **Can edit**.

A shared debt, and a shared goal with what each of you has put in:

20. On device A, tap **Debts**, then **Add a debt**: name `Car loan`, **Loan**, `1200`, tick "I don't have payments planned for it yet", and tap **Add this debt**. Under it: "Only you see this". On device B, **Debts** shows no Car loan.
21. On device A, tap **Car loan**. Under **Who sees it**, tap **Share this debt with Tom**, then **Yes, share it**. On device B, within a minute, **Debts** shows Car loan with "Shared with Jess".
22. On device A, tap **More**, then **Savings goals**, then **Add a savings goal**: `Holiday`, target `1200`, kept in **Current account**, already saved `100`. Tap **Add goal**. It says "Shared with Tom".
23. On device B, tap **More**, then **Accounts**, then **Add an account**: `Tom's account`, `300`. Then **More**, **Savings goals**, and under Holiday, **Add a payment into Holiday**: from **Tom's account**, to **Current account**, `50`, today, **Once**, then **Add payment**. On Home, tap **From Tom**, then **Mark as arrived**.
24. On both devices, **Savings goals**: Holiday has "£150.00 saved of £1,200.00", and **What each of you has put in**: "Already saved when it was made £100.00" and "Tom £50.00" (on device B, "You £50.00").

Making a shared account private again:

25. On device A, tap **More**, then **Accounts**, then **Add an account**: `Joint savings`, `800`. Then **Share with my partner**, **Choose shared accounts**, tick **Joint savings**, **Share these accounts**, **Yes, share**. On device B, Accounts shows Joint savings within a minute.
26. On device A, on **Choose shared accounts**, under **Shared accounts**, tap **Make Joint savings private again**, then **Yes, make it private**: "Joint savings is private now. Only you see it."
27. On device B, within a minute, Accounts no longer shows Joint savings, and Activity says only "Jess made a shared account private, so you no longer see it.", nothing more about it. Under **Choose shared accounts**, Current account says "Only Jess can make this private again, as they shared it."

Tom leaves, taking a copy:

28. On device B, tap **More**, then **Share with my partner**. At the bottom, under **Leave this plan**, tap **Leave this plan**. It says what comes with you (everything only you see) and what stays with Jess (every shared account, your changes in her Activity, and money you put into a shared account).
29. Tap **Leave this plan** without choosing anything: it says "Choose whether to take a copy of the shared accounts." Choose **Yes, take a copy**, tap **Leave this plan**, then, in the sheet, **Yes, leave**.
30. Device B opens Home of Tom's own plan: "You've left the plan. Your own things are in a plan of your own now, with a copy of the shared accounts as they were today." Tap **Got it**. Under **More**, **Accounts** shows Tom's account and his copy of Current account. **Activity** starts with "You left the shared plan, and took a copy of the shared accounts.", and has nothing of Jess's.
31. On device A, within a minute: **More**, then **Share with my partner** shows only you, with **Invite your partner** again. **Activity** says "Tom left the plan.", and Tom's earlier changes still say "Tom". On Home, tap **Rent**, then **Show its history**: Tom's change is still there. Tom's account shows nowhere.

When you're done, close the private window, and on device A sign out and sign in again with your own address.

#### Removing the two test accounts afterwards

Use **Delete my account** on each device, in either order, as part H says ("Removing the two test accounts afterwards"): **More**, **Delete my account and all my data**, **Send me a code**, the code, `delete`, then **Delete my account and all my data**. If Tom deletes his first, Jess's Activity then says "Someone who has left changed Rent…" and "Someone left the plan." (D482).

**Only if that can't be done**, use the same query as part H, with this step's two addresses. It refuses to do anything unless it finds both, and unless their plan has nobody else in it.

1. On supabase.com, open the **prepenny** project, then **SQL Editor** in the menu on the left, then **New query**.
2. Paste the query from part H. On its first line, put the two addresses, keeping the quote marks:

   `addresses text[] := array['yourname+jess3@gmail.com', 'yourname+tom3@gmail.com'];`

3. Tap **Run**. It should say **Success. No rows returned**, and under it "Removed 2 plans and 2 accounts.": Jess's plan, and the plan of his own Tom took with him when he left. The history of their changes goes with the plans. (If you stopped before step 28, it says "Removed 1 plans and 2 accounts.")
4. If it says "Found 1 of the 2 addresses", one was never used or is gone already: nothing was removed. Check the spelling, or take that address out and run it again.
5. Close the query without saving it. Any device still signed in as one of them notices within a minute that the sign-in has ended.

Your own account is never touched: the query only finds the addresses typed on its first line.

### K. Step 3h: download, import and delete

**What you need to set up: one setting in Supabase, two minutes. Done by the owner on 12 Nov 2026 (D486).** Deleting an account also removes the person from Supabase's own sign-in log when that log is kept in the database. That log grows with every sign-in, and the database can only read all of it, so turn off its database copy and deleting stays quick (D481). Supabase still keeps the log in its own log storage, for 1 day on the free plan and 7 on the paid plan.

1. On supabase.com, open the **prepenny** project, then **Authentication** in the menu on the left.
2. Under **Configuration**, open **Audit Logs**. (Supabase moves its menus now and then: it may be under **Settings** instead.)
3. Turn **Write audit logs to the database** off, and save if there's a **Save** button.
4. That's all. If you can't find it, nothing breaks for now: deleting only slows down once there are hundreds of thousands of sign-ins, long after launch.

Everything else, checked one by one, in this step's own changes, is nothing new:

- **Supabase.** The **Database** workflow adds this step's database changes with the key it already has, after its key check of all eleven permissions (D406). No other new sign-in setting, web address, email template, function or permission. "Check it's you", before deleting, sends the same 6-digit sign-in email as signing in (part E's template). Deleting an account removes it from Supabase's sign-in tables inside the database itself, as signing devices out already does (step 3e), so no new key or function is needed. Backups: the free plan has none, and there's nothing to switch on; the paid plan's daily backups come with the move to it before launch (launch checklist, item 3).
- **Resend.** One new email, "Your PrePenny account has been deleted", from hello@prepenny.co.uk, through the same key in Supabase's Vault (part F). Resend's free plan allows 100 emails a day.
- **GitHub.** No new secret or variable, and no workflow changed. The new end-to-end tests run in the sign-in tests' parts, which already start a local Supabase: about 5 more minutes across the three parts.
- **Cloudflare.** Nothing new: Download my data, Import a backup and Delete my account are ordinary pages, and the files are made on the phone.
- **Google.** Nothing new.
- **A new package**, Zod 4.6.7, which checks imported files. It's installed with the rest by the workflows: nothing to do.

This sandbox couldn't open Supabase's, Resend's, Cloudflare's or GitHub's own websites. Supabase's settings and backup rules were checked in Supabase's own documentation, read from its public repository; Resend's were not, so its 30 days are to be checked before launch (PLAN.md item 68).

To check it worked, after merging: **Actions**, then **Database**, then the newest run: a green tick. Then **Deploy**: a green tick.

#### Trying it on the live app, alone

You need a computer or phone with a **private or incognito window**, and one new Gmail "+" address made from your own: if your address is `yourname@gmail.com`, Gmail delivers mail for `yourname+data1@gmail.com` to your own inbox, but PrePenny treats it as a new person. Put your own name where these steps say `yourname`. Your own plan isn't touched. Optionally, your phone as a second device (step 13).

A plan to try it on, in the private window:

1. Open https://prepenny.co.uk/app/. Tap **Make my plan**. Keep **Current account**, type `500`, tap **Next**, then **Skip this step** on each screen, then **Go to my plan**.
2. Tap **More**, then **Sign up or sign in**, and sign up with `yourname+data1@gmail.com`.
3. On Home, tap **Add a payment**: name `Rent`, amount `550`, the 1st of next month, **Every month, or every few months**, then **Add payment**.

Download my data:

4. Tap **More**. Under **Your data**, tap **Download my data**. It says what's in the files, and "The files aren't locked."
5. Tap **Download the spreadsheet**. It says "Saved as prepenny-….csv. Look in your phone's downloads." Open it in a spreadsheet app: **Your account** has your "+" address; **Accounts** has £500; **Coming up in the next 12 months** has Rent on the 1st with what's left after it; **History** has "You added Rent…".
6. Tap **Download the backup**. It says "Saved as prepenny-backup-….json".

Import a backup:

7. On Home, tap **Update balance**, type `400`, and finish it, so the plan has changed since the backup.
8. Tap **More**, then **Import a backup**. It says "The plan in the backup takes the place of your plan now, on this phone and in your account. Its Activity starts again."
9. Tap **Choose a backup file** and choose the `.csv` file from step 5 by mistake: "This isn't a PrePenny backup. Choose the file ending in .json from Download my data." Nothing changes.
10. Tap **Choose a backup file** again and choose the `.json` file from step 6. A sheet says "Import this backup?", when it was made, and "It has 1 account, 1 payment, no debts and no savings goals. Your plan now will be replaced. It can't be brought back." Tap **Yes, replace my plan**.
11. It says "Your backup is in. Your plan is now the one from the backup." Tap **Go to Home**: the balance is £500.00 again, with Rent.

Delete my account:

12. Tap **More**, then **Delete my account and all my data**. It says what's deleted, and "It's deleted from PrePenny straight away. Copies in PrePenny's backups, and in the records of the services that run it, are gone within 30 days."
13. (Optional, a second device.) On your phone, tap **More**, then **Sign out**, then **Sign out** again (your own plan is safe in your account), then sign in with `yourname+data1@gmail.com`, and leave it on Home.
14. In the private window, tap **Send me a code**. Type the 6-digit code from the email, type `delete` under **Type delete to confirm**, and tap **Delete my account and all my data**.
15. The welcome says "Your account and all your data have been deleted, and nothing of yours is left on this phone. An email is on its way to say so." Your inbox has "Your PrePenny account has been deleted".
16. (If you did step 13.) Within a minute, without touching it, your phone opens the welcome: "This account has been deleted, so nothing of it is left on this phone." Sign in again there with your own address.

Nothing to remove afterwards: the account deleted itself.

#### Deleting in a shared plan, with two devices

Using the two test accounts of part J, or two new "+" addresses shared as part J's steps 1 to 9 do (Jess on device A, Tom in a private window on device B):

17. On device B, on Home, tap **Rent**, change the amount to `560`, and tap **Save**. On device A, Rent shows "Changed by Tom, just now".
18. On device B, tap **More**, then **Delete my account and all my data**. Under **Your shared plan**: "You share a plan with Jess. Deleting your account takes you out of it first…". Send the code, type it and `delete`, and tap **Delete my account and all my data**.
19. On device A, within a minute: Rent shows "Changed by someone who has left". **More**, then **Activity**: "Someone left the plan." and "Someone who has left changed Rent on … from £550.00 to £560.00." Tap **Rent** on Home, then **Show its history**: "Someone who has left changed it from £550.00 to £560.00". The name Tom is nowhere.
20. To finish, delete Jess's account the same way on device A.

#### If a backup of the database is ever put back

Only if Supabase's backups are used to put the database back as it was on an earlier day (with the paid plan). Accounts deleted since that day would come back with it, so delete them again straight after: on supabase.com, open the **prepenny** project, then **SQL Editor**, then **New query**, paste `select app.delete_again_after_restore();` and tap **Run**. It says how many it deleted again. It works for 30 days after each deletion, longer than the paid plan keeps its backups.

### L. Step 3i: Phase 3 checks

**What you need to set up: nothing.** Checked one by one, in this step's own changes:

- **Supabase.** One database change, sent by the **Database** workflow with the key it already has, after its check of all eleven permissions (D406). No new sign-in setting, web address, email template, function, permission or extension. The security test switches GraphQL on in the test database only; whether to switch it off on the live project is a question in `PLAN.md` (D495).
- **Resend.** Nothing new: no new email. The Database workflow now gives the live database the same key a safer way (D494).
- **GitHub.** No new secret or variable. The end-to-end tests take about 28 minutes more on a ready pull request and on `main`, shared between the three parts, and each part may run for 60 minutes instead of 45 (D499).
- **Cloudflare.** Nothing new.
- **Google.** Nothing new.
- **No new package.**

To try all of Phase 3 on the live app in about 15 minutes, alone, with a phone and a private window, follow `docs/TRY-PHASE-3.md`. It ends with deleting the test accounts.

### M. Step 4a: shared budgets and GraphQL

**What you need to set up: nothing.** Checked one by one, in this step's own changes:

- **Supabase.** One database change, sent by the **Database** workflow with the key it already has, after its check of all eleven permissions (D406). Switching GraphQL off is part of that change: `drop extension if exists pg_graphql`, as Supabase's own guide to pg_graphql gives it. The new check on every run, "Check GraphQL is still off", uses Supabase's database query route, which Supabase's own description of its API says needs `database_read` and `database_write`: that's **Database: Read-write** on the token page, which the key already has (step 5 of "The database"). **Data API Config** stays **Read**: GraphQL isn't switched off through the Data API's settings, which would need Read-write. No new sign-in setting, web address, email template, function or permission (D519).
- **GitHub.** No new secret or variable. The Database workflow has one more step. The end-to-end tests add about 6 minutes, shared between the three parts, inside their 60 minutes.
- **Resend, Cloudflare and Google.** Nothing new.
- **No new package.**

This computer couldn't open supabase.com today, so Supabase's guide and the description of its API were read from Supabase's own repository on GitHub, where its documentation lives.

To check it worked, after merging: **Actions**, then **Database**, then the newest run: a green tick, and its step **Check GraphQL is still off** says "GraphQL is off." Then **Deploy**: a green tick.

#### Trying it on the live app

What to check by hand is in `docs/TRY-PHASE-4.md`, section "Step 4a", with the test accounts deleted at its end. Walk through it once, with the rest of Phase 4, at the end of Phase 4 (D526).

### N. Step 4b: safer building blocks

What changed (D527 to D532): every building block is checked for known security problems on every change, a change that brings in a serious one is stopped, and GitHub is sent the list for Dependabot alerts after each change to `main` ("Checks", above); each page's security policy lists exactly the scripts PrePenny wrote into it, so a script slipped into a page can't run; and straight after each update, the Deploy workflow checks the live pages are exactly PrePenny's own, with nothing of Cloudflare's in them.

**What you need to set up**, checked against each service's own pages on 14 Nov 2026:

1. **Cloudflare: switch off Real User Monitoring (RUM)** (about 3 minutes). Cloudflare switched it on by itself for prepenny.co.uk, as it does for every free plan, and writes its script (from `static.cloudflareinsights.com`) into every page. The security policy has always stopped it running, but it shouldn't be there, and the Deploy workflow fails while it is. It isn't listed on Cloudflare's **Web Analytics** page, which says "Get started", so these steps start from the domain instead (D553, from Cloudflare's own documentation for Configuration Rules, 16 Nov 2026):
   1. Sign in at https://dash.cloudflare.com. On **Account home**, select **prepenny.co.uk**.
   2. In the menu on the left, select **Rules**, then **Overview**.
   3. Select **Create rule**, then **Configuration Rule**.
   4. In **Rule name**, type `No Cloudflare scripts in PrePenny`.
   5. Under **When incoming requests match**, choose **All incoming requests**.
   6. Under **Then the settings are**, add the setting **Disable Real User Monitoring (RUM)** and turn it on. Cloudflare's documentation names the setting, not the button that adds it: it may say **+ Add** or **Select setting**.
   7. Select **Deploy**.

   Then, on GitHub, open **Actions**, then **Deploy**, then its newest run from `main`, and tap **Re-run all jobs**. Its step **Check the live pages are PrePenny's own** should no longer name "its Real User Monitoring (RUM) script".
2. **Cloudflare: switch off Network Error Logging** (recommended, about 2 minutes, any time). Cloudflare asks phones to tell it when they fail to reach PrePenny: the address they tried and the error, never anything about money (D531). PrePenny doesn't use those reports. From Cloudflare's own "Get started" page for Network Error Logging: on **Account home**, select **Network**, find **Network Error Logging Monitoring**, and turn its toggle off. If **Network** isn't on Account home, select **prepenny.co.uk** first and find **Network** in the menu on the left. Until it's off, each Deploy run shows a yellow warning about it, and nothing fails.
3. **GitHub: nothing new.** Dependabot alerts are on, which also switches on the dependency graph that Dependabot's list needs ("When enabled, GitHub immediately generates the dependency graph", GitHub's own words). Dependabot's list sends with GitHub's own key for each run: no secret or variable.
4. **Supabase, Resend and Google: nothing.** No new package.

**To check it worked, after merging:** **Actions**, then **Deploy**, then the newest run: a green tick, and its step **Check the live pages are PrePenny's own** says "each exactly as built, with its own security policy, and nothing of Cloudflare's written into them". If it has a red cross naming "its Real User Monitoring (RUM) script", do step 1 above, then **Re-run all jobs**. If it names a page with "a different security policy from the one written for it", tell Claude Code what it says it was sent instead (D553). Then **Dependabot's list**: a green tick. What to check by hand is in `docs/TRY-PHASE-4.md`, section "Step 4b".

### O. Step 4c: bank holidays

What changed (D536 to D542): phones get the newest UK bank holiday list each week from PrePenny's own site, which the **Bank holidays** workflow keeps up to date from GOV.UK every Monday, and use the copy built into PrePenny with no signal. In a shared plan both phones work out every date from the same list. A payment's sheet says why it moved, its weekend and bank holiday rule can be changed for this and all later ones, and when a new bank holiday moves a payment, Home says so once ("Bank holidays", below).

**What you need to set up: nothing.** Checked on 15 Nov 2026 against GitHub's own documentation (in its source, as docs.github.com couldn't be opened from the building computer): the Monday check starts the Deploy workflow with GitHub's own key, which GitHub allows ("`workflow_dispatch` and `repository_dispatch` events always create workflow runs"), and asks for the permission to in its own file; the Deploy workflow already has the Cloudflare key; the database change goes to the real database with the Database workflow after merging, as every step's does; and GOV.UK's list needs no key.

**To check it worked, after merging:** the Monday after, **Actions**, then **Bank holidays**: a run from "schedule" with a green tick, saying "The site already has GOV.UK's list, so there's nothing to do." (or, if GOV.UK's list changed, that it put the live app online again, followed by a **Deploy** run with a green tick). What to check by hand is in `docs/TRY-PHASE-4.md`, section "Step 4c".

### P. Step 4d: installing to the home screen

What changed (D546 to D552): Home suggests adding PrePenny to the home screen once, on the second day someone uses their own plan; on an iPhone in Safari, **Make my plan** suggests it first, as a plan made in Safari stays in Safari; the steps for Android and iPhone are always under **More**, **Home screen**; an iPhone shows PrePenny's colours while the home-screen app opens; and on Android a long press of the icon offers **Update balance** and **I spent**. Also (D553): Cloudflare's script is its Real User Monitoring, and part N, step 1, now says exactly where to switch it off.

**What you need to set up: nothing new for step 4d.** Checked on 16 Nov 2026: no new secret or variable on GitHub (no workflow asks for one); on Cloudflare, the hosting settings change only the list of files the few lines in front of the app skip, which the Deploy workflow's key already puts online (`wrangler deploy`, "Workers Scripts Edit", as before); no database change, so nothing for Supabase; nothing for Resend or Google; and no Apple or Google developer account, as adding to the home screen needs neither. Part N, step 1 (Cloudflare's Real User Monitoring) is still to do if you haven't, and its steps have changed.

**To check it worked, after merging:** **Actions**, then **Deploy**: a green tick once part N, step 1 is done. What to check by hand is in `docs/TRY-PHASE-4.md`, section "Step 4d".

### Q. Step 4d-2: the Next.js update and the front page

What changed (D557 to D559): Next.js, which turns PrePenny's screens into the site's files, is 16.4.6 instead of 16.4.3, with the fix for the known problem the building-block check listed (PLAN.md item 88). And the front page, https://prepenny.co.uk/, is sent exactly its own security policy again: the live site was sending it two, which kept its buttons from working wherever they were sent (item 89). The few lines in front of the app's files (`apps/web/cloudflare/worker.ts`) now send every page one policy, its own.

**What you need to set up: nothing.** Checked on 17 Nov 2026: no workflow changed, so no new secret or variable on GitHub; on Cloudflare, the Deploy workflow puts the new files and the few lines in front of them online with the key it already has, as before ("Workers Scripts Edit"), and no hosting setting changed; no database change, so nothing for Supabase; nothing for Resend or Google.

**To check it worked, after merging:** **Actions**, then **Deploy**: a green tick once part N, step 1 is done. What to check by hand is in `docs/TRY-PHASE-4.md`, section "Step 4d-2".

### R. Step 4e: reminders

What changed (D560 to D573): **More** has **Reminders**: payday at 9am, the evening before money goes out at 7pm, a shortfall when it first appears and again at 9am the day before, and the weekly summary on Sundays at 6pm, each off until it's turned on, with **Hide amounts in notifications**, and nothing between 9pm and 8am. They need an account, and on an iPhone PrePenny opened from the Home Screen (part P). Every 15 minutes the database's own scheduled job starts a new function, `reminders`, which works each one out from the plan as the person's own phone reads it and sends it to the phone, sealed so Apple's, Google's and Mozilla's push services can't read it. And the database now fetches PrePenny's own bank holiday list itself each Monday, and plans take only a list it fetched (D545).

**What you need to set up: nothing.** Checked on 17 Nov 2026, against Supabase's and Apple's own documentation (D573):

- **GitHub:** no new secret or variable. The Database workflow builds the reminders function, puts it online and tells the database its address, with the same key and the same permissions it already has: "Edge Functions: Read-write", as for the get-back-in function, and "Database: Read-write", as for the GraphQL check. The key check at the start of the run still lists exactly those eleven.
- **Supabase:** nothing to switch on by hand. The database change switches on Supabase Cron (pg_cron) and pg_net with SQL, as Supabase's own guide shows, and both are on the free plan. PrePenny's signing key for notifications is made by the function the first time it runs and kept in Supabase's Vault: there's no key for you to make or copy. `PLAN.md` had said you would add one GitHub secret; that's no longer needed (D566).
- **Apple, Google, Mozilla:** no developer account. Apple's own documentation: "You don't need to join the Apple Developer Program to send web push notifications."
- **Resend:** nothing. Reminders are never emails (D560).
- **Cloudflare:** nothing new.

**To check it worked, after merging:**

1. **Actions**, then **Database**: a green tick. Tap the run, then **Change the real database**: the step **Tell the database where the reminders function is** ends "The database knows where the reminders function is, and has started it once."
2. On supabase.com, open the project, then **Edge Functions**: `get-back-in` and `reminders` are listed. Then **Integrations**, **Cron**: two jobs, `prepenny-reminders` (every 15 minutes; every minute since step 4f, part S) and `prepenny-bank-holidays` (Mondays). Their runs say "succeeded".
3. What to check by hand on your phone is in `docs/TRY-PHASE-4.md`, section "Step 4e".

**If something goes wrong with reminders:** if the Database run's step **Tell the database where the reminders function is** fails, run the workflow again by hand (**Actions**, **Database**, **Run workflow** on `main`). If reminders stop arriving for everyone, look at **Integrations**, **Cron**, `prepenny-reminders`: a run that failed says why, with no amounts or names in it. Ask Claude Code to look, with what it says.

### S. Step 4f: notifications in a shared plan

What changed (D575 to D582): in a shared plan, **Reminders** under **More** has **When Tom changes something**, off until each person turns it on. A few minutes after a partner changes something you both see, a notification says what, in Activity's own words, "Tom added Car MOT, −£54.85 on Fri 13 Nov.", with changes made close together as one: "Tom made 3 changes, including Car MOT, −£54.85." Nobody is told about their own changes, or anything only the other person sees. Quiet hours and **Hide amounts in notifications** apply. Shared warnings come with **When you'd be short**, which in a shared plan names the shared account, so both read the same: "Joint account will be £30.00 short on Sun 1 Nov." The reminders function does this too, and the database's scheduled job now looks every minute, rather than every 15, starting the function only when someone may be due something.

**What you need to set up: nothing.** Checked on 18 Nov 2026, against Supabase's own documentation:

- **GitHub:** no new secret or variable, and no workflow changed. The Database workflow already puts the reminders function online after every merge (part R), with the key it has.
- **Supabase:** nothing to switch on by hand. The database change moves the job `prepenny-reminders` to every minute; Supabase's guide to Cron says "Attempting to create a second Job with the same name (and case) will overwrite the first Job", which is how it's changed. Every minute starts the function at most 43,200 times a month, and only when someone may be due something; Supabase's free plan includes 500,000 function starts a month (its "Function Invocations" quota).
- **Apple, Google, Mozilla, Resend, Cloudflare:** nothing new. Notifications in a shared plan go the same way as reminders, and are never emails.

**To check it worked, after merging:**

1. **Actions**, then **Database**: a green tick.
2. On supabase.com, open the project, then **Integrations**, **Cron**: `prepenny-reminders` now runs every minute (`* * * * *`), and its runs say "succeeded".
3. What to check by hand with two people is in `docs/TRY-PHASE-4.md`, section "Step 4f".

### T. Step 4g: the help centre

What changed (D584 to D593): **More** has **Help**, with **Help centre** and **Help when money is tight**, and the same articles are on the website at https://prepenny.co.uk/help/ for anyone. The articles are the Markdown files in `content/help`: change one, merge it, and the next update shows it (`content/help/README.md` says how they're written). Search works on the phone, with no signal. Home shows "Free, confidential help is available." under the lowest point when three pay periods in a row each have a short day, starting with the one we're in now or the next one. And a new scheduled job, `prepenny-job-history`, clears PrePenny's own scheduled jobs' run history older than 7 days, once a day.

**What you need to set up: nothing.** Checked on 18 Nov 2026:

- **GitHub:** no new secret or variable, and no workflow changed. The new database test runs with the others, and the Database workflow sends the new database change to the live database after merging, as for every step. No workflow skips a change to `content/help`, so an article change alone is checked and goes live when merged.
- **Supabase:** nothing to switch on by hand. The database change makes the new job with SQL, as Supabase's own Cron guide shows (https://supabase.com/docs/guides/cron/quickstart, "Clean up job run history", which says the history "is never cleaned up automatically"). It runs inside the database, so it doesn't count as a function start.
- **Cloudflare:** nothing. The 22 help pages each get their own security policy rule, as every page does (D529): 57 pages in all, within the 100 rules Cloudflare reads, which the build checks.
- **Resend, Apple, Google:** nothing.

**To check it worked, after merging:**

1. **Actions**, then **Database**: a green tick.
2. On supabase.com, open the project, then **Integrations**, **Cron**: a third job, `prepenny-job-history`, runs at 3:23am UTC each day. After its first run, `prepenny-reminders`' history goes back 7 days, no further.
3. Open https://prepenny.co.uk/help/: the help centre, with 10 articles.
4. What to check by hand on your phone is in `docs/TRY-PHASE-4.md`, section "Step 4g".

### U. Step 4h: updating open phones, help where it's needed, and the tour

What changed (D594 to D599): an open PrePenny now finds a new version within seconds of coming back on screen, signed in or not, shows "PrePenny has been updated. Tap to reload.", and loads it by itself once it's on the phone, at the first safe moment. Three "?" buttons say why, in the person's own figures: beside **Lowest point ahead** on Home, **Not ticked yet** on Coming up, and Update balance's ticking step. Home offers a 60-second tour once after setup, which **More**, **Help**, **Take the tour** replays.

**What you need to set up: nothing.** Checked on 19 Nov 2026:

- **GitHub:** no new secret or variable. The end-to-end workflow builds the app twice now (`pnpm build:update-test`, then `pnpm build:local`, about half a minute more in each of its three parts), for the updating tests. The Deploy and Database workflows don't change.
- **Supabase:** nothing. No database change in this step.
- **Cloudflare:** nothing. The new `/offline-version.json` is served as a plain file, like `/version.json`, so it doesn't run PrePenny's few lines or count towards the free allowance (`apps/web/wrangler.jsonc`), and its one header rule makes 60 of the 100 Cloudflare reads, which the build checks.
- **Resend, Apple, Google:** nothing.

**To check it worked, after merging:**

1. **Actions**, then **Deploy**: a green tick.
2. Open https://prepenny.co.uk/offline-version.json: it says the same `build` as https://prepenny.co.uk/version.json.
3. What to check by hand on your phone, including updating to a new version after a later merge, is in `docs/TRY-PHASE-4.md`, section "Step 4h".

### V. Step 4i: Contact us, Something looks wrong and Suggest a feature

What changed (D601 to D614): **Contact us** is under **More**, **Help**, and on the website at https://prepenny.co.uk/contact/ for anyone, signed in or not. **Something looks wrong** is at the end of every screen, beside **Help**: someone says what looks wrong, and can add a screenshot from their photos or the backup file of their plan, only after the consent message. **Suggest a feature** is under **More**, **Help**. Every message is kept in PrePenny's own database. hello@prepenny.co.uk gets "A message is waiting in PrePenny's support inbox", with none of its words, at most once every 4 hours. The person gets an automatic reply saying when to expect an answer, with none of their words. Signed out, they first type a code sent to their address, so nobody can make PrePenny email someone else. Pictures and plan copies are deleted after 30 days, and messages 12 months after your last reply (D604).

**What you need to set up: nothing.** Checked on 19 Nov 2026, against each service (D614):

- **Supabase:** nothing by hand. The Database workflow makes the new tables, the two steps the app calls and two scheduled jobs (`prepenny-support-told` every 15 minutes, `prepenny-support-tidy` every hour) from the migration, as for every step. No Storage bucket: pictures are kept in the database itself (D607). No new function, secret or setting.
- **Resend:** nothing. The emails go from hello@prepenny.co.uk with the key the database already has (part F). Resend's own pricing page, read on 19 Nov 2026, says the free plan is 3,000 emails a month and 100 a day, and keeps emails 30 days. Support's emails are capped at 21 a day, so at least 79 are always left for sign-in codes (D606).
- **Cloudflare:** nothing. Three new pages, each with its own security policy: 63 of the 100 rules, which the build checks.
- **GitHub, Apple, Google:** nothing.

**Reading messages, until step 4j's support screen:**

1. On supabase.com, open the **prepenny** project, then **SQL Editor** in the menu on the left, then **New query**.
2. Paste this, and tap **Run**:

   ```sql
   select to_char(m.sent_at at time zone 'Europe/London', 'Dy DD Mon HH24:MI') as sent,
     m.kind, m.words, m.screen as on_screen,
     coalesce(m.email, u.email) as reply_to,
     m.answer_by, m.phone_type, m.app_version,
     m.file_kind as attached, m.file_gone_at as attachment_deleted, m.id
   from app.support_messages m
   left join auth.users u on u.id = m.person_id
   order by m.sent_at desc
   limit 50;
   ```

   Newest first. **kind** is `contact` (Contact us), `problem` (Something looks wrong) or `idea` (Suggest a feature). **reply_to** is the address to answer: the one they sign in with, or the one they proved with a code. **answer_by** is the working day the automatic reply aimed for. **attached** says `picture` or `plan` when they added one.
3. To look at a picture: copy the message's **id** from the last column, then run this with it in place of `PASTE-THE-ID-HERE`:

   ```sql
   select 'data:' || f.content_type || ';base64,' || translate(encode(f.data, 'base64'), E'\n', '') as picture
   from app.support_files f
   where f.message_id = 'PASTE-THE-ID-HERE' and f.kind = 'picture';
   ```

   Copy the result, which starts `data:image/`, and paste it into a new browser tab's address bar: the picture opens, on your computer only. A very big picture may be too long to paste; step 4j's support screen shows it, well within its 30 days.
4. To read a copy of a plan, the same with this, which shows the backup file's text:

   ```sql
   select convert_from(f.data, 'UTF8') as plan_copy
   from app.support_files f
   where f.message_id = 'PASTE-THE-ID-HERE' and f.kind = 'plan';
   ```

5. To answer, until step 4j: write from hello@prepenny.co.uk to the **reply_to** address. Someone in distress: step 4j adds the ready reply with Samaritans and free debt advice.

Nothing here changes a message. The SQL Editor is only for you: nobody signed in to PrePenny can read any message, not even their own.

**To check it worked, after merging:**

1. **Actions**, then **Database**: a green tick, with **Change the real database** done.
2. On supabase.com, **Integrations**, **Cron**: `prepenny-support-told` and `prepenny-support-tidy` are listed, and their runs succeed.
3. What to check by hand, on your phone and in a private window, is in `docs/TRY-PHASE-4.md`, section "Step 4i".

### W. Step 4j: support tools

What changed (D617 to D642): **the support dashboard**, an internal site of its own at https://admin.prepenny.co.uk/, for support's own account alone, never your personal one: every message and idea, newest first, with any picture and plan copy; your reply, emailed from hello@prepenny.co.uk, with ready replies (one for someone in distress, with Samaritans and free debt advice); finding an account and seeing its status, never its money; signing someone out everywhere, the 7-day wait to turn off two-step sign-in, and a link to a locked backup email; usage counts; and the tax year check. The app has no support pages, and nothing in the app or on the website links to the dashboard. Under **More**, **Security**, people can **Let support see my plan** for 7 days, read only; a partner is told in Activity.

Support's account is its own: an address at prepenny.co.uk that you choose, forwarded to your Gmail, and never written anywhere public: not in the app, the website, PrePenny's emails or this repository. It lives only in Cloudflare (Email Routing and Access) and in GitHub's `SUPPORT_EMAIL` secret. Below it's called **support's address**. That account never has a plan: signed in on prepenny.co.uk, it sees only "This is PrePenny support's account. Open the support dashboard instead." (D640).

**Checked on Cloudflare's own pages on 21 Nov 2026 (D641):** Cloudflare Access is part of the Zero Trust Free plan, "$0 forever", with a "50 user limit", and the dashboard needs one user. Cloudflare's setup page says that when you start Zero Trust you choose a plan and enter payment details: "If you chose the Zero Trust Free plan, this step is still needed but you will not be charged." So it asks for a card even on the Free plan. GitHub's Cloudflare key needs nothing new: adding a Worker's own address accepts **Workers Scripts** permission (Cloudflare's API reference), which the key has from part A, on the same prepenny.co.uk it already puts the app on. Supabase allows the dashboard's address for signing in from `supabase/sign-in-settings.json`, which the Database workflow sends at the merge: nothing to do by hand.

**Do these in this order.** Steps 1 to 7 come before merging; step 8 is the merge; steps 9 to 11 come after.

1. **Support's address, forwarded to your Gmail.** On dash.cloudflare.com, choose your account, then **Compute**, **Email Service**, **Email Routing**, **Routing Rules**, then **Create routing rule**. In **Email pattern**, type the part of support's address before the @, with the domain `prepenny.co.uk`. **Action**: **Send to an email**. **Destination**: your Gmail, which is there already from part A (hello@). Save it. Send an email to support's address from another account: it arrives in your Gmail.
2. **Zero Trust, once.** On dash.cloudflare.com, choose **Zero Trust**. Choose a team name, such as `prepenny` (your Access address becomes `prepenny.cloudflareaccess.com`), then the **Zero Trust Free** plan, and enter the payment details it asks for (nothing is charged). You can see the team name later under **Zero Trust**, **Settings**.
3. **The one-time code login.** In **Zero Trust**, **Integrations**, **Identity providers**, choose **Add new identity provider**, then **One-time PIN**.
4. **Cloudflare Access in front of the dashboard.** In **Zero Trust**, **Access controls**, **Applications**, choose **Create new application**, then **Self-hosted and private**, then **Add public hostname**: subdomain `admin`, domain `prepenny.co.uk`, nothing in the path. Under **Access policies**, create a new policy: name it `Support only`, action **Allow**, and include **Emails**: support's address, and nothing else. Under login methods, choose **One-time PIN** only, and turn on **Apply instant authentication**. **Session Duration**: 24 hours. Choose **Create**. Don't make a DNS record for `admin` yourself: the deploy makes it (Cloudflare can't add a Worker's address where one already exists).
5. **Two GitHub variables, from Access.** In Access, open the application (**Edit**), then **Additional settings**, and copy the **Application Audience (AUD) Tag**: 64 letters and numbers. On github.com, open the repository, **Settings**, **Secrets and variables**, **Actions**, the **Variables** tab, **New repository variable**: name `CLOUDFLARE_ACCESS_AUD`, value the tag. Then another: `CLOUDFLARE_ACCESS_TEAM_DOMAIN`, value your team's Access address, such as `prepenny.cloudflareaccess.com`. Neither is secret: the dashboard checks with them that every request came through Access, and serves nothing without them.
6. **The GitHub secret.** Same page, the **Secrets** tab, **New repository secret**: name `SUPPORT_EMAIL`, secret support's address, exactly. **Add secret**. (If you added your own address here before, change it: the Database workflow refuses an address whose account is in a plan.)
7. **The Cloudflare key.** Check GitHub's key still has the three permissions in part A, steps 1 to 4. Nothing else is needed.
8. **Merge** the pull request.
9. **Check the runs.** **Actions**, then **Deploy**: a green tick, with **Put the support dashboard online** and **Check the support dashboard is only at its own address, behind Cloudflare Access** both done. The first time, the new address's certificate can take a few minutes, and the check waits up to 5. Then **Actions**, **Database**: **Tell the database who PrePenny support is** says "The database knows who PrePenny support is."
10. **Sign in to the dashboard, once, on your computer.** Open https://admin.prepenny.co.uk/. Cloudflare asks for an email address: type support's address, then the code Cloudflare emails (it arrives in your Gmail). Then the dashboard's own page, **Sign in to PrePenny support**: support's address, **Send me a code**, the code from the email, **Sign in**.
11. **Turn on its two-step sign-in.** The first time, the dashboard shows **Set up two-step sign-in**: tap **Set it up**, scan the picture with the authenticator app on your phone, type the code it shows for PrePenny support, and tap **Turn on**. The dashboard opens. Keep the key it shows somewhere safe. From then on, every sign-in asks for Cloudflare's code, the dashboard's code by email, then the app's code.

**Using it:**

- Open https://admin.prepenny.co.uk/ on your computer. Nothing of the dashboard is kept there: closing the tab signs you out of it. The email to hello@prepenny.co.uk that messages are waiting has **Open the support dashboard** too.
- Tap a message to read it. To reply, choose a ready reply or write your own, change anything, and tap **Send reply**. Never write an amount, a payment name or a note: Resend keeps emails for 30 days.
- **Find an account** by the address they sign in with, or their backup email. Their plan shows only if they've let support see it, from **More**, **Security**, **Let support see my plan**: the ready reply **Can we see your plan?** says how.
- **Lost the authenticator app, still has the email:** on their account, **Turn off two-step sign-in**. It's turned off after 7 days, unless it's stopped from the email to them or the notice on any phone they're signed in on, or they sign in with the app meanwhile. Send the ready reply **Lost the authenticator app**.
- **Lost the sign-in email, no backup:** support never moves an account. Send the ready reply **Lost the sign-in email, no backup**.
- **Backup email kept locked by someone else:** on their account, **Send a link to their backup email**, and the ready reply **Backup email kept locked**. The link to finish goes by itself after 24 hours.
- From 1 March, the **Tax files** card, a yellow warning on every pull request and a red **Tax year** run each morning say when next year's tax file is missing: ask Claude Code for step 4r.

Part V's SQL Editor queries still work, but you no longer need them.

**To check it worked, after merging:** steps 9 to 11 above, then **Actions**, **Tax year**, **Run workflow**: a green tick, saying every tax file needed now is there. What to check by hand is in `docs/TRY-PHASE-4.md`, section "Step 4j".

### If support's authenticator app is lost

The support dashboard opens only with the code from the authenticator app on your phone. If that phone is lost, or the app was removed, turn off two-step sign-in for support's account yourself, in Supabase, then set it up again with your new phone (D648, since step 4k). You never type support's address: the database already knows which account is support's.

1. On supabase.com, sign in, open the **prepenny** project, then **SQL Editor** in the menu on the left, then **New query**.
2. Paste this line, exactly, and tap **Run**:

   ```sql
   select app.turn_off_support_two_step();
   ```

3. The result says: "Two-step sign-in is off for PrePenny support's account, and it has been signed out everywhere. Sign in to the support dashboard again, and set up two-step sign-in with your new phone." It removes support's authenticator app and ends every sign-in of support's account, on every computer. It changes nothing on anyone else's account.
   - If it says "Nobody is PrePenny support in this database yet", check the GitHub secret `SUPPORT_EMAIL` (part W, step 6), then **Actions**, **Database**, **Run workflow**, and try again. Nothing was changed.
   - If it says two-step sign-in "was already off", support's account is signed out everywhere: go on to step 4.
4. Open https://admin.prepenny.co.uk/ on your computer and sign in as before: Cloudflare's code, then the dashboard's code by email to support's address.
5. The dashboard shows **Set up two-step sign-in**, as the first time (part W, step 11): tap **Set it up**, scan the picture with the authenticator app on your new phone, type the code it shows for PrePenny support, and tap **Turn on**. Keep the key it shows somewhere safe.
6. If you find the old phone, remove the old "PrePenny support" entry from its authenticator app: its codes no longer work.

Only people who can sign in to the Supabase project can open its SQL Editor. Nobody signed in to PrePenny, nobody signed out, and not even Supabase's own key can run this step: `supabase/tests/database/42-support-lost-authenticator.test.sql` checks it.

### X. Step 4k: service status

What changed (D643 to D652): **PrePenny's status page** says whether four things are working: the app, signing in, saving changes and reminders. It's at UptimeRobot, on UptimeRobot's free plan, so it keeps working when PrePenny doesn't. UptimeRobot checks each part every 5 minutes, and emails you when one stops working. The app links to it from **More**, **Help**, from **Contact us**, and from the end of every help page on the website. When a signed-in phone has a signal but PrePenny's server isn't answering, a note says "PrePenny's server isn't answering right now, so changes can't be sent to your account. They're saved on this phone and will be sent when it's back.", with **See PrePenny's status**. The support dashboard shows the same four parts at the top, checked as you open it.

The checks use nobody's account or data: "the app" is PrePenny's own page; the other three ask a small function on Supabase, `status`, which the Database workflow puts online. It asks Supabase's sign-in service whether it's healthy, saves the time of the check in a row of its own, and looks whether the reminders job ran in the last 5 minutes and the reminders function answers.

**Checked on 21 Nov 2026:** UptimeRobot's own pricing page says its free plan is "Good for personal and commercial projects", with "50 monitors", a "5 min. monitoring interval" and "Basic status pages"; its terms say "UptimeRobot is available for any use, including commercial and business use" and "Free plan includes 1 status page with a unique UptimeRobot URL only", so the page's address is at stats.uptimerobot.com, not prepenny.co.uk (that needs a paid plan). Cloudflare and Supabase stay free: the checks use about 7% of Supabase's 500,000 free function calls a month, and 288 of Cloudflare's 100,000 free daily requests (D644).

**What you set up.** Steps 1 to 5 come before merging; step 6 is the merge; steps 7 to 10 come after, as the status function goes online with the merge.

1. **The account.** On https://uptimerobot.com/pricing/, under **Free**, tap **Register now**, and sign up with your Gmail. No card is needed. UptimeRobot emails you there when a part stops working.
2. **The app's check.** In UptimeRobot's dashboard, tap **+ Add New Monitor**. Choose **HTTP(s)**. **URL**: `https://prepenny.co.uk/app/`. **Friendly Name**: `The app` (it's what the status page shows). Leave the monitoring interval at **5 minutes**, keep your email as the alert contact, and tap **Create Monitor**. Within 5 minutes it says **Up**.
3. **The status page.** Tap **Status pages**, then **Create Status Page**. Choose the monitor **The app**. Name the page `PrePenny`. Leave your own domain empty (it's for paid plans). Tap **Finish**. Open the page: its address starts `https://stats.uptimerobot.com/`. Copy the whole address.
4. **The GitHub variable.** On github.com, open the repository, **Settings**, **Secrets and variables**, **Actions**, then the **Variables** tab (not **Secrets**: the address is public), **New repository variable**. **Name**: `STATUS_PAGE_URL`. **Value**: the status page's address you copied, such as `https://stats.uptimerobot.com/AbCdEf123`. Tap **Add variable**.
5. **Your Supabase address, for steps 8 and 9.** On the same **Variables** tab, open `SUPABASE_URL` and copy its value, such as `https://abcdefghijklmnopqrst.supabase.co`.
6. **Merge** the pull request.
7. **Check the runs.** **Actions**, then **Database**: a green tick, with **Put the status function online** done. Then **Actions**, **Deploy**: a green tick, and no yellow "No status page" warning.
8. **The three server checks.** In UptimeRobot, tap **+ Add New Monitor** three times, each **HTTP(s)**, 5 minutes, your email as the alert contact, then **Create Monitor**. Put your Supabase address from step 5 in place of the made-up one:
   - **Friendly Name** `Signing in`, **URL** `https://abcdefghijklmnopqrst.supabase.co/functions/v1/status?part=sign-in`
   - **Friendly Name** `Saving changes`, **URL** `https://abcdefghijklmnopqrst.supabase.co/functions/v1/status?part=saving`
   - **Friendly Name** `Reminders`, **URL** `https://abcdefghijklmnopqrst.supabase.co/functions/v1/status?part=reminders`

   Each says **Up** within 5 minutes. A part that isn't working answers "503", which UptimeRobot counts as down.
9. **Add them to the status page.** Tap **Status pages**, then the PrePenny page, and choose the three new monitors as well. With **Manual** sorting, drag them into this order: The app, Signing in, Saving changes, Reminders. Save.
10. **Look at it.** Open the status page: four parts, each **Up**, with nothing personal on it. UptimeRobot's own words on the page, such as "All systems operational", are UptimeRobot's and can't be changed on the free plan.

**Using it:** UptimeRobot emails your Gmail when a part goes down, and again when it's back. When people write in, the status page and the dashboard's **PrePenny's status** say whether it's PrePenny's end. What to check by hand is in `docs/TRY-PHASE-4.md`, section "Step 4k".

**If something goes wrong:** if a server check stays **Down** while PrePenny works on your phone, open its address in a browser: "working": true means UptimeRobot will catch up at its next check; anything else, run **Actions**, **Database**, **Run workflow** again, then ask Claude Code.

## Bank holidays

The engine's copy of the UK bank holiday list is `packages/engine/data/bank-holidays.json`, downloaded unchanged from https://www.gov.uk/bank-holidays.json by the **Bank holidays** workflow on GitHub. The file beside it, `bank-holidays.source.json`, says where it came from and when. It's built into PrePenny, so a phone with no signal still knows the bank holidays. To get a fresh copy, open **Actions**, then **Bank holidays**, then **Run workflow** on your branch. It only saves a new commit if the list has changed. A pull request gets one by itself when it's marked ready.

Since step 4c (D537), phones also fetch the newest list from PrePenny's own site, https://prepenny.co.uk/bank-holidays.json, once a week. Every Monday morning the **Bank holidays** workflow compares GOV.UK's list with that one, and when GOV.UK's has changed, puts the live app online again with it, the same commit that's live, so a new bank holiday reaches people's phones within about a week with no update to PrePenny. Every time the live app is put online, it gets GOV.UK's newest list too. Each plan keeps the list it uses, so both phones in a shared plan always agree (D536).

- **To update it now,** without waiting for Monday: **Actions**, then **Bank holidays**, then **Run workflow**, keeping **Branch: main**.
- **If the Monday runs stop:** GitHub switches off a public repository's scheduled workflows after 60 days with no change to it (PLAN.md item 85). To switch it back on: **Actions**, then **Bank holidays** in the list on the left, then **Enable workflow**. Until then, every update put online still gets the newest list.
- **A yellow warning "Built-in bank holidays"** on a Deploy run means GOV.UK couldn't be reached at that moment: the site keeps the list built into that version, and the next Monday tries again. Nothing else needs doing.

Since step 4e (D545, D569), the database fetches that same list from PrePenny's site itself every Monday at 7:41am UTC, after the workflow above, and gives every plan the newest it fetched. A list a phone sends is taken only if the database fetched it too, so nobody can put a made-up list into a shared plan. On supabase.com, **Integrations**, **Cron** lists the job as `prepenny-bank-holidays`.

## Tax figures

The take-home pay calculator's figures for each tax year are in `packages/engine/src/pay/tax-years`, one file per tax year, with the GOV.UK page each figure comes from. The GOV.UK pages and HMRC's files they come from are saved unchanged in `sources/gov-uk/` by the **Fetch sources** workflow on GitHub, from the list of addresses in `sources/gov-uk.txt`. To fetch them again, open **Actions**, then **Fetch sources**, then **Run workflow**. A new tax year file is needed every April, and the tax year check warns from 1 March when next year's is missing.
