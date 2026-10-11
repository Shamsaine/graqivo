import {
  IsEmail,
  IsEnum,
  IsIn,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { OrganizationRole, WorkspaceType } from '@prisma/client';
export class CreateWorkspaceDto {
  @IsString() @Length(2, 100) name!: string;
  @IsString()
  @Length(3, 60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
  @IsEnum(WorkspaceType) workspaceType!: WorkspaceType;
}
export class InviteDto {
  @IsEmail() @Length(3, 254) email!: string;
  @IsIn([OrganizationRole.ADMIN, OrganizationRole.MEMBER])
  role!: OrganizationRole;
}
export class ChangeRoleDto {
  @IsEnum(OrganizationRole) role!: OrganizationRole;
}
export class AcceptInvitationDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) token!: string;
}
