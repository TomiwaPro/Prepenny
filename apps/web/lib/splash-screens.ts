// The opening screen of PrePenny on an iPhone's Home Screen (step 4d, D550).
// An iPhone shows a plain white screen while a home-screen web app starts,
// unless the page lists a picture for its exact screen size, so each
// iPhone's size has one in PrePenny's colours, light and dark: the icon on
// the paper colour with the name under it, as Android draws its own.
//
// Portrait only, as PrePenny is made for a phone held upright. Sizes from
// Apple's own list of iPhone screens, in points and their scale, newest
// first. scripts/make-splash-screens.ts draws them into public/splash/.

export interface SplashScreen {
  /** The screen's width and height in points, as the page sees them. */
  readonly width: number;
  readonly height: number;
  /** Pixels for each point. */
  readonly scale: 2 | 3;
}

export const IPHONE_SCREENS: readonly SplashScreen[] = [
  // iPhone 16 Pro Max, 17 Pro Max
  { width: 440, height: 956, scale: 3 },
  // iPhone Air
  { width: 420, height: 912, scale: 3 },
  // iPhone 16 Pro, 17, 17 Pro
  { width: 402, height: 874, scale: 3 },
  // iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 430, height: 932, scale: 3 },
  // iPhone 14 Pro, 15, 15 Pro, 16
  { width: 393, height: 852, scale: 3 },
  // iPhone 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 428, height: 926, scale: 3 },
  // iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e
  { width: 390, height: 844, scale: 3 },
  // iPhone X, XS, 11 Pro, 12 mini, 13 mini
  { width: 375, height: 812, scale: 3 },
  // iPhone XS Max, 11 Pro Max
  { width: 414, height: 896, scale: 3 },
  // iPhone XR, 11
  { width: 414, height: 896, scale: 2 },
  // iPhone 6s Plus, 7 Plus, 8 Plus
  { width: 414, height: 736, scale: 3 },
  // iPhone 6s, 7, 8, SE (2nd and 3rd)
  { width: 375, height: 667, scale: 2 },
  // iPhone SE (1st), 320 by 568
  { width: 320, height: 568, scale: 2 },
];

export type SplashColours = 'light' | 'dark';

/** The picture's file, by its size in pixels. */
export function splashFile(screen: SplashScreen, colours: SplashColours): string {
  return `/splash/iphone-${screen.width * screen.scale}x${screen.height * screen.scale}-${colours}.png`;
}

/** When the iPhone uses it: that screen, upright, in that colour scheme. */
export function splashMedia(screen: SplashScreen, colours: SplashColours): string {
  return `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.scale}) and (orientation: portrait) and (prefers-color-scheme: ${colours})`;
}

/** Every picture with its media query, for the page's head. */
export function startupImages(): { readonly url: string; readonly media: string }[] {
  return IPHONE_SCREENS.flatMap((screen) =>
    (['light', 'dark'] as const).map((colours) => ({
      url: splashFile(screen, colours),
      media: splashMedia(screen, colours),
    })),
  );
}
