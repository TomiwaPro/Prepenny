// The one message a page sends the offline helper (PLAN.md item 37): "take
// charge of this page", from a page that loaded while the helper was taking
// charge, so it wasn't among the pages the helper took over then.

export const TAKE_CHARGE = { type: 'take-charge' } as const;
