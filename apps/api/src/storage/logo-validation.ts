import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';
import type { UploadFile } from './file-validation.js';

const maxBytes = 5 * 1024 * 1024;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function validateWorkspaceLogo(file: UploadFile) {
  if (
    !file?.buffer ||
    !file.size ||
    file.size > maxBytes ||
    file.size !== file.buffer.length
  )
    throw new BadRequestException('Choose an image no larger than 5 MB');

  const extension = extname(file.originalname.replaceAll('\\', '/')).toLowerCase();
  const declaredMime = file.mimetype.split(';')[0].toLowerCase();
  if (
    extension === '.png' &&
    declaredMime === 'image/png' &&
    validPng(file.buffer)
  ) {
    return { extension, mimeType: declaredMime };
  }

  if (
    ['.jpg', '.jpeg'].includes(extension) &&
    declaredMime === 'image/jpeg' &&
    isValidJpeg(file.buffer)
  )
    return { extension: '.jpg', mimeType: declaredMime };

  throw new BadRequestException(
    'Logo must be a valid PNG or JPEG image with matching file extension',
  );
}

function validPng(buffer: Buffer) {
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(pngSignature))
    return false;
  let offset = 8;
  let first = true;
  let hasImageData = false;
  let dimensionsValid = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > buffer.length) return false;
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (crc32(buffer.subarray(offset + 4, dataEnd)) !== buffer.readUInt32BE(dataEnd))
      return false;
    if (first) {
      if (type !== 'IHDR' || length !== 13) return false;
      const width = buffer.readUInt32BE(dataStart);
      const height = buffer.readUInt32BE(dataStart + 4);
      if (
        width === 0 ||
        height === 0 ||
        width > 10000 ||
        height > 10000 ||
        width * height > 25000000
      )
        return false;
      dimensionsValid = true;
      first = false;
    } else if (type === 'IHDR') {
      return false;
    }
    if (type === 'IDAT') hasImageData = true;
    offset = chunkEnd;
    if (type === 'IEND')
      return (
        length === 0 &&
        offset === buffer.length &&
        hasImageData &&
        dimensionsValid
      );
  }
  return false;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isValidJpeg(buffer: Buffer) {
  if (
    buffer.length < 4 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[buffer.length - 2] !== 0xff ||
    buffer[buffer.length - 1] !== 0xd9
  )
    return false;

  let offset = 2;
  let dimensionsValid = false;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) return false;
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (marker === 0xd9) return false;
    if (
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    )
      continue;
    if (offset + 1 >= buffer.length) return false;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return false;
    if (marker === 0xda) return dimensionsValid && offset + length <= buffer.length - 2;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      if (length < 8) return false;
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      dimensionsValid =
        width > 0 &&
        height > 0 &&
        width <= 10000 &&
        height <= 10000 &&
        width * height <= 25000000;
      if (!dimensionsValid) return false;
    }
    offset += length;
  }
  return false;
}

export function storedLogoKey(value: string | null | undefined) {
  return value?.startsWith('storage://') ? value.slice('storage://'.length) : null;
}
