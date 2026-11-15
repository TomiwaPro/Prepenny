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

## Last: delete the test accounts (2 minutes)

1. On device B, tap **More**, then **Delete my account and all my data**, then **Send me a code**. Type the code from the email to `yourname+tom4@gmail.com`, type `delete` in **Type delete to confirm**, and tap **Delete my account and all my data**. It says the account and all its data have been deleted, and an email says it's done.
2. On device A, the same with the code sent to `yourname+jess4@gmail.com`.
3. Close the private window. On device A, tap **Already have an account? Sign in** and sign in with your own address: your own plan comes back.

If a deletion can't be done, README.md part H has a query that removes test accounts by their addresses, and only those.
