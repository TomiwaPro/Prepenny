# Try Phase 3 in 15 minutes

All of Phase 3 on the live app, alone: signing in, two devices in step, sharing, a change made with no signal, two changes at once, "Can view only", leaving, your data, and deleting. It ends by deleting the two test accounts. Your own plan isn't touched.

You need:

- **Your phone**, device A, playing Jess.
- **A private or incognito window** on a computer, device B, playing Tom.
- **Two made-up "+" addresses** from your own Gmail. If your address is `yourname@gmail.com`, Gmail delivers mail for `yourname+phase3jess@gmail.com` and `yourname+phase3tom@gmail.com` to your own inbox, but PrePenny treats them as two new people. Put your own name where these steps say `yourname`.

Each step says what you should see. If something looks different, note the step number and what you saw.

## 1. Jess makes a plan and signs up (3 minutes)

On device A:

1. Open https://prepenny.co.uk/app/, tap **More**, then **Sign out**, then **Sign out** again. Your own plan is safe in your account.
2. Tap **Make my plan**. Keep **Current account**, type `500`, tap **Next**, then **Skip this step** on each screen, then **Go to my plan**.
3. Tap **More**, then **Sign up or sign in**, and sign up with `yourname+phase3jess@gmail.com`, typing the 6-digit code from the email. **More** says "Your plan is saved in your account."
4. On Home, tap **Add a payment**: name `Rent`, amount `550`, the 1st of next month, **Every month, or every few months**, then **Add payment**.
5. Tap **More**, then **Accounts**, then **Add an account**: `Jess savings`, `400`, then **Add account**. This one stays Jess's alone.
6. On Home, tap **Add a payment**: name `Birthday present`, amount `45`, a day next week, **Once**, and under **From** choose **Jess savings**. Tap **Add payment**.
7. Tap **More**, then **Share with my partner**, then **Choose shared accounts**. Tick **Current account** only, tap **Share these accounts**, then **Yes, share**. Go back.
8. Under **Invite your partner**, type `Jess`, keep **Can edit** and **A link I send myself**, tap **Make the invite link**, then **Copy the link**, and send it to yourself so you can open it on device B.

## 2. Tom joins (2 minutes)

On device B, in the private window:

9. Open the link. Tap **Sign up or sign in** and sign up with `yourname+phase3tom@gmail.com`. Type `Tom` and tap **Ask to join**.
10. On device A, within a few seconds, "Tom wants to join your plan", with Tom's address: tap **Allow**, then **Got it**. On device B, Home opens.

## 3. Nothing of Jess's own account reaches Tom (1 minute)

11. On device B, tap **More**, then **Accounts**: only **Current account**. Nothing says Jess savings or Birthday present, on Home, **Coming up** or **Activity** either.

## 4. "Changed by Tom" within 5 seconds (1 minute)

12. On device A, stay on **Home**, with Rent under **Next due**.
13. On device B, on Home, tap **Rent**, change the amount to `560`, and tap **Save**.
14. On device A, within 5 seconds and without touching it, Rent shows **−£560.00** with "Changed by Tom, just now" under its date.

## 5. A change with no signal, and two changes to one payment (2 minutes)

15. On device B, tap **Rent**, change the amount to `570`, and tap **Save**.
16. On device A, turn on **Airplane mode**. A note says "You're offline. Changes are saved on this phone and will be sent when you're back online."
17. On device A, tap **Rent**, change the amount to `580`, and tap **Save**. Tap **More**: "1 change is waiting to be sent to your account."
18. Turn **Airplane mode** off. Within a few seconds **More** says "Your plan is saved in your account." Jess's change was made after Tom's, so it's kept.
19. On device B, a sheet opens by itself, **Changed on two phones**: "Jess changed Rent on … to £580 after you changed it to £570. Jess's change is kept." Tap **Keep Jess's change**. Rent shows −£580.00 on both.

## 6. "Can view only" is refused by the server (1 minute)

20. On device A, tap **More**, then **Share with my partner**, then **Change what Tom can do**. Choose **Can view only** and tap **Save**: "Tom can view only now."
21. On device B, go to Home, tap **Rent**, change the amount to `999` and tap **Save**. Within a few seconds a sheet says "A change wasn't saved" and "You can look at this plan but not change it." Tap **Got it**: Rent is back to −£580.00.

## 7. Your data (1 minute)

22. On device A, tap **More**, then **Download my data**, then **Download the spreadsheet**. A file called `prepenny-` and today's date arrives in your phone's downloads. Open it: your account, Current account and Jess savings, Rent and Birthday present, and the history, Tom's changes included.

## 8. Tom leaves and keeps a copy (2 minutes)

23. On device B, tap **More**, then **Share with my partner**, then, at the bottom, **Leave this plan**. Choose **Yes, take a copy**, tap **Leave this plan**, then **Yes, leave**.
24. Device B opens Home of Tom's own plan: "You've left the plan." with what came. Tap **Got it**. Rent shows −£580.00.
25. On device A, within a minute, **Share with my partner** shows only you. **Activity** says "Tom left the plan.", and his changes still say "Tom". Rent is still −£580.00.
26. On device A, tap **Rent**, change the amount to `600`, and tap **Save**. On device B, reload the page: Tom's copy still says −£580.00. It never updates.

## 9. Delete the two test accounts (2 minutes)

27. On device B, tap **More**, then **Delete my account and all my data**, then **Send me a code**. Type the code from the email to `yourname+phase3tom@gmail.com`, type `delete` in **Type delete to confirm**, then tap **Delete my account and all my data**. It says the account and all its data have been deleted, and the welcome opens. An email says it's done.
28. On device A, do the same with the code sent to `yourname+phase3jess@gmail.com`.
29. Close the private window. On device A, tap **Already have an account? Sign in** and sign in with your own address: your own plan comes back.

That's all of Phase 3. Getting back in with a backup email takes 24 hours by design, so it isn't in these 15 minutes; README.md part G has its own steps.

If a deletion can't be done, README.md part H has a query that removes test accounts by their addresses, and only those.
