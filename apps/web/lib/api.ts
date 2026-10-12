'use client';
export function apiBase() {
  const configured = new URL(
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  );
  if (
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
    ['localhost', '127.0.0.1'].includes(configured.hostname)
  )
    configured.hostname = window.location.hostname;
  return configured.origin;
}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const response = await fetch(apiBase() + path, {
    method,
    credentials: 'include',
    cache: 'no-store',
    ...(method !== 'GET'
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options.body ?? {}),
        }
      : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      Array.isArray(data.message)
        ? data.message.join('. ')
        : (data.message ?? 'The request could not be completed.'),
      response.status,
    );
  return data as T;
}
export interface Workspace {
  id: string;
  slug: string;
  name: string;
  workspaceType: 'ORGANIZATION' | 'PERSONAL';
  theme?: string;
  displayName?: string | null;
  logoUrl?: string | null;
}
export interface Membership {
  organization: Workspace;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}
export interface Member {
  id: string;
  role: Membership['role'];
  user: { id: string; name: string; email: string };
}
export interface Invitation {
  id: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  status: string;
  expiresAt: string;
}
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}
