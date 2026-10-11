import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  @Get() live() { return {status: 'ok', service: 'graqivo-api'}; }
  @Get('ready') async ready() {
    try { await this.prisma.$queryRaw`SELECT 1`; return {status: 'ok', database: 'connected'}; }
    catch { throw new ServiceUnavailableException('Database unavailable'); }
  }
}
