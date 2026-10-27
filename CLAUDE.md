# PrePenny: rules for every Claude Code session

PrePenny is a money planner for people in the UK who live payday to payday. You type in what your bank shows today and every payment coming up, and it shows the balance left after each one, the lowest point ahead and when each debt is paid off.

## Read first

Before any work, read all of these:

1. `docs/BRIEF.md`: the full product brief from the owner.
2. `docs/DECISIONS.md`: decisions made since the brief.
3. `docs/VOICE.md`: how all text is written.
4. `docs/DESIGN.md`: how every screen looks.
5. `PLAN.md`: what's done, what's next, and questions waiting for the owner.

Where `docs/DECISIONS.md` and `docs/BRIEF.md` disagree, `docs/DECISIONS.md` wins. Where `docs/VOICE.md` or `docs/DESIGN.md` is stricter than the brief, they win too.

## The owner

The owner of PrePenny is not a developer. Write to them in plain English, with no jargon.

## Money

- Money is stored as whole pence (integers), never floating point.
- The engine (`packages/engine`) is pure: no UI, no network, no clock. "Today" is passed in.
- Never guess a money rule. If something is unclear, stop and ask the owner.
- Never change an expected number in a test to make it pass. If a test from the brief fails, find the bug or ask.

## Proof

- Never say something works unless you have run it. Show the test output.

## Words and looks

- All text people read follows `docs/VOICE.md`.
- All screens follow `docs/DESIGN.md`.
- Never fall back on a component library's default look.

## Privacy

- Never write amounts, payment names or notes to logs, error reports or analytics.
- No third-party scripts on money screens.
- Fonts are self-hosted.

## How to work

- Small commits with clear messages.
- Keep `PLAN.md` and `docs/DECISIONS.md` up to date. Whenever you make a decision, add it to `docs/DECISIONS.md` with the reason.
- Work one step at a time and stop at the end of each step.
- At each stop, report in plain English:
  - what works now
  - how to try it on a phone (a link and 3 or 4 steps)
  - what's left
  - any decisions you need from the owner

## Before you stop

Review your work as a strict outsider:

- Check the numbers.
- Check every screen at 320px and 360px wide.
- Search all text people read for the banned words and long dashes listed in `docs/VOICE.md`.

Fix what you find.
