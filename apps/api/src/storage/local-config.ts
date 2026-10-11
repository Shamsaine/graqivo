import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
config({ path: '../../.env', quiet: true });
const accessKey = process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER;
const secretKey =
  process.env.S3_SECRET_ACCESS_KEY ?? process.env.MINIO_ROOT_PASSWORD;
if (
  !accessKey ||
  !secretKey ||
  secretKey.length < 8 ||
  /REPLACE_WITH/.test(secretKey)
)
  throw new Error('Configure local storage credentials first');
const directory = resolve(process.cwd(), '../../.local/storage');
mkdirSync(directory, { recursive: true });
writeFileSync(
  resolve(directory, 's3.json'),
  JSON.stringify({
    identities: [
      {
        name: 'graqivo-local',
        credentials: [{ accessKey, secretKey }],
        actions: ['Admin', 'Read', 'List', 'Tagging', 'Write'],
      },
    ],
  }),
);
console.log(
  'Private local S3 credentials configured; no anonymous identity enabled.',
);
