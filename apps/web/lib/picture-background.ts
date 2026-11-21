// Getting a picture ready for Something looks wrong (D607), in the background
// worker (step 4k).
//
// On the screen's own thread, Chrome saves a drawing as a file only in the
// moments the screen is idle: it waits up to a second for one to start, and
// once started, up to 5 seconds more before finishing anyway. On a slow
// phone, or a busy computer, a screen is rarely idle, so "Getting the
// picture ready." could stay for over 5 seconds, and the screen stuttered
// while it was finished. The background worker has no screen to wait for,
// and the screen keeps working meanwhile.
//
// A browser that can't draw in a worker, or a worker that fails, gets the
// picture ready on the screen's own thread, as before.

import { askInBackground } from '../worker/client.ts';
import { type Chosen, type Picture, preparePicture } from './picture.ts';

/** A picture the person chose, ready to send, worked out off the screen where it can be. */
export async function preparePictureInBackground(file: Blob): Promise<Chosen<Picture>> {
  if (typeof Worker === 'function' && typeof OffscreenCanvas === 'function') {
    try {
      return await askInBackground({ kind: 'picture', file });
    } catch {
      // No worker here, or it couldn't draw: the screen does it instead.
    }
  }
  return preparePicture(file);
}
