// Step 4i (D601 to D613): what the phone adds by itself to a message, and how
// a picture's hidden details are taken out on the phone before it's sent.
// The database checks the same again (39-support-messages.test.sql).

import { describe, expect, it } from 'vitest';
import {
  base64Of,
  isPlanCopy,
  pictureType,
  plainJpeg,
  plainPng,
  sizeToDraw,
  sizeWords,
} from '../../lib/picture.ts';
import { phoneType, screenName } from '../../lib/support.ts';

const bytes = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
const hexOf = (data: Uint8Array) =>
  Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('');
const ascii = (words: string) => hexOf(new TextEncoder().encode(words));

/** A PNG chunk, with a made-up check sum: only its place and name matter here. */
const chunk = (name: string, dataHex: string) =>
  (dataHex.length / 2).toString(16).padStart(8, '0') + ascii(name) + dataHex + '00000000';
const PNG_START = '89504e470d0a1a0a';
const IHDR = chunk('IHDR', '0000000100000001080600000000'.slice(0, 26));
const IDAT = chunk('IDAT', '78da63f8cfc0f01f0005000201');
const IEND = '0000000049454e44ae426082';

/** A JPEG's parts: SOI, then each segment, then the picture data and EOI. */
const segment = (marker: string, dataHex: string) =>
  `ff${marker}${(dataHex.length / 2 + 2).toString(16).padStart(4, '0')}${dataHex}`;
const JFIF = segment('e0', '4a464946000101000001000100' + '00');
const EXIF = segment('e1', ascii('Exif') + '0000' + ascii('GPS 51.5072N 0.1276W'));
const XMP = segment('e1', ascii('http://ns.adobe.com/xap/1.0/') + '00' + ascii('<x:xmpmeta/>'));
const COMMENT = segment('fe', ascii('Taken at home'));
const DQT = segment('db', `00${'01'.repeat(64)}`);
const SOF = segment('c0', '080002000303012200021101031101');
const DHT = segment('c4', `00${'00'.repeat(16)}`);
const SOS_AND_DATA = `${segment('da', '03010002110311003f00')}a1b2c3ffd9`;

describe('What the phone adds by itself (D610)', () => {
  it('names the phone as "Android, Chrome 131", never the whole description', () => {
    expect(
      phoneType(
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Android, Chrome 131');
    expect(
      phoneType(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone, Safari 18');
    expect(
      phoneType(
        'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Android, Samsung Internet 26');
    expect(
      phoneType(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      ),
    ).toBe('Windows, Edge 131');
    expect(phoneType('Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0')).toBe(
      'Android, Firefox 133',
    );
    expect(
      phoneType(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone, Chrome 131');
  });

  it('knows an iPad that says it is a Mac by its touch screen', () => {
    const description =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
    expect(phoneType(description, 5)).toBe('iPad, Safari 18');
    expect(phoneType(description, 0)).toBe('Mac, Safari 18');
  });

  it('says so when it can tell neither', () => {
    expect(phoneType('Something new/1.0')).toBe('Another device, Another browser');
  });

  it('always matches the pattern the database checks, whatever the description', () => {
    const pattern =
      /^(Android|iPhone|iPad|Windows|Mac|Linux|Chromebook|Another device), (Chrome|Safari|Firefox|Edge|Samsung Internet|Opera|Another browser)( [0-9]{1,4})?$/;
    for (const description of [
      '',
      'Chrome/123456789',
      'Linux; Android; Mobile Chrome/12 SamsungBrowser/x',
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      'HeadlessChrome/140.0.0.0',
      'OPR/115.0.0.0 (Windows NT 10.0) Chrome/130',
    ]) {
      expect(phoneType(description)).toMatch(pattern);
    }
  });

  it("names a screen by its address only, never what's after a # (where a debt's id is)", () => {
    expect(screenName('/app/')).toBe('home');
    expect(screenName('/app/coming-up/')).toBe('coming-up');
    expect(screenName('/app/debt/#id=0192f1a2-b3c4')).toBe('debt');
    expect(screenName('/app/help/sign-in-problems/')).toBe('help-sign-in-problems');
    expect(screenName('/app/more/?from=x')).toBe('more');
    expect(screenName('/')).toBe('home');
    expect(screenName('/app/<script>/')).toBe('script');
  });
});

describe("A picture's hidden details are taken out on the phone (D607)", () => {
  it('knows a JPEG and a PNG by their contents, and nothing else', () => {
    expect(pictureType(bytes(`ffd8${JFIF}`))).toBe('image/jpeg');
    expect(pictureType(bytes(PNG_START + IHDR))).toBe('image/png');
    expect(pictureType(bytes('474946383961'))).toBeNull();
    expect(
      pictureType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(pictureType(bytes('ffd8'))).toBeNull();
  });

  it('takes Exif (where a photo was taken), XMP, comments and the JFIF header out of a JPEG', () => {
    const before = bytes(`ffd8${JFIF}${EXIF}${XMP}${COMMENT}${DQT}${SOF}${DHT}${SOS_AND_DATA}`);
    const after = plainJpeg(before);
    expect(after).not.toBeNull();
    expect(hexOf(after ?? new Uint8Array())).toBe(`ffd8${DQT}${SOF}${DHT}${SOS_AND_DATA}`);
    expect(hexOf(after ?? new Uint8Array())).not.toContain(ascii('GPS'));
  });

  it('takes text, eXIf, time and colour profiles out of a PNG', () => {
    const text = chunk('tEXt', ascii('Comment') + '00' + ascii('Taken at home'));
    const exif = chunk('eXIf', ascii('MM') + '002a' + ascii('GPS'));
    const time = chunk('tIME', '07ea0b130a0000');
    const international = chunk('iTXt', ascii('Location') + '0000000000' + ascii('London'));
    const profile = chunk('iCCP', ascii('icc') + '0000' + '78da');
    const before = bytes(
      PNG_START + IHDR + text + exif + time + international + profile + IDAT + IEND,
    );
    expect(hexOf(plainPng(before) ?? new Uint8Array())).toBe(PNG_START + IHDR + IDAT + IEND);
  });

  it('refuses a picture cut short, rather than sending part of one', () => {
    const jpeg = `ffd8${DQT}${SOF}${DHT}${SOS_AND_DATA}`;
    expect(plainJpeg(bytes(jpeg.slice(0, 40)))).toBeNull();
    expect(plainJpeg(bytes(jpeg.slice(0, -4)))).toBeNull();
    expect(plainPng(bytes(PNG_START + IHDR + IDAT))).toBeNull();
  });

  it('draws a very big picture smaller, never bigger', () => {
    expect(sizeToDraw(1290, 2796, 2400)).toEqual({ width: 1107, height: 2400 });
    expect(sizeToDraw(1080, 2400, 2400)).toEqual({ width: 1080, height: 2400 });
    expect(sizeToDraw(720, 1600, 2400)).toEqual({ width: 720, height: 1600 });
  });

  it('says its size in plain words', () => {
    expect(sizeWords(500)).toBe('1 KB');
    expect(sizeWords(412 * 1024)).toBe('412 KB');
    expect(sizeWords(1.44 * 1024 * 1024)).toBe('1.4 MB');
  });

  it('sends it as base64, byte for byte', () => {
    const all = Uint8Array.from({ length: 70_000 }, (_, at) => (at * 7) % 256);
    expect(Uint8Array.from(atob(base64Of(all)), (letter) => letter.charCodeAt(0))).toEqual(all);
  });
});

describe('A plan copy is the backup file from Download my data, by its contents (D607)', () => {
  const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  it("is PrePenny's backup, version 1, with a plan in it", () => {
    expect(
      isPlanCopy(encoded({ app: 'PrePenny', kind: 'backup', version: 1, plan: { records: {} } })),
    ).toBe(true);
    expect(isPlanCopy(encoded({ app: 'Other', kind: 'backup', version: 1, plan: {} }))).toBe(false);
    expect(isPlanCopy(encoded({ app: 'PrePenny', kind: 'backup', version: 2, plan: {} }))).toBe(
      false,
    );
    expect(isPlanCopy(encoded({ app: 'PrePenny', kind: 'backup', version: 1, plan: [] }))).toBe(
      false,
    );
    expect(isPlanCopy(new TextEncoder().encode('app,kind\nPrePenny,backup'))).toBe(false);
    expect(isPlanCopy(bytes('ffd8ff'))).toBe(false);
  });
});
