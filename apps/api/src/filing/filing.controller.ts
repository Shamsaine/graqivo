import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
  type Type,
} from '@nestjs/common';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../auth/session.guard.js';
import {
  CreateFilingCategoryDto,
  FileResourceDto,
  FilingQuery,
} from './filing.dto.js';
import { FilingService } from './filing.service.js';

const pipe = (type: Type<unknown>) =>
  new ValidationPipe({
    expectedType: type,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

@Controller('workspaces/:slug')
@UseGuards(SessionGuard)
export class FilingController {
  constructor(private readonly service: FilingService) {}

  @Get('filing/categories')
  categories(@Param('slug') slug: string, @Req() req: AuthenticatedRequest) {
    return this.service.categories(slug, req.user.id);
  }

  @Post('filing/categories')
  createCategory(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(CreateFilingCategoryDto)) dto: CreateFilingCategoryDto,
  ) {
    return this.service.createCategory(slug, req.user.id, dto);
  }

  @Patch('filing/categories/:id')
  updateCategory(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(CreateFilingCategoryDto)) dto: CreateFilingCategoryDto,
  ) {
    return this.service.updateCategory(slug, id, req.user.id, dto);
  }

  @Get('filing/resources')
  list(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
    @Query(pipe(FilingQuery)) query: FilingQuery,
  ) {
    return this.service.list(slug, req.user.id, query);
  }

  @Post('resources/:id/filing')
  file(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(FileResourceDto)) dto: FileResourceDto,
  ) {
    return this.service.file(slug, id, req.user.id, dto);
  }

  @Delete('resources/:id/filing')
  unfile(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.unfile(slug, id, req.user.id);
  }
}
