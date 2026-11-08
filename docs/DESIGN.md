# Design

The look: calm and premium, like a well-made bank statement with a modern layout. Rounded cards on a warm paper background, navy and cream, one font.

The owner's approved sample is the "Your pick" board at https://claude.ai/artifact/WHH7uQgMVdBkAMBCBJ2qek

Where the sample and this file differ, this file wins. Two known differences:

- The sample shows the month in the date tile at 11px. Build it at 12px, the smallest size allowed.
- The sample loads Figtree from Google Fonts because it is a mock-up. The app self-hosts it (D23).

## Font

- Figtree, self-hosted, weights 400, 500, 600 and 700. No second font.
- Every amount uses tabular, lining figures (`font-variant-numeric: tabular-nums lining-nums`) so digits line up.
- Smallest text 12px. Text must scale to 200% without breaking.

## Type sizes (px / weight)

| Use | Size / weight |
| --- | --- |
| Balance | 46 / 700, letter-spacing −0.8px |
| Key figure (lowest point) | 30 / 700 |
| Section heading | 17 / 700 |
| Payment name | 16 / 600 |
| Body text | 15 to 16 / 400 |
| Second lines | 13 to 14 / 400 |
| Labels and navigation | 12 / 600 to 700 |

## Colours (light mode)

| Role | Colour |
| --- | --- |
| Paper (page background) | #F4EFE6 |
| Card | #FFFDF8 |
| Sunk (date tiles) | #EFE8DA |
| Ink (main text) | #1A2238 |
| Ink muted (second lines) | #4A5060 |
| Navy (brand, main button, balance card) | #14213D |
| Navy raised (block inside the balance card) | #22304F |
| Text on navy | #F4EFE6 |
| Muted text on navy | #C9BFA8 |
| Brass (thin lines and borders only, never text) | #A8864B |
| Row dividers | #EDE5D6 |
| Card edges | #E3D9C6 |
| Button borders | #D9D2C3 |
| Active navigation pill | #E6E2D6 |
| Money in | #1E6B3A |
| Tight | text #7A4E00 on #FBF0D9 |
| Short | text #A1281E on #FBE4E1 |

Every text and background pair must pass WCAG 2.2 AA (4.5:1).

Checked on 27 Oct 2026: every text pair above passes. The lowest is Money in on Sunk, 5.35:1. Brass is 2.97:1 on paper, too low for text, so it stays lines and borders only.

### Dark mode, the text box border and the focus outline

Approved by the owner on 3 Nov 2026 (D164, D176). Dark mode uses the same roles. Two roles were added: **Navy as text** (links, outlined buttons, the wordmark and the active navigation item) and the two lines WCAG needs at 3:1 against the colours around them.

| Role | Light | Dark |
| --- | --- | --- |
| Paper | #F4EFE6 | #0E1424 |
| Card | #FFFDF8 | #172036 |
| Sunk | #EFE8DA | #212B44 |
| Ink | #1A2238 | #F2ECE0 |
| Ink muted | #4A5060 | #B9B2A3 |
| Navy | #14213D | #22345E |
| Navy raised | #22304F | #2E4272 |
| Text on navy | #F4EFE6 | #F4EFE6 |
| Muted text on navy | #C9BFA8 | #D3C9B3 |
| Brass (lines only) | #A8864B | #B08E55 |
| Row dividers | #EDE5D6 | #27314B |
| Card edges | #E3D9C6 | #2C3752 |
| Button borders | #D9D2C3 | #3B4662 |
| Active navigation pill | #E6E2D6 | #2B3757 |
| Money in | #1E6B3A | #74CC92 |
| Tight | #7A4E00 on #FBF0D9 | #F2C46A on #3B2D0F |
| Short | #A1281E on #FBE4E1 | #FFB2A6 on #4B1D18 |
| Navy as text | #14213D | #F2ECE0 |
| Text box border | #7A7365 | #8790A6 |
| Focus outline (3px, 2px outside the control) | #14213D | #F4EFE6 |

Every text pair passes 4.5:1 in both modes, and the text box border and focus outline pass 3:1 against Paper, Card and Sunk. `apps/web/test/unit/colours.test.ts` checks them all.

## Shape and space

- 4px spacing scale. Screen side padding 16px. 12px between cards. Card padding 14 to 18px.
- Corners: balance card 20px, cards 16px, buttons, tiles and inner blocks 12px, status pills fully rounded.
- No shadows, no gradients. Cards stand apart from the paper by colour alone, and rows by 1px lines.
- Tap targets at least 44 by 44px. Buttons 48px tall.

## Parts (from the approved sample)

- **Balance card:** navy. Label, balance, "Checked today, Sun 25 Oct", a 1px brass line, then a raised block with "Left to spend".
- **Figure card:** label, status pill (always with the word), big figure, date and cause, one line of context.
- **Payment row:** date tile (day number over month), name with date below, then amount with "£X left" below, right-aligned.
- **Actions:** a 2 by 2 grid. One navy main button (Update balance); the others outlined.
- **Bottom navigation:** Home, Coming up, Debts, More (D208). Simple line icons (1.7 stroke, round ends) with a label under each, and the active item in a soft pill.
- **Editing** opens in a bottom sheet on phones and a centred dialog on laptops.
- **Setup's parts** (D356): the top of each setup screen says its part in words, "Part 2 of 3: Money out", with "Skip this step" beside it, over a bar of three equal parts with 4px between them, 8px tall and fully rounded. Each part fills in Navy as text as far as the screen showing; the empty part is the card edge colour. The bar is only a picture: the words say the same.

## Every screen says what it's for (D213)

A rule for every screen from now on, agreed by the owner on 4 Nov 2026.

- Each screen starts with one plain sentence saying what it's for, so a 16-year-old understands it straight away. On a page it sits under the heading; on a sheet, under its title.
- Every control says in words what it does. Where a word alone isn't enough, a line beside or under it says what a tap does: "Open Fri 30 Oct below", "Tap one to see every payment in it."
- No switch whose options look like separate buttons. A choice is a list with a round button beside each word, under a heading that asks or says what's being chosen, such as "What happened?" or "Group payments".
- A line that opens and closes is a button that tells screen readers whether it's open.
- The only control without a word is the small "?" for help (brief 4.16), and screen readers hear what it opens: "How to read this".

## Never

- Gradients, glowing blobs, glass effects, stock illustrations, rows of three icon cards, emoji.
- A component library's default look. If a library is used for behaviour (sheets, dialogs), restyle it fully with these tokens.
- Decorative icons. Icons only in navigation and a few actions. One mark isn't PrePenny's own: Google's "G", in Google's colours, on "Continue with Google", as Google's rules ask (D307).
- Red, amber or green for anything except money states, with one exception: red for Short, and for mistakes in what was typed, such as "Type an amount, for example 25." beside its box (D276).
