import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { validateWorkspaceLogo } from '../src/storage/logo-validation.js';
import type { UploadFile } from '../src/storage/file-validation.js';

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([header, name, data, crc]);
}

function png() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function file(name: string, mimetype: string, buffer: Buffer): UploadFile {
  return { originalname: name, mimetype, size: buffer.length, buffer };
}

describe('workspace logo validation', () => {
  it('accepts a structurally valid PNG', () => {
    expect(validateWorkspaceLogo(file('logo.png', 'image/png', png()))).toEqual({
      extension: '.png',
      mimeType: 'image/png',
    });
  });

  it('accepts a JPEG with matching extension and content type', () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01,
      0x01, 0x01, 0x11, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00,
      0x00, 0x3f, 0x00, 0x00, 0xff, 0xd9,
    ]);
    expect(
      validateWorkspaceLogo(file('logo.jpeg', 'image/jpeg', jpeg)),
    ).toEqual({ extension: '.jpg', mimeType: 'image/jpeg' });
  });

  it('rejects mismatched, unsupported, oversized, and malformed images', () => {
    expect(() =>
      validateWorkspaceLogo(file('logo.png', 'image/jpeg', png())),
    ).toThrow('valid PNG or JPEG');
    expect(() =>
      validateWorkspaceLogo(file('logo.svg', 'image/svg+xml', Buffer.from('<svg/>'))),
    ).toThrow('valid PNG or JPEG');
    expect(() =>
      validateWorkspaceLogo(
        file('logo.png', 'image/png', Buffer.alloc(5 * 1024 * 1024 + 1)),
      ),
    ).toThrow('no larger than 5 MB');
    expect(() =>
      validateWorkspaceLogo(file('logo.png', 'image/png', Buffer.from('not an image'))),
    ).toThrow('valid PNG or JPEG');
  });
});
