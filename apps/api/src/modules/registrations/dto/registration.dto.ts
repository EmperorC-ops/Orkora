import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const PAYMENT_METHODS = ['free', 'stripe', 'paystack', 'flutterwave'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export class AttendeeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName!: string;

  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,30}$/)
  phone?: string;
}

export class RegisterAttendeesDto {
  @IsUUID()
  tierId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AttendeeDto)
  attendees!: AttendeeDto[];

  @IsOptional()
  @IsString()
  @IsIn(PAYMENT_METHODS as unknown as string[])
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsObject()
  formResponses?: Record<string, unknown>;
}

export class RegistrationListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  q?: string;
}

export class OrgRegistrationListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @Type(() => Number)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  skip?: number;
}

export class OrgAttendeeListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['name', 'events', 'spent'])
  sort?: 'name' | 'events' | 'spent';

  @IsOptional()
  @Type(() => Number)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  skip?: number;
}
