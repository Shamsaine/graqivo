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
  UseInterceptors,
  UploadedFile,
  ValidationPipe,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../auth/session.guard.js';
import { WorkspacesService } from './workspaces.service.js';
import type { UploadFile } from '../storage/file-validation.js';
import {
  AcceptInvitationDto,
  ChangeRoleDto,
  CreateWorkspaceDto,
  InviteDto,
} from './workspaces.dto.js';
function dtoPipe(type: Type<unknown>) {
  return new ValidationPipe({
    expectedType: type,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}
@Controller()
@UseGuards(SessionGuard)
export class WorkspacesController {
  constructor(
    @Inject(WorkspacesService) private readonly workspaces: WorkspacesService,
  ) {}
  @Get('workspaces') list(@Req() req: AuthenticatedRequest) {
    return this.workspaces.list(req.user.id);
  }
  @Post('workspaces') create(
    @Req() req: AuthenticatedRequest,
    @Body(dtoPipe(CreateWorkspaceDto)) dto: CreateWorkspaceDto,
  ) {
    return this.workspaces.create(req.user.id, dto);
  }
  @Get('workspaces/:slug') detail(
    @Req() req: AuthenticatedRequest,
    @Param('slug') slug: string,
  ) {
    return this.workspaces.accessible(slug, req.user.id);
  }
  @Get('workspaces/:slug/members') members(
    @Req() req: AuthenticatedRequest,
    @Param('slug') slug: string,
  ) {
    return this.workspaces.members(slug, req.user.id);
  }
  @Get('workspaces/:slug/invitations') invitations(
    @Req() req: AuthenticatedRequest,
    @Param('slug') slug: string,
  ) {
    return this.workspaces.invitations(slug, req.user.id);
  }
  @Post('workspaces/:slug/invitations') invite(
    @Req() req: AuthenticatedRequest,
    @Param('slug') slug: string,
    @Body(dtoPipe(InviteDto)) dto: InviteDto,
  ) {
    return this.workspaces.invite(slug, req.user.id, dto);
  }
  @Post('invitations/accept') accept(
    @Req() req: AuthenticatedRequest,
    @Body(dtoPipe(AcceptInvitationDto)) dto: AcceptInvitationDto,
  ) {
    return this.workspaces.accept(req.user, dto.token);
  }
  @Delete('workspaces/:slug/invitations/:invitationId') revoke(
    @Req() req: AuthenticatedRequest,
    @Param('slug') slug: string,
    @Param('invitationId') id: string,
  ) {
    return this.workspaces.revokeInvitation(slug, req.user.id, id);
  }
  @Patch('workspaces/:slug/members/:membershipId/role') role(
    @Req() req: AuthenticatedRequest,
    @Param('slug') slug: string,
    @Param('membershipId') id: string,
    @Body(dtoPipe(ChangeRoleDto)) dto: ChangeRoleDto,
  ) {
    return this.workspaces.changeMember(slug, req.user.id, id, dto.role);
  }
  @Post('workspaces/:slug/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    }),
  )
  uploadLogo(
    @Req() req: AuthenticatedRequest,
    @Param('slug') slug: string,
    @UploadedFile() file: UploadFile,
  ) {
    return this.workspaces.uploadLogo(slug, req.user.id, file);
  }
  @Delete('workspaces/:slug/members/:membershipId') remove(
    @Req() req: AuthenticatedRequest,
    @Param('slug') slug: string,
    @Param('membershipId') id: string,
  ) {
    return this.workspaces.changeMember(slug, req.user.id, id);
  }
}
