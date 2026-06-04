import { IsIn, IsInt, IsString, Min, MaxLength, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export const UPLOAD_KINDS = ['banner', 'avatar', 'logo'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

const ALLOWED_TYPES = /^image\/(png|jpeg|jpg|webp|gif)$/i;

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
    message: 'contentType must be one of image/png, image/jpeg, image/webp, image/gif',
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
