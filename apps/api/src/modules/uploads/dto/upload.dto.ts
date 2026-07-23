import { IsIn, IsInt, IsString, Min, MaxLength, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export const UPLOAD_KINDS = ['banner', 'avatar', 'logo', 'recording'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

// Images cover the branding kinds; video/* is allowed so the recording library
// can presign direct-to-R2 uploads of session recordings (mp4/webm/etc).
const ALLOWED_TYPES = /^(image\/(png|jpeg|jpg|webp|gif)|video\/[a-z0-9.+-]+)$/i;

/**
 * Absolute lower bound. The upper bound is enforced server-side against
 * `MAX_UPLOAD_BYTES` so it stays operator-tunable. Anything under 1 byte
 * is nonsense and is rejected at DTO time.
 */
const MIN_UPLOAD_BYTES = 1;

export class PresignUploadDto {
  @IsString()
  @IsIn(UPLOAD_KINDS as unknown as string[])
  kind!: UploadKind;

  @IsString()
  @MaxLength(160)
  filename!: string;

  @IsString()
  @Matches(ALLOWED_TYPES, {
    message:
      'contentType must be an image (png, jpeg, webp, gif) or a video/* type',
  })
  contentType!: string;

  /**
   * Exact byte length the client intends to upload. The API uses this to
   * (a) reject anything above `MAX_UPLOAD_BYTES` before issuing a signed
   * URL, and (b) sign Content-Length as a required header so the resulting
   * presigned URL is single-use for that exact byte count. An attacker who
   * stole the URL cannot reuse it to upload a larger object.
   */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_UPLOAD_BYTES)
  sizeBytes!: number;
}
