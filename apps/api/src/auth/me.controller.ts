import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SessionGuard, type AuthenticatedRequest } from './session.guard.js';
@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  @Get() me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }
}
