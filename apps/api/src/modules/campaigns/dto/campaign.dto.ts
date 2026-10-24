import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  previewText?: string;

  @IsString()
  @MinLength(1)
  bodyMarkdown!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fromName!: string;

  @IsEmail()
  fromEmail!: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @IsUUID()
  audienceId!: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  // Optional inline flyer image. Must be on our media host (checked in the
  // service against S3_PUBLIC_BASE_URL); see campaigns/flyer.ts.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  flyerUrl?: string;

  // Optional PDF (newsletter). Must be one of our uploaded PDFs; checked in
  // the service, including the file signature. See campaigns/document.ts.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  documentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  documentName?: string;
}

export class PatchCampaignDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(200) previewText?: string;
  @IsOptional() @IsString() bodyMarkdown?: string;
  @IsOptional() @IsString() @MaxLength(120) fromName?: string;
  @IsOptional() @IsEmail() fromEmail?: string;
  @IsOptional() @IsEmail() replyTo?: string;
  @IsOptional() @IsUUID() audienceId?: string;
  // Editing a draft can switch it to another event (with that event's audience).
  @IsOptional() @IsUUID() eventId?: string;
  // null removes the flyer; a string replaces it (host-checked in the service).
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(500) flyerUrl?: string | null;
  // null removes the PDF document; a string replaces it (checked in the service).
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(500) documentUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(300) documentName?: string;
}

export class ScheduleCampaignDto {
  @IsISO8601()
  scheduledAt!: string;
}

export class TestSendDto {
  @IsEmail()
  email!: string;
}

export class CreateAudienceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsIn(['smart', 'custom'])
  kind!: 'smart' | 'custom';

  /**
   * For kind=smart: which preset to materialise. Slice A supports
   * `all-registrations`; Slice B adds `checked-in`, `tier:<id>`, etc.
   */
  @ValidateIf((o) => o.kind === 'smart')
  @IsString()
  smartKey?: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;
}
