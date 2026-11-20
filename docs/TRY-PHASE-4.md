# Try Phase 4

What to check by hand in Phase 4, one short section for each step, added as each step is built (D526). Walk through it once, in order, on the live app at https://prepenny.co.uk/app/, after the last Phase 4 step is merged. The last section deletes the test accounts. Your own plan isn't touched.

You need:

- **Your phone**, device A, playing Jess.
- **A private or incognito window** on a computer, device B, playing Tom.
- **Two made-up "+" addresses** from your own Gmail. If your address is `yourname@gmail.com`, Gmail delivers mail for `yourname+jess4@gmail.com` and `yourname+tom4@gmail.com` to your own inbox, but PrePenny treats them as two new people. Put your own name where these steps say `yourname`.

Each step says what you should see. If something looks different, note the section, the step number and what you saw.

## Step 4a: shared budgets (10 minutes)

Each partner adds a budget to the joint account, is told first, and both phones show the same joint account. Then Jess leaves.

Jess's plan, on device A:

1. Open https://prepenny.co.uk/app/, tap **More**, then **Sign out**, then **Sign out** again. Your own plan is safe in your account.
2. Tap **Make my plan**. Name the account `Jess current account`, with `410`. Tap **Add another account**: `Joint account`, choose **Joint account**, `1050`. Tap **Next**.
3. On "How you're paid": name `Jess pay`, **Monthly, on a date**, next payday the 28th of this month (of next month if it's past), `2100`, into **Jess current account**, and **No** to extra hours. Tap **Next**, then **Skip this step** on each of the next three screens, then **Go to my plan**.
4. Tap **More**, then **Sign up or sign in**, and sign up with `yourname+jess4@gmail.com`.
5. Tap **More**, then **Share with my partner**, then **Choose shared accounts**. Tick **Joint account** only, tap **Share these accounts**, then **Yes, share**. Go back.
6. Under **Invite your partner**, type `Jess`, keep **Can edit** and **A link I send myself**, tap **Make the invite link**, then **Copy the link**, and send it to yourself so you can open it on device B.

Tom's plan, on device B, in a private or incognito window:

7. Open https://prepenny.co.uk/app/ and tap **Make my plan**. Name the account `Tom current account`, with `520`, and tap **Next**. On "How you're paid": `Tom pay`, **Monthly, on a date**, next payday the 15th of next month, `2350`, and **No** to extra hours. Tap **Next**, **Skip this step** three times, then **Go to my plan**.
8. Tap **More**, then **Sign up or sign in**, and sign up with `yourname+tom4@gmail.com`.
9. Open the invite link. It says your plan comes with you. Type `Tom` and tap **Ask to join**.
10. On device A, within a few seconds, "Tom wants to join your plan": tap **Allow**, then **Got it**. On device B, Home opens.

Each adds a budget, and is told first:

11. On device A, tap **More**, then **Budgets**, then **Add a budget**: name `Food`, amount `300`, **Month**, from **Joint account**. Above **Add budget** it says "Tom will see this money leave on your paydays." Choose **Jess current account** instead: the sentence goes. Choose **Joint account** again and tap **Add budget**.
12. On device B, the same with `Meals out`, `60`, **Month**, from **Joint account**: "Jess will see this money leave on your paydays." Tap **Add budget**.
13. Within a minute, on device A, **Budgets** says under Food "Tom sees this leave on your paydays." and under Meals out "Leaves on Tom's paydays." On device B, under Food "Leaves on Jess's paydays." and under Meals out "Jess sees this leave on your paydays." Food's "This month, to …" is the same day on both devices, and so is Meals out's.

The same joint account on both phones:

14. On both devices, tap **Coming up**, then **Switch account**, then **Joint account**. Food's −£300.00 is on Jess's next payday on both, Meals out's −£60.00 on Tom's, and every "Left after this" is the same. Nothing of Jess's pay shows on device B: no Jess current account and no Jess pay.

Jess leaves:

15. On device A, tap **More**, then **Share with my partner**, then **Leave this plan**. Choose **No, just my own things**, tap **Leave this plan**, then **Yes, leave**.
16. On device B, within a minute, **Budgets** says under Food "The person who added this has left the plan, so it now leaves on your paydays.", and its "This month, to …" is now the same day as Meals out's.
17. On device B, tap **More**, then **Share with my partner**. Under **Invite your partner**: "Whoever joins will see Food and Meals out leave on your paydays."

## Step 4b: safer building blocks (5 minutes)

Nothing in the app looks different. These check that GitHub and Cloudflare are set up, and that every screen still works with the stricter security policy, on your own phone, with no test accounts. README.md part N has the set-up steps.

On GitHub, on your phone or a computer:

1. Open https://github.com/TomiwaPro/Prepenny/actions and tap **Deploy**, then its newest run from `main`. It has a green tick. Tap **Put the app online**, then the step **Check the live pages are PrePenny's own**: it ends "each exactly as built, with its own security policy, and nothing of Cloudflare's written into them." Once Network Error Logging is off, there's no yellow warning naming "nel" either.
2. Back on **Actions**, tap **Dependabot's list**: its newest run has a green tick.
3. On the repository's page, tap **Insights**, then **Dependency graph**: the list includes next, react and @supabase/supabase-js, from `pnpm-lock.yaml`.
4. Tap **Security and quality**, then under **Findings**, **Dependabot**, then **Vulnerabilities**. Either there are no alerts, or each one names a package: ask Claude Code to update it.

On your phone, device A, signed in as yourself or not:

5. Open https://prepenny.co.uk/app/. Home shows your plan. Tap **Coming up**, **Debts** and **More**: each opens with your figures.
6. In **More**, under **Colours**, choose **Dark**, then tap **Home**, and reload the page: it opens dark straight away, with no flash of light colours. That's one of the small scripts the policy now lists by name. Choose **Match this phone** again.
7. Turn on **Airplane mode**. Close PrePenny and open it again: Home shows your plan, with a note that starts "You're offline." Tap **Coming up** and **More**: each opens. Turn **Airplane mode** off.

## Step 4c: bank holidays (5 minutes)

A new bank holiday can't be made up on the live app, so these check what you can see: the list on PrePenny's own site, why a payment moved, changing its rule, and no signal. The note on Home when a new bank holiday moves a payment, and two phones agreeing, were tested with a made-up bank holiday on the building computer and on GitHub; `docs/screens/4c/home-note-360-light.png` shows the note.

On device A, Jess's plan from step 4a, signed in as `yourname+jess4@gmail.com`:

1. Open https://prepenny.co.uk/bank-holidays.json. It starts `{"version":"`, then a date and a long code, and further on lists `england-and-wales` with each bank holiday's date.
2. Open https://prepenny.co.uk/app/ and tap **Add a payment**. Name `Water`, amount `30`, **Next payment** 29/03/2027 (Mon 29 Mar 2027, Easter Monday), **Every month, or every few months**, and under **On a weekend or bank holiday**, **Move to the working day before**. Tap **Add payment**.
3. Tap **Coming up**, then **Change view**. Choose **By calendar month**, and close the sheet. Tap **Show another month** until May 2027 is listed. Under **Next months**, tap the line for March 2027: Water is on Thu 25 Mar 2027, as Easter Monday and Good Friday are bank holidays.
4. Tap Water. Under its date it says "Moved from Mon 29 Mar 2027: bank holiday". Close it. Tap the line for May 2027: Water is on Fri 28 May 2027. Tap it: "Moved from Sat 29 May 2027: weekend". Close it.
5. Tap Water in March again. Choose **This and all later ones**: "On a weekend or bank holiday" appears, with **Move to the working day before** chosen. Choose **Keep the date** and tap **Save**. Water is now on Mon 29 Mar 2027, and its sheet has no "Moved from" line. Tap **Undo** in the bar at the bottom: it's back on Thu 25 Mar 2027.
6. Turn on **Airplane mode**. Close PrePenny and open it again. Water is still on Thu 25 Mar 2027 in March. Turn **Airplane mode** off.
7. Tidy up: tap Water, then **Remove**, then **Remove this and all later ones**.

On GitHub, a Monday after merging:

8. Open https://github.com/TomiwaPro/Prepenny/actions and tap **Bank holidays**. The newest run says "schedule" and has a green tick. Tap it, then **Keep the site's list up to date**: its last step says "The site already has GOV.UK's list, so there's nothing to do.", or that it put the live app online again because GOV.UK's list changed.

## Step 4d: installing to the home screen (10 minutes, over two days)

The suggestion on Home comes on the second day someone uses their own plan, so steps 1 to 3 need two days on your own phone, device A, in its browser rather than from its home screen. If PrePenny already suggested it to you after step 4d went live and you answered it, it won't come back, which is right (D546): go to step 4. No test accounts are needed, and your plan isn't changed.

The suggestion on Home, device A, in the browser:

1. **Day 1:** open https://prepenny.co.uk/app/ in Chrome (Android) or Safari (iPhone), with your own plan. Nothing about the home screen shows.
2. **Day 2:** open it again in the same browser. Under the lowest point: "Add PrePenny to your home screen." with **Show me how** (or **Add to home screen** on Android, where Chrome offers it) and **Not now**.
3. Tap **Show me how**. A sheet shows the steps for your phone first, numbered. Close it. In its place on Home: "The steps are in More, under Home screen, whenever you want them." Open PrePenny again, the next day too: the suggestion doesn't come back. On Android, if the first button says **Add to home screen**, tap it and confirm with Chrome's **Install** instead: Home then says "PrePenny is on your home screen now. Open it from there." Go to step 5.

The steps, and adding it, device A:

4. Tap **More**. Under **Home screen**, tap **Add to home screen**. Your phone's steps are first. Follow them.
5. Open PrePenny from the new icon on your home screen. It opens without the browser's address bar. On an iPhone, while it opens, the screen shows PrePenny's icon and name on the cream paper colour, not a white screen. On an iPhone, sign in there with your own address: your plan comes down, as the home-screen app keeps its own storage.
6. In PrePenny, tap **More**: under **Home screen** it now says "PrePenny is on this phone's home screen".
7. Switch your phone to dark mode and open PrePenny from the home screen again. On an iPhone, the opening screen should be dark navy: if it's still cream, note it (D550: no source says whether an iPhone uses the dark one). On Android it stays light: Chrome doesn't read dark colours for it yet (D550). Switch dark mode back if you like.
8. **Android only:** press and hold PrePenny's icon. It offers **Update balance** and **I spent**. Tap **Update balance**: PrePenny opens with Update balance open (with the app lock on, after your PIN). Close it without saving.

Before setup on an iPhone (only if device A is an iPhone):

9. In Safari, open a **Private** tab and go to https://prepenny.co.uk. Tap **Make my plan**. A sheet says "Add PrePenny to your Home Screen first" and "On an iPhone, a plan made here in Safari stays in Safari. PrePenny on your Home Screen starts empty, unless you sign in.", with **Show me how** and **Make my plan here in Safari**. Tap **Close**, then close the private tab: nothing is kept.

Cloudflare's script, once README.md part N, step 1 is done:

10. Open https://github.com/TomiwaPro/Prepenny/actions, tap **Deploy**, then its newest run from `main`, then **Put the app online**, then **Check the live pages are PrePenny's own**. It doesn't name "its Real User Monitoring (RUM) script". If it names a page with "a different security policy", note what it says it was sent instead.

## Step 4d-2: the Next.js update and the front page (5 minutes)

Nothing in the app looks different. These check that the update went online, the warning has gone, and the front page's buttons work again (D559). No test accounts are needed.

On GitHub, on your phone or a computer:

1. Open https://github.com/TomiwaPro/Prepenny/actions and tap **Check**, then its newest run from `main`, then **Lint, type checks, tests and the database**, then the step **Check every building block for known security problems**. It says "332 checked against the list of known security problems, and this change brings in no serious one." with no yellow warning naming next.
2. Back on **Actions**, tap **Deploy**, then its newest run from `main`, then **Put the app online**, then **Check the live pages are PrePenny's own**. It doesn't say "/ has a different security policy". Once README.md part N, step 1 is done, it ends "each exactly as built, with its own security policy, and nothing of Cloudflare's written into them."
3. On the repository's page, tap **Security and quality**, then under **Findings**, **Dependabot**, then **Vulnerabilities**. There's no open alert for next. If there was one for next 16.4.3, it closes by itself once **Dependabot's list** has run after the merge.

The front page's buttons on the live site, in a private or incognito window on your phone, so nothing of yours is used:

4. Open https://prepenny.co.uk/. It says "Plan every penny before payday." Tap **Look at an example plan**: Home opens on Sam's example, with £267.54.
5. Go back to https://prepenny.co.uk/ and tap **Make my plan**: setup opens at "Part 1 of 3: Money in". On an iPhone, a sheet "Add PrePenny to your Home Screen first" opens first: tap **Make my plan here in Safari**, and setup opens.
6. Close the private window: nothing is kept.

On your phone, device A, in your usual browser:

7. Open https://prepenny.co.uk/app/. If "PrePenny has been updated. Tap to reload." shows, tap it. Home shows your plan. Tap **Coming up**, **Debts** and **More**: each opens with your figures.
8. Turn on **Airplane mode**. Close PrePenny and open it again: Home shows your plan, with a note that starts "You're offline." Turn **Airplane mode** off.

## Step 4e: reminders (15 minutes, then one evening)

Reminders on your phone, device A, as Jess, with a shortfall you'll get within 15 minutes, and the evening one that evening. On an iPhone, do this in PrePenny opened from your Home Screen (step 4d), not in Safari. Do it between 8am and about 6pm, so nothing waits for quiet hours.

1. **iPhone only:** in Safari, open https://prepenny.co.uk/app/more/ and tap **Reminders**. It says "On an iPhone, reminders only work in PrePenny opened from your Home Screen..." with **Show me how**. Close Safari and open PrePenny from your Home Screen.
2. On device A, signed in as `yourname+jess4@gmail.com` (sign in from **More** if you aren't), tap **More**, then **Reminders**. It starts "Notifications on this phone on payday, before money goes out and when you'd be short, so you know before it happens." Every box is unticked, and **This phone** says "Turn on a reminder above, and this phone gets it."
3. Tick **When you'd be short**. Your phone asks to allow notifications from PrePenny: tap **Allow**. The box stays ticked, "Saved." shows, and **This phone** says "This phone gets your reminders."
4. Tick **The evening before money goes out** too.
5. Tap **Home**, then **Add a payment**: name `Test short`, amount `5000`, **Next payment** tomorrow, from **Jess current account**. Tap **Add payment**.
6. Lock your phone. Within 15 minutes a notification from PrePenny says "You'll be £... short on [tomorrow's date]." Tap it: PrePenny opens on Home (after your PIN, if the app lock is on).
7. That evening at 7pm, UK time, a notification says "Test short goes out tomorrow. You'll be £... short on [tomorrow's date]."
8. Back in **Reminders**, tick **Hide amounts in notifications**: from now on notifications say "Test short goes out tomorrow." with no amount. Then on Home, tap the **Test short** row, and **Remove this one**.

Signing out stops them, device A:

9. Add **Test short** again for tomorrow, as in step 5, then tap **More**, **Sign out**, **Sign out**. Nothing more arrives from PrePenny on this phone, not in 15 minutes and not at 7pm. Sign in again with `yourname+jess4@gmail.com`; in **Reminders** your choices are still ticked, and **This phone** says "This phone doesn't get your reminders yet." with **Get reminders on this phone**. Untick every box: **This phone** says "Turn on a reminder above, and this phone gets it." Remove **Test short**.

On GitHub and Supabase:

10. Open https://github.com/TomiwaPro/Prepenny/actions, tap **Database**, then its newest run from `main`, then **Change the real database**. The step **Tell the database where the reminders function is** ends "The database knows where the reminders function is, and has started it once."
11. On supabase.com, open the project, then **Integrations**, **Cron**: `prepenny-reminders` runs every 15 minutes and its runs succeed; `prepenny-bank-holidays` runs on Mondays. Under **Edge Functions**, `reminders` is listed.

If a notification never arrives, note which step, your phone, and whether **This phone** said "This phone gets your reminders."

## Step 4f: notifications in a shared plan (15 minutes)

Jess, on your phone (device A), is told about Tom's changes. Tom makes them on device B. A private or incognito window can't get notifications, so only device A gets them. Do it between 8am and about 8pm, so nothing waits for quiet hours. In step 4a Jess left the plan, so first Tom invites her back. On an iPhone, use PrePenny opened from your Home Screen on device A, as in step 4e.

Jess and Tom share a plan again:

1. On device B, open a private or incognito window, go to https://prepenny.co.uk/app/, tap **More**, then **Sign up or sign in**, and sign in with `yourname+tom4@gmail.com`.
2. On device B, tap **More**, then **Share with my partner**. Under **Invite your partner**, type `Tom`, keep **Can edit** and **A link I send myself**, tap **Make the invite link**, then **Copy the link**, and send it to yourself so you can open it on device A.
3. On device A, signed in as `yourname+jess4@gmail.com`, open the link. It says your plan comes with you. Type `Jess` and tap **Ask to join**. On device B, within a few seconds, "Jess wants to join your plan": tap **Allow**, then **Got it**. On device A, Home opens (if it says **Finish joining**, tap it).

Jess turns it on:

4. On device A, tap **More**, then **Reminders**. The first sentence ends "and when Tom changes something you both see." There's a box **When Tom changes something**, not ticked, with what it does under it. Tick it. If your phone asks to allow notifications, tap **Allow**. "Saved." shows, and **This phone** says "This phone gets your reminders."

One change, then three close together:

5. On device B, tap **Add a payment**: name `Car MOT`, amount `54.85`, **Next payment** a day next week, from **Joint account**. Tap **Add payment**.
6. Lock device A. About 2 to 3 minutes later, a notification from PrePenny says "Tom added Car MOT, −£54.85 on [the day you chose]." Tap it: PrePenny opens (on Activity, if PrePenny wasn't open).
7. On device B, add three payments one after another, each from **Joint account**: `Window cleaner` `12`, `Gym` `25` and `Phone` `30`. About 2 to 3 minutes after the last, one notification on device A says "Tom made 3 changes, including Phone, −£30.00."
8. On device A, add a payment yourself: `Dentist`, `65`, from **Joint account**. Nothing arrives on device A about it: nobody is told about their own changes.

Hidden amounts and shared warnings:

9. On device A, in **Reminders**, tick **Hide amounts in notifications**. On device B, add `Parking`, `8`, from **Joint account**. On device A: "Tom added Parking on [the day you chose]." with no amount.
10. On device A, in **Reminders**, tick **When you'd be short**. Its line says it covers "the ones you share with Tom". On device B, add `Boiler`, `5000`, **Next payment** tomorrow, from **Joint account**. Within about 3 minutes, on device A: "Joint account will be short on [tomorrow's date]." (no amount, as they're hidden), and soon after, "Tom added Boiler on [tomorrow's date]."

Turning it off:

11. On device A, in **Reminders**, untick **When Tom changes something**, **When you'd be short** and **Hide amounts in notifications**. On device B, add `Lunch`, `9`, from **Joint account**. Nothing arrives on device A, not in 5 minutes and not later.

If a notification never arrives, note which step, your phone, and whether **This phone** said "This phone gets your reminders." The last section deletes both test accounts, with everything in them.

## Step 4g: the help centre (10 minutes)

The help centre in the app and on the website, its search with no signal, and Home's card when money is tight. On device A, signed in as `yourname+jess4@gmail.com`, as at the end of step 4f.

The help centre:

1. On device A, tap **More**. Near the end there's a **Help** card with **Help centre** and **Help when money is tight**. Tap **Help centre**. It lists 10 articles, each with a line under its title.
2. Tap **Help when money is tight**. StepChange, National Debtline and Citizens Advice each have their number and website, MoneyHelper has its debt advice locator, and Surviving Economic Abuse is near the end. Tap **0800 138 1111**: your phone offers to call it. Don't call: go back. Tap **stepchange.org**: StepChange's site opens beside PrePenny. Close it and go back to PrePenny.
3. Tap **Back to Help**. In **Search help**, type `debt`. It says how many articles have "debt", and lists them, **Each debt shows what's left and when it's paid off** first. Type `zebra`: "No article has "zebra". Try another word, such as balance or debt." Tap **Clear search**: all 10 are back.
4. Turn on airplane mode. Pull down to reload the page. Search for `backup email`, and open the article it finds: it opens. Turn airplane mode off.
5. On device B, in the private window, open https://prepenny.co.uk/help/sign-in-problems/. The same article, with **PrePenny** and **Open PrePenny** at the top and no bottom bar, as on any website.

Home's card when money is tight, on device A:

6. Tap **Add a payment**: name `Test big bill`, amount `3000`, **Next payment** tomorrow, **How often** **Every month, or every few months**, **From** **Jess current account**. Tap **Add payment**. Your plan is now short in three pay periods in a row, starting with the one you're in now.
7. On **Home**, under **Lowest point ahead**, a card in the same soft colour as other notes says "Free, confidential help is available.", with **See where to get help** and **Not now**. No red, and the lowest point hasn't moved down.
8. Tap **See where to get help**: Help when money is tight opens. Go back to **Home**.
9. Tap **Not now**. A line in its place says "Where to get help is in More, under Help, whenever you want it." Tap **Coming up**, then **Home**: the card has gone, and stays gone for 30 days on this phone. (The tests check the 30 days.)
10. Tap the `Test big bill` row under **Next due** (or on **Coming up**), then **Remove**, then **Remove this and all later ones**. The card doesn't come back.

If something looks different, note the step number and what you saw. The last section deletes the test accounts, with the test bill in them.

## Step 4h: help where it's needed, the tour, and updating (15 minutes, then 5 after a later merge)

The "?" beside what can confuse, the tour of Home, and an open PrePenny updating itself. On device A, signed in as `yourname+jess4@gmail.com`, as at the end of step 4g.

The "?" on Home:

1. On device A, open **Home**. Beside **Lowest point ahead** there's a small "?" with **Why**. The lowest point's figure and date are where they were, and on a small phone **Lowest point ahead** is still on screen without scrolling.
2. Tap **Why**. A sheet says "Why your lowest point is on" and the same date as Home, then that day's figure, the payment it's after and your next payday, as on Home. If Home says Tight or Short, the sheet says why. Tap **Every payment shows what you'll have left after it**: the help article opens. Go back to **Home**.

The tour:

3. Under the lowest point (and under the help card, if it's showing), a soft card says "New to PrePenny? Take a 60-second tour.", with **Show me** and **No thanks** side by side.
4. Tap **Show me**. A panel says "Step 1 of 5", **Your account**, with **Back**, **Next** and **End tour**, and the account card has a ring round it. Tap **Next**: step 2, **Lowest point ahead**, with your own figure and date. Tap **Back**: step 1. Tap **End tour**: the panel goes, and the card is still there.
5. Tap **Show me** again, and **Next** four times: **Next due**, **Update balance**, **Everything else** (the bottom bar is ringed, and the panel moves to the top). The last step's button says **Done**. Tap it. In the card's place: "The tour is in More, under Help, whenever you want it." Tap **Coming up**, then **Home**: the card has gone for good on this phone.
6. Tap **More**. Under **Help** there's **Take the tour**, "60 seconds around Home, step by step". Tap it: Home opens with the tour at step 1. Tap **End tour**.
7. Optional, with your phone's screen reader on (TalkBack on Android, VoiceOver on iPhone): on Home, move to the "?": it says "Why your lowest point is on" and the date. Open the tour from More: each step's words are read as it opens. Turn the screen reader off.

The other two "?":

8. Tap **Coming up**. If there's a **Not ticked yet** section (payments from before today that aren't ticked), tap **Why** beside it: "Why payments not ticked yet still count", with how many there are and the day you last checked your balance. Close it. If there's no such section, skip this.
9. On **Home**, tap **Update balance**, type what your test account shows (any figure, such as `400`), and tap **Next** twice. If step 3 lists payments to tick, tap **Why** under its line: "Why you tick what's already gone", naming the figure you typed. Tap **Close**: you're back on step 3, nothing lost. Tap **Close** on Update balance too, so nothing is saved.

Updating to a new version, after a later merge. This step changed how an open PrePenny updates, so it can only be seen on the update after this one, such as step 4i's. (Phones open on the version before step 4h update to step 4h the old way, once.)

10. After step 4h is merged and live, open https://prepenny.co.uk/app/ on device A, in Chrome. Tap **More**: **Take the tour** under **Help** means this phone has step 4h.
11. Leave PrePenny open on **More**. Switch to another app, or lock the phone.
12. When the next step's pull request has been merged and its **Deploy** run on GitHub has a green tick (**Actions**, then **Deploy**), go back to PrePenny. With a signal, within a few seconds a note at the bottom says "PrePenny has been updated. Tap to reload."
13. Don't tap it. Within a minute or so (longer on a weak signal), the screen loads afresh by itself, still on **More**, and the note has gone: More now has whatever that step added. It doesn't load again after that.
14. To see it wait for a safe moment, the next time an update goes live: before switching away, open **Update balance** and type a figure. Going back, nothing reloads while the sheet is open, and what you typed stays. Tap **Close**: the new version loads straight away.
15. To see it with no signal: turn on airplane mode before going back to PrePenny. Nothing changes, and PrePenny works as usual. Turn airplane mode off: within a few seconds, the note.
16. Signed out, on device B: open https://prepenny.co.uk/app/ in the private window, tap **Look at an example plan**, then **More**, and leave the tab open. After the next merge goes live, switch back to that tab: the note, then the new version by itself, as on device A.

If something looks different, note the step number and what you saw. Nothing new to clean up: the tour's card is gone only on device A, and signing out, or deleting the test account in the last section, clears it.

## Step 4i: Contact us, Something looks wrong and Suggest a feature (15 minutes)

Writing to support signed in and signed out, a screenshot with the consent message first, and reading it all in Supabase. On device A, signed in as `yourname+jess4@gmail.com`, as at the end of step 4h; device B is a private window, signed out. The emails go to your own Gmail inbox, as the test addresses are "+" addresses.

At the end of every screen:

1. On device A, open **Home** and scroll to the very end: under everything, after **+ Add an account**, a line with **Help** and **Something looks wrong**. The lowest point hasn't moved: on a small phone, **Lowest point ahead** is still on screen without scrolling. Tap **Coming up**, **Debts** and **More**: the same line is at the end of each, in the same order.

Something looks wrong, with a screenshot:

2. Take a screenshot of **Home** with your phone's buttons. Then tap **Something looks wrong**. A sheet says "Tell PrePenny support what looks wrong on this screen, and we'll look into it." Under **What looks wrong?**, type `Test 4i: the lowest point`.
3. Under **Add a picture or your plan?**, **No, just my words** is chosen. There's no button for a picture yet. Choose **A screenshot**: a soft box says "This picture may show your balances and payments. Only PrePenny support sees it, and it's deleted after 30 days.", then how, then **Choose a picture**.
4. Tap **Close**, then **Something looks wrong** again: what you typed and **A screenshot** are still there.
5. Tap **Choose a picture** and choose the screenshot from your photos. It says "Picture chosen: ... by ..., ... KB. Its hidden details have been taken out."
6. Under it: "PrePenny adds its version (...), your phone type (...) and which screen you're on, and nothing about your money." The phone type is short, such as "Android, Chrome 131". There's no box for an email address, as you're signed in.
7. Tap **Send**. It says **Sent**, "Thanks. We aim to answer within 1 working day, so by the end of [the next working day].", and "We've emailed yourname+jess4@gmail.com to say so, and we'll reply there."
8. In your Gmail, an email "PrePenny has your message" to `yourname+jess4@gmail.com`: it says when to expect an answer, and "For your privacy, this email doesn't repeat what you wrote." Nothing you typed is in it. At hello@prepenny.co.uk, "A message is waiting in PrePenny's support inbox": how many, and nothing you typed, and not who sent it. (If one came in the last 4 hours, the next comes once the 4 hours are up.)

Suggest a feature, and the "Not ticked yet" sheet:

9. Tap **More**. Under **Help**, there are **Contact us** and **Suggest a feature**. Tap **Suggest a feature**, type `Test 4i: an idea` and tap **Send**: "Thanks. Your idea has been sent to PrePenny." No email comes for an idea.
10. If **Coming up** has a **Not ticked yet** section, tap **Why** beside it: one line now says "If a payment from that day or before had already gone, your bank's figure already includes it. Until you tick it, PrePenny counts it twice." Close it.

Contact us on the website, signed out:

11. On device B, open a new private window and go to https://prepenny.co.uk/sign-in/. Under the sign-in buttons, "Can't sign in? Contact us": tap it. **Contact us** opens, with **Open PrePenny** at the top and no bottom bar.
12. Type `Test 4i: I can't sign in` and your address `yourname+tom4@gmail.com`, then tap **Send**. It says "We've sent a 6-digit code to yourname+tom4@gmail.com. Type it here to send your message. It lasts 10 minutes."
13. Type `000000` and tap **Send my message**: "That code doesn't match. Check the 6 numbers in the email from PrePenny." Type the code from the email "Your PrePenny code to send your message" and tap **Send my message**: **Sent**, with the working day and "We've emailed yourname+tom4@gmail.com to say so, and we'll reply there." The automatic reply arrives there too, with none of your words.

Reading them in Supabase:

14. On a computer, follow README.md part V, "Reading messages": the query lists your three test messages, newest first: `contact` from `yourname+tom4@gmail.com`, `idea` and `problem` from `yourname+jess4@gmail.com`, the problem with **on_screen** `home` and **attached** `picture`.
15. Look at the picture with step 3 there: it's your screenshot. (That its hidden details, such as a location, were taken out is checked by the tests, byte by byte.)

If something looks different, note the step number and what you saw. The last section deletes both test accounts, and deleting them deletes their messages too, those sent signed out from their addresses included.

## Step 4j: support tools (20 minutes)

The support screen, for you alone; a reply; Jess letting support see her plan; and support's actions on Tom. First, follow README.md part W: the `SUPPORT_EMAIL` secret, and two-step sign-in on your own account. Device A is your phone, signed in as `yourname+jess4@gmail.com`, in Tom's plan since step 4f. Device B is a private window. Device C is an ordinary browser window on a computer, where you sign in as yourself.

The support screen is yours alone:

1. On device A, open https://prepenny.co.uk/app/support/. It says "This screen is for PrePenny support only.", with **Back to More**, and nothing else.
2. On device C, open https://prepenny.co.uk/app/support/ and sign in with your own address, then your authenticator app's code. **Support** opens: **Tax files** says "The pay calculator has the tax file for every tax year it needs now."; **Inbox** lists step 4i's test messages, newest first, each with its kind, when, who it's from and its first lines; then **Find an account** and **Usage**, with numbers only.

A reply, from a ready reply:

3. Tap the **Contact us** message from `yourname+tom4@gmail.com` ("Test 4i: I can't sign in"). Under **Reply**, choose **Someone in distress**: the box fills with Samaritans' 116 123 and the debt helplines. Add `Test 4j.` as a first line, and tap **Send reply**: "Reply sent to yourname+tom4@gmail.com.", and your words under **Replies**.
4. In your Gmail, "A reply from PrePenny support", from hello@prepenny.co.uk to `yourname+tom4@gmail.com`: your words, each line a paragraph, then "For your privacy, this email doesn't repeat what you wrote." Nothing Tom wrote in step 4i is in it.
5. Tap **Back to the inbox**, then the **Something looks wrong** message from `yourname+jess4@gmail.com`: your screenshot from step 4i shows, with when it's deleted.

Jess lets support see her plan:

6. On device B, go to https://prepenny.co.uk/app/, tap **More**, then **Sign up or sign in**, and sign in with `yourname+tom4@gmail.com`.
7. On device A, tap **More**, then under **Security**, **Let support see my plan**. It says "Support sees what you see: your own accounts and the shared ones, never Tom's private ones. Tom is told in Activity." Tap **Let support see it for 7 days**: "PrePenny support can see your plan until [now] on [a week today]."
8. On device B, tap **More**, then **Activity**: "Jess let PrePenny support see the plan until [a week today]."
9. On device C, under **Find an account**, type `yourname+jess4@gmail.com` and tap **Find**. Her account: when she signed up and last signed in, "Plan: shared with a partner", and "They let support see their plan until ...". Tap **See their plan**: Jess's accounts and the shared ones, each with its bank figure, lowest point and coming payments, and none of Tom's private accounts. Nothing on it can be tapped to change.
10. On device A, go back and open **Let support see my plan** again: "Support last looked at [just now]." Tap **Stop support seeing my plan**: it says support can't see your plan now.
11. On device C, reload the page: "They've stopped support seeing their plan, or its 7 days are over, so it can't be shown." On device B, **Activity**: "Jess stopped PrePenny support seeing the plan."

Support's actions, on Tom:

12. On device B, tap **More**, **Security**, **Two-step sign-in**, and turn it on with your own authenticator app, as in step 3e (it adds a second PrePenny line to the app, for Tom). Then **More**, **Security**, **Email addresses**, and add `yourname+tom4backup@gmail.com` as the backup email, with its code.
13. On device C, find `yourname+tom4@gmail.com`. Tap **Turn off two-step sign-in**, then **Start the 7-day wait**: "The 7-day wait has started. Two-step sign-in is turned off at [now] on [a week today], unless it's stopped." In Gmail, to `yourname+tom4@gmail.com`, "PrePenny support is turning off two-step sign-in", with **Stop it**, and the same to `yourname+tom4backup@gmail.com`. Tap **Stop it** in the first: a page "Keep two-step sign-in on"; tap **Stop it**: "It's stopped". On device C, reload: **Under way** says "Nothing is under way.", and **What support did** lists both, with the time.
14. On device C, tap **Turn off two-step sign-in** and **Start the 7-day wait** again. On device B, within a minute, every screen shows "PrePenny support is turning off two-step sign-in", with **Stop it**. Tap it: "It's stopped. Two-step sign-in stays on." 
15. On device C, tap **Send a link to their backup email**, then **Send the link**: "Link sent to yourname+tom4backup@gmail.com." In Gmail, to that address, "A link from PrePenny support to get back in". Open its **Get back in** in a new private window: "PrePenny support sent you this link to get back into your account.", with **Use the link from PrePenny support**. Tap it: "You've asked to get back in", and to `yourname+tom4@gmail.com`, "Someone asked to get into your PrePenny account", with **Stop it**. Tap that **Stop it**, then **Stop it** on its page, so nothing changes on Tom's account.
16. On device C, tap **Sign out everywhere**, then **Sign out everywhere** again: "Signed out of 1 phone or computer. They've been emailed." Within a minute device B is signed out, and Gmail has "PrePenny support signed you out" to `yourname+tom4@gmail.com`.

The tax year check, on GitHub:

17. On github.com, **Actions**, then **Tax year**, then **Run workflow**, keeping **Branch: main**: a green tick, and its last step says "The pay calculator has the tax file for every tax year it needs now." From 1 March it turns red each morning until next year's file is added (step 4r).

If something looks different, note the step number and what you saw. The last section deletes both test accounts, and with them everything support kept about them. Afterwards, remove the second PrePenny line, for Tom, from your authenticator app.

## Last: delete the test accounts (2 minutes)

1. On device B, tap **More**, then **Delete my account and all my data**, then **Send me a code**. Type the code from the email to `yourname+tom4@gmail.com`, type `delete` in **Type delete to confirm**, and tap **Delete my account and all my data**. It says the account and all its data have been deleted, and an email says it's done.
2. On device A, the same with the code sent to `yourname+jess4@gmail.com`.
3. Close the private window. On device A, tap **Already have an account? Sign in** and sign in with your own address: your own plan comes back.

If a deletion can't be done, README.md part H has a query that removes test accounts by their addresses, and only those.
