import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  MaxLength,
} from 'class-validator';

export const DISCOUNT_KINDS = ['percent', 'fixed'] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

/**
 * Create a discount code for an event. `code` is normalised to uppercase and
 * trimmed in the service, so the DTO only enforces length here. `value` means
 * a percentage (1..100) for kind 'percent' and an amount in minor units for
 * kind 'fixed'; the service applies the tighter percent ceiling. `currency`
 * is only meaningful for fixed codes (the currency the amount is in); leaving
 * it unset makes a fixed code apply to any currency.
 */
export class CreateDiscountCodeDto {
  @IsString()
  @Length(2, 40)
  code!: string;

  @IsIn(DISCOUNT_KINDS as unknown as string[])
  kind!: DiscountKind;

  @IsInt()
  @Min(1)
  value!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Patch an existing discount code. Every field is optional. */
export class UpdateDiscountCodeDto {
  @IsOptional()
  @IsString()
  @Length(2, 40)
  code?: string;

  @IsOptional()
  @IsIn(DISCOUNT_KINDS as unknown as string[])
  kind?: DiscountKind;

  @IsOptional()
  @IsInt()
  @Min(1)
  value?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * Public validation payload from the register page. `code` is the discount
 * code entered by the buyer (the service uppercases it); `tierId` is the
 * selected ticket tier and `quantity` the number of attendees, which together
 * fix the subtotal the discount applies to.
 */
export class ValidateDiscountDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsUUID()
  tierId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
