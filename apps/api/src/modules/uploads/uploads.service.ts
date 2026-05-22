import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService } from './storage.service';
import type { UploadKind } from './dto/upload.dto';

@Injectable()
export class UploadsService {
  constructor(private readonly storage: StorageService) {}

  async presign(input: {
    kind: UploadKind;
    filename: string;
    contentType: string;
    userId: string;
  }) {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException(
        'File uploads are not configured on this server. Add S3 env keys and restart.',
      );
    }

    const ext = inferExtension(input.filename, input.contentType);
    if (!ext) throw new BadRequestException('Could not infer file extension');

    const key = `${input.kind}s/${input.userId}/${randomUUID()}.${ext}`;
    const { uploadUrl, publicUrl } = await this.storage.presignUpload({
      key,
      contentType: input.contentType,
    });
    return { key, uploadUrl, publicUrl, contentType: input.contentType };
  }
}

function inferExtension(filename: string, contentType: string): string | null {
  // Prefer the content type since the user-supplied filename can be
  // anything. Fall back to the filename extension for edge cases.
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const mapped = map[contentType.toLowerCase()];
  if (mapped) return mapped;
  const fromName = filename.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  if (fromName) return fromName;
  return null;
}
