'use client';
import { useState } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Library,
  Users,
  CheckCheck,
  Activity,
  Settings,
  Shield,
  ArrowLeftRight,
  LogOut,
} from 'lucide-react';
import { Brand, BrandMark } from './brand';
import { api, type Membership } from '../lib/api';
type WorkspaceIdentityData = {
  name: string;
  displayName?: string | null;
  logoUrl?: string | null;
  workspaceType: string;
};
export function WorkspaceHeader({
  onError,
  disabled = false,
}: {
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await api('/api/auth/sign-out', { method: 'POST' });
      window.location.assign('/login');
    } catch {
      onError('Sign out failed. Please try again.');
      setBusy(false);
    }
  }
  return (
    <header className="workspace-header">
      <Brand />
      <nav aria-label="Account">
        <a href="/workspaces">
          <ArrowLeftRight size={16} aria-hidden="true" />
          <span>Switch workspace</span>
        </a>
        <button
          type="button"
          className="plain-button"
          disabled={busy || disabled}
          onClick={signOut}
        >
          <LogOut size={16} aria-hidden="true" />
          <span>{busy ? 'Signing out…' : 'Sign out'}</span>
        </button>
      </nav>
    </header>
  );
}
export function WorkspaceIdentity({
  organization,
  role,
}: {
  organization: WorkspaceIdentityData;
  role: Membership['role'];
}) {
  return (
    <div className="workspace-identity">
      <div className="workspace-emblem">
        {organization.logoUrl ? (
          <img
            src={organization.logoUrl}
            alt=""
            width={44}
            height={44}
            referrerPolicy="no-referrer"
          />
        ) : (
          <BrandMark />
        )}
      </div>
      <div>
        <span className="eyebrow">
          {organization.workspaceType === 'PERSONAL'
            ? 'PERSONAL WORKSPACE'
            : 'ORGANIZATION'}{' '}
          <span className="identity-role">· {role.toLowerCase()}</span>
        </span>
        <h1>{organization.displayName || organization.name}</h1>
      </div>
    </div>
  );
}
const links = [
  ['overview', 'Overview', LayoutDashboard],
  ['projects', 'Projects', FolderKanban],
  ['registry', 'Registry', Library],
  ['people', 'People', Users],
  ['reviews', 'Reviews', CheckCheck],
  ['activity', 'Activity', Activity],
] as const;
export function WorkspaceNavigation({
  slug,
  current,
  role,
}: {
  slug: string;
  current: string;
  role: Membership['role'];
}) {
  const href = '/app/' + encodeURIComponent(slug);
  return (
    <nav className="workspace-tabs" aria-label="Workspace">
      {links.map(([path, label, Icon]) => (
        <a
          key={path}
          href={href + '/' + path}
          aria-current={current === path ? 'page' : undefined}
        >
          <Icon size={17} aria-hidden="true" />
          {label}
        </a>
      ))}
      {role !== 'MEMBER' && (
        <a
          href={href + '/admin'}
          aria-current={current === 'admin' ? 'page' : undefined}
        >
          <Shield size={17} aria-hidden="true" />
          Administration
        </a>
      )}
      {role === 'OWNER' && (
        <a
          href={href + '/settings'}
          aria-current={current === 'settings' ? 'page' : undefined}
        >
          <Settings size={17} aria-hidden="true" />
          Settings
        </a>
      )}
    </nav>
  );
}
