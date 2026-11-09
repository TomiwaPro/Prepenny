// A time limit on every request PrePenny sends (step 3e-2, D404).
//
// A phone that sleeps, or moves between Wi-Fi and mobile data, part-way
// through a request can be left waiting for an answer that never comes, for
// many minutes. Supabase's sign-in code shares one request to renew the
// sign-in between every request that needs it, and PrePenny's own looks at
// the account run one at a time, so one request with no answer held up
// everything after it until the page was loaded again: the owner's phone
// showed "Someone asked to get into your account" only after a refresh.
// With a limit, a request with no answer is given up, and the next look,
// within a minute, asks again.

/** How long PrePenny waits for an answer before giving up and trying again later. */
export const ANSWER_WITHIN_MS = 30_000;

/**
 * `fetch` with a time limit: it gives up once the limit has passed without
 * the whole answer, as if there were no signal. A request already cancelled
 * by its sender stays cancelled.
 */
export function fetchWithTimeLimit(
  limitMs: number = ANSWER_WITHIN_MS,
  send: typeof fetch = (...args) => fetch(...args),
): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const given = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const stop = () => controller.abort(given?.reason);
    if (given?.aborted === true) stop();
    else given?.addEventListener('abort', stop, { once: true });
    // Left to run after the answer has started: reading a slow answer counts
    // too, and stopping a request that has finished does nothing.
    const timer = setTimeout(
      () => controller.abort(new DOMException('No answer in time.', 'TimeoutError')),
      limitMs,
    );
    return send(input, { ...init, signal: controller.signal }).catch((error: unknown) => {
      clearTimeout(timer);
      throw error;
    });
  };
}
