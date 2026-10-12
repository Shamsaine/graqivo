'use client';
import { useEffect } from 'react';
import { Brand } from '../components/brand';
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    document.title = 'Something went wrong · Graqivo';
  }, []);
  return (
    <main id="main" tabIndex={-1} className="account-page">
      <Brand />
      <section className="account-panel">
        <span className="eyebrow">LET’S TRY THAT AGAIN</span>
        <h1>We couldn’t open this page.</h1>
        <p>Your work is still in your workspace. Try reloading this view.</p>
        <button className="button" onClick={reset}>
          Try again
        </button>
        <a href="/workspaces">Back to workspaces</a>
      </section>
    </main>
  );
}
