// Two real builds of PrePenny at one address, for the updating tests (step 4h,
// D594): the build under test (out/) as the old version, and a second build
// of the same code with its own name as the new one, made by
// `pnpm build:update-test` into e2e/.updating/new before `pnpm build:local`.
// Each test serves the old one with Wrangler, as Cloudflare serves it, then
// puts the new one live at the same address, as a deploy does.
//
// The phone is Android Chrome. Headless Chrome never hides a tab, so the tab
// is put away the way Android does it: the page is told it's hidden (the
// event PrePenny listens for), then frozen for real, timers and all; brought
// back, it's woken, then told it's showing. A weak signal is played by
// holding the offline helper's own downloads, the 193 files a new version
// brings, for as long as a test says.

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type BrowserContext,
  test as base,
  type CDPSession,
  expect,
  type Page,
} from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
/** The build under test: the old version. */
export const OLD_BUILD = join(APP, 'out');
/** The same code built again with its own name: the new version. */
export const NEW_BUILD = join(HERE, '.updating', 'new');
/** The name `pnpm build:update-test` gives the new version (package.json). */
const NEW_NAME = 'update-test';

/** Which version a build says it is, from its /version.json. */
function versionOf(build: string): string {
  const file = join(build, 'version.json');
  if (!existsSync(file)) {
    throw new Error(
      `${file} is missing. Run \`pnpm build:update-test\` and then \`pnpm build:local\` first (README.md).`,
    );
  }
  return (JSON.parse(readFileSync(file, 'utf8')) as { build: string }).build;
}

/** Wrangler's settings for one copy of the site, as wrangler.jsonc has them, serving `build`. */
function settingsFor(build: string, port: number): string {
  const own = readFileSync(join(APP, 'wrangler.jsonc'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  const settings = JSON.parse(own) as Record<string, unknown> & {
    assets: Record<string, unknown>;
  };
  delete settings.$schema;
  // No address of its own: each request keeps the one the browser asked for.
  delete settings.routes;
  delete settings.workers_dev;
  delete settings.preview_urls;
  return JSON.stringify(
    {
      ...settings,
      name: `prepenny-updating-test-${port}`,
      main: join(APP, 'cloudflare', 'worker.ts'),
      assets: { ...settings.assets, directory: build },
    },
    null,
    2,
  );
}

/** One address, serving the old version or the new one. */
export class Site {
  readonly origin: string;
  private wrangler: ChildProcess | null = null;
  private readonly folder: string;
  private readonly port: number;

  constructor(port: number) {
    this.port = port;
    this.origin = `http://127.0.0.1:${port}`;
    this.folder = join(HERE, '.updating', String(port));
  }

  /** Puts `build` live at this address, in place of whatever was, and waits until it answers. */
  async serve(build: string): Promise<void> {
    const version = versionOf(build);
    await this.stop();
    mkdirSync(this.folder, { recursive: true });
    const config = join(this.folder, 'wrangler.jsonc');
    writeFileSync(config, settingsFor(build, this.port));
    const log = openSync(join(this.folder, 'wrangler.log'), 'a');
    this.wrangler = spawn(
      join(APP, 'node_modules', '.bin', 'wrangler'),
      [
        'dev',
        '--config',
        config,
        '--port',
        String(this.port),
        '--ip',
        '127.0.0.1',
        // Its own debugger port too: copies starting at the same moment would
        // otherwise all reach for Wrangler's usual one.
        '--inspector-port',
        String(this.port + 10_000),
        '--log-level',
        'warn',
      ],
      {
        cwd: APP,
        detached: true,
        // Wrangler's own words, kept beside its settings, in case it doesn't start.
        stdio: ['ignore', log, log],
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      },
    );
    await expect
      .poll(
        async () => {
          try {
            const answer = await fetch(`${this.origin}/version.json`, { cache: 'no-store' });
            return ((await answer.json()) as { build?: string }).build;
          } catch {
            return null;
          }
        },
        {
          message: `${build} live at ${this.origin} (Wrangler's words: ${join(this.folder, 'wrangler.log')})`,
          timeout: 60_000,
          intervals: [250],
        },
      )
      .toBe(version);
  }

  /** Takes the site down, as between two deploys. */
  async stop(): Promise<void> {
    const running = this.wrangler;
    this.wrangler = null;
    if (running === null || running.pid === undefined || running.exitCode !== null) return;
    const group = -running.pid;
    const signal = (name: NodeJS.Signals) => {
      try {
        // Wrangler and the runtime it starts, together.
        process.kill(group, name);
      } catch {
        // Gone already.
      }
    };
    signal('SIGTERM');
    // The runtime can hold the address a moment after Wrangler has gone: the
    // next copy waits until it's free, and stops it outright after 5 seconds.
    const started = Date.now();
    while (await this.answers()) {
      if (Date.now() - started > 5_000) signal('SIGKILL');
      if (Date.now() - started > 20_000) throw new Error(`${this.origin} is still taken.`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /** True while something answers at this address. */
  private answers(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = connect(this.port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
  }
}

/**
 * The tests' `test`, with the old version served at an address of their own
 * (one per worker running at once), which is every page's base address.
 */
export const test = base.extend<{ site: Site }>({
  site: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's first argument to know what it uses, here nothing.
    async ({}, use, info) => {
      const versions = [versionOf(OLD_BUILD), versionOf(NEW_BUILD)];
      expect(versions[1], 'the new build has its own name').toBe(NEW_NAME);
      expect(versions[0], 'the two builds are different versions').not.toBe(versions[1]);
      const site = new Site(4180 + info.parallelIndex);
      await site.serve(OLD_BUILD);
      await use(site);
      await site.stop();
    },
    { timeout: 90_000 },
  ],
  baseURL: async ({ site }, use) => {
    await use(site.origin);
  },
  context: async ({ context }, use) => {
    // Lets the test tell the page it's hidden or showing, as a phone does.
    await context.addInitScript(() => {
      Reflect.set(window, '__updatingTestShow', (state: 'hidden' | 'visible') => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => state,
        });
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get: () => state === 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    });
    await use(context);
  },
});

/** Puts PrePenny away, as switching to another app: hidden, then frozen. */
export async function putAway(page: Page): Promise<CDPSession> {
  await page.evaluate(() => Reflect.get(window, '__updatingTestShow')('hidden'));
  const session = await page.context().newCDPSession(page);
  await session.send('Page.setWebLifecycleState', { state: 'frozen' });
  return session;
}

/** Brings PrePenny back on screen: woken, then showing. */
export async function bringBack(page: Page, session: CDPSession): Promise<void> {
  await session.send('Page.setWebLifecycleState', { state: 'active' });
  await page.evaluate(() => Reflect.get(window, '__updatingTestShow')('visible'));
}

/** Holds every download of the offline helper's, as a weak signal, until `release`. */
export async function holdHelperDownloads(context: BrowserContext) {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = 0;
  await context.route('**/*', async (route) => {
    if (route.request().serviceWorker() !== null) {
      held += 1;
      await released;
    }
    await route.continue();
  });
  return {
    held: () => held,
    release: async () => {
      release();
      await context.unrouteAll({ behavior: 'ignoreErrors' });
    },
  };
}

/**
 * Which version the page open is: the one whose files its scripts are. The
 * two builds' scripts have different names, as each build's name is inside
 * them.
 */
export async function versionOpen(page: Page): Promise<'old' | 'new' | 'loading'> {
  let scripts: string[];
  try {
    scripts = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLScriptElement>('script[src]')]
        .map((script) => new URL(script.src).pathname)
        .filter((path) => path.startsWith('/_next/static/')),
    );
  } catch {
    // Asked in the very moment the page loads afresh.
    return 'loading';
  }
  if (scripts.length === 0) return 'loading';
  const inOld = scripts.every((path) => existsSync(join(OLD_BUILD, path)));
  const inNew = scripts.every((path) => existsSync(join(NEW_BUILD, path)));
  if (inNew && !inOld) return 'new';
  if (inOld && !inNew) return 'old';
  throw new Error(`The page's scripts are from neither build, or both: ${scripts.join(' ')}`);
}

/** Counts the times the page loads afresh from now on. */
export function countLoads(page: Page): () => number {
  let loads = 0;
  page.on('domcontentloaded', () => {
    loads += 1;
  });
  return () => loads;
}

/** True while the page open is still the one marked `__theOldPage`. */
export async function stillTheOldPage(page: Page): Promise<boolean | 'loading'> {
  try {
    return await page.evaluate(() => Reflect.get(window, '__theOldPage') === true);
  } catch {
    return 'loading';
  }
}

/** Marks the page open now, so a test can tell when it has loaded afresh. */
export async function markTheOldPage(page: Page): Promise<void> {
  await page.evaluate(() => Reflect.set(window, '__theOldPage', true));
}

/** Which version the offline helper in charge of the page holds. */
export async function versionOnThePhone(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(async () => {
      const answer = await fetch('/offline-version.json', { cache: 'no-store' });
      return ((await answer.json()) as { build: string }).build;
    });
  } catch {
    return null;
  }
}

export { NEW_NAME };
