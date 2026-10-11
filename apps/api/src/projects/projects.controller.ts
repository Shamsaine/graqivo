import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
  type Type,
} from '@nestjs/common';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../auth/session.guard.js';
import { ProjectsService } from './projects.service.js';
import {
  SettingsDto,
  CreateProjectDto,
  UpdateProjectDto,
  ProjectMemberDto,
} from './projects.dto.js';
const pipe = (type: Type<unknown>) =>
  new ValidationPipe({
    expectedType: type,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
@Controller('workspaces/:slug')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly service: ProjectsService,
  ) {}
  @Get('overview') overview(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.overview(slug, req.user.id);
  }
  @Get('people') people(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.people(slug, req.user.id);
  }
  @Patch('settings') settings(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(SettingsDto)) dto: SettingsDto,
  ) {
    return this.service.settings(slug, req.user.id, dto);
  }
  @Get('projects') list(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.projects(slug, req.user.id);
  }
  @Post('projects') create(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(CreateProjectDto)) dto: CreateProjectDto,
  ) {
    return this.service.save(slug, req.user.id, dto);
  }
  @Get('projects/:id') detail(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.detail(slug, id, req.user.id);
  }
  @Patch('projects/:id') update(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(UpdateProjectDto)) dto: UpdateProjectDto,
  ) {
    return this.service.save(slug, req.user.id, dto, id);
  }
  @Post('projects/:id/members') member(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(ProjectMemberDto)) dto: ProjectMemberDto,
  ) {
    return this.service.member(slug, id, req.user.id, dto);
  }
  @Delete('projects/:id/members/:memberId') remove(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Param('memberId') membershipId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.member(
      slug,
      id,
      req.user.id,
      { membershipId, role: 'CONTRIBUTOR' },
      true,
    );
  }
}
