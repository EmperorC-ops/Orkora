import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { StorageService } from './storage.service';
import type { UploadKind } from './dto/upload.dto';

/** Still-image types accepted for campaign flyers. */
const FLYER_TYPES = /^image\/(png|jpeg|jpg|webp)$/i;
/** Per-flyer ceiling, below the general MAX_UPLOAD_BYTES. */
export const FLYER_MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class UploadsService {
  /**
   * Server-side ceiling on direct-to-S3 uploads, sourced from
   * `MAX_UPLOAD_BYTES`. We enforce this once at presign time, then sign
   * Content-Length as a required header in the resulting URL so the signed
   * URL is single-use for that exact byte count.
   */
  private readonly maxUploadBytes: number;

  constructor(
    private readonly storage: StorageService,
    cfg: ConfigService,
  ) {
    this.maxUploadBytes = cfg.get<number>('MAX_UPLOAD_BYTES') ?? 8 * 1024 * 1024;
  }

  async presign(input: {
    kind: UploadKind;
    filename: string;
    contentType: string;
    sizeBytes: number;
    userId: string;
  }) {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException(
        'File uploads are not configured on this server. Add S3 env keys and restart.',
      );
    }

    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1) {
      throw new BadRequestException('sizeBytes must be a positive integer');
    }
    if (input.sizeBytes > this.maxUploadBytes) {
      throw new PayloadTooLargeException(
        `Upload exceeds the ${formatBytes(this.maxUploadBytes)} limit ` +
          `(requested ${formatBytes(input.sizeBytes)}).`,
      );
    }

    // Campaign flyers are shown inline in bulk email: still images only (no
    // video, no GIF animation), and a tighter size cap so a flyer stays quick
    // to load on mobile data for every recipient.
    if (input.kind === 'campaign_flyer') {
      if (!FLYER_TYPES.test(input.contentType)) {
        throw new BadRequestException('A flyer must be a PNG, JPEG, or WEBP image.');
      }
      if (input.sizeBytes > FLYER_MAX_BYTES) {
        throw new PayloadTooLargeException(
          `A flyer can be at most ${formatBytes(FLYER_MAX_BYTES)} ` +
            `(this one is ${formatBytes(input.sizeBytes)}).`,
        );
      }
    }

    const ext = inferExtension(input.filename, input.contentType);
    if (!ext) throw new BadRequestException('Could not infer file extension');

    const key = `${input.kind}s/${input.userId}/${randomUUID()}.${ext}`;
    // Gated recordings go to the private recordings bucket when one is
    // configured; everything else (and recordings when no private bucket is
    // set) uses the default public media bucket.
    const bucket =
      input.kind === 'recording' ? this.storage.recordingsBucketName ?? undefined : undefined;
    const { uploadUrl, publicUrl } = await this.storage.presignUpload({
      key,
      contentType: input.contentType,
      contentLength: input.sizeBytes,
      bucket,
    });
    return {
      key,
      uploadUrl,
      publicUrl,
      contentType: input.contentType,
      contentLength: input.sizeBytes,
    };
  }
}

function inferExtension(filename: string, contentType: string): string | null {
  // Prefer the content type since the user-supplied filename can be
  // anything. Fall back to the filename extension for edge cases.
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const mapped = map[contentType.toLowerCase()];
  if (mapped) return mapped;
  const fromName = filename.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  if (fromName) return fromName;
  return null;
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
