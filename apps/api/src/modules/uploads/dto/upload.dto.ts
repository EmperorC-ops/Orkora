import { IsIn, IsString, MaxLength, Matches } from 'class-validator';

export const UPLOAD_KINDS = ['banner', 'avatar', 'logo'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

const ALLOWED_TYPES = /^image\/(png|jpeg|jpg|webp|gif)$/i;

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
}
