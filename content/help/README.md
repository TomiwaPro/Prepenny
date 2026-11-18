# Help articles

PrePenny's help centre is built from the files in this folder (step 4g, D587). Each file is one article, shown in the app under **More**, then **Help centre**, and on the website at prepenny.co.uk/help/. Change a file, and the next update of PrePenny shows the change. This file isn't an article.

## How an article is written

- The file is named with two digits for its place in the list, then its name: `04-updating-your-balance.md`. The name becomes its address: prepenny.co.uk/help/updating-your-balance/.
- The first line is the title, after `# `. Titles are statements, never questions (D58).
- The first paragraph says what the article is about. It's shown under the title, in the list and in searches.
- `## ` starts a section. A blank line starts a new paragraph.
- `- ` starts a list, and `1. ` a numbered list.
- `**words**` makes words bold, for the names of buttons and screens.
- `[words](address)` is a link. The address is another organisation's website (`https://`), a page of PrePenny's own (`https://prepenny.co.uk/...`), a phone number (`tel:08001381111`), PrePenny's email address (`mailto:hello@prepenny.co.uk`), or another article's file (`04-updating-your-balance.md`).
- A paragraph starting `Checked:` says where and when a phone number or another organisation's link was checked, on that organisation's own website. GitHub shows it; PrePenny doesn't.

The words follow `docs/VOICE.md`, and the build stops on anything else, saying which file and line.
