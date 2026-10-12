'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  apiBase,
  ApiError,
  type Member,
  type Workspace,
  type Membership,
} from '../lib/api';
import { ResourceReviews, ActivityFeed } from './reviews-activity';
import {
  WorkspaceHeader,
  WorkspaceIdentity,
  WorkspaceNavigation,
} from './workspace-chrome';
import { workspaceStyle } from '../lib/themes';
import { LoadingState, EmptyState } from './feedback-state';
type Resource = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  source: string;
  externalUrl: string | null;
  status: string;
  reviewState: string;
  uploadState: string;
  fileName: string | null;
  fileSize: number | null;
  updatedAt: string;
  projectId: string | null;
  project: { id: string; name: string } | null;
  projectHidden: boolean;
  owner: { id: string; user: { name: string; email: string } };
  createdBy: { id: string; user: { name: string } };
  access: {
    id: string;
    permission: string;
    membership: { id: string; user: { name: string; email: string } };
  }[];
  permissions: {
    edit: boolean;
    review: boolean;
    manageAccess: boolean;
    delete: boolean;
  };
  events?: {
    id: string;
    action: string;
    createdAt: string;
    actor: { user: { name: string } };
  }[];
};
type Page = { items: Resource[]; total: number; page: number; limit: number };
const categories = [
  'DOCUMENT',
  'SHEET',
  'PRESENTATION',
  'PDF',
  'LINK',
  'OTHER',
];
function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (s) => s.toUpperCase());
}
export function ResourceRegistry({
  slug,
  resourceId,
  projectId,
  embedded = false,
}: {
  slug: string;
  resourceId?: string;
  projectId?: string;
  embedded?: boolean;
}) {
  const [access, setAccess] = useState<{
    organization: Workspace;
    role: Membership['role'];
  }>();
  const [data, setData] = useState<Page>();
  const [resource, setResource] = useState<Resource>();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<Member[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({
    status: 'ACTIVE',
  });
  const [page, setPage] = useState(1);
  const [source, setSource] = useState('EXTERNAL');
  const [search, setSearch] = useState('');
  const [writableProjects, setWritableProjects] = useState<string[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setFilters((current) => ({ ...current, search }));
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [restoreResourceFocus, setRestoreResourceFocus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const base = '/workspaces/' + encodeURIComponent(slug);
  const href = '/app/' + encodeURIComponent(slug);
  async function load() {
    const current = await api<{
      organization: Workspace;
      role: Membership['role'];
    }>(base);
    setAccess(current);
    const [allProjects, members] = await Promise.all([
      api<{ id: string; name: string }[]>(base + '/projects'),
      api<Member[]>(base + '/members'),
    ]);
    setProjects(allProjects);
    const me = await api<{ id: string }>('/me');
    setWritableProjects(
      allProjects
        .filter(
          (project) =>
            current.role !== 'MEMBER' ||
            (
              project as {
                memberships?: {
                  role: string;
                  membership: { user: { id: string } };
                }[];
              }
            ).memberships?.some(
              (person) =>
                person.role === 'CONTRIBUTOR' &&
                person.membership.user.id === me.id,
            ),
        )
        .map((project) => project.id),
    );
    setPeople(members);
    if (resourceId)
      setResource(
        await api<Resource>(
          base + '/resources/' + encodeURIComponent(resourceId),
        ),
      );
    else {
      const query = new URLSearchParams({ page: String(page), limit: '20' });
      for (const [key, value] of Object.entries(filters))
        if (value) query.set(key, value);
      if (projectId) query.set('projectId', projectId);
      setData(await api<Page>(base + '/resources?' + query));
    }
    setLoading(false);
  }
  useEffect(() => {
    setLoading(true);
    setError('');
    load().catch((failure) => {
      setLoading(false);
      if (failure instanceof ApiError && failure.status === 401)
        window.location.assign('/login');
      else
        setError(
          failure instanceof Error ? failure.message : 'Resources unavailable',
        );
    });
  }, [slug, resourceId, projectId, page, JSON.stringify(filters)]);
  useEffect(() => {
    if (access)
      document.title =
        (resource?.title || 'Registry') +
        ' · ' +
        (access.organization.displayName || access.organization.name) +
        ' · Graqivo';
  }, [access, resource?.title]);
  useEffect(() => {
    if (!busy && restoreResourceFocus) {
      document.getElementById('add-resource-trigger')?.focus();
      setRestoreResourceFocus(false);
    }
  }, [busy, restoreResourceFocus]);
  async function change(path: string, method: string, body: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(path, { method, body });
      await load();
      setMessage('Resource updated.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again');
    } finally {
      setBusy(false);
    }
  }
  async function sendFile(id: string, file: File) {
    const form = new FormData();
    form.set('file', file);
    const response = await fetch(
      apiBase() + base + '/resources/' + id + '/file',
      { method: 'POST', credentials: 'include', body: form },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        body.message ?? 'Upload failed. Retry from the resource details.',
      );
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError('');
    setMessage('');
    let created: Resource | undefined;
    try {
      created = await api<Resource>(base + '/resources', {
        method: 'POST',
        body: {
          title: String(values.get('title')),
          description: String(values.get('description') ?? ''),
          source,
          type: String(values.get('type')),
          projectId: projectId || String(values.get('projectId') ?? '') || null,
          ...(source === 'EXTERNAL'
            ? { externalUrl: String(values.get('externalUrl')) }
            : {}),
        },
      });
      if (source === 'UPLOAD') {
        const file = values.get('file');
        if (!(file instanceof File) || !file.size)
          throw new Error('Choose a file.');
        await sendFile(created.id, file);
      }
      await load();
      form.reset();
      setMessage('Resource added.');
      setShowCreateForm(false);
      setRestoreResourceFocus(true);
    } catch (failure) {
      setError(
        (failure instanceof Error ? failure.message : 'Please try again') +
          (created && source === 'UPLOAD'
            ? ' Your resource entry was saved; open its details to retry the file.'
            : ''),
      );
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!resource) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ url: string }>(
        base + '/resources/' + resource.id + '/download',
        { method: 'POST' },
      );
      window.location.assign(result.url);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Download unavailable',
      );
    } finally {
      setBusy(false);
    }
  }
  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resource) return;
    const values = new FormData(event.currentTarget);
    await change(base + '/resources/' + resource.id, 'PATCH', {
      title: String(values.get('title')),
      description: String(values.get('description') ?? ''),
      status: String(values.get('status')),
      ...(resource.source === 'EXTERNAL'
        ? {
            externalUrl: String(values.get('externalUrl')),
            type: String(values.get('type')),
          }
        : {}),
      ...(resource.permissions.manageAccess
        ? {
            ...(!resource.projectHidden
              ? { projectId: String(values.get('projectId') ?? '') || null }
              : {}),
            ownerMembershipId: String(values.get('ownerMembershipId')),
          }
        : {}),
    });
  }
  function filter(key: string, value: string) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }
  const content = (
    <>
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
      {loading && <LoadingState label="Loading resources…" />}
      {!resourceId && (
        <>
          <div className="section-heading">
            <div>
              <h2>{projectId ? 'Project resources' : 'Resource registry'}</h2>
              <p>One organized view of the resources you can access.</p>
            </div>
            <div className="form-grid">
              <span>{data?.total ?? '—'} accessible</span>
              {(!projectId || writableProjects.includes(projectId)) && (
                <button
                  className="button"
                  disabled={busy || loading}
                  aria-expanded={showCreateForm}
                  aria-controls="add-resource-form"
                  id="add-resource-trigger"
                  onClick={() => setShowCreateForm((open) => !open)}
                >
                  {showCreateForm ? 'Cancel' : 'Add resource'}
                </button>
              )}
            </div>
          </div>
          {showCreateForm &&
            (!projectId || writableProjects.includes(projectId)) && (
              <section className="core-panel" id="add-resource-form">
                <h3>Add a resource</h3>
                <form onSubmit={create} className="core-form">
                  <label>
                    Title
                    <input
                      name="title"
                      autoFocus
                      required
                      minLength={2}
                      maxLength={180}
                    />
                  </label>
                  <label>
                    Description
                    <textarea name="description" maxLength={4000} rows={3} />
                  </label>
                  <div className="form-grid">
                    <label>
                      Source
                      <select
                        value={source}
                        onChange={(event) => setSource(event.target.value)}
                      >
                        <option value="EXTERNAL">External link</option>
                        <option value="UPLOAD">Private upload</option>
                      </select>
                    </label>
                    <label>
                      Type
                      <select name="type" defaultValue="LINK">
                        {categories.map((type) => (
                          <option key={type} value={type}>
                            {label(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!projectId && (
                      <label>
                        Project
                        <select name="projectId">
                          <option value="">Unassigned</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  {source === 'EXTERNAL' ? (
                    <label>
                      External URL
                      <input
                        name="externalUrl"
                        type="url"
                        required
                        maxLength={2048}
                        placeholder="https://"
                      />
                      <small>
                        Graqivo stores this link. The original provider controls
                        who can open it.
                      </small>
                    </label>
                  ) : (
                    <label>
                      File
                      <input
                        name="file"
                        type="file"
                        required
                        accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.png,.jpg,.jpeg"
                      />
                      <small>
                        Up to 25 MB. PDF, modern Office files, text, CSV, PNG,
                        and JPEG. The file type is determined from validated
                        content.
                      </small>
                    </label>
                  )}
                  <button className="button" disabled={busy}>
                    {busy ? 'Adding…' : 'Add resource'}
                  </button>
                </form>
              </section>
            )}
          <form
            className="registry-filters"
            onSubmit={(event) => event.preventDefault()}
          >
            <label>
              Search
              <input
                type="search"
                maxLength={150}
                placeholder="Search titles and descriptions"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            {!projectId && (
              <label>
                Project
                <select
                  value={filters.projectId ?? ''}
                  onChange={(event) => filter('projectId', event.target.value)}
                >
                  <option value="">All accessible projects</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Type
              <select
                value={filters.type ?? ''}
                onChange={(event) => filter('type', event.target.value)}
              >
                <option value="">All types</option>
                {categories.map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={filters.status ?? ''}
                onChange={(event) => filter('status', event.target.value)}
              >
                <option value="">Active and archived</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label>
              Associated person
              <select
                value={filters.personId ?? ''}
                onChange={(event) => filter('personId', event.target.value)}
              >
                <option value="">Anyone</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.user.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Review state
              <select
                value={filters.reviewState ?? ''}
                onChange={(event) => filter('reviewState', event.target.value)}
              >
                <option value="">All review states</option>
                {['NO_REVIEW', 'PENDING', 'APPROVED', 'CHANGES_REQUESTED'].map(
                  (state) => (
                    <option key={state} value={state}>
                      {label(state)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="filter-check">
              <input
                type="checkbox"
                checked={filters.mine === 'true'}
                onChange={(event) =>
                  filter('mine', event.target.checked ? 'true' : '')
                }
              />
              Added by me
            </label>
            {!projectId && (
              <label className="filter-check">
                <input
                  type="checkbox"
                  checked={filters.unassigned === 'true'}
                  onChange={(event) =>
                    filter('unassigned', event.target.checked ? 'true' : '')
                  }
                />
                Unassigned
              </label>
            )}
          </form>
          {!loading && data && (
            <>
              <div
                className="table-scroll registry-table"
                role="region"
                aria-label="Resource registry"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Resource</th>
                      <th>Project</th>
                      <th>People</th>
                      <th>Status / review</th>
                      <th>Last activity</th>
                      <th>Added by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <a href={href + '/registry/' + item.id}>
                            {item.title}
                          </a>
                          <small className="block-muted">
                            {label(item.type)} · {label(item.source)}
                            {item.source === 'UPLOAD'
                              ? ' · ' + label(item.uploadState)
                              : ''}
                          </small>
                        </td>
                        <td>
                          {item.project ? (
                            <a href={href + '/projects/' + item.project.id}>
                              {item.project.name}
                            </a>
                          ) : item.projectHidden ? (
                            'Restricted project'
                          ) : (
                            'Unassigned'
                          )}
                        </td>
                        <td>
                          {item.owner.user.name}
                          <small className="block-muted">
                            {item.access.length} explicit grants
                          </small>
                        </td>
                        <td>
                          {label(item.status)}
                          <small className="block-muted">
                            {label(item.reviewState)}
                          </small>
                        </td>
                        <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
                        <td>{item.createdBy.user.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.items.length && (
                <EmptyState
                  title="No matching resources"
                  description="Try adjusting your filters, or connect the first resource to this workspace."
                  action={
                    !projectId || writableProjects.includes(projectId)
                      ? {
                          label: 'Add resource',
                          onClick: () => setShowCreateForm(true),
                        }
                      : undefined
                  }
                />
              )}
              <nav className="registry-pagination" aria-label="Resource pages">
                <button
                  disabled={page === 1 || busy}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} · {data.total} results
                </span>
                <button
                  disabled={page * data.limit >= data.total || busy}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </nav>
            </>
          )}
        </>
      )}
      {!loading && resourceId && resource && (
        <>
          <a href={href + '/registry'}>← Registry</a>
          <div className="section-heading">
            <div>
              <span className="status-pill">
                {label(resource.type)} · {label(resource.status)}
              </span>
              <h2>{resource.title}</h2>
              <p>{resource.description || 'No description yet.'}</p>
            </div>
            {resource.source === 'EXTERNAL' ? (
              <a
                className="button"
                href={resource.externalUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open external resource ↗
              </a>
            ) : (
              <button
                className="button"
                disabled={busy || resource.uploadState !== 'READY'}
                onClick={download}
              >
                Download private file
              </button>
            )}
          </div>
          <section className="core-panel">
            <dl className="project-facts">
              <div>
                <dt>Project</dt>
                <dd>
                  {resource.project?.name ||
                    (resource.projectHidden
                      ? 'Restricted project'
                      : 'Unassigned')}
                </dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{resource.owner.user.name}</dd>
              </div>
              <div>
                <dt>Added by</dt>
                <dd>{resource.createdBy.user.name}</dd>
              </div>
              <div>
                <dt>Review state</dt>
                <dd>{label(resource.reviewState)}</dd>
              </div>
              {resource.source === 'UPLOAD' && (
                <div>
                  <dt>Upload</dt>
                  <dd>
                    {label(resource.uploadState)} ·{' '}
                    {resource.fileName ?? 'No file uploaded'}
                    {resource.fileSize
                      ? ' · ' + (resource.fileSize / 1024).toFixed(1) + ' KB'
                      : ''}
                  </dd>
                </div>
              )}
            </dl>
            <p>
              {resource.source === 'EXTERNAL'
                ? 'Access to this registry entry does not guarantee access at the original provider.'
                : 'Downloads require current workspace and resource access. Download links expire shortly after issuance.'}
            </p>
          </section>
          {resource.permissions.edit &&
            resource.source === 'UPLOAD' &&
            ['PENDING', 'FAILED'].includes(resource.uploadState) && (
              <section className="core-panel">
                <h3>Upload / retry file</h3>
                <form
                  className="core-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const values = new FormData(event.currentTarget);
                    const file = values.get('file');
                    if (!(file instanceof File)) return;
                    setBusy(true);
                    setError('');
                    try {
                      await sendFile(resource.id, file);
                      await load();
                      setMessage('File uploaded.');
                    } catch (failure) {
                      setError(
                        failure instanceof Error
                          ? failure.message
                          : 'Upload failed',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <input
                    aria-label="File to upload"
                    type="file"
                    name="file"
                    required
                    accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.png,.jpg,.jpeg"
                  />
                  <button className="button" disabled={busy}>
                    Upload file
                  </button>
                </form>
              </section>
            )}
          {resource.permissions.edit && (
            <section className="core-panel">
              <h3>Edit metadata</h3>
              <p>
                Changing content or assignment cancels any pending review and
                clears its current decision. Review history is retained.
              </p>
              <form
                key={resource.updatedAt}
                onSubmit={edit}
                className="core-form"
              >
                <label>
                  Title
                  <input
                    name="title"
                    required
                    minLength={2}
                    maxLength={180}
                    defaultValue={resource.title}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    maxLength={4000}
                    rows={3}
                    defaultValue={resource.description ?? ''}
                  />
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={resource.status}>
                    <option value="ACTIVE">Active</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </label>
                {resource.source === 'EXTERNAL' && (
                  <>
                    <label>
                      URL
                      <input
                        name="externalUrl"
                        type="url"
                        required
                        defaultValue={resource.externalUrl ?? ''}
                      />
                    </label>
                    <label>
                      Type
                      <select name="type" defaultValue={resource.type}>
                        {categories.map((type) => (
                          <option key={type} value={type}>
                            {label(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {resource.permissions.manageAccess && (
                  <>
                    <label>
                      Project
                      <select
                        name="projectId"
                        disabled={resource.projectHidden}
                        defaultValue={resource.projectId ?? ''}
                      >
                        <option value="">Unassigned</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Owner
                      <select
                        name="ownerMembershipId"
                        defaultValue={resource.owner.id}
                      >
                        {people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.user.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <button className="button" disabled={busy}>
                  Save resource
                </button>
              </form>
            </section>
          )}
          <section className="core-panel">
            <h3>Associated people and access</h3>
            <p>
              {resource.owner.user.name} owns this resource. Organization
              administrators and authorized project participants may also have
              access.
            </p>
            <ul>
              {resource.access.map((grant) => (
                <li key={grant.id}>
                  {grant.membership.user.name} · {label(grant.permission)}
                  {resource.permissions.manageAccess && (
                    <button
                      className="plain-button"
                      disabled={busy}
                      onClick={() =>
                        void change(
                          base + '/resources/' + resource.id + '/access',
                          'DELETE',
                          {
                            membershipId: grant.membership.id,
                            permission: grant.permission,
                          },
                        )
                      }
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {resource.permissions.manageAccess && (
              <form
                className="invite-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const values = new FormData(event.currentTarget);
                  void change(
                    base + '/resources/' + resource.id + '/access',
                    'POST',
                    {
                      membershipId: String(values.get('membershipId')),
                      permission: String(values.get('permission')),
                    },
                  );
                }}
              >
                <label>
                  Person
                  <select name="membershipId" required>
                    <option value="">Choose an active member</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.user.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Permission
                  <select name="permission">
                    <option value="VIEW">View</option>
                    <option value="EDIT">Edit</option>
                    <option value="REVIEW">Review</option>
                  </select>
                </label>
                <button className="button" disabled={busy}>
                  Grant access
                </button>
              </form>
            )}
            <small>
              Review access allows comments and responses to assigned review
              requests.
            </small>
          </section>
          <ResourceReviews slug={slug} resource={resource} onChange={load} />
          <ActivityFeed
            key={resource.updatedAt}
            slug={slug}
            resourceId={resource.id}
          />
          {resource.permissions.delete && (
            <section className="core-panel">
              <h3>Delete resource</h3>
              <p>
                Removes this entry from the registry and queues its private file
                for deletion. Its audit history is retained.
              </p>
              <button
                className="plain-button"
                disabled={busy}
                onClick={async () => {
                  if (
                    !window.confirm(
                      'Delete this resource and its uploaded file?',
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    await api(base + '/resources/' + resource.id, {
                      method: 'DELETE',
                    });
                    window.location.assign(href + '/registry');
                  } catch (failure) {
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : 'Deletion failed',
                    );
                    setBusy(false);
                  }
                }}
              >
                Delete resource
              </button>
            </section>
          )}
        </>
      )}
    </>
  );
  if (embedded) return <div className="embedded-registry">{content}</div>;
  return (
    <main
      id="main"
      tabIndex={-1}
      className="workspace-page core-workspace"
      style={workspaceStyle(access?.organization.theme)}
    >
      <WorkspaceHeader onError={setError} disabled={busy} />
      {access && (
        <>
          <WorkspaceIdentity
            organization={access.organization}
            role={access.role}
          />
          <WorkspaceNavigation
            slug={slug}
            current="registry"
            role={access.role}
          />
        </>
      )}
      {content}
    </main>
  );
}
