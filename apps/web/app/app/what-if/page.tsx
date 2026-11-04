import type { Metadata } from 'next';
import { Suspense } from 'react';
import { WhatIfScreen } from '../../../components/WhatIfScreen.tsx';
import { strings } from '../../../strings/en-GB.ts';

export const metadata: Metadata = { title: strings.whatIf.heading };

// What if (brief 4.10): reads where it was opened from after the question
// mark, to go back there.
export default function WhatIfPage() {
  return (
    <Suspense>
      <WhatIfScreen />
    </Suspense>
  );
}
