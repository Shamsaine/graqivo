'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { LoadingState, EmptyState } from './feedback-state';
import { api, ApiError } from '../lib/api';
type Person = { id: string; user: { id: string; name: string } };
type Review = {
  id: string;
  type: string;
  comment: string | null;
  createdAt: string;
  author: Person;
};
type Request = {
  id: string;
  round: number;
  status: string;
  comment: string | null;
  createdAt: string;
  completedAt: string | null;
  requester: Person;
  reviewer: Person;
  reviews: Review[];
  resource?: { id: string; title: string; status: string; reviewState: string };
};
type History = { requests: Request[]; comments: Review[] };
function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (s) => s.toUpperCase());
}
function failure(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again';
}
export function ResourceReviews({
  slug,
  resource,
  onChange,
}: {
  slug: string;
  resource: {
    id: string;
    status: string;
    reviewState: string;
    source: string;
    uploadState: string;
    permissions: { edit: boolean; review: boolean };
  };
  onChange: () => Promise<void>;
}) {
  const base =
    '/workspaces/' + encodeURIComponent(slug) + '/resources/' + resource.id;
  const [history, setHistory] = useState<History>();
  const [reviewers, setReviewers] = useState<Person[]>([]);
  const [myId, setMyId] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const [next, me, access] = await Promise.all([
      api<History>(base + '/reviews'),
      api<{ id: string }>('/me'),
      api<{ role: string }>('/workspaces/' + encodeURIComponent(slug)),
    ]);
    setHistory(next);
    setMyId(me.id);
    setRole(access.role);
    if (resource.permissions.edit)
      setReviewers(await api<Person[]>(base + '/reviewers'));
  }
  useEffect(() => {
    setHistory(undefined);
    setError('');
    load().catch((e) => setError(failure(e)));
  }, [
    slug,
    resource.id,
    resource.reviewState,
    resource.permissions.edit,
    resource.permissions.review,
  ]);
  const pending = history?.requests.find((item) => item.status === 'PENDING');
  const canDecide =
    resource.permissions.review &&
    (role !== 'MEMBER' || pending?.reviewer.user.id === myId);
  const writable =
    resource.status === 'ACTIVE' &&
    (resource.source !== 'UPLOAD' || resource.uploadState === 'READY');
  async function write(path: string, body: unknown, form?: HTMLFormElement) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method: 'POST', body });
      form?.reset();
      await onChange();
      await load();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void write(
      base + '/review-requests',
      {
        reviewerMembershipId: String(data.get('reviewerMembershipId')),
        comment: String(data.get('comment')),
      },
      event.currentTarget,
    );
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const type = String(data.get('type'));
    void write(
      base + '/reviews',
      {
        type,
        comment: String(data.get('comment')),
        ...(pending ? { requestId: pending.id } : {}),
      },
      event.currentTarget,
    );
  }
  function review(item: Review) {
    return (
      <li key={item.id}>
        <strong>
          {label(item.type)} · {item.author.user.name}
        </strong>
        {item.comment && <p className="review-comment">{item.comment}</p>}
        <time>{new Date(item.createdAt).toLocaleString()}</time>
      </li>
    );
  }
  return (
    <section className="core-panel">
      <div className="section-heading">
        <h3>Reviews</h3>
        <span className="role-chip">{label(resource.reviewState)}</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!history && !error && <LoadingState label="Loading review history…" />}
      {pending && (
        <div className="review-request">
          <strong>
            Round {pending.round} · awaiting {pending.reviewer.user.name}
          </strong>
          <p>
            Requested by {pending.requester.user.name} ·{' '}
            {new Date(pending.createdAt).toLocaleString()}
          </p>
          {pending.comment && (
            <p className="review-comment">{pending.comment}</p>
          )}
          {resource.permissions.edit && (
            <button
              className="plain-button"
              disabled={busy}
              onClick={() =>
                void write(
                  base + '/review-requests/' + pending.id + '/cancel',
                  {},
                )
              }
            >
              Cancel request
            </button>
          )}
        </div>
      )}
      {writable && resource.permissions.edit && history && !pending && (
        <form className="core-form" onSubmit={request}>
          <h4>Request a review</h4>
          <label>
            Reviewer
            <select name="reviewerMembershipId" required>
              <option value="">Choose a member with Review access</option>
              {reviewers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.user.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note
            <textarea name="comment" maxLength={4000} rows={2} />
          </label>
          <button className="button" disabled={busy || reviewers.length === 0}>
            Request review
          </button>
          <small>
            Assign Review access in the resource permissions if your reviewer is
            missing.
          </small>
        </form>
      )}
      {writable && resource.permissions.review && history && (
        <form className="core-form" onSubmit={submit}>
          <h4>{pending ? 'Respond to review' : 'Add a review comment'}</h4>
          <label>
            Response
            <select name="type">
              <option value="COMMENT">Comment</option>
              {pending && canDecide && (
                <>
                  <option value="APPROVAL">Approve</option>
                  <option value="CHANGES_REQUESTED">Request changes</option>
                </>
              )}
            </select>
          </label>
          <label>
            Comment
            <textarea name="comment" maxLength={4000} rows={3} />
          </label>
          <small>
            Comments and change requests require a note. Decisions are final for
            this round.
          </small>
          <button className="button" disabled={busy}>
            Submit response
          </button>
        </form>
      )}
      {!writable && (
        <p>Review actions require an active resource with its file ready.</p>
      )}
      {history && (
        <>
          <h4>Review history</h4>
          <small>
            Latest 50 rounds and up to 50 recent comments per round.
          </small>
          {!history.requests.length && !history.comments.length ? (
            <EmptyState
              title="No reviews yet"
              description="Review requests and decisions will appear here. Members with Review access can leave feedback."
            />
          ) : (
            <>
              <ol className="review-history">
                {history.requests.map((item) => (
                  <li key={item.id}>
                    <strong>
                      Round {item.round} · {label(item.status)}
                    </strong>
                    <p>
                      {item.requester.user.name} requested review from{' '}
                      {item.reviewer.user.name} ·{' '}
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                    {item.comment && (
                      <p className="review-comment">{item.comment}</p>
                    )}
                    <ol>{item.reviews.map(review)}</ol>
                    {item.completedAt && (
                      <small>
                        Closed {new Date(item.completedAt).toLocaleString()}
                      </small>
                    )}
                  </li>
                ))}
              </ol>
              {history.comments.length > 0 && (
                <>
                  <h4>Other review comments</h4>
                  <ol className="review-history">
                    {history.comments.map(review)}
                  </ol>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
export function ReviewList({
  slug,
  projectId,
}: {
  slug: string;
  projectId?: string;
}) {
  const [result, setResult] = useState<{ total: number; items: Request[] }>();
  const [status, setStatus] = useState('PENDING');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  useEffect(() => {
    setResult(undefined);
    setError('');
    const query = new URLSearchParams({
      page: String(page),
      limit: '20',
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
      ...(mine ? { mine: 'true' } : {}),
    });
    api<{ total: number; items: Request[] }>(
      '/workspaces/' + encodeURIComponent(slug) + '/reviews?' + query,
    )
      .then(setResult)
      .catch((e) => setError(failure(e)));
  }, [slug, projectId, status, mine, page]);
  const href = '/app/' + encodeURIComponent(slug);
  return (
    <section className="core-panel">
      <h3>Review requests</h3>
      <div className="registry-filters">
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {['PENDING', 'COMPLETED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => {
              setMine(e.target.checked);
              setPage(1);
            }}
          />
          Assigned to me
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <LoadingState label="Loading reviews…" />}
      {result && (
        <>
          {result.items.length ? (
            <ol className="review-history">
              {result.items.map((r) => (
                <li key={r.id}>
                  <a href={href + '/registry/' + r.resource!.id}>
                    <strong>{r.resource!.title}</strong>
                  </a>
                  <p>
                    Round {r.round} · {label(r.status)} · reviewer{' '}
                    {r.reviewer.user.name}
                  </p>
                  {r.comment && <p className="review-comment">{r.comment}</p>}
                  <time>{new Date(r.createdAt).toLocaleString()}</time>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              title="No matching review requests"
              description="Try another status, or open a resource to request a review."
            />
          )}
          <div className="registry-pagination">
            <button
              className="plain-button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              {result.total} requests · page {page}
            </span>
            <button
              className="plain-button"
              disabled={page * 20 >= result.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
type Activity = {
  id: string;
  action: string;
  createdAt: string;
  actor: { user: { name: string } } | null;
  project: { id: string; name: string } | null;
  resource: { id: string; title: string } | null;
};
export function ActivityFeed({
  slug,
  projectId,
  resourceId,
  actorId,
}: {
  slug: string;
  projectId?: string;
  resourceId?: string;
  actorId?: string;
}) {
  const [result, setResult] = useState<{ total: number; items: Activity[] }>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  useEffect(() => {
    setResult(undefined);
    setError('');
    const query = new URLSearchParams({
      page: String(page),
      limit: '20',
      ...(projectId ? { projectId } : {}),
      ...(resourceId ? { resourceId } : {}),
      ...(actorId ? { actorId } : {}),
    });
    api<{ total: number; items: Activity[] }>(
      '/workspaces/' + encodeURIComponent(slug) + '/activities?' + query,
    )
      .then(setResult)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401)
          window.location.assign('/login');
        else setError(failure(e));
      });
  }, [slug, projectId, resourceId, actorId, page]);
  const href = '/app/' + encodeURIComponent(slug);
  return (
    <section className="core-panel">
      <h3>
        {resourceId ? 'Resource' : projectId ? 'Project' : 'Workspace'} activity
      </h3>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <LoadingState label="Loading activity…" />}
      {result && (
        <>
          {result.items.length ? (
            <ol className="activity-list">
              {result.items.map((item) => (
                <li key={item.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{label(item.action)}</strong>
                    <p>
                      {item.actor?.user.name ?? 'Workspace member'}
                      {item.resource && (
                        <>
                          {' '}
                          ·{' '}
                          <a href={href + '/registry/' + item.resource.id}>
                            {item.resource.title}
                          </a>
                        </>
                      )}
                      {item.project && (
                        <>
                          {' '}
                          ·{' '}
                          <a href={href + '/projects/' + item.project.id}>
                            {item.project.name}
                          </a>
                        </>
                      )}
                    </p>
                    <time>{new Date(item.createdAt).toLocaleString()}</time>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              title="A fresh start"
              description="Activity appears here as authorized projects, resources, and reviews change."
            />
          )}
          <div className="registry-pagination">
            <button
              className="plain-button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              {result.total} events · page {page}
            </span>
            <button
              className="plain-button"
              disabled={page * 20 >= result.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
