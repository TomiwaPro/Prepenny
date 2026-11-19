// Pictures and plan copies for "Something looks wrong" (step 4i, D607,
// the owner's answer to PLAN.md question 11).
//
// - A picture is a screenshot the person chooses from their photos, after
//   the consent message. Only JPEG and PNG are taken, known by their
//   contents (the first bytes), never by their name.
// - Its hidden details are taken out here, on the phone, before anything is
//   sent: it's drawn afresh (so nothing but the picture itself is copied),
//   made smaller if it's very big, then every part that isn't the picture
//   is removed: a JPEG keeps only its tables, its size and its picture data
//   (no Exif, where a phone keeps where a photo was taken, no XMP, no
//   comments, no thumbnail); a PNG keeps only its header, colours,
//   transparency and picture data (no text, no eXIf, no time). The server
//   checks the same (app.picture_facts) and refuses anything else.
// - A plan copy is the backup file from Download my data (step 3h), chosen
//   the same way, known by its contents too.
//
// Nothing here is logged, and nothing is kept: the picture is only in memory
// until it's sent or the person chooses another.

/** The biggest picture sent, as the server takes it (app.support_picture_most_bytes). */
export const PICTURE_MOST_BYTES = 2 * 1024 * 1024;
/** The biggest plan copy sent (app.support_plan_most_bytes). */
export const PLAN_MOST_BYTES = 5 * 1024 * 1024;
/** The longest side of a picture sent, in pixels: a phone screenshot's text stays clear. */
export const LONGEST_SIDE = 2400;

export type PictureType = 'image/jpeg' | 'image/png';

/** What a file is, from its first bytes: a JPEG, a PNG, or neither. */
export function pictureType(bytes: Uint8Array): PictureType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((byte, at) => bytes[at] === byte)) return 'image/png';
  return null;
}

/** The PNG chunks a picture needs: everything else is taken out. */
const PNG_KEPT = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

function chunkName(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(
    bytes[at] ?? 0,
    bytes[at + 1] ?? 0,
    bytes[at + 2] ?? 0,
    bytes[at + 3] ?? 0,
  );
}

/**
 * A PNG with only the chunks a picture needs, or null when it isn't a whole
 * PNG. Each chunk kept is copied as it was, its check sum with it.
 */
export function plainPng(bytes: Uint8Array): Uint8Array | null {
  if (pictureType(bytes) !== 'image/png') return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let at = 8;
  for (;;) {
    if (at + 12 > bytes.length) return null;
    const length =
      ((bytes[at] ?? 0) * 0x1000000 +
        ((bytes[at + 1] ?? 0) << 16) +
        ((bytes[at + 2] ?? 0) << 8) +
        (bytes[at + 3] ?? 0)) >>>
      0;
    const end = at + 12 + length;
    if (end > bytes.length) return null;
    const name = chunkName(bytes, at + 4);
    if (PNG_KEPT.has(name)) kept.push(bytes.subarray(at, end));
    at = end;
    if (name === 'IEND') break;
  }
  return joined(kept);
}

/** JPEG markers kept before the picture data: tables, sizes and the restart interval. */
function keptJpegMarker(marker: number): boolean {
  return (
    marker === 0xdb || // quantisation tables
    marker === 0xc4 || // Huffman tables
    marker === 0xcc || // arithmetic coding
    marker === 0xdd || // restart interval
    (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
  );
}

/**
 * A JPEG with nothing before its picture data but its tables and size: no
 * application data (APP0 to APP15, which hold JFIF, Exif, XMP and the
 * like) and no comments. Null when it isn't a whole JPEG.
 */
export function plainJpeg(bytes: Uint8Array): Uint8Array | null {
  if (pictureType(bytes) !== 'image/jpeg') return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  for (;;) {
    if (at + 4 > bytes.length || bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(bytes.subarray(at, at + 2));
      at += 2;
      continue;
    }
    if (marker === 0xd8 || marker === 0xd9) return null;
    const length = ((bytes[at + 2] ?? 0) << 8) + (bytes[at + 3] ?? 0);
    const end = at + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    if (marker === 0xda) {
      // The picture data, to the end of the file.
      kept.push(bytes.subarray(at));
      break;
    }
    if (keptJpegMarker(marker)) kept.push(bytes.subarray(at, end));
    at = end;
  }
  const whole = joined(kept);
  return whole[whole.length - 2] === 0xff && whole[whole.length - 1] === 0xd9 ? whole : null;
}

function joined(parts: readonly Uint8Array[]): Uint8Array {
  const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.length;
  }
  return whole;
}

/** The bytes as base64, as the server takes them. */
export function base64Of(bytes: Uint8Array): string {
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(text);
}

/** "412 KB" or "1.4 MB", for the line saying what was chosen. */
export function sizeWords(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toFixed(1)} MB`;
}

export interface Picture {
  readonly kind: 'picture';
  readonly type: PictureType;
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface PlanCopy {
  readonly kind: 'plan';
  readonly bytes: Uint8Array;
}

export type Chosen<T> =
  | { readonly ok: true; readonly file: T }
  | {
      readonly ok: false;
      readonly problem: 'not-a-picture' | 'unreadable' | 'too-big' | 'not-a-plan';
    };

/** The width and height to draw at: the longest side at most `longest`, never bigger. */
export function sizeToDraw(
  width: number,
  height: number,
  longest: number,
): { width: number; height: number } {
  const scale = Math.min(1, longest / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encoded(
  canvas: HTMLCanvasElement,
  type: PictureType,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * A picture the person chose, ready to send: known by its contents, drawn
 * afresh with its hidden details taken out, and no bigger than 2 MB.
 */
export async function preparePicture(file: Blob): Promise<Chosen<Picture>> {
  try {
    return await readPicture(file);
  } catch {
    // A photo that isn't on the phone yet, or a file taken away while it was read.
    return { ok: false, problem: 'unreadable' };
  }
}

async function readPicture(file: Blob): Promise<Chosen<Picture>> {
  const start = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = pictureType(start);
  if (type === null) return { ok: false, problem: 'not-a-picture' };
  let bitmap: ImageBitmap;
  try {
    // Turned the way the phone shows it, before what says which way up is dropped.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
  try {
    // A PNG screenshot stays a PNG while it fits; anything else, or one too big, is a JPEG.
    const tries: {
      readonly type: PictureType;
      readonly longest: number;
      readonly quality: number;
    }[] = [
      ...(type === 'image/png' ? [{ type, longest: LONGEST_SIDE, quality: 1 }] : []),
      { type: 'image/jpeg', longest: LONGEST_SIDE, quality: 0.9 },
      { type: 'image/jpeg', longest: 1800, quality: 0.85 },
      { type: 'image/jpeg', longest: 1200, quality: 0.8 },
    ];
    for (const one of tries) {
      const size = sizeToDraw(bitmap.width, bitmap.height, one.longest);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const drawing = canvas.getContext('2d');
      if (drawing === null) return { ok: false, problem: 'unreadable' };
      if (one.type === 'image/jpeg') {
        // A JPEG has no see-through parts: white behind them, as a screen shows.
        drawing.fillStyle = '#ffffff';
        drawing.fillRect(0, 0, size.width, size.height);
      }
      drawing.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await encoded(canvas, one.type, one.quality);
      if (blob === null) continue;
      const raw = new Uint8Array(await blob.arrayBuffer());
      const plain = one.type === 'image/png' ? plainPng(raw) : plainJpeg(raw);
      if (plain === null) continue;
      if (plain.length <= PICTURE_MOST_BYTES) {
        return {
          ok: true,
          file: { kind: 'picture', type: one.type, bytes: plain, ...size },
        };
      }
    }
    return { ok: false, problem: 'too-big' };
  } finally {
    bitmap.close();
  }
}

/**
 * A plan copy the person chose: the backup file from Download my data,
 * known by its contents: JSON saying it's PrePenny's backup, with a plan in
 * it, 5 MB at most. Sent as it is.
 */
export async function preparePlanCopy(file: Blob): Promise<Chosen<PlanCopy>> {
  if (file.size > PLAN_MOST_BYTES) return { ok: false, problem: 'too-big' };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, problem: 'not-a-plan' };
  }
  return isPlanCopy(bytes)
    ? { ok: true, file: { kind: 'plan', bytes } }
    : { ok: false, problem: 'not-a-plan' };
}

/** True when the bytes are a PrePenny backup, as app.plan_copy_ok checks. */
export function isPlanCopy(bytes: Uint8Array): boolean {
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const { app, kind, version, plan } = value as Record<string, unknown>;
    return (
      app === 'PrePenny' &&
      kind === 'backup' &&
      version === 1 &&
      plan !== null &&
      typeof plan === 'object' &&
      !Array.isArray(plan)
    );
  } catch {
    return false;
  }
}
