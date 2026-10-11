'use client';
import { useEffect, useState } from 'react';
import { Brand } from './brand';
import { api, ApiError } from '../lib/api';
export function InvitationAccept() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setToken(
      (previous) =>
        previous ||
        new URLSearchParams(window.location.hash.slice(1)).get('token') ||
        '',
    );
    window.history.replaceState(null, '', '/invitations/accept');
    api('/me')
      .then(() => setReady(true))
      .catch((failure) => {
        if (failure instanceof ApiError && failure.status === 401)
          setSignedOut(true);
        else setError(failure.message);
      });
  }, []);
  async function accept() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ slug: string }>('/invitations/accept', {
        method: 'POST',
        body: { token },
      });
      setToken('');
      window.location.assign('/app/' + result.slug + '/overview');
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
        <h1>Join your workspace.</h1>
        <p>Accept this invitation using the verified account it was sent to.</p>
        {signedOut ? (
          <>
            <p>
              Sign in or create an account, verify your email, then reopen the
              invitation link from your email.
            </p>
            <a className="button" href="/login">
              Sign in
            </a>
            <a href="/register">Create an account</a>
          </>
        ) : ready ? (
          <button className="button" disabled={busy || !token} onClick={accept}>
            {busy ? 'Joining…' : 'Accept invitation'}
          </button>
        ) : (
          <p>Checking your account…</p>
        )}
        {ready && !token && <p>Open the invitation link from your email.</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
