import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadsService } from './uploads.service';
import { StorageService } from './storage.service';

/**
 * Tests for the upload presign size gate. The storage layer is stubbed so
 * we can focus on the input-validation surface.
 */
describe('UploadsService.presign size enforcement', () => {
  function makeService(maxBytes: number) {
    const storage = {
      enabled: true,
      presignUpload: jest.fn().mockResolvedValue({
        uploadUrl: 'https://r2.example/up',
        publicUrl: 'https://cdn.example/x.jpg',
      }),
    } as unknown as StorageService;
    const cfg = {
      get: jest.fn((k: string) => (k === 'MAX_UPLOAD_BYTES' ? maxBytes : undefined)),
    } as unknown as ConfigService;
    return new UploadsService(storage, cfg);
  }

  const okInput = {
    kind: 'banner' as const,
    filename: 'b.jpg',
    contentType: 'image/jpeg',
    userId: 'u-1',
  };

  it('issues a signed URL when sizeBytes is within the limit', async () => {
    const svc = makeService(8 * 1024 * 1024);
    const out = await svc.presign({ ...okInput, sizeBytes: 1_000_000 });
    expect(out).toEqual(
      expect.objectContaining({
        uploadUrl: expect.any(String),
        publicUrl: expect.any(String),
        contentType: 'image/jpeg',
        contentLength: 1_000_000,
      }),
    );
  });

  it('rejects when sizeBytes exceeds MAX_UPLOAD_BYTES', async () => {
    const svc = makeService(1_000_000);
    await expect(
      svc.presign({ ...okInput, sizeBytes: 2_000_000 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('rejects when sizeBytes is zero or negative', async () => {
    const svc = makeService(8 * 1024 * 1024);
    await expect(
      svc.presign({ ...okInput, sizeBytes: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.presign({ ...okInput, sizeBytes: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('passes contentLength through to the storage layer so the signed URL embeds it', async () => {
    const presignUpload = jest.fn().mockResolvedValue({
      uploadUrl: 'u',
      publicUrl: 'p',
    });
    const storage = { enabled: true, presignUpload } as unknown as StorageService;
    const cfg = {
      get: jest.fn().mockReturnValue(8 * 1024 * 1024),
    } as unknown as ConfigService;
    const svc = new UploadsService(storage, cfg);

    await svc.presign({ ...okInput, sizeBytes: 5_000 });

    expect(presignUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentLength: 5_000 }),
    );
  });

  // Campaign flyers go inline into bulk email: still images only, 5 MB cap,
  // stored under campaign_flyers/ (the prefix the campaign host check expects).
  describe('campaign_flyer', () => {
    const flyer = {
      kind: 'campaign_flyer' as const,
      filename: 'flyer.png',
      contentType: 'image/png',
      userId: 'u-1',
    };

    it('accepts a PNG flyer and stores it under campaign_flyers/', async () => {
      const presignUpload = jest.fn().mockResolvedValue({ uploadUrl: 'u', publicUrl: 'p' });
      const storage = { enabled: true, presignUpload } as unknown as StorageService;
      const cfg = { get: jest.fn().mockReturnValue(8 * 1024 * 1024) } as unknown as ConfigService;
      const svc = new UploadsService(storage, cfg);
      await svc.presign({ ...flyer, sizeBytes: 2_000_000 });
      expect(presignUpload).toHaveBeenCalledWith(
        expect.objectContaining({ key: expect.stringMatching(/^campaign_flyers\/u-1\/.+\.png$/) }),
      );
    });

    it('rejects a GIF or a video as a flyer', async () => {
      const svc = makeService(8 * 1024 * 1024);
      await expect(
        svc.presign({ ...flyer, contentType: 'image/gif', filename: 'f.gif', sizeBytes: 1_000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        svc.presign({ ...flyer, contentType: 'video/mp4', filename: 'f.mp4', sizeBytes: 1_000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a flyer over 5 MB even when the general limit is higher', async () => {
      const svc = makeService(8 * 1024 * 1024);
      await expect(
        svc.presign({ ...flyer, sizeBytes: 6 * 1024 * 1024 }),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
    });
  });
});
