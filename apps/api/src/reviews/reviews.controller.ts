import {
  Controller,
  Get,
  Post,
  Inject,
  Param,
  Query,
  Req,
  Body,
  UseGuards,
  ValidationPipe,
  type Type,
} from '@nestjs/common';
import {
  SessionGuard,
  type AuthenticatedRequest,
} from '../auth/session.guard.js';
import { ReviewsService } from './reviews.service.js';
import {
  RequestReviewDto,
  SubmitReviewDto,
  ReviewQuery,
} from './reviews.dto.js';
const pipe = (type: Type<unknown>) =>
  new ValidationPipe({
    expectedType: type,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
@Controller('workspaces/:slug')
@UseGuards(SessionGuard)
export class ReviewsController {
  constructor(
    @Inject(ReviewsService) private readonly service: ReviewsService,
  ) {}
  @Get('reviews') list(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
    @Query(pipe(ReviewQuery)) query: ReviewQuery,
  ) {
    return this.service.list(slug, req.user.id, query);
  }
  @Get('resources/:id/reviewers') reviewers(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.reviewers(slug, id, req.user.id);
  }
  @Get('resources/:id/reviews') history(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.history(slug, id, req.user.id);
  }
  @Post('resources/:id/review-requests') request(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(RequestReviewDto)) dto: RequestReviewDto,
  ) {
    return this.service.request(slug, id, req.user.id, dto);
  }
  @Post('resources/:id/reviews') submit(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body(pipe(SubmitReviewDto)) dto: SubmitReviewDto,
  ) {
    return this.service.submit(slug, id, req.user.id, dto);
  }
  @Post('resources/:id/review-requests/:requestId/cancel') cancel(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.cancel(slug, id, requestId, req.user.id);
  }
}
