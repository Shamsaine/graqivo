import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateFilingCategoryDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(1, 24) code!: string;
  @IsOptional() @IsString() @Length(0, 1000) description?: string;
  @IsOptional() @IsString() @Length(1, 100) parentId?: string | null;
}

export class FileResourceDto {
  @IsString() @Length(1, 100) filingCategoryId!: string;
  @IsOptional() @IsDateString() recordDate?: string;
  @IsOptional()
  @IsIn(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'])
  confidentialityLevel?: string;
}

export class FilingQuery {
  @IsOptional() @IsString() @Length(0, 150) search?: string;
  @IsOptional() @IsString() @Length(1, 100) categoryId?: string;
  @IsOptional()
  @IsIn(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'])
  confidentialityLevel?: string;
  @IsOptional() @IsIn(['true', 'false']) filed?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
