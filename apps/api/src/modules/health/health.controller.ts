import { Controller, Get, HttpCode } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(200)
  async check() {
    const [db] = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`]);
    return {
      status: db.status === 'fulfilled' ? 'ok' : 'degraded',
      checks: {
        database: db.status === 'fulfilled' ? 'ok' : 'down',
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
