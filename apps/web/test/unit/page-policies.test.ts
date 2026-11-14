// Each page's security policy lists exactly its own scripts (step 4b, D529):
// scripts/page-policies.ts, which scripts/write-headers.ts and
// serwist.config.js use after the build.

import { describe, expect, it } from 'vitest';
import {
  checkLimits,
  inlineScripts,
  MAX_RULES,
  pageRevision,
  rulesFor,
  scriptHash,
  servedAt,
  withScripts,
  writePolicies,
} from '../../scripts/page-policies.ts';

const GENERAL =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'";

const HEADERS = `# A comment
/*
  Content-Security-Policy: ${GENERAL}
  X-Content-Type-Options: nosniff

/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
`;

describe("a page's scripts", () => {
  it('are the scripts written into it, exactly as written, and never a script file', () => {
    const html =
      '<html><head><script>(function(){try{var c=1}catch(e){}})()</script>' +
      '<script src="/_next/static/chunks/a.js" async=""></script>' +
      '<script id="_R_">self.__next_f.push([1,"a>b"])</script></head>' +
      '<body><SCRIPT type="module">\n  go();\n</SCRIPT><script data-src="x">one()</script>' +
      '<script src=/b.js></script></body></html>';
    expect(inlineScripts(html)).toEqual([
      '(function(){try{var c=1}catch(e){}})()',
      'self.__next_f.push([1,"a>b"])',
      '\n  go();\n',
      'one()',
    ]);
  });

  it("are named by their SHA-256 fingerprint, as a browser's policy names them", () => {
    // The example in the W3C's Content Security Policy Level 3, "hash-source".
    expect(scriptHash("alert('Hello, world.');")).toBe(
      "'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='",
    );
  });
});

describe('where a page is served', () => {
  it('is its folder, and the not-found pages have no address of their own', () => {
    expect(servedAt('index.html')).toBe('/');
    expect(servedAt('app/index.html')).toBe('/app/');
    expect(servedAt('app/share/accounts/index.html')).toBe('/app/share/accounts/');
    expect(servedAt('404.html')).toBeNull();
    expect(servedAt('404/index.html')).toBeNull();
    expect(servedAt('_not-found/index.html')).toBeNull();
    expect(() => servedAt('app/odd.html')).toThrow(/isn't a page Cloudflare serves/);
  });
});

describe('a policy with its scripts', () => {
  it('adds them to script-src, each once, and changes nothing else', () => {
    expect(withScripts(GENERAL, ["'sha256-a'", "'sha256-b'", "'sha256-a'"])).toBe(
      "default-src 'self'; script-src 'self' 'sha256-a' 'sha256-b'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'",
    );
  });

  it("refuses a policy that allows any script written into a page, so it can't come back", () => {
    expect(() =>
      withScripts("default-src 'self'; script-src 'self' 'unsafe-inline'", ["'sha256-a'"]),
    ).toThrow(/'unsafe-inline'/);
    // style-src may: styles can't run anything.
    expect(withScripts(GENERAL, [])).toContain("style-src 'self' 'unsafe-inline'");
  });
});

describe('_headers with each page’s policy', () => {
  const pages = [
    { file: '404.html', hashes: ["'sha256-theme'", "'sha256-missing'"] },
    { file: 'app/index.html', hashes: ["'sha256-theme'", "'sha256-home'"] },
    { file: 'index.html', hashes: ["'sha256-theme'", "'sha256-welcome'"] },
  ];
  const written = writePolicies(HEADERS, pages);

  it("puts the not-found page's scripts in the general rule, and a rule of its own for each other page", () => {
    expect(written).toContain(
      "/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-theme' 'sha256-missing'; style-src",
    );
    expect(written).toContain(
      "/\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-theme' 'sha256-welcome'; style-src",
    );
    expect(written).toContain(
      "/app/\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-theme' 'sha256-home'; style-src",
    );
    // The rules already there stay as they were.
    expect(written).toContain(
      '/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n',
    );
  });

  it('gives each address exactly the rules Cloudflare applies to it, in order', () => {
    expect(rulesFor(written, '/app/').split('\n')).toEqual([
      '/*',
      "Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-theme' 'sha256-missing'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'",
      'X-Content-Type-Options: nosniff',
      '/app/',
      '! Content-Security-Policy',
      "Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-theme' 'sha256-home'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'",
    ]);
    expect(rulesFor(written, '/app/no-such-page/')).not.toContain('sha256-home');
    expect(rulesFor(written, '/_next/static/chunks/a.js')).toContain('immutable');
  });

  it('stops the build when Cloudflare would skip part of it, rather than send pages without their policy', () => {
    const many = Array.from({ length: MAX_RULES + 1 }, (_, at) => `/page-${at}/\n  X-A: b\n`).join(
      '',
    );
    expect(() => checkLimits(many)).toThrow(/Cloudflare reads only the first 100/);
    expect(() => checkLimits(`/*\n  X-A: ${'b'.repeat(2000)}\n`)).toThrow(
      /Cloudflare skips a line over 2000/,
    );
    expect(() => checkLimits(written)).not.toThrow();
  });
});

describe("a page's version for the offline helper", () => {
  it('changes when only its policy changes, so phones fetch it again with the new one', () => {
    const before = writePolicies(HEADERS, [{ file: 'app/index.html', hashes: ["'sha256-home'"] }]);
    const after = before.replace(
      "connect-src 'self'",
      "connect-src 'self' https://abcdefghijklmnopqrst.supabase.co",
    );
    expect(pageRevision('f03ec4b6', before, 'app/index.html')).not.toBe(
      pageRevision('f03ec4b6', after, 'app/index.html'),
    );
    expect(pageRevision('f03ec4b6', before, 'app/index.html')).toBe(
      pageRevision('f03ec4b6', before, 'app/index.html'),
    );
    expect(pageRevision('f03ec4b6', before, 'app/index.html')).not.toBe(
      pageRevision('0a1b2c3d', before, 'app/index.html'),
    );
    // A rule for another page changes nothing.
    const other = `${before}/app/more/\n  X-A: b\n`;
    expect(pageRevision('f03ec4b6', other, 'app/index.html')).toBe(
      pageRevision('f03ec4b6', before, 'app/index.html'),
    );
  });
});
