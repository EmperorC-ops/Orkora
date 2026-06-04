import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { PresignUploadDto } from './dto/upload.dto';
import { UploadsService } from './uploads.service';

/**
 * Presigned-upload flow:
 *   1. Client calls POST /v1/uploads/presign with
 *      { kind, filename, contentType, sizeBytes }.
 *   2. API enforces sizeBytes <= MAX_UPLOAD_BYTES and returns
 *      { uploadUrl, publicUrl, contentLength }. Content-Length is part of
 *      the signature, so the URL is single-use for that exact byte count.
 *   3. Client PUTs the file bytes to uploadUrl with the same Content-Type
 *      AND the same Content-Length. Any deviation makes S3 reject the PUT.
 *   4. Client persists publicUrl on the parent resource (event banner,
 *      speaker avatar, organization logo, ...).
 */
@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('presign')
  presign(@Body() dto: PresignUploadDto, @CurrentUser() user: AuthUser) {
    return this.uploads.presign({
      kind: dto.kind,
      filename: dto.filename,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      userId: user.userId,
    });
  }
}
