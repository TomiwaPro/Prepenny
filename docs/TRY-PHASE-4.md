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
3. Tap **Show me how**. A sheet shows the steps for your phone first, numbered. Close it. In its place on Home: "The steps are in More, under Home screen, whenever you want them." Open PrePenny again, the next day too: the suggestion doesn't come back.

The steps, and adding it, device A:

4. Tap **More**. Under **Home screen**, tap **Add to home screen**. Your phone's steps are first. Follow them.
5. Open PrePenny from the new icon on your home screen. It opens without the browser's address bar. On an iPhone, while it opens, the screen shows PrePenny's icon and name on the cream paper colour, not a white screen. On an iPhone, sign in there with your own address: your plan comes down, as the home-screen app keeps its own storage.
6. In PrePenny, tap **More**: under **Home screen** it now says "PrePenny is on this phone's home screen".
7. Switch your phone to dark mode and open PrePenny from the home screen again. On an iPhone, the opening screen should be dark navy: if it's still cream, note it (D550: no source says whether an iPhone uses the dark one). On Android it stays light: Chrome doesn't read dark colours for it yet (D550). Switch dark mode back if you like.
8. **Android only:** press and hold PrePenny's icon. It offers **Update balance** and **I spent**. Tap **Update balance**: PrePenny opens with Update balance open. Close it without saving.

Before setup on an iPhone (only if device A is an iPhone):

9. In Safari, open a **Private** tab and go to https://prepenny.co.uk. Tap **Make my plan**. A sheet says "Add PrePenny to your Home Screen first" and "On an iPhone, a plan made here in Safari stays in Safari. PrePenny on your Home Screen starts empty, unless you sign in.", with **Show me how** and **Make my plan here in Safari**. Tap **Close**, then close the private tab: nothing is kept.

Cloudflare's script, once README.md part N, step 1 is done:

10. Open https://github.com/TomiwaPro/Prepenny/actions, tap **Deploy**, then its newest run from `main`, then **Put the app online**, then **Check the live pages are PrePenny's own**. It doesn't name "its Real User Monitoring (RUM) script". If it names a page with "a different security policy", note what it says it was sent instead.

## Last: delete the test accounts (2 minutes)

1. On device B, tap **More**, then **Delete my account and all my data**, then **Send me a code**. Type the code from the email to `yourname+tom4@gmail.com`, type `delete` in **Type delete to confirm**, and tap **Delete my account and all my data**. It says the account and all its data have been deleted, and an email says it's done.
2. On device A, the same with the code sent to `yourname+jess4@gmail.com`.
3. Close the private window. On device A, tap **Already have an account? Sign in** and sign in with your own address: your own plan comes back.

If a deletion can't be done, README.md part H has a query that removes test accounts by their addresses, and only those.
