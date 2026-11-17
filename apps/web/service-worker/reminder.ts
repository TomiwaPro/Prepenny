// A reminder as the offline helper shows it (step 4e, D564): what arrived,
// opened by the browser, checked before it's shown. Kept apart from sw.ts
// so it can be tested.

/** The name, shown as the title if a reminder's own can't be read. */
const NAME = 'PrePenny';

export interface Reminder {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly url: string;
}

export function reminderOf(read: () => unknown): Reminder {
  const shown: Reminder = { title: NAME, body: '', tag: 'prepenny', url: '/app/' };
  try {
    const sent: unknown = read();
    if (typeof sent !== 'object' || sent === null) return shown;
    const field = (name: keyof Reminder) => {
      const value = (sent as Record<string, unknown>)[name];
      return typeof value === 'string' && value.length <= 1000 ? value : shown[name];
    };
    // Only one of PrePenny's own pages opens from a tap.
    const url = field('url');
    return {
      title: field('title'),
      body: field('body'),
      tag: field('tag'),
      url: /^\/app\/[A-Za-z0-9/_#-]*$/.test(url) ? url : shown.url,
    };
  } catch {
    return shown;
  }
}
