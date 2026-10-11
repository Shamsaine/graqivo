'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Brand } from './brand';
import { api } from '../lib/api';
type Mode = 'register' | 'login' | 'forgot' | 'reset';
const titles = {
  register: 'Bring your work together.',
  login: 'Welcome back.',
  forgot: 'Reset your password.',
  reset: 'Choose a new password.',
};
export function AccountForm({ mode }: { mode: Mode }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetToken, setResetToken] = useState('');
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has('error'))
      setError('This email link is invalid or expired. Request a new one.');
    if (query.get('verified') === '1')
      setMessage('Email verified. Sign in to create or open your workspace.');
    if (mode === 'reset') {
      setResetToken(
        (previous) =>
          previous ||
          new URLSearchParams(window.location.hash.slice(1)).get('token') ||
          '',
      );
      window.history.replaceState(null, '', '/reset-password');
    }
  }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '')
      .trim()
      .toLowerCase();
    const password = String(data.get('password') ?? '');
    try {
      if (mode === 'register') {
        const type =
          data.get('workspaceType') === 'PERSONAL'
            ? 'PERSONAL'
            : 'ORGANIZATION';
        await api('/api/auth/sign-up/email', {
          method: 'POST',
          body: {
            name: String(data.get('name')).trim(),
            email,
            password,
            callbackURL:
              window.location.origin + '/login?verified=1&type=' + type,
          },
        });
        setMessage(
          'Check your inbox for a verification link. If this address is already registered, sign in or reset your password.',
        );
      } else if (mode === 'login') {
        await api('/api/auth/sign-in/email', {
          method: 'POST',
          body: { email, password },
        });
        const type = new URLSearchParams(window.location.search).get('type');
        window.location.assign(
          type
            ? '/onboarding?type=' +
                (type === 'PERSONAL' ? 'PERSONAL' : 'ORGANIZATION')
            : '/workspaces',
        );
      } else if (mode === 'forgot') {
        await api('/api/auth/request-password-reset', {
          method: 'POST',
          body: {
            email,
            redirectTo: window.location.origin + '/reset-password',
          },
        });
        setMessage(
          'If an account exists for this address, a password reset link will arrive by email.',
        );
      } else {
        if (!resetToken)
          throw new Error('Reopen your password reset link from the email.');
        await api('/api/auth/reset-password', {
          method: 'POST',
          body: { token: resetToken, newPassword: password },
        });
        setResetToken('');
        setMessage(
          'Password updated. Your previous sessions have been signed out.',
        );
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    const input = document.getElementById('email') as HTMLInputElement | null;
    if (!input?.value || !input.checkValidity()) {
      setError('Enter your email address first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/send-verification-email', {
        method: 'POST',
        body: {
          email: input.value.trim().toLowerCase(),
          callbackURL: window.location.origin + '/login?verified=1',
        },
      });
      setMessage('If verification is needed, a new link will arrive by email.');
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-page">
      <Brand />
      <section className="account-panel">
        <span className="eyebrow">YOUR WORK, CONNECTED.</span>
        <h1>{titles[mode]}</h1>
        <p>
          {mode === 'register'
            ? 'Create your account, verify your email, then set up your workspace.'
            : 'Connect to your Graqivo workspace.'}
        </p>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
              />
              <label htmlFor="workspaceType">Workspace</label>
              <select id="workspaceType" name="workspaceType">
                <option value="ORGANIZATION">An organization</option>
                <option value="PERSONAL">My personal workspace</option>
              </select>
            </>
          )}
          {mode !== 'reset' && (
            <>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </>
          )}
          {mode !== 'forgot' && (
            <>
              <label htmlFor="password">
                {mode === 'reset' ? 'New password' : 'Password'}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                required
                minLength={mode === 'login' ? 1 : 12}
                maxLength={128}
              />
              {mode !== 'login' && <small>Use at least 12 characters.</small>}
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
          <button className="button" type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'register'
                ? 'Create account'
                : mode === 'login'
                  ? 'Sign in'
                  : mode === 'forgot'
                    ? 'Send reset link'
                    : 'Update password'}
          </button>
        </form>
        {mode === 'login' && (
          <>
            <a href="/forgot-password">Forgot password?</a>
            <button
              className="plain-button"
              type="button"
              disabled={busy}
              onClick={resend}
            >
              Resend verification email
            </button>
          </>
        )}
        <div className="account-links">
          {mode === 'register' ? (
            <a href="/login">Already have an account? Sign in</a>
          ) : mode === 'reset' ? (
            <a href="/login">Sign in</a>
          ) : (
            <a href="/register">Create an account</a>
          )}
          <a href="/">Back to Graqivo</a>
        </div>
      </section>
    </main>
  );
}
