# PrePenny

Plan every penny before payday.

PrePenny is a money planner for people in the UK who live payday to payday. You type in what your bank shows today and every payment coming up, and it shows the balance left after each one, the lowest point ahead and when each debt is paid off.

Phase 2 is done (4 Nov 2026): the money engine, and the whole app on one phone. Someone can make their own plan in eight steps, or look around Sam's example plan; see Home, Coming up and their debts; update their balance, add, change, move, tick or remove any payment and undo it; record what they spend from a budget; add overtime or a missed shift; keep savings goals; practise changes in What if; and work out take-home pay, in the app or on the free public calculator. Everything is saved on the phone only, and it works with no signal. Signing in, sharing a plan and keeping it on a server come in Phase 3. See `PLAN.md` for progress.

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

GitHub checks every change: lint, type checks and tests run on every push and pull request. To see them, open the repository on GitHub and tap **Actions**, then **Check**. A green tick means everything passed.

GitHub runs two sets of checks. **Lint, type checks and tests** checks the code and runs every engine and app test. **Build and end-to-end tests** builds the app and uses it in a real browser at 320px and 360px wide, as a phone would, in three parts side by side so it finishes sooner: "part 1 of 3", "part 2 of 3" and "part 3 of 3". All four must have a green tick.

To run them on a computer, install Node 24 and pnpm 12, then run:

```
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @prepenny/web exec playwright install chromium
pnpm e2e
```

To look at the app on a computer while working on it, run `pnpm --filter @prepenny/web dev` and open http://localhost:3000/. A browser with nothing saved starts at the welcome and setup.

## Putting PrePenny online

The app is hosted on Cloudflare Workers (D68), on Cloudflare's free plan. GitHub puts it online by itself, with the **Deploy** workflow (`.github/workflows/deploy.yml`): every pull request gets its own preview link, and every change merged into `main` goes to the live app once GitHub's checks have passed on it.

The live app is at https://prepenny.prepenny.workers.dev/app/ (set up by the owner on 3 Nov 2026, D195).

### How to put an update online

You don't need to type any commands. Everything is done on github.com, on a phone or a computer. An update arrives as a **pull request**: a proposed change, with a name such as "Step 2h: Phase 2 complete".

1. **Open the pull request.** Go to https://github.com/TomiwaPro/Prepenny and tap **Pull requests**, then the update's name.
2. **Try the preview.** A few minutes after the pull request is opened, a comment appears on it from **github-actions** with a preview link, such as `https://pr-19-prepenny.prepenny.workers.dev/app/`. Open it on your phone and try the update. It's a separate copy: nothing you do there touches the live app. If no link appears after 15 minutes, see "If something goes wrong" below.
3. **Check the ticks.** Scroll to the bottom of the pull request. Wait until every check has a green tick. There are five: "Lint, type checks and tests", "Build and end-to-end tests" parts 1, 2 and 3, and "Put the app online". A yellow dot means it's still running (about 15 minutes). A red cross means a check failed: don't merge, and see "If something goes wrong".
4. **Merge it.** When you're happy with the preview and every tick is green, tap **Merge pull request**, then **Confirm merge**. GitHub may say **Squash and merge** or **Create a merge commit** instead; either is fine.
5. **Wait for it to go live.** Merging starts the checks again, on `main` this time. When they pass, the Deploy workflow puts the update on the live app, about 20 minutes after merging in all. To watch it, tap **Actions**: the newest **Check** run, then the newest **Deploy** run, each get a green tick when they're done.
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

## Bank holidays

The engine's copy of the UK bank holiday list is `packages/engine/data/bank-holidays.json`, downloaded unchanged from https://www.gov.uk/bank-holidays.json by the **Bank holidays** workflow on GitHub. The file beside it, `bank-holidays.source.json`, says where it came from and when. To get a fresh copy, open **Actions**, then **Bank holidays**, then **Run workflow**. It only saves a new commit if the list has changed.

## Tax figures

The take-home pay calculator's figures for each tax year are in `packages/engine/src/pay/tax-years`, one file per tax year, with the GOV.UK page each figure comes from. The GOV.UK pages and HMRC's files they come from are saved unchanged in `sources/gov-uk/` by the **Fetch sources** workflow on GitHub, from the list of addresses in `sources/gov-uk.txt`. To fetch them again, open **Actions**, then **Fetch sources**, then **Run workflow**. A new tax year file is needed every April, and the tax year check warns from 1 March when next year's is missing.
