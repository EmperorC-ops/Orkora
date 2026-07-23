import {
  CreateBucketCommand,
  GetObjectCommand,
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
  /**
   * Optional PRIVATE bucket for gated recordings. When set (and distinct from
   * the public media bucket), uploaded recordings land here with no public-read
   * policy and are served via short-lived signed GET URLs, so a leaked URL
   * expires instead of granting permanent access. When unset, recordings fall
   * back to the public media bucket (best-effort gating, the pre-fix behavior).
   */
  private readonly recordingsBucket: string | null;

  constructor(cfg: ConfigService) {
    const endpoint = cfg.get<string>('S3_ENDPOINT');
    const accessKeyId = cfg.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = cfg.get<string>('S3_SECRET_ACCESS_KEY');
    const region = cfg.get<string>('AWS_REGION') ?? 'us-east-1';
    const forcePathStyle = cfg.get<boolean>('S3_FORCE_PATH_STYLE') ?? true;
    this.bucket = cfg.get<string>('S3_BUCKET_MEDIA') ?? null;
    this.publicBaseUrl = cfg.get<string>('S3_PUBLIC_BASE_URL') ?? null;
    this.recordingsBucket = cfg.get<string>('S3_BUCKET_RECORDINGS') ?? null;

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
      // Cloudflare R2 rejects the CRC32 checksum that aws-sdk v3 (>=3.729)
      // now adds to PutObject by default, which makes presigned PUTs fail
      // with a 503. Only attach checksums when a command explicitly needs
      // them so presigned URLs stay R2-compatible.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  get enabled(): boolean {
    return this.client !== null && this.bucket !== null;
  }

  /**
   * True when a dedicated private recordings bucket is configured (and it is
   * not just the public media bucket). Recordings then upload to it and are
   * played back through signed, expiring URLs.
   */
  get recordingsPrivate(): boolean {
    return (
      this.client !== null &&
      this.recordingsBucket !== null &&
      this.recordingsBucket !== this.bucket
    );
  }

  /** The bucket recording uploads should target, or null to use the default. */
  get recordingsBucketName(): string | null {
    return this.recordingsPrivate ? this.recordingsBucket : null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client || !this.bucket) return;
    await this.ensureBucket(this.bucket, { publicRead: true });
    // A dedicated recordings bucket must stay PRIVATE (no public-read policy),
    // otherwise the signed-URL gating would be pointless.
    if (this.recordingsPrivate && this.recordingsBucket) {
      await this.ensureBucket(this.recordingsBucket, { publicRead: false });
    }
  }

  /**
   * Generates a presigned PUT URL the browser uploads to directly. The
   * caller is responsible for using the same Content-Type when the actual
   * upload happens (S3 verifies it against the signed URL).
   */
  async presignUpload(input: {
    key: string;
    contentType: string;
    /**
     * Exact byte length the client will upload. When set, the resulting
     * presigned URL signs `Content-Length` as a required header, so an
     * attacker who stole the URL cannot reuse it to upload an object of a
     * different size. The client MUST send the same Content-Length on the
     * PUT or S3 rejects with 403 SignatureDoesNotMatch.
     */
    contentLength?: number;
    expiresIn?: number;
    /**
     * Target bucket. Defaults to the public media bucket. Callers pass the
     * private recordings bucket for gated video. When the target is not the
     * public media bucket we return `publicUrl: null` because a private object
     * has no reachable public URL (playback uses a signed URL instead).
     */
    bucket?: string;
  }): Promise<{ uploadUrl: string; publicUrl: string | null }> {
    if (!this.client || !this.bucket) {
      throw new Error('Storage is not configured');
    }
    const targetBucket = input.bucket ?? this.bucket;
    const isPublicBucket = targetBucket === this.bucket;
    const cmd = new PutObjectCommand({
      Bucket: targetBucket,
      Key: input.key,
      ContentType: input.contentType,
      // When the caller declares an exact size, embed it as ContentLength
      // so it becomes part of the signed canonical request. S3 (and R2)
      // will reject a PUT whose actual content-length differs from the
      // signed value, which is the property we want.
      ...(input.contentLength !== undefined ? { ContentLength: input.contentLength } : {}),
      // Cache hard. Object keys are content-derived UUIDs, so the URL is
      // immutable for our purposes.
      CacheControl: 'public, max-age=31536000, immutable',
    });
    const uploadUrl = await getSignedUrl(this.client, cmd, {
      expiresIn: input.expiresIn ?? 60 * 5,
      // Belt-and-braces: ask the signer to treat content-length as a
      // signable header even if the underlying SDK version does not
      // include it by default for PutObject. R2 + S3 both honour this.
      signableHeaders:
        input.contentLength !== undefined ? new Set(['content-length']) : undefined,
    });
    return {
      uploadUrl,
      publicUrl: isPublicBucket ? this.publicUrlFor(input.key) : null,
    };
  }

  /**
   * Presigned GET URL for a private object, valid for a short window. Used to
   * play back gated recordings that live in the private recordings bucket, so a
   * shared link stops working once the URL expires.
   */
  async getSignedDownloadUrl(input: {
    key: string;
    bucket?: string;
    expiresIn?: number;
  }): Promise<string> {
    if (!this.client || !this.bucket) {
      throw new Error('Storage is not configured');
    }
    const cmd = new GetObjectCommand({
      Bucket: input.bucket ?? this.bucket,
      Key: input.key,
    });
    return getSignedUrl(this.client, cmd, {
      expiresIn: input.expiresIn ?? 60 * 60 * 6, // 6 hours
    });
  }

  /**
   * Resolve the playback URL for an uploaded recording. When a private
   * recordings bucket is configured we hand back a short-lived signed URL;
   * otherwise we fall back to the public media URL (the pre-fix behavior, which
   * gates only at hand-out time).
   */
  async recordingPlaybackUrl(storageKey: string): Promise<string> {
    if (this.recordingsPrivate && this.recordingsBucket) {
      return this.getSignedDownloadUrl({
        key: storageKey,
        bucket: this.recordingsBucket,
      });
    }
    return this.publicUrlFor(storageKey);
  }

  publicUrlFor(key: string): string {
    // The returned string must be a well-formed URL because downstream
    // consumers (event.bannerUrl, org.logoUrl, speaker.avatarUrl) validate
    // it with class-validator's @IsUrl. If we return a bare "bucket/key"
    // path the caller silently 400s and the client sees an unsaved banner
    // - exactly the incident that surfaced when S3_PUBLIC_BASE_URL was
    // left blank on prod Render.
    if (this.publicBaseUrl) {
      const base = this.publicBaseUrl.replace(/\/$/, '');
      // Reject configured base URLs that would still generate an invalid
      // URL (e.g. missing scheme). Fail loudly at presign rather than
      // pushing a malformed URL to the DB.
      if (!/^https?:\/\//i.test(base)) {
        throw new Error(
          `S3_PUBLIC_BASE_URL must start with http:// or https:// (got: "${base}")`,
        );
      }
      return `${base}/${encodeURI(key)}`;
    }
    // No public base URL configured. Refuse to return a schemeless string
    // that will break @IsUrl validation on the caller. The operator must
    // set S3_PUBLIC_BASE_URL to the R2 custom domain or the R2 dev URL.
    throw new Error(
      'S3_PUBLIC_BASE_URL is not configured. Set it to your R2 custom ' +
        'domain (e.g. https://cdn.orkora.events) or the R2 dev URL ' +
        '(e.g. https://<bucket-id>.r2.dev) so uploaded assets have a ' +
        'reachable public URL.',
    );
  }

  private async ensureBucket(
    name: string,
    opts: { publicRead: boolean } = { publicRead: true },
  ): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: name }));
      this.logger.log(`Bucket ${name} is reachable`);
    } catch {
      this.logger.log(`Creating bucket ${name}`);
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: name }));
      } catch (err) {
        this.logger.warn({ err }, `Could not create bucket ${name}`);
        return;
      }
    }
    // A private bucket (recordings) gets no public-read policy, so its objects
    // are only reachable via signed URLs.
    if (!opts.publicRead) {
      this.logger.log(`Bucket ${name} kept private (signed-URL access only)`);
      return;
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
