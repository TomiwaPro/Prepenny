# Testing PrePenny with people

A short script for watching three people who have never seen PrePenny set it up on their own phone, without help. Brief Part 10 counts PrePenny as done only when three people manage it in under 5 minutes. It takes about 20 minutes a person.

Setup is 6 screens in 3 parts (D356). The top of each screen says which part it's in, such as "Part 2 of 3: Money out":

| Part | Screens |
| --- | --- |
| Part 1 of 3: Money in | 1. Your account. 2. How you're paid. |
| Part 2 of 3: Money out | 3. Home and bills. 4. Debts. 5. Spending money. |
| Part 3 of 3: Your plan | 6. Here's your plan, with "Saving for something? Add a goal". |

## Before you start

- **Who:** three people who have never seen PrePenny. Try to get a mix: someone paid weekly, someone paid monthly, and if you can, someone whose money comes in at different times (Universal Credit, a student loan or self-employed work).
- **Their own phone,** in their usual browser (Chrome on Android, Safari on iPhone). Not a private window: some private windows can't save anything.
- **The link:** https://prepenny.co.uk (the live app), or the preview link of the update you're testing.
- **Their numbers:** they can use their real balance and bills, rough figures, or made-up ones. Tell them so. Never write their amounts or payment names in your notes: write what they did, not what they typed.
- **You need:** a stopwatch (your phone's clock app), this page, and a copy of the notes table below. Or the notes page Claude Code made you (D507): it has this script, the clocks and the notes table in one place, and copies all three people's notes for Claude Code.

## What to say

Read this out, in your own words if you like:

> "Thanks for helping. This is PrePenny, an app that plans your money from one payday to the next. I'd like to watch you set it up on your phone, as if you'd just found it.
>
> It's the app being tested, not you. If something is confusing, that's exactly what I need to know.
>
> You don't need to sign in or make an account.
>
> I can't help or answer questions while you do it, because I won't be there when other people use it. If you get stuck, say what you're looking for out loud, and carry on however you think best. You can stop whenever you like.
>
> Use your real numbers, rough ones or made-up ones: whatever you're comfortable with. I won't write down any amounts.
>
> Please say what you're thinking as you go."

Then give them the link.

## What to time

- **Start** when they tap **Make my plan** on the first screen. The welcome above it says "Set it up once, about 5 minutes": note whether they read it.
- **Stop** when they reach **Here's your plan** (Part 3 of 3: Your plan) and tap **Go to my plan**.
- **Under 5 minutes is a pass.** Write the time down to the second, even if it's over.
- **A savings goal is optional.** If they tap **Add a goal** on Here's your plan, keep the clock running: it's part of their setup. Note whether they added one.

Don't stop the clock if they pause to read: reading is part of setting up. If they give up, write down the time and the screen they were on.

## What to note

While they set up, note anything like this, with the screen's name (its heading, such as "Home and bills") and its part (the top of each screen says "Part 2 of 3: Money out"):

- They stop for more than about 5 seconds without tapping anything.
- They tap something, then go Back or undo it.
- They read the same words twice, or read them out with a question in their voice.
- They say "what does this mean", "where's the...", "I don't know" or similar. Write their words down exactly.
- They tap "Skip this step". Note whether they meant to.
- On Home and bills, whether they found the bills below their rent, and whether "I don't pay rent or a mortgage" and "I'll add it later" were clear.
- They type something the app says is wrong, and what the app's message was.
- Anything they say they like or don't like.

Don't help, even if they ask. Say "What would you try?" and wait.

## Five tasks after setup

When they're on Home, ask them to do each of these on their own. Read each one out, then wait. Time each one, and note the same things as above. If one takes more than 2 minutes, say "Thanks, let's move on" and note where they were.

1. **"How much will you have left after rent?"** (If they don't pay rent, ask about their biggest bill.) A pass is pointing at the right "left" figure on Home or Coming up.
2. **"What's the lowest your money will get, and on which day?"** A pass is reading out the lowest point and its date.
3. **"You've just spent £6 on lunch. Tell PrePenny."** A pass is using I spent. If they have no budget yet, it's a pass if they add one.
4. **"One of your bills is going to be late. Move it to your next payday."** A pass is opening the bill and using Move to next payday.
5. **"What if your next pay was £100 less? Try it, then put things back as they were."** A pass is using What if and then throwing the practice change away, so their real plan is as before.

## Afterwards

Ask these three questions, and write down their answers word for word:

1. "What did you find hardest?"
2. "Was there anything you expected to see that wasn't there?"
3. "Would you use this? Why, or why not?"

Thank them. If they used real numbers and want them gone, they can remove them in PrePenny itself:

- **If they didn't sign in** (most people): nothing they typed was sent anywhere, as PrePenny keeps it on their phone only. Tap **More**, then **Delete my account and all my data**, then **Remove everything from this phone**, then **Yes, remove everything**.
- **If they signed in**: their plan is also saved in their account. Tap **More**, then **Delete my account and all my data**, then **Send me a code**, type the code from the email, type `delete` in **Type delete to confirm**, and tap **Delete my account and all my data**. An email says it's done.

## Notes table

Copy this for each person.

| | |
| --- | --- |
| Person | 1, 2 or 3 (no names) |
| How they're paid | Weekly, monthly, or other |
| Phone and browser | For example, Android, Chrome |
| Setup time | Minutes and seconds, and whether they finished |
| Read the "about 5 minutes" line | Yes or no |
| Screens skipped | Which screens, and whether they meant to |
| Added a savings goal | Yes or no |
| Where they got stuck | The screen's name and what happened |
| Their words | What they said, exactly |
| Task 1: left after rent | Pass or not, time, notes |
| Task 2: lowest point | Pass or not, time, notes |
| Task 3: I spent £6 | Pass or not, time, notes |
| Task 4: move a bill | Pass or not, time, notes |
| Task 5: What if | Pass or not, time, notes |
| Hardest part | Their answer |
| Missing | Their answer |
| Would they use it | Their answer |

## When you're done

PrePenny passes when all three people set it up in under 5 minutes without help. Send the three notes tables to Claude Code in a new step, and ask for the changes they point to. A word or screen that stopped two of the three people is worth changing even if they all finished in time.
