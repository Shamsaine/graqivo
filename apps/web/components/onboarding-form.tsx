'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Brand } from './brand';
import { api, ApiError, type Workspace } from '../lib/api';
export function OnboardingForm() {
  const [type, setType] = useState('ORGANIZATION');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setType(
      new URLSearchParams(window.location.search).get('type') === 'PERSONAL'
        ? 'PERSONAL'
        : 'ORGANIZATION',
    );
    api('/me')
      .then(() => setReady(true))
      .catch((failure) => {
        if (failure instanceof ApiError && failure.status === 401)
          window.location.assign('/login');
        else setError(failure.message);
      });
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const workspace = await api<Workspace>('/workspaces', {
        method: 'POST',
        body: { name, slug, workspaceType: type },
      });
      window.location.assign('/app/' + workspace.slug + '/overview');
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Please try again.',
      );
      setBusy(false);
    }
  }
  return (
    <main className="account-page">
      <Brand />
      <section className="account-panel">
        <span className="eyebrow">SET UP YOUR WORKSPACE</span>
        <h1>A place for your work.</h1>
        <p>You’ll become the Owner of this workspace.</p>
        {!ready && !error ? (
          <p>Checking your account…</p>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="type">Workspace type</label>
            <select
              id="type"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="ORGANIZATION">Organization</option>
              <option value="PERSONAL">Personal workspace</option>
            </select>
            <label htmlFor="workspace-name">
              {type === 'PERSONAL' ? 'Workspace name' : 'Organization name'}
            </label>
            <input
              id="workspace-name"
              value={name}
              required
              minLength={2}
              maxLength={100}
              onChange={(event) => {
                setName(event.target.value);
                setSlug(
                  event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                    .slice(0, 60),
                );
              }}
            />
            <label htmlFor="slug">Workspace address</label>
            <input
              id="slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              required
              minLength={3}
              maxLength={60}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
            <small>graqivo / app / {slug || 'your-workspace'}</small>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button" disabled={busy || !ready}>
              {busy ? 'Creating workspace…' : 'Create workspace'}
            </button>
          </form>
        )}
        <a href="/workspaces">Back to your workspaces</a>
      </section>
    </main>
  );
}
