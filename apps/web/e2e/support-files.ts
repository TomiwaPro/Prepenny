// Pictures as phones make them, with hidden details added on purpose, for
// the tests of Something looks wrong (step 4i, D607): a real screenshot of
// the page, with a place written into it as a phone's camera or an editing
// app would, and a GIF named as if it were a PNG.

import type { Page } from '@playwright/test';

/** A screenshot of the page as a PNG, with a text chunk and an eXIf chunk naming a place. */
export async function pngWithDetails(page: Page): Promise<Buffer> {
  const png = await page.screenshot();
  const chunk = (name: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(name, 'latin1'), data, Buffer.alloc(4)]);
  };
  const ihdrEnd = 8 + 12 + 13;
  return Buffer.concat([
    png.subarray(0, ihdrEnd),
    chunk('tEXt', Buffer.from('Location\0GPS 51.5072N 0.1276W', 'latin1')),
    chunk('eXIf', Buffer.from('MM\0*GPS 51.5072N 0.1276W', 'latin1')),
    png.subarray(ihdrEnd),
  ]);
}

/** A screenshot of the page as a JPEG, with an Exif segment naming a place, as a phone's camera writes. */
export async function jpegWithDetails(page: Page): Promise<Buffer> {
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 80 });
  const exif = Buffer.from('Exif\0\0MM\0*GPS 51.5072N 0.1276W', 'latin1');
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1);
  header.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, exif, jpeg.subarray(2)]);
}

/** A GIF, named as if it were a PNG. */
export const GIF_CALLED_PNG = {
  name: 'screenshot.png',
  mimeType: 'image/png',
  buffer: Buffer.from('474946383961010001000000002c00000000010001000002024401003b', 'hex'),
};

/** What's in a JPEG or PNG before its picture data: each part's name. */
export function partsOf(file: Buffer): string[] {
  if (file.subarray(1, 4).toString('latin1') === 'PNG') {
    const names: string[] = [];
    for (let at = 8; at + 8 <= file.length; ) {
      const name = file.subarray(at + 4, at + 8).toString('latin1');
      names.push(name);
      at += 12 + file.readUInt32BE(at);
    }
    return names;
  }
  const names: string[] = [];
  for (let at = 2; at + 4 <= file.length; ) {
    const marker = file[at + 1] ?? 0;
    names.push(`ff${marker.toString(16)}`);
    if (marker === 0xda) break;
    at += 2 + file.readUInt16BE(at + 2);
  }
  return names;
}
