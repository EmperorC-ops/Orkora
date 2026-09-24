import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export type EventKind = 'physical' | 'virtual' | 'hybrid';
export type EventStatus = 'draft' | 'published' | 'live' | 'ended' | 'archived';

// Topic categories for discovery/SEO. Slugs, stable, used in public browse URLs.
export const EVENT_CATEGORIES = [
  'music',
  'tech',
  'business',
  'arts-culture',
  'food-drink',
  'faith',
  'sports-fitness',
  'wellness',
  'education',
  'community',
  'fashion',
  'comedy',
  'film',
  'other',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export class CreateEventDto {
  @IsString()
  @Length(3, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @IsEnum(['physical', 'virtual', 'hybrid'])
  kind!: EventKind;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsUrl({ require_tld: false })
  bannerUrl?: string;

  @IsOptional()
  @IsObject()
  theme?: Record<string, unknown>;

  @IsOptional()
  @IsIn(EVENT_CATEGORIES as unknown as string[])
  category?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  city?: string | null;

  // Deep shape (types, required, options) validated by the RegistrationForm
  // zod schema in the service. `@Type(() => Object)` is load-bearing: without
  // it, the ValidationPipe's enableImplicitConversion coerces each item to []
  // (the same trap documented on UpdateStoryDto.blocks).
  @IsOptional()
  @IsArray()
  @Type(() => Object)
  registrationFields?: unknown[];

  // Hide the boilerplate intro above the custom questions on the register form.
  @IsOptional()
  @IsBoolean()
  registrationIntroHidden?: boolean;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @Length(3, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @IsOptional()
  @IsEnum(['physical', 'virtual', 'hybrid'])
  kind?: EventKind;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsUrl({ require_tld: false })
  bannerUrl?: string;

  @IsOptional()
  @IsObject()
  theme?: Record<string, unknown>;

  @IsOptional()
  @IsIn(EVENT_CATEGORIES as unknown as string[])
  category?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  city?: string | null;

  @IsOptional()
  @IsArray()
  @Type(() => Object)
  registrationFields?: unknown[];

  @IsOptional()
  @IsBoolean()
  registrationIntroHidden?: boolean;
}

// === Story Mode ===

export class UpdateStoryDto {
  @IsOptional()
  @IsEnum(['classic', 'editorial', 'cinematic', 'underground', 'runway'])
  template?: string;

  // Deep shape validated in the service via the Story composition zod schema.
  //
  // `@Type(() => Object)` is load-bearing, not decoration. The global
  // ValidationPipe runs with transformOptions.enableImplicitConversion, and for
  // a property whose only reflected design:type is `Array`, class-transformer
  // applies that same `Array` type to every ITEM. Each block object is then
  // coerced into `[]`, so the service receives `[[]]` and the zod schema
  // rejects it as "Invalid story composition". Naming the item type stops the
  // coercion. An empty blocks array is unaffected, which is exactly why this
  // presented as a content bug rather than a transport one: every save with any
  // content failed, and only an empty composition got through.
  @IsArray()
  @Type(() => Object)
  blocks!: unknown[];
}

export class StoryAnalyticsEventDto {
  @IsEnum(['event_view', 'block_viewed', 'scroll_depth', 'tickets_scrolled_to'])
  kind!: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  blockType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  blockIndex?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  depthPercent?: number;
}

export class StoryAnalyticsBatchDto {
  @IsOptional()
  @IsString()
  @Length(0, 64)
  visitor?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StoryAnalyticsEventDto)
  events!: StoryAnalyticsEventDto[];
}

// === Sessions / Tracks / Speakers ===

export class CreateTrackDto {
  @IsString()
  @Length(1, 60)
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateTrackDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class CreateSessionDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @IsOptional()
  @IsString()
  trackId?: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  streamUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  requiresRsvp?: boolean;
}

export class UpdateSessionDto {
  @IsOptional() @IsString() @Length(2, 200) title?: string;
  @IsOptional() @IsString() @Length(0, 4000) description?: string;
  @IsOptional() @IsString() trackId?: string | null;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsUrl({ require_tld: false }) streamUrl?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() requiresRsvp?: boolean;
}

export class CreateSpeakerDto {
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  bio?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  avatarUrl?: string;

  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}

// Every field optional so an organiser can edit any subset of a speaker.
export class UpdateSpeakerDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  fullName?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  bio?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  avatarUrl?: string;

  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}

// === Tickets ===

export class CreateTicketTierDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsInt()
  @Min(0)
  priceMinor!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantityTotal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minPerOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerOrder?: number;

  @IsOptional()
  @IsDateString()
  saleStartsAt?: string;

  @IsOptional()
  @IsDateString()
  saleEndsAt?: string;

  @IsOptional()
  isGroup?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  groupSize?: number;

  @IsOptional()
  @IsInt()
  position?: number;
}

export class UpdateTicketTierDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsString() @Length(0, 1000) description?: string;
  @IsOptional() @IsInt() @Min(0) priceMinor?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsInt() @Min(1) quantityTotal?: number;
  @IsOptional() @IsInt() @Min(1) minPerOrder?: number;
  @IsOptional() @IsInt() @Min(1) maxPerOrder?: number;
  @IsOptional() @IsDateString() saleStartsAt?: string;
  @IsOptional() @IsDateString() saleEndsAt?: string;
  @IsOptional() isGroup?: boolean;
  @IsOptional() @IsInt() @Min(2) groupSize?: number;
  @IsOptional() @IsInt() position?: number;
}

export class ReorderTicketTiersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TierPosition)
  items!: TierPosition[];
}

export class TierPosition {
  @IsString()
  id!: string;

  @IsInt()
  position!: number;
}
