# PrePenny

Plan every penny before payday.

PrePenny is a money planner for people in the UK who live payday to payday. You type in what your bank shows today and every payment coming up, and it shows the balance left after each one, the lowest point ahead and when each debt is paid off.

The money engine is being built (Phase 1). There's no app to try yet. See `PLAN.md` for progress.

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

To run them on a computer, install Node 24 and pnpm 12, then run:

```
pnpm install
pnpm test
pnpm lint
pnpm typecheck
```

## Bank holidays

The engine's copy of the UK bank holiday list is `packages/engine/data/bank-holidays.json`, downloaded unchanged from https://www.gov.uk/bank-holidays.json by the **Bank holidays** workflow on GitHub. The file beside it, `bank-holidays.source.json`, says where it came from and when. To get a fresh copy, open **Actions**, then **Bank holidays**, then **Run workflow**. It only saves a new commit if the list has changed.

## Tax figures

The take-home pay calculator's figures for each tax year are in `packages/engine/src/pay/tax-years`, one file per tax year, with the GOV.UK page each figure comes from. The GOV.UK pages and HMRC's files they come from are saved unchanged in `sources/gov-uk/` by the **Fetch sources** workflow on GitHub, from the list of addresses in `sources/gov-uk.txt`. To fetch them again, open **Actions**, then **Fetch sources**, then **Run workflow**. A new tax year file is needed every April, and the tax year check warns from 1 March when next year's is missing.

A step-by-step guide for deploying updates will be added here once there's an app to deploy.
