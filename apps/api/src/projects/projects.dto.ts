import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { ProjectRole, ProjectStatus } from '@prisma/client';
export class SettingsDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(2, 100)
  name?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(0, 100)
  displayName?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(0, 2000)
  description?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['indigo', 'purple', 'teal', 'blue', 'rose'])
  theme?: string;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Length(0, 2048)
  logoUrl?: string | null;
}
export class CreateProjectDto {
  @IsString() @Length(2, 150) name!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(0, 4000)
  description?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
  @IsOptional() @IsString() @Length(1, 100) leadMembershipId?: string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?:
    string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) targetDate?:
    string | null;
}
export class UpdateProjectDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(2, 150)
  name?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(0, 4000)
  description?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
  @IsOptional() @IsString() @Length(1, 100) leadMembershipId?: string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?:
    string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) targetDate?:
    string | null;
}
export class ProjectMemberDto {
  @IsString() @Length(1, 100) membershipId!: string;
  @IsEnum(ProjectRole) role!: ProjectRole;
}
