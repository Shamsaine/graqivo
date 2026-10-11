import { BadRequestException } from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import yauzl from 'yauzl';
import { basename, extname } from 'node:path';
export interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
const office: Record<
  string,
  { mime: string; entry: string; type: ResourceType }
> = {
  '.docx': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    entry: 'word/document.xml',
    type: 'DOCUMENT',
  },
  '.xlsx': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    entry: 'xl/workbook.xml',
    type: 'SHEET',
  },
  '.pptx': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    entry: 'ppt/presentation.xml',
    type: 'PRESENTATION',
  },
};
async function validOffice(buffer: Buffer, expected: string) {
  return new Promise<boolean>((resolve) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) {
          resolve(false);
          return;
        }
        let count = 0,
          total = 0,
          content = false,
          entry = false,
          finished = false;
        const finish = (ok: boolean) => {
          if (!finished) {
            finished = true;
            zip.close();
            resolve(ok);
          }
        };
        zip.on('error', () => finish(false));
        zip.on('end', () => finish(content && entry));
        zip.on('entry', (item) => {
          count++;
          total += item.uncompressedSize;
          if (
            count > 5000 ||
            total > 200 * 1024 * 1024 ||
            item.generalPurposeBitFlag & 1 ||
            /(^|\/)\.\.(\/|$)|vbaProject\.bin$/i.test(item.fileName)
          ) {
            finish(false);
            return;
          }
          if (item.fileName === '[Content_Types].xml') content = true;
          if (item.fileName === expected) entry = true;
          zip.readEntry();
        });
        zip.readEntry();
      },
    );
  });
}
export async function validateUpload(file: UploadFile, maxBytes: number) {
  if (
    !file?.buffer ||
    !file.size ||
    file.size > maxBytes ||
    file.size !== file.buffer.length
  )
    throw new BadRequestException(
      'Upload an allowed file within the size limit',
    );
  const name = basename(file.originalname.replaceAll('\\', '/'))
    .replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, 180);
  const ext = extname(name).toLowerCase();
  let mime = '',
    type: ResourceType = 'OTHER';
  let valid = false;
  const buffer = file.buffer;
  if (office[ext]) {
    const format = office[ext];
    mime = format.mime;
    type = format.type;
    valid =
      buffer.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])) &&
      (await validOffice(buffer, format.entry));
  } else if (ext === '.pdf') {
    mime = 'application/pdf';
    type = 'PDF';
    valid =
      buffer.subarray(0, 5).toString() === '%PDF-' &&
      buffer
        .subarray(Math.max(0, buffer.length - 1024))
        .includes(Buffer.from('%%EOF'));
  } else if (ext === '.txt' || ext === '.csv') {
    mime = ext === '.csv' ? 'text/csv' : 'text/plain';
    type = ext === '.csv' ? 'SHEET' : 'DOCUMENT';
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      valid = !buffer.includes(0);
    } catch {
      valid = false;
    }
  } else if (ext === '.png') {
    mime = 'image/png';
    valid = buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  } else if (ext === '.jpg' || ext === '.jpeg') {
    mime = 'image/jpeg';
    valid =
      buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])) &&
      buffer.subarray(-2).equals(Buffer.from([255, 217]));
  }
  const declared = file.mimetype.split(';')[0].toLowerCase();
  if (
    !valid ||
    ![
      mime,
      'application/octet-stream',
      ...(ext === '.csv' ? ['application/vnd.ms-excel'] : []),
    ].includes(declared)
  )
    throw new BadRequestException(
      'File content, extension, or content type is not allowed',
    );
  return { fileName: name, mimeType: mime, type, size: file.size };
}
