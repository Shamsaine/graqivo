import { z } from 'zod';
export function parseStorageEnvironment(input: Record<string, unknown>) {
  const common = z
    .object({
      STORAGE_PROVIDER: z.enum(['minio', 's3', 'r2']).default('minio'),
      STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce
        .number()
        .int()
        .min(1)
        .max(300)
        .default(120),
      MAX_UPLOAD_SIZE_MB: z.coerce.number().int().min(1).max(25).default(25),
    })
    .safeParse(input);
  if (!common.success)
    throw new Error('Invalid configuration: storage limits or provider');
  const r2 = common.data.STORAGE_PROVIDER === 'r2';
  const prefix = r2
    ? 'R2'
    : common.data.STORAGE_PROVIDER === 's3'
      ? 'S3'
      : 'MINIO';
  const values = {
    endpoint: input[prefix + '_ENDPOINT'],
    accessKeyId:
      input[
        r2
          ? 'R2_ACCESS_KEY_ID'
          : prefix === 'S3'
            ? 'S3_ACCESS_KEY_ID'
            : 'MINIO_ROOT_USER'
      ],
    secretAccessKey:
      input[
        r2
          ? 'R2_SECRET_ACCESS_KEY'
          : prefix === 'S3'
            ? 'S3_SECRET_ACCESS_KEY'
            : 'MINIO_ROOT_PASSWORD'
      ],
    bucket: input[prefix + '_BUCKET_NAME'],
    region: r2 ? 'auto' : (input.MINIO_REGION ?? 'us-east-1'),
  };
  const parsed = z
    .object({
      endpoint: z.string().url(),
      accessKeyId: z.string().min(3),
      secretAccessKey: z
        .string()
        .min(8)
        .refine((value) => !/REPLACE_WITH/i.test(value)),
      bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
      region: z.string().min(1),
    })
    .safeParse(values);
  if (!parsed.success)
    throw new Error(
      'Invalid configuration: ' +
        prefix +
        ' storage credentials, bucket or endpoint',
    );
  const url = new URL(parsed.data.endpoint);
  if (
    url.username ||
    url.password ||
    !['http:', 'https:'].includes(url.protocol) ||
    (r2 && url.protocol !== 'https:') ||
    (input.NODE_ENV === 'production' && (!r2 || url.protocol !== 'https:'))
  )
    throw new Error(
      'Invalid configuration: production storage requires R2 over HTTPS',
    );
  return {
    ...common.data,
    ...parsed.data,
    maxBytes: common.data.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  };
}
