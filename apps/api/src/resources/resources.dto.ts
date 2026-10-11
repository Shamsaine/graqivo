import {
  IsString,
  IsEnum,
  IsOptional,
  Length,
  IsUrl,
  ValidateIf,
  IsIn,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ResourceType,
  ResourceSource,
  ResourceStatus,
  ResourcePermission,
  ReviewState,
} from '@prisma/client';
export class CreateResourceDto {
  @IsString() @Length(2, 180) title!: string;
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @Length(0, 4000)
  description?: string;
  @IsEnum(ResourceType) type!: ResourceType;
  @IsEnum(ResourceSource) source!: ResourceSource;
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @Length(1, 2048)
  externalUrl?: string;
  @IsOptional() @IsString() @Length(1, 100) projectId?: string | null;
  @IsOptional() @IsString() @Length(1, 100) ownerMembershipId?: string;
}
export class UpdateResourceDto {
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @Length(2, 180)
  title?: string;
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @Length(0, 4000)
  description?: string;
  @ValidateIf((_, v) => v !== undefined)
  @IsEnum(ResourceType)
  type?: ResourceType;
  @ValidateIf((_, v) => v !== undefined)
  @IsIn([ResourceStatus.ACTIVE, ResourceStatus.ARCHIVED])
  status?: ResourceStatus;
  @ValidateIf((_, v) => v !== undefined)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @Length(1, 2048)
  externalUrl?: string;
  @IsOptional() @IsString() @Length(1, 100) projectId?: string | null;
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @Length(1, 100)
  ownerMembershipId?: string;
}
export class GrantResourceDto {
  @IsString() @Length(1, 100) membershipId!: string;
  @IsEnum(ResourcePermission) permission!: ResourcePermission;
}
export class RegistryQuery {
  @IsOptional() @IsString() @Length(0, 150) search?: string;
  @IsOptional() @IsString() @Length(1, 100) projectId?: string;
  @IsOptional() @IsEnum(ResourceType) type?: ResourceType;
  @IsOptional() @IsEnum(ReviewState) reviewState?: ReviewState;
  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status?: 'ACTIVE' | 'ARCHIVED';
  @IsOptional() @IsString() @Length(1, 100) personId?: string;
  @IsOptional() @IsIn(['true', 'false']) mine?: string;
  @IsOptional() @IsIn(['true', 'false']) unassigned?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page: number =
    1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit: number =
    20;
}
