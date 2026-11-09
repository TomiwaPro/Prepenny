// Step 3e-2 (D404): a request that never gets an answer is given up after
// the time limit, so it can't hold up everything after it.

import { describe, expect, it, vi } from 'vitest';
import { ANSWER_WITHIN_MS, fetchWithTimeLimit } from '../../lib/time-limit.ts';

/** A server that never answers, as when a phone slept part-way through a request. */
const neverAnswers: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });

describe('A time limit on every request', () => {
  it('gives up on a request with no answer after 30 seconds', async () => {
    vi.useFakeTimers();
    try {
      const asked = fetchWithTimeLimit(
        ANSWER_WITHIN_MS,
        neverAnswers,
      )('https://example.test/hello');
      const outcome = asked.then(
        () => 'answered',
        (error: unknown) => (error as DOMException).name,
      );
      await vi.advanceTimersByTimeAsync(ANSWER_WITHIN_MS - 1);
      let settled = false;
      void outcome.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await outcome).toBe('TimeoutError');
      expect(ANSWER_WITHIN_MS).toBe(30_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes an answer that comes in time straight through', async () => {
    const answer = new Response('{"sign_in":"ok"}');
    const quick: typeof fetch = () => Promise.resolve(answer);
    expect(await fetchWithTimeLimit(1000, quick)('https://example.test/hello')).toBe(answer);
  });

  it('keeps a request its sender cancels cancelled', async () => {
    const sender = new AbortController();
    const asked = fetchWithTimeLimit(60_000, neverAnswers)('https://example.test/hello', {
      signal: sender.signal,
    });
    sender.abort(new DOMException('Cancelled.', 'AbortError'));
    await expect(asked).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('sends the request as it was given, with its own way to stop it', async () => {
    const seen: RequestInit[] = [];
    const watch: typeof fetch = (_input, init) => {
      seen.push(init ?? {});
      return Promise.resolve(new Response('{}'));
    };
    await fetchWithTimeLimit(1000, watch)('https://example.test/rpc/hello', {
      method: 'POST',
      headers: { 'x-prepenny-version': '20261112100000' },
      body: '{}',
    });
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.body).toBe('{}');
    expect(seen[0]?.headers).toEqual({ 'x-prepenny-version': '20261112100000' });
    expect(seen[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});
