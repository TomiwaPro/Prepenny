// The difference between this phone's clock and the server's, while
// PrePenny is open (D378, step 3e). The times written inside the plan, such
// as when a payment was ticked, a balance updated, a spend recorded or a
// debt updated from a statement (D33, D62), are this phone's clock
// corrected by it, as the time a change was made is (D366). So two phones
// whose clocks disagree can't count a tick on the wrong side of a balance
// update. It's learnt from the server's answers (data/clock.ts) and is 0
// until then, and on a phone that never signs in.

let offsetMs = 0;

/** Called by data/clock.ts whenever it learns or loads the difference. */
export function setClockOffset(ms: number): void {
  if (Number.isFinite(ms)) offsetMs = ms;
}

/** The time now by the server's clock, as well as this phone can tell, in milliseconds. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}
