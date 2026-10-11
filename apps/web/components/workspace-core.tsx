'use client';
import { useEffect, useState, type FormEvent, type CSSProperties } from 'react';
import { ActivityFeed, ReviewList } from './reviews-activity';
import { ResourceRegistry } from './resource-registry';
import { Brand } from './brand';
import { api, ApiError, type Membership } from '../lib/api';
type Person = { id: string; name: string; email: string; image: string | null };
type Participant = {
  id: string;
  membershipId: string;
  role: string;
  membership: { user: Person };
};
type Event = {
  id: string;
  action: string;
  createdAt: string;
  project?: { id: string; name: string } | null;
  actor?: { user: { name: string } } | null;
  resource?: { id: string; title: string } | null;
};
type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  leadMembershipId: string | null;
  startDate: string | null;
  targetDate: string | null;
  updatedAt: string;
  lead: { id: string; status: string; user: Person } | null;
  memberships: Participant[];
  _count?: { resources: number };
  events?: Event[];
};
type People = {
  id: string;
  role: string;
  status: string;
  user: Person;
  projectMemberships: {
    role: string;
    project: {
      id: string;
      name: string;
      status: string;
      leadMembershipId: string | null;
    };
  }[];
  projectEvents: Event[];
};
type Workspace = {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  logoUrl: string | null;
  theme: string;
  workspaceType: string;
};
type Overview = {
  activeProjectCount: number;
  projects: Project[];
  events: Event[];
  pendingReviews: number;
  needsAttention: {
    id: string;
    createdAt: string;
    resource: { id: string; title: string };
  }[];
  resources: number;
  recentResources: {
    id: string;
    title: string;
    type: string;
    updatedAt: string;
  }[];
};
const statuses = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'];
const themes: Record<string, string> = {
  indigo: '#4338ca',
  purple: '#6d28d9',
  teal: '#0f766e',
  blue: '#1d4ed8',
  rose: '#be123c',
};
function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (s) => s.toUpperCase());
}
function date(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' })
    : 'Not set';
}
export function WorkspaceCore({
  slug,
  view,
  projectId,
}: {
  slug: string;
  view:
    | 'overview'
    | 'projects'
    | 'project'
    | 'people'
    | 'settings'
    | 'activity'
    | 'reviews';
  projectId?: string;
}) {
  const [access, setAccess] = useState<{
    organization: Workspace;
    role: Membership['role'];
  }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<People[]>([]);
  const [project, setProject] = useState<Project>();
  const [overview, setOverview] = useState<Overview>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('overview');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const base = '/workspaces/' + encodeURIComponent(slug);
  const href = '/app/' + encodeURIComponent(slug);
  async function load() {
    const current = await api<{
      organization: Workspace;
      role: Membership['role'];
    }>(base);
    setAccess(current);
    if (view === 'settings' && current.role !== 'OWNER')
      throw new Error('Only Owners can change workspace settings.');
    if (view === 'overview')
      setOverview(await api<Overview>(base + '/overview'));
    if (view === 'projects')
      setProjects(await api<Project[]>(base + '/projects'));
    if (
      view === 'people' ||
      ((view === 'projects' || view === 'project') && current.role !== 'MEMBER')
    )
      setPeople(await api<People[]>(base + '/people'));
    if (view === 'project')
      setProject(await api<Project>(base + '/projects/' + projectId));
    setReady(true);
  }
  useEffect(() => {
    setReady(false);
    setShowProjectForm(false);
    setAccess(undefined);
    setProject(undefined);
    setError('');
    load().catch((failure) => {
      if (failure instanceof ApiError && failure.status === 401)
        window.location.assign('/login');
      else
        setError(
          failure instanceof Error ? failure.message : 'Workspace unavailable',
        );
    });
  }, [slug, view, projectId]);
  async function write(
    path: string,
    method: string,
    body: unknown,
    onSuccess?: () => void,
  ) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(path, { method, body });
      await load();
      setMessage('Changes saved.');
      onSuccess?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again');
    } finally {
      setBusy(false);
    }
  }
  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = {
      name: String(data.get('name')),
      description: String(data.get('description') ?? ''),
      status: String(data.get('status')),
      leadMembershipId: String(data.get('leadMembershipId') ?? '') || null,
      startDate: String(data.get('startDate') ?? '') || null,
      targetDate: String(data.get('targetDate') ?? '') || null,
    };
    await write(
      base + '/projects' + (projectId ? '/' + projectId : ''),
      projectId ? 'PATCH' : 'POST',
      body,
      () => {
        if (!projectId) form.reset();
        setShowProjectForm(false);
      },
    );
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await write(base + '/settings', 'PATCH', {
      name: String(data.get('name')),
      displayName: String(data.get('displayName') ?? ''),
      description: String(data.get('description') ?? ''),
      theme: String(data.get('theme')),
      logoUrl: String(data.get('logoUrl') ?? '') || null,
    });
  }
  function projectForm(item?: Project) {
    return (
      <form
        key={item?.updatedAt ?? 'new-project'}
        onSubmit={saveProject}
        className="core-form"
      >
        <label>
          Project name
          <input
            name="name"
            autoFocus
            required
            minLength={2}
            maxLength={150}
            defaultValue={item?.name}
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            maxLength={4000}
            rows={3}
            defaultValue={item?.description ?? ''}
          />
        </label>
        <div className="form-grid">
          <label>
            Status
            <select name="status" defaultValue={item?.status ?? 'PLANNING'}>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {label(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project lead
            <select
              name="leadMembershipId"
              defaultValue={item?.leadMembershipId ?? ''}
            >
              <option value="">No lead assigned</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.user.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input
              type="date"
              name="startDate"
              defaultValue={item?.startDate?.slice(0, 10)}
            />
          </label>
          <label>
            Target date
            <input
              type="date"
              name="targetDate"
              defaultValue={item?.targetDate?.slice(0, 10)}
            />
          </label>
        </div>
        <button className="button" disabled={busy}>
          {busy ? 'Saving…' : item ? 'Save project' : 'Create project'}
        </button>
      </form>
    );
  }
  function cards(items: Project[]) {
    return items.length ? (
      <div className="project-grid">
        {items.map((item) => (
          <a
            className="project-card"
            key={item.id}
            href={href + '/projects/' + item.id}
          >
            <span className={'status-pill status-' + item.status.toLowerCase()}>
              {label(item.status)}
            </span>
            <h3>{item.name}</h3>
            <p>{item.description || 'No description yet.'}</p>
            <dl>
              <div>
                <dt>Lead</dt>
                <dd>
                  {item.lead?.status === 'ACTIVE'
                    ? item.lead.user.name
                    : 'Unassigned'}
                </dd>
              </div>
              <div>
                <dt>Participants</dt>
                <dd>{item.memberships.length}</dd>
              </div>
              <div>
                <dt>Resources</dt>
                <dd>{item._count?.resources ?? 0}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{date(item.updatedAt)}</dd>
              </div>
            </dl>
          </a>
        ))}
      </div>
    ) : (
      <div className="core-empty">
        <h3>No projects to show.</h3>
        <p>
          {access?.role === 'MEMBER'
            ? 'Projects appear here when a workspace administrator adds you.'
            : 'Create a project to bring work and people together.'}
        </p>
      </div>
    );
  }
  function activity(events: Event[]) {
    return events.length ? (
      <ol className="activity-list">
        {events.map((event) => (
          <li key={event.id}>
            <span className="activity-dot" />
            <div>
              <strong>{label(event.action.replace(/^PROJECT_/, ''))}</strong>
              <p>
                {event.actor?.user.name ?? ''}
                {event.resource && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={href + '/registry/' + event.resource.id}>
                      {event.resource.title}
                    </a>
                  </>
                )}
                {event.project && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={href + '/projects/' + event.project.id}>
                      {event.project.name}
                    </a>
                  </>
                )}
              </p>
              <time dateTime={event.createdAt}>
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </div>
          </li>
        ))}
      </ol>
    ) : (
      <p className="muted">No project activity yet.</p>
    );
  }
  const manager = access?.role === 'OWNER' || access?.role === 'ADMIN';
  return (
    <main
      className="workspace-page core-workspace"
      style={
        {
          '--workspace-accent': themes[access?.organization.theme ?? 'indigo'],
        } as CSSProperties
      }
    >
      <header>
        <Brand />
        <nav>
          <a href="/workspaces">Switch workspace</a>
          <button
            className="plain-button"
            disabled={busy}
            onClick={async () => {
              try {
                await api('/api/auth/sign-out', { method: 'POST' });
                window.location.assign('/login');
              } catch {
                setError('Sign out failed. Please try again.');
              }
            }}
          >
            Sign out
          </button>
        </nav>
      </header>
      {access && (
        <>
          <div className="workspace-identity">
            {access.organization.logoUrl && (
              <img
                src={access.organization.logoUrl}
                alt=""
                width={48}
                height={48}
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <span className="eyebrow">
                {access.organization.workspaceType === 'PERSONAL'
                  ? 'PERSONAL WORKSPACE'
                  : 'ORGANIZATION'}{' '}
                · {access.role}
              </span>
              <h1>
                {access.organization.displayName || access.organization.name}
              </h1>
            </div>
          </div>
          <nav className="workspace-tabs" aria-label="Workspace">
            {(
              [
                'overview',
                'projects',
                'registry',
                'people',
                'reviews',
                'activity',
              ] as const
            ).map((page) => (
              <a
                key={page}
                aria-current={
                  view === page || (view === 'project' && page === 'projects')
                    ? 'page'
                    : undefined
                }
                href={href + '/' + page}
              >
                {label(page)}
              </a>
            ))}
            {manager && <a href={href + '/admin'}>Administration</a>}
            {access.role === 'OWNER' && (
              <a
                aria-current={view === 'settings' ? 'page' : undefined}
                href={href + '/settings'}
              >
                Settings
              </a>
            )}
          </nav>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {!ready && !error && <p role="status">Loading your workspace…</p>}
      {ready && view === 'overview' && overview && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">WORKSPACE OVERVIEW</span>
              <h2>Your work at a glance.</h2>
              <p>
                {access?.organization.description ||
                  'A shared place for your projects and people.'}
              </p>
            </div>
            <a className="button" href={href + '/projects'}>
              {manager ? 'Manage projects' : 'View projects'}
            </a>
          </div>
          <div className="dashboard-metrics">
            <section>
              <span>Active projects</span>
              <strong>{overview.activeProjectCount}</strong>
              <small>Visible to you</small>
            </section>
            <section>
              <span>Resources</span>
              <strong>{overview.resources}</strong>
              <small>Accessible active resources</small>
            </section>
            <section>
              <span>Pending reviews</span>
              <strong>{overview.pendingReviews}</strong>
              <small>Accessible active resources</small>
            </section>
          </div>
          <section className="core-panel">
            <div className="section-heading">
              <h2>Projects in progress</h2>
              <a href={href + '/projects'}>All projects →</a>
            </div>
            {cards(overview.projects)}
          </section>
          <div className="core-columns">
            <section className="core-panel">
              <h2>Recent activity</h2>
              {activity(overview.events)}
            </section>
            <section className="core-panel">
              <h2>Needs attention</h2>
              {overview.needsAttention.length ? (
                <ul>
                  {overview.needsAttention.map((item) => (
                    <li key={item.id}>
                      <a href={href + '/registry/' + item.resource.id}>
                        {item.resource.title}
                      </a>{' '}
                      · awaiting your review
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No reviews need your attention.</p>
              )}
              <a href={href + '/reviews'}>All review requests →</a>
              <h2>Recent resources</h2>
              {overview.recentResources.length ? (
                <ul>
                  {overview.recentResources.map((item) => (
                    <li key={item.id}>
                      <a href={href + '/registry/' + item.id}>{item.title}</a> ·{' '}
                      {label(item.type)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No accessible resources yet.</p>
              )}
            </section>
          </div>
        </>
      )}
      {ready && view === 'projects' && (
        <>
          <div className="section-heading">
            <div>
              <h2>Projects</h2>
              <p>Plan, connect people, and keep a clear record of work.</p>
            </div>
            <div className="form-grid">
              <span>{projects.length} accessible</span>
              {manager && (
                <button
                  className="button"
                  disabled={busy}
                  aria-expanded={showProjectForm}
                  aria-controls="create-project-form"
                  onClick={() => setShowProjectForm((open) => !open)}
                >
                  {showProjectForm ? 'Cancel' : 'Create project'}
                </button>
              )}
            </div>
          </div>
          {manager && showProjectForm && (
            <section className="core-panel" id="create-project-form">
              <h2>Create a project</h2>
              {projectForm()}
            </section>
          )}
          {cards(projects)}
        </>
      )}
      {ready && view === 'project' && project && (
        <>
          <a href={href + '/projects'}>← All projects</a>
          <div className="section-heading">
            <div>
              <span className="status-pill">{label(project.status)}</span>
              <h2>{project.name}</h2>
              <p>{project.description || 'No description yet.'}</p>
            </div>
            {manager && project.status !== 'ARCHIVED' && (
              <button
                className="plain-button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Archive this project? Its history will be retained.',
                    )
                  )
                    void write(base + '/projects/' + project.id, 'PATCH', {
                      status: 'ARCHIVED',
                    });
                }}
              >
                Archive project
              </button>
            )}
          </div>
          <nav className="project-tabs" aria-label="Project sections">
            {['overview', 'people', 'resources', 'reviews', 'activity'].map(
              (name) => (
                <button
                  key={name}
                  aria-pressed={tab === name}
                  onClick={() => setTab(name)}
                >
                  {label(name)}
                </button>
              ),
            )}
          </nav>
          {tab === 'overview' && (
            <section className="core-panel">
              <dl className="project-facts">
                <div>
                  <dt>Lead</dt>
                  <dd>
                    {project.lead?.status === 'ACTIVE'
                      ? project.lead.user.name
                      : 'Unassigned'}
                  </dd>
                </div>
                <div>
                  <dt>Start</dt>
                  <dd>{date(project.startDate)}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{date(project.targetDate)}</dd>
                </div>
                <div>
                  <dt>Participants</dt>
                  <dd>{project.memberships.length}</dd>
                </div>
              </dl>
              {manager && (
                <>
                  <button
                    className="button"
                    disabled={busy}
                    aria-expanded={showProjectForm}
                    aria-controls="edit-project-form"
                    onClick={() => setShowProjectForm((open) => !open)}
                  >
                    {showProjectForm ? 'Cancel' : 'Edit project'}
                  </button>
                  {showProjectForm && (
                    <div id="edit-project-form">
                      <h3>Edit project</h3>
                      {projectForm(project)}
                    </div>
                  )}
                </>
              )}
              {!manager && activity((project.events ?? []).slice(0, 5))}
            </section>
          )}
          {tab === 'people' && (
            <section className="core-panel">
              <h3>Project people</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Project role</th>
                      {manager && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {project.memberships.map((participant) => (
                      <tr key={participant.id}>
                        <td>
                          {participant.membership.user.name}
                          <small className="block-muted">
                            {participant.membership.user.email}
                          </small>
                        </td>
                        <td>
                          {participant.membershipId === project.leadMembershipId
                            ? 'Lead'
                            : label(participant.role)}
                        </td>
                        {manager && (
                          <td>
                            <button
                              className="plain-button"
                              disabled={
                                busy ||
                                project.status === 'ARCHIVED' ||
                                participant.membershipId ===
                                  project.leadMembershipId
                              }
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Remove this participant from the project?',
                                  )
                                )
                                  void write(
                                    base +
                                      '/projects/' +
                                      project.id +
                                      '/members/' +
                                      participant.membershipId,
                                    'DELETE',
                                    {},
                                  );
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {manager && project.status !== 'ARCHIVED' && (
                <form
                  className="invite-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void write(
                      base + '/projects/' + project.id + '/members',
                      'POST',
                      {
                        membershipId: String(data.get('membershipId')),
                        role: String(data.get('role')),
                      },
                    );
                  }}
                >
                  <label>
                    Workspace member
                    <select name="membershipId" required>
                      <option value="">Choose a person</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.user.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Role
                    <select name="role">
                      <option value="CONTRIBUTOR">Contributor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  </label>
                  <button className="button" disabled={busy}>
                    Add / update participant
                  </button>
                </form>
              )}
            </section>
          )}
          {tab === 'activity' && (
            <ActivityFeed slug={slug} projectId={project.id} />
          )}
          {tab === 'resources' && (
            <ResourceRegistry slug={slug} projectId={project.id} embedded />
          )}
          {tab === 'reviews' && (
            <ReviewList slug={slug} projectId={project.id} />
          )}
        </>
      )}
      {ready && view === 'activity' && <ActivityFeed slug={slug} />}
      {ready && view === 'reviews' && <ReviewList slug={slug} />}
      {ready && view === 'people' && (
        <>
          <div className="section-heading">
            <div>
              <h2>People</h2>
              <p>The people who make this workspace work.</p>
            </div>
            {manager && (
              <a className="button" href={href + '/admin'}>
                Manage invitations
              </a>
            )}
          </div>
          <div className="people-grid">
            {people.map((person) => (
              <article className="core-panel person-card" key={person.id}>
                <div className="person-heading">
                  {person.user.image ? (
                    <img
                      width={44}
                      height={44}
                      src={person.user.image}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="avatar-initials">
                      {person.user.name
                        .split(' ')
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                  )}
                  <div>
                    <h3>{person.user.name}</h3>
                    <p>{person.user.email}</p>
                  </div>
                </div>
                <span className="status-pill">
                  {label(person.role)} · {label(person.status)}
                </span>
                <h4>Projects visible to you</h4>
                {person.projectMemberships.length ? (
                  <ul>
                    {person.projectMemberships.map((item) => (
                      <li key={item.project.id}>
                        <a href={href + '/projects/' + item.project.id}>
                          {item.project.name}
                        </a>{' '}
                        ·{' '}
                        {item.project.leadMembershipId === person.id
                          ? 'Lead'
                          : label(item.role)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No shared projects.</p>
                )}
                <h4>Recent authorized activity</h4>
                {activity(person.projectEvents)}
              </article>
            ))}
          </div>
        </>
      )}
      {ready && view === 'settings' && access && (
        <section className="core-panel">
          <h2>Workspace settings</h2>
          <p>
            Update your workspace identity. Its address remains{' '}
            <strong>{slug}</strong>.
          </p>
          <form
            key={JSON.stringify(access.organization)}
            onSubmit={saveSettings}
            className="core-form"
          >
            <label>
              Organization name
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={access.organization.name}
              />
            </label>
            <label>
              Display name
              <input
                name="displayName"
                maxLength={100}
                defaultValue={access.organization.displayName ?? ''}
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                maxLength={2000}
                rows={4}
                defaultValue={access.organization.description ?? ''}
              />
            </label>
            <label>
              Logo URL
              <input
                type="url"
                name="logoUrl"
                placeholder="https://"
                maxLength={2048}
                defaultValue={access.organization.logoUrl ?? ''}
              />
              <small>
                Use an HTTPS image URL. File uploads arrive in Phase 4.
              </small>
            </label>
            <label>
              Theme
              <select name="theme" defaultValue={access.organization.theme}>
                {Object.keys(themes).map((theme) => (
                  <option key={theme} value={theme}>
                    {label(theme)}
                  </option>
                ))}
              </select>
            </label>
            <div
              className="theme-swatches"
              aria-label="Available workspace colors"
            >
              {Object.entries(themes).map(([name, color]) => (
                <span
                  key={name}
                  title={label(name)}
                  style={{ background: color }}
                />
              ))}
            </div>
            <button className="button" disabled={busy}>
              Save workspace settings
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
