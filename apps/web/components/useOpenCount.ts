'use client';

// How many times a sheet has opened, so its form starts afresh each time
// (as the edit sheet's does, D188) and keeps its last state while closing.

import { useState } from 'react';

export function useOpenCount(open: boolean): number {
  const [state, setState] = useState({ open: false, count: 0 });
  if (open !== state.open) {
    const next = { open, count: open ? state.count + 1 : state.count };
    setState(next);
    return next.count;
  }
  return state.count;
}
