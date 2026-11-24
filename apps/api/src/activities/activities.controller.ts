import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../auth/session.guard.js';
import { ActivitiesService } from './activities.service.js';
import { ActivityQuery } from './activities.dto.js';
@Controller('workspaces/:slug/activities')
@UseGuards(SessionGuard)
export class ActivitiesController {
  constructor(
    @Inject(ActivitiesService) private readonly service: ActivitiesService,
  ) {}
  @Get() list(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
    @Query(
      new ValidationPipe({
        expectedType: ActivityQuery,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: ActivityQuery,
  ) {
    return this.service.list(slug, req.user.id, query);
  }
}
