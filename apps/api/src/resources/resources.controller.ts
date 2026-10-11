import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
  type Type,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../auth/session.guard.js';
import { ResourcesService } from './resources.service.js';
import {
  CreateResourceDto,
  UpdateResourceDto,
  GrantResourceDto,
  RegistryQuery,
} from './resources.dto.js';
import type { UploadFile } from '../storage/file-validation.js';
import { parseStorageEnvironment } from '../storage/storage-environment.js';
const pipe = (type: Type<unknown>) =>
  new ValidationPipe({
    expectedType: type,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
@Injectable()
export class ResourceUploadGuard implements CanActivate {
  constructor(
    @Inject(ResourcesService) private readonly resources: ResourcesService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.resources.ensureUpload(
      String(request.params.slug),
      String(request.params.id),
      request.user.id,
    );
    return true;
  }
}
@Controller('workspaces/:slug/resources')
@UseGuards(SessionGuard)
export class ResourcesController {
  constructor(
    @Inject(ResourcesService) private readonly service: ResourcesService,
  ) {}
  @Get() list(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
    @Query(pipe(RegistryQuery)) query: RegistryQuery,
  ) {
    return this.service.list(slug, req.user.id, query);
  }
  @Post() create(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(CreateResourceDto)) dto: CreateResourceDto,
  ) {
    return this.service.create(slug, req.user.id, dto);
  }
  @Get(':id') detail(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.detail(slug, id, req.user.id);
  }
  @Patch(':id') update(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(UpdateResourceDto)) dto: UpdateResourceDto,
  ) {
    return this.service.update(slug, id, req.user.id, dto);
  }
  @Post(':id/access') grant(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(GrantResourceDto)) dto: GrantResourceDto,
  ) {
    return this.service.grant(slug, id, req.user.id, dto);
  }
  @Delete(':id/access') revoke(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(GrantResourceDto)) dto: GrantResourceDto,
  ) {
    return this.service.grant(slug, id, req.user.id, dto, true);
  }
  @Post(':id/file')
  @UseGuards(ResourceUploadGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: parseStorageEnvironment(process.env).maxBytes,
        files: 1,
        fields: 0,
        parts: 1,
      },
    }),
  )
  upload(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: UploadFile,
  ) {
    return this.service.upload(slug, id, req.user.id, file);
  }
  @Post(':id/download') download(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.download(slug, id, req.user.id);
  }
  @Delete(':id') remove(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.remove(slug, id, req.user.id);
  }
}
