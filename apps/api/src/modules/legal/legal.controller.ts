import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import {
  LEGAL_ACCEPTANCE_SOURCES,
  LEGAL_DOCUMENTS,
  type LegalAcceptanceSource,
  type LegalDocument,
} from '../../common/legal-versions';
import { LegalService } from './legal.service';

class AcceptItemDto {
  @IsIn(LEGAL_DOCUMENTS as unknown as string[])
  document!: LegalDocument;

  @IsString()
  @MaxLength(20)
  version!: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

class AcceptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AcceptItemDto)
  documents!: AcceptItemDto[];

  @IsOptional()
  @IsIn(LEGAL_ACCEPTANCE_SOURCES as unknown as string[])
  source?: LegalAcceptanceSource;
}

/**
 * Clickwrap acceptance of the Terms, Privacy Policy and Organizer Agreement.
 * `versions` is public so the signup page can show what is being accepted;
 * the rest needs a signed-in user.
 */
@ApiTags('legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('versions')
  versions() {
    return this.legal.versions();
  }

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  status(@CurrentUser() user: AuthUser) {
    return this.legal.status(user.userId);
  }

  @Post('accept')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  accept(@Body() dto: AcceptDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.legal.accept(user.userId, dto.documents, {
      source: dto.source ?? 'prompt',
      // Behind Render's proxy req.ip is the proxy; the client is the first
      // X-Forwarded-For entry.
      ip:
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
        req.ip ||
        null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });
  }
}
