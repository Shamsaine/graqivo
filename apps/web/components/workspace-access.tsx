'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {
  WorkspaceHeader,
  WorkspaceIdentity,
  WorkspaceNavigation,
} from './workspace-chrome';
import { workspaceStyle } from '../lib/themes';
import { LoadingState, EmptyState } from './feedback-state';
import {
  api,
  ApiError,
  type Invitation,
  type Member,
  type Membership,
  type Workspace,
} from '../lib/api';
export function WorkspaceAccess({
  slug,
  admin = false,
}: {
  slug: string;
  admin?: boolean;
}) {
  const [workspace, setWorkspace] = useState<{
    organization: Workspace;
    role: Membership['role'];
  }>();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const access = await api<{
      organization: Workspace;
      role: Membership['role'];
    }>('/workspaces/' + slug);
    if (admin && access.role === 'MEMBER')
      throw new Error('Workspace administration requires Owner or Admin.');
    setWorkspace(access);
    if (admin) {
      const [people, invites] = await Promise.all([
        api<Member[]>('/workspaces/' + slug + '/members'),
        api<Invitation[]>('/workspaces/' + slug + '/invitations'),
      ]);
      setMembers(people);
      setInvitations(invites);
    }
  }
  useEffect(() => {
    load().catch((failure) => {
      if (failure instanceof ApiError && failure.status === 401)
        window.location.assign('/login');
      else setError(failure.message);
    });
  }, [slug, admin]);
  useEffect(() => {
    if (workspace)
      document.title =
        (admin ? 'Administration' : 'Overview') +
        ' · ' +
        (workspace.organization.displayName || workspace.organization.name) +
        ' · Graqivo';
  }, [workspace, admin]);
  async function change(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(path, { method, body });
      await load();
      setMessage('Workspace access updated.');
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await change('/workspaces/' + slug + '/invitations', 'POST', {
      email: String(data.get('email')),
      role: String(data.get('role')),
    });
  }
  return (
    <main
      id="main"
      tabIndex={-1}
      className="workspace-page core-workspace"
      style={workspaceStyle(workspace?.organization.theme)}
    >
      <WorkspaceHeader onError={setError} disabled={busy} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {!workspace && !error && (
        <LoadingState label="Opening workspace access…" />
      )}
      {workspace && (
        <>
          <WorkspaceIdentity
            organization={workspace.organization}
            role={workspace.role}
          />
          <WorkspaceNavigation
            slug={slug}
            current={admin ? 'admin' : 'overview'}
            role={workspace.role}
          />
          {!admin ? (
            <section className="workspace-empty">
              <h2>Your workspace is ready.</h2>
              <p>
                Your projects, resources, and reviews are ready to connect. Open
                the overview to find your next step.
              </p>
              {workspace.organization.workspaceType === 'ORGANIZATION' &&
                workspace.role !== 'MEMBER' && (
                  <a className="button" href={'/app/' + slug + '/admin'}>
                    Invite your team
                  </a>
                )}
            </section>
          ) : (
            <>
              {workspace.organization.workspaceType === 'ORGANIZATION' && (
                <section className="admin-section">
                  <h2>Invite someone</h2>
                  <p>
                    Invitations are sent by email and expire after 72 hours.
                  </p>
                  <form className="invite-form" onSubmit={invite}>
                    <label>
                      Email
                      <input
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                      />
                    </label>
                    <label>
                      Role
                      <select name="role">
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </label>
                    <button className="button" disabled={busy}>
                      Send invitation
                    </button>
                  </form>
                </section>
              )}
              <section className="admin-section">
                <h2>Members</h2>
                <div
                  className="table-scroll"
                  role="region"
                  aria-label="Workspace access table"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Access</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.id}>
                          <td>{member.user.name}</td>
                          <td>{member.user.email}</td>
                          <td>
                            <select
                              aria-label={'Role for ' + member.user.name}
                              value={member.role}
                              disabled={
                                busy ||
                                (member.role === 'OWNER' &&
                                  workspace.role !== 'OWNER')
                              }
                              onChange={(event) => {
                                const role = event.target.value;
                                if (
                                  (role === 'OWNER' ||
                                    member.role === 'OWNER') &&
                                  !window.confirm(
                                    'Confirm this ownership change. The workspace must retain at least one Owner.',
                                  )
                                )
                                  return;
                                void change(
                                  '/workspaces/' +
                                    slug +
                                    '/members/' +
                                    member.id +
                                    '/role',
                                  'PATCH',
                                  { role },
                                );
                              }}
                            >
                              {workspace.role === 'OWNER' && (
                                <option value="OWNER">Owner</option>
                              )}
                              <option value="ADMIN">Admin</option>
                              <option value="MEMBER">Member</option>
                              {workspace.role !== 'OWNER' &&
                                member.role === 'OWNER' && (
                                  <option value="OWNER">Owner</option>
                                )}
                            </select>
                          </td>
                          <td>
                            <button
                              className="plain-button"
                              disabled={
                                busy ||
                                (member.role === 'OWNER' &&
                                  workspace.role !== 'OWNER')
                              }
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Remove access for ' +
                                      member.user.name +
                                      '?',
                                  )
                                )
                                  void change(
                                    '/workspaces/' +
                                      slug +
                                      '/members/' +
                                      member.id,
                                    'DELETE',
                                  );
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="admin-section">
                <h2>Invitations</h2>
                {!invitations.length ? (
                  <EmptyState
                    title="No invitations yet"
                    description="Invite someone by email to bring them into this workspace."
                  />
                ) : (
                  <div
                    className="table-scroll"
                    role="region"
                    aria-label="Workspace access table"
                    tabIndex={0}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th>Expires</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invitations.map((invitation) => (
                          <tr key={invitation.id}>
                            <td>{invitation.email}</td>
                            <td>{invitation.role}</td>
                            <td>
                              {invitation.status === 'PENDING' &&
                              new Date(invitation.expiresAt) < new Date()
                                ? 'EXPIRED'
                                : invitation.status}
                            </td>
                            <td>
                              {new Date(
                                invitation.expiresAt,
                              ).toLocaleDateString()}
                            </td>
                            <td>
                              {invitation.status === 'PENDING' && (
                                <button
                                  className="plain-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void change(
                                      '/workspaces/' +
                                        slug +
                                        '/invitations/' +
                                        invitation.id,
                                      'DELETE',
                                    )
                                  }
                                >
                                  Revoke
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
      {!workspace && !error && <p>Checking workspace access…</p>}
    </main>
  );
}
