import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
export class RequestReviewDto {
  @IsString() @MinLength(1) @MaxLength(100) reviewerMembershipId!: string;
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
}
export class SubmitReviewDto {
  @IsEnum(['COMMENT', 'APPROVAL', 'CHANGES_REQUESTED']) type!:
    'COMMENT' | 'APPROVAL' | 'CHANGES_REQUESTED';
  @IsOptional() @IsString() @MaxLength(100) requestId?: string;
  @IsOptional() @IsString() @MaxLength(4000) comment?: string;
}
export class ReviewQuery {
  @IsOptional() @IsString() @MaxLength(100) projectId?: string;
  @IsOptional() @IsEnum(['PENDING', 'COMPLETED', 'CANCELLED']) status?:
    'PENDING' | 'COMPLETED' | 'CANCELLED';
  @IsOptional() @IsEnum(['true', 'false']) mine?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
