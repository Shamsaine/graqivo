import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  GetBucketPolicyCommand,
  DeleteBucketPolicyCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { parseStorageEnvironment } from './storage-environment.js';
@Injectable()
export class StorageService {
  readonly config = parseStorageEnvironment(process.env);
  readonly client = new S3Client({
    endpoint: this.config.endpoint,
    region: this.config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
    },
    maxAttempts: 2,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  async provision() {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
      );
    } catch (error) {
      if (
        (error as { $metadata?: { httpStatusCode: number } }).$metadata
          ?.httpStatusCode !== 404
      )
        throw new Error(
          'Storage bucket unavailable; check credentials and service',
        );
      await this.client.send(
        new CreateBucketCommand({ Bucket: this.config.bucket }),
      );
    }
    if (
      this.config.STORAGE_PROVIDER === 'minio' ||
      this.config.STORAGE_PROVIDER === 's3'
    ) {
      try {
        const policy = await this.client.send(
          new GetBucketPolicyCommand({ Bucket: this.config.bucket }),
        );
        if (policy.Policy)
          await this.client.send(
            new DeleteBucketPolicyCommand({ Bucket: this.config.bucket }),
          );
      } catch (error) {
        if (
          !['NoSuchBucketPolicy', 'NoSuchBucketPolicyException'].includes(
            (error as Error).name,
          )
        )
          throw new Error('Private bucket policy verification failed');
      }
    }
  }
  async put(key: string, body: Buffer, mime: string, fileName: string) {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: mime,
          ContentDisposition:
            'attachment; filename="' +
            fileName.replace(/[^a-zA-Z0-9._-]/g, '_') +
            '"',
          CacheControl: 'private, no-store',
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Private storage is unavailable. Retry this upload.',
      );
    }
  }
  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
  }
  async exists(key: string) {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      return true;
    } catch {
      return false;
    }
  }
  async download(key: string, fileName: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ResponseContentType: 'application/octet-stream',
        ResponseContentDisposition:
          "attachment; filename*=UTF-8''" + encodeURIComponent(fileName),
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: this.config.STORAGE_SIGNED_URL_TTL_SECONDS },
    );
  }
}
