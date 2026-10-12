'use client';
import { useEffect, useState } from 'react';
import { Brand, BrandMark } from './brand';
import { LoadingState, EmptyState } from './feedback-state';
import { api, ApiError, type CurrentUser, type Membership } from '../lib/api';
export function WorkspacePicker() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [user, setUser] = useState<CurrentUser>();
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api<CurrentUser>('/me'), api<Membership[]>('/workspaces')])
      .then(([person, workspaces]) => {
        setUser(person);
        setMemberships(workspaces);
      })
      .catch((failure) => {
        if (failure instanceof ApiError && failure.status === 401)
          window.location.assign('/login');
        else setError(failure.message);
      });
  }, []);
  async function signOut() {
    try {
      await api('/api/auth/sign-out', { method: 'POST' });
      window.location.assign('/login');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign out failed');
    }
  }
  return (
    <main id="main" tabIndex={-1} className="workspace-page">
      <header>
        <Brand />
        <button className="plain-button" onClick={signOut}>
          Sign out
        </button>
      </header>
      <span className="eyebrow">YOUR WORKSPACES</span>
      <h1>{user ? 'Welcome, ' + user.name + '.' : 'Your workspaces'}</h1>
      <p>Choose a workspace. Your membership determines what you can access.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!user && !error && <LoadingState label="Opening your account…" />}
      {user && (
        <>
          <div className="workspace-list">
            {memberships.map((membership) => (
              <a
                key={membership.organization.id}
                href={'/app/' + membership.organization.slug + '/overview'}
              >
                <span className="workspace-card-icon">
                  <BrandMark />
                </span>
                <div>
                  <strong>{membership.organization.name}</strong>
                  <small>
                    {membership.organization.workspaceType === 'PERSONAL'
                      ? 'Personal workspace'
                      : 'Organization'}
                  </small>
                </div>
                <span className="role">{membership.role}</span>
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </div>
          {!memberships.length && (
            <EmptyState
              title="Your workspace starts here"
              description="Create a personal space for your own work, start an organization, or accept an invitation from your email."
              action={{ label: 'Create a workspace', href: '/onboarding' }}
            />
          )}
          {memberships.length > 0 && (
            <a href="/onboarding" className="button">
              Create a workspace
            </a>
          )}
        </>
      )}
    </main>
  );
}
