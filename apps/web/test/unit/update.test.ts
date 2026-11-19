// Step 4h (D594): what an open PrePenny does when it looks for a new version.
// It loads a new version only once a fresh load would give it, that is once
// the offline helper in charge holds it; before that it shows the note and
// lets the helper fetch it. The whole journey, with two real builds, is
// e2e/updating.spec.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { whatToDo } from '../../lib/update.ts';
import { forgetLiveVersion, lastAskedAt, liveVersion } from '../../lib/version.ts';

const OLD = { database: '20261121100000', build: 'old' };
const NEW = { database: '20261122100000', build: 'new' };
const NEWER = { database: '20261122100000', build: 'newer' };

describe('What a look for a new version does', () => {
  it('does nothing when this screen is the live version', () => {
    expect(whatToDo(NEW, NEW, NEW)).toBe('nothing');
    // No signal and nothing else on the phone.
    expect(whatToDo(NEW, null, NEW)).toBe('nothing');
    expect(whatToDo(NEW, null, null)).toBe('nothing');
  });

  it("lets the offline helper fetch a newer version, without loading the page, while the helper doesn't hold it yet", () => {
    // The fault found in step 4h: loading now would only show the old version again.
    expect(whatToDo(OLD, NEW, OLD)).toBe('fetch');
    // Can't tell what a fresh load gives, as with a helper not in charge yet.
    expect(whatToDo(OLD, NEW, null)).toBe('fetch');
    // The helper holds a version between, and a newer one is live: it waits for that.
    expect(whatToDo(OLD, NEWER, NEW)).toBe('fetch');
  });

  it('loads the new version once the helper in charge holds it', () => {
    expect(whatToDo(OLD, NEW, NEW)).toBe('load');
  });

  it("with no signal, loads a version that's on the phone already", () => {
    expect(whatToDo(OLD, null, NEW)).toBe('load');
  });

  it("only lets the helper catch up, with no note, when this screen is live and the helper isn't", () => {
    expect(whatToDo(NEW, NEW, OLD)).toBe('catch-up');
  });

  it('counts a change of database alone as a new version', () => {
    const sameBuild = { database: '20261123100000', build: 'old' };
    expect(whatToDo(OLD, sameBuild, sameBuild)).toBe('load');
  });
});

describe('Asking which version is live', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    forgetLiveVersion();
  });

  it('shares one request between looks a few seconds apart, and asks afresh after', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (input: string) => {
      asked.push(input);
      return new Response(JSON.stringify(NEW), { status: 200 });
    });
    const now = 1_000_000;
    const first = liveVersion(now);
    const second = liveVersion(now + 4_000);
    expect(await first).toEqual(NEW);
    expect(await second).toEqual(NEW);
    expect(asked).toEqual(['/version.json']);
    expect(lastAskedAt()).toBe(now);
    expect(await liveVersion(now + 5_000)).toEqual(NEW);
    expect(asked).toHaveLength(2);
  });

  it("doesn't share no answer: a look a moment later, with the signal back, asks afresh", async () => {
    let signal = false;
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (input: string) => {
      asked.push(input);
      if (!signal) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify(NEW), { status: 200 });
    });
    expect(await liveVersion(1_000)).toBeNull();
    signal = true;
    expect(await liveVersion(2_000)).toEqual(NEW);
    expect(asked).toHaveLength(2);
  });

  it('says null with no signal, or an answer that is not a version', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await liveVersion(1)).toBeNull();
    forgetLiveVersion();
    vi.stubGlobal('fetch', async () => new Response('<html>', { status: 200 }));
    expect(await liveVersion(2)).toBeNull();
    forgetLiveVersion();
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }));
    expect(await liveVersion(3)).toBeNull();
  });
});
