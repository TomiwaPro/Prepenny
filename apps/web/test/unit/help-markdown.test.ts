// Step 4g: the help articles' Markdown, read the way content/help/README.md
// says, and nothing else (D587).

import { describe, expect, it } from 'vitest';
import { HelpFormatError, inOrder, readArticle, readInlines } from '../../lib/help-markdown.ts';

const article = (body: string, file = '04-updating-your-balance.md') =>
  readArticle(file, `# Updating your balance keeps your plan true\n\n${body}\n`);

describe('Reading an article', () => {
  it('reads its title, summary, sections, lists and notes', () => {
    const read = article(
      [
        'Tell PrePenny what your bank shows.',
        '',
        '## How to update it',
        '',
        '1. Tap **Update balance**.',
        '2. Type what your bank shows,',
        '  then tap **Next**.',
        '',
        '- One',
        '- Two, with [StepChange](https://www.stepchange.org/contact-us.aspx)',
        '',
        'Call [0800 138 1111](tel:08001381111) or write to [us](mailto:hello@prepenny.co.uk).',
        'See [the calculator](https://prepenny.co.uk/pay-calculator/) and [debts](05-debts.md).',
        '',
        'Checked: on stepchange.org on Wed 18 Nov 2026.',
      ].join('\n'),
    );
    expect(read.slug).toBe('updating-your-balance');
    expect(read.order).toBe(4);
    expect(read.title).toBe('Updating your balance keeps your plan true');
    expect(read.summary).toBe('Tell PrePenny what your bank shows.');
    expect(read.checked).toEqual(['on stepchange.org on Wed 18 Nov 2026.']);
    expect(read.blocks).toEqual([
      {
        kind: 'paragraph',
        inlines: [{ kind: 'text', text: 'Tell PrePenny what your bank shows.' }],
      },
      { kind: 'heading', text: 'How to update it' },
      {
        kind: 'list',
        ordered: true,
        items: [
          [
            { kind: 'text', text: 'Tap ' },
            { kind: 'strong', text: 'Update balance' },
            { kind: 'text', text: '.' },
          ],
          [
            { kind: 'text', text: 'Type what your bank shows, then tap ' },
            { kind: 'strong', text: 'Next' },
            { kind: 'text', text: '.' },
          ],
        ],
      },
      {
        kind: 'list',
        ordered: false,
        items: [
          [{ kind: 'text', text: 'One' }],
          [
            { kind: 'text', text: 'Two, with ' },
            {
              kind: 'link',
              text: 'StepChange',
              to: { kind: 'web', href: 'https://www.stepchange.org/contact-us.aspx' },
            },
          ],
        ],
      },
      {
        kind: 'paragraph',
        inlines: [
          { kind: 'text', text: 'Call ' },
          { kind: 'link', text: '0800 138 1111', to: { kind: 'phone', href: 'tel:08001381111' } },
          { kind: 'text', text: ' or write to ' },
          { kind: 'link', text: 'us', to: { kind: 'email', href: 'mailto:hello@prepenny.co.uk' } },
          { kind: 'text', text: '. See ' },
          { kind: 'link', text: 'the calculator', to: { kind: 'site', path: '/pay-calculator/' } },
          { kind: 'text', text: ' and ' },
          {
            kind: 'link',
            text: 'debts',
            to: { kind: 'article', slug: 'debts', file: '05-debts.md' },
          },
          { kind: 'text', text: '.' },
        ],
      },
    ]);
  });

  it("stops at anything it doesn't read, saying the file and line", () => {
    const refused = (body: string) => () => article(body);
    expect(() => readArticle('updating.md', '# Title\n\nWords.\n')).toThrow(
      'content/help/updating.md, line 1',
    );
    expect(() => readArticle('04-a.md', 'Title\n\nWords.\n')).toThrow(
      'The first line is the title',
    );
    expect(refused('## A heading first')).toThrow('After the title comes one paragraph');
    expect(refused('Words.\n\n### Too deep')).toThrow('Use "## "');
    expect(refused('Words with _emphasis_.')).toThrow(HelpFormatError);
    expect(refused('Words with `code`.')).toThrow(HelpFormatError);
    expect(refused('Words with <b>html</b>.')).toThrow(HelpFormatError);
    expect(refused('Words with a [stray bracket.')).toThrow(HelpFormatError);
    expect(refused('A [link](http://example.com).')).toThrow("isn't an address PrePenny links to");
    expect(refused('A [link](mailto:sam@example.com).')).toThrow("isn't an address");
    expect(refused('A [link](javascript:alert(1)).')).toThrow(HelpFormatError);
    expect(refused('Words.\n\n1. One\n3. Three')).toThrow('number the steps 1, 2, 3');
    expect(() => readArticle('04-a.md', '# Title\r\n\r\nWords.\r\n')).toThrow('plain line endings');
  });

  it('reads plain text as it is', () => {
    expect(readInlines('£4.53 left, 50% paid, 1257L.')).toEqual([
      { kind: 'text', text: '£4.53 left, 50% paid, 1257L.' },
    ]);
  });
});

describe('Putting articles in order', () => {
  const one = (file: string, body = 'Words.') => readArticle(file, `# A title\n\n${body}\n`);

  it('by the number in their file names', () => {
    expect(inOrder([one('02-b.md'), one('01-a.md')]).map((a) => a.slug)).toEqual(['a', 'b']);
  });

  it("refuses two with the same number, or a link to a file that isn't there", () => {
    expect(() => inOrder([one('01-a.md'), one('01-b.md')])).toThrow('Two articles are number 1');
    expect(() => inOrder([one('01-a.md', 'See [b](02-b.md).')])).toThrow(
      '01-a.md links to "02-b.md", which isn\'t an article\'s file.',
    );
    expect(() => inOrder([one('01-a.md', 'See [b](03-b.md).'), one('02-b.md')])).toThrow(
      'links to "03-b.md"',
    );
  });
});
