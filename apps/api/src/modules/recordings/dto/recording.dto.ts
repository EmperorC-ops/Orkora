import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Recording sources and visibility levels. Kept as literal arrays so the DTO
 * validation and the service share one source of truth.
 *
 * source:
 *   'link'   -> external URL (YouTube / Vimeo / HLS). `url` is required.
 *   'upload' -> a file already presigned+PUT to R2. `storageKey` is required.
 *
 * visibility:
 *   'public' -> anyone can watch.
 *   'ticket' -> any valid issued ticket for the event.
 *   'tier'   -> a ticket whose tierId matches `requiredTierId`.
 */
export const RECORDING_SOURCES = ['link', 'upload'] as const;
export const RECORDING_VISIBILITIES = ['public', 'ticket', 'tier'] as const;

export type RecordingSource = (typeof RECORDING_SOURCES)[number];
export type RecordingVisibility = (typeof RECORDING_VISIBILITIES)[number];

export class CreateRecordingDto {
  /** Optional session this recording belongs to. Validated against the event. */
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsString()
  @IsIn(RECORDING_SOURCES as unknown as string[])
  source!: RecordingSource;

  /** Required when source is 'link'. TLD not required so localhost/dev URLs pass. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url?: string;

  /** Required when source is 'upload'. The R2 object key from the presign flow. */
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  storageKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationSec?: number;

  @IsString()
  @IsIn(RECORDING_VISIBILITIES as unknown as string[])
  visibility!: RecordingVisibility;

  /** Required when visibility is 'tier'. Validated against the event's tiers. */
  @IsOptional()
  @IsUUID()
  requiredTierId?: string;

  /** Convenience: when true the service stamps publishedAt to now. */
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class UpdateRecordingDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(RECORDING_SOURCES as unknown as string[])
  source?: RecordingSource;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  storageKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationSec?: number;

  @IsOptional()
  @IsString()
  @IsIn(RECORDING_VISIBILITIES as unknown as string[])
  visibility?: RecordingVisibility;

  @IsOptional()
  @IsUUID()
  requiredTierId?: string;

  /** Toggle publish state. true -> publishedAt now; false -> publishedAt null. */
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
