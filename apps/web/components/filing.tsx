'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Membership, type Workspace } from '../lib/api';
import {
  WorkspaceHeader,
  WorkspaceIdentity,
  WorkspaceNavigation,
} from './workspace-chrome';
import { EmptyState, LoadingState } from './feedback-state';

type Category = {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  description: string | null;
};
type FilingItem = {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  purpose: string | null;
  keywords: string[];
  type: string;
  project: { id: string; name: string } | null;
  filing: {
    referenceNumber: string;
    recordDate: string;
    confidentialityLevel: string;
    filingCategory: { id: string; name: string; code: string };
  } | null;
};

function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (s) => s.toUpperCase());
}

export function Filing({ slug }: { slug: string }) {
  const base = '/workspaces/' + encodeURIComponent(slug);
  const href = '/app/' + encodeURIComponent(slug);
  const [access, setAccess] = useState<{
    organization: Workspace;
    role: Membership['role'];
  }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<FilingItem[]>([]);
  const [search, setSearch] = useState('');
  const [filed, setFiled] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);

  async function load() {
    const current = await api<{
      organization: Workspace;
      role: Membership['role'];
    }>(base);
    const [categoryRows, page] = await Promise.all([
      api<Category[]>(base + '/filing/categories'),
      api<{ items: FilingItem[] }>(
        base +
          '/filing/resources?' +
          new URLSearchParams({
            ...(search ? { search } : {}),
            ...(filed ? { filed } : {}),
            ...(categoryId ? { categoryId } : {}),
            limit: '50',
          }),
      ),
    ]);
    setAccess(current);
    setCategories(categoryRows);
    setItems(page.items);
  }

  useEffect(() => {
    setLoading(true);
    setError('');
    load()
      .catch((failure) => {
        if (failure instanceof ApiError && failure.status === 401)
          window.location.assign('/login');
        else
          setError(
            failure instanceof Error ? failure.message : 'Filing unavailable',
          );
      })
      .finally(() => setLoading(false));
  }, [slug, search, filed, categoryId]);
  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setCategoryBusy(true);
    setError('');
    try {
      await api(base + '/filing/categories', {
        method: 'POST',
        body: {
          name: String(values.get('name')),
          code: String(values.get('code')),
          description: String(values.get('description') ?? ''),
        },
      });
      event.currentTarget.reset();
      await load();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Category could not be created',
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  if (!access) {
    return (
      <main className="workspace-shell">
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <LoadingState label="Loading filing…" />
        )}
      </main>
    );
  }

  return (
    <div className="workspace-shell">
      <WorkspaceHeader onError={setError} disabled={loading} />
      <WorkspaceIdentity
        organization={access.organization}
        role={access.role}
      />
      <WorkspaceNavigation slug={slug} current="filing" role={access.role} />
      <main id="main-content" className="workspace-main">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="section-heading">
          <div>
            <span className="eyebrow">DIGITAL FILING</span>
            <h2>What are you looking for?</h2>
            <p>
              Find a document by title, description, subject, project, or filing
              reference.
            </p>
          </div>
        </div>
        <section className="core-panel">
          <form
            className="registry-filters"
            onSubmit={(event) => event.preventDefault()}
          >
            <label>
              Search
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Describe the document or information you’re looking for…"
                maxLength={150}
              />
            </label>
            <label>
              Filing status
              <select
                value={filed}
                onChange={(event) => setFiled(event.target.value)}
              >
                <option value="">Filed and unfiled</option>
                <option value="true">Filed only</option>
                <option value="false">Unfiled only</option>
              </select>
            </label>
            <label>
              Category
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.code} · {category.name}
                  </option>
                ))}
              </select>
            </label>
          </form>
        </section>
        {access.role !== 'MEMBER' && (
          <details className="core-panel">
            <summary>Manage filing categories</summary>
            <form className="core-form" onSubmit={createCategory}>
              <label>
                Category name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="Financial reports"
                />
              </label>
              <label>
                Category code
                <input
                  name="code"
                  required
                  minLength={1}
                  maxLength={24}
                  placeholder="FIN"
                />
              </label>
              <label>
                Description
                <textarea name="description" maxLength={1000} rows={2} />
              </label>
              <button className="button" disabled={categoryBusy}>
                {categoryBusy ? 'Creating…' : 'Create category'}
              </button>
            </form>
          </details>
        )}
        {loading && <LoadingState label="Searching resources…" />}
        {!loading && !items.length && (
          <EmptyState
            title={
              search || filed
                ? 'No matching resources'
                : 'No resources in filing'
            }
            description="Try another search or register a resource in the Registry first."
          />
        )}
        {!loading && items.length > 0 && (
          <section className="resource-list" aria-label="Filing resources">
            {items.map((item) => (
              <article className="core-panel" key={item.id}>
                <div className="section-heading">
                  <div>
                    <span className="status-pill">{label(item.type)}</span>
                    <h3>{item.title}</h3>
                    <p>
                      {item.description ||
                        item.purpose ||
                        'No description yet.'}
                    </p>
                    {item.keywords.length > 0 && (
                      <small>{item.keywords.join(' · ')}</small>
                    )}
                  </div>
                  <a
                    className="button"
                    href={href + '/registry/' + encodeURIComponent(item.id)}
                  >
                    View details
                  </a>
                </div>
                <dl className="project-facts">
                  <div>
                    <dt>Project</dt>
                    <dd>{item.project?.name || 'Unassigned'}</dd>
                  </div>
                  <div>
                    <dt>Filing</dt>
                    <dd>
                      {item.filing
                        ? `${item.filing.filingCategory.name} · ${item.filing.referenceNumber}`
                        : 'Unfiled'}
                    </dd>
                  </div>
                  {item.filing && (
                    <div>
                      <dt>Confidentiality</dt>
                      <dd>{label(item.filing.confidentialityLevel)}</dd>
                    </div>
                  )}
                </dl>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
