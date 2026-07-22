import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Public feedback submission. Every field except the implicit event (resolved
 * from the URL) is optional, but the service enforces that at least one of
 * rating / npsScore / comment is present so we never store an empty row.
 *
 * `sessionId` present -> the feedback is about that session; absent -> it is
 * about the event overall. The service validates the session belongs to the
 * event before writing.
 */
export class SubmitFeedbackDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  npsScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  /** Optional: lets the organizer follow up. Never required. */
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;
}
