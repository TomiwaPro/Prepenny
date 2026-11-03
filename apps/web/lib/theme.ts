// Light or Dark on this phone (D173), and the browser bar's colour to match.
// The paper colours are the same as --paper in styles/tokens.css, which
// test/unit/colours.test.ts checks.

export const PAPER = { light: '#f4efe6', dark: '#0e1424' } as const;

export const COLOURS_KEY = 'prepenny-colours';

export type ColourChoice = 'phone' | 'light' | 'dark';

/**
 * Runs before the page is drawn: picks Light or Dark when the person chose one
 * on the More screen, so the colours never flash, and sets the browser bar to
 * the same paper colour once the page's tags are there. Our own fixed script,
 * with no data in it.
 */
export const coloursScript = `(function(){try{var c=localStorage.getItem('${COLOURS_KEY}');if(c!=='light'&&c!=='dark')return;document.documentElement.dataset.theme=c;var p=c==='dark'?'${PAPER.dark}':'${PAPER.light}';document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',p)})})}catch(e){}})()`;

/** Applies a choice now: the colours and the browser bar. */
export function applyColours(choice: ColourChoice) {
  const root = document.documentElement;
  if (choice === 'phone') delete root.dataset.theme;
  else root.dataset.theme = choice;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.media.includes('dark') ? PAPER.dark : PAPER.light;
    meta.content = choice === 'phone' ? own : PAPER[choice];
  }
}
