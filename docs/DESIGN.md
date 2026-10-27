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

Dark mode uses the same roles. Propose its values in Phase 2 for the owner's approval.

### Still to choose in Phase 2

WCAG also needs 3:1 for the edges of text boxes and for focus outlines, against the colour around them. The row, card and button line colours above are only 1.1 to 1.5:1, so they can't be used for those. Propose a text box border and a focus outline colour in Phase 2, with the dark mode values.

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
- **Bottom navigation:** Home, Plan, Debts, More. Simple line icons (1.7 stroke, round ends) with a label under each, and the active item in a soft pill.
- **Editing** opens in a bottom sheet on phones and a centred dialog on laptops.

## Never

- Gradients, glowing blobs, glass effects, stock illustrations, rows of three icon cards, emoji.
- A component library's default look. If a library is used for behaviour (sheets, dialogs), restyle it fully with these tokens.
- Decorative icons. Icons only in navigation and a few actions.
- Red, amber or green for anything except money states.
