import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Thin S3 wrapper. Uses MinIO locally (via S3_ENDPOINT) and AWS S3 / R2 in
 * production with no code changes. On boot it ensures the media bucket
 * exists and is publicly readable so that direct-from-S3 image URLs work
 * without per-object signing.
 *
 * Uploads always go through a presigned PUT URL: the client uploads the
 * bytes directly to S3, the API never proxies the file.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string | null;
  private readonly publicBaseUrl: string | null;

  constructor(cfg: ConfigService) {
    const endpoint = cfg.get<string>('S3_ENDPOINT');
    const accessKeyId = cfg.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = cfg.get<string>('S3_SECRET_ACCESS_KEY');
    const region = cfg.get<string>('AWS_REGION') ?? 'us-east-1';
    const forcePathStyle = cfg.get<boolean>('S3_FORCE_PATH_STYLE') ?? true;
    this.bucket = cfg.get<string>('S3_BUCKET_MEDIA') ?? null;
    this.publicBaseUrl = cfg.get<string>('S3_PUBLIC_BASE_URL') ?? null;

    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      this.logger.warn(
        'S3 storage is not configured (S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_BUCKET_MEDIA). Uploads will be disabled.',
      );
      this.client = null;
      return;
    }

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
    });
  }

  get enabled(): boolean {
    return this.client !== null && this.bucket !== null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client || !this.bucket) return;
    await this.ensureBucket(this.bucket);
  }

  /**
   * Generates a presigned PUT URL the browser uploads to directly. The
   * caller is responsible for using the same Content-Type when the actual
   * upload happens (S3 verifies it against the signed URL).
   */
  async presignUpload(input: {
    key: string;
    contentType: string;
    expiresIn?: number;
  }): Promise<{ uploadUrl: string; publicUrl: string }> {
    if (!this.client || !this.bucket) {
      throw new Error('Storage is not configured');
    }
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      // Cache hard. Object keys are content-derived UUIDs, so the URL is
      // immutable for our purposes.
      CacheControl: 'public, max-age=31536000, immutable',
    });
    const uploadUrl = await getSignedUrl(this.client, cmd, {
      expiresIn: input.expiresIn ?? 60 * 5,
    });
    return { uploadUrl, publicUrl: this.publicUrlFor(input.key) };
  }

  publicUrlFor(key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${encodeURI(key)}`;
    }
    if (!this.bucket) return key;
    return `${this.bucket}/${encodeURI(key)}`;
  }

  private async ensureBucket(name: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: name }));
      this.logger.log(`Media bucket ${name} is reachable`);
    } catch {
      this.logger.log(`Creating media bucket ${name}`);
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: name }));
      } catch (err) {
        this.logger.warn({ err }, `Could not create media bucket ${name}`);
        return;
      }
    }
    // Public-read policy so direct image URLs render without per-object
    // signing. Only object reads are public; uploads still require a
    // presigned URL.
    try {
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: name,
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: '*',
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${name}/*`],
              },
            ],
          }),
        }),
      );
    } catch (err) {
      this.logger.debug({ err }, 'Bucket public-read policy could not be applied (non-fatal)');
    }
  }
}
