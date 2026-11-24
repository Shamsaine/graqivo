import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
export class ActivityQuery {
  @IsOptional() @IsString() @MaxLength(100) projectId?: string;
  @IsOptional() @IsString() @MaxLength(100) resourceId?: string;
  @IsOptional() @IsString() @MaxLength(100) actorId?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
