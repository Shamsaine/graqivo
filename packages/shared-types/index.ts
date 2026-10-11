export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type WorkspaceType = 'ORGANIZATION' | 'PERSONAL';
export interface HealthResponse {
  status: 'ok';
  service: 'graqivo-api';
}
