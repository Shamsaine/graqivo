import { Brand } from '../components/brand';
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="account-page">
      <Brand />
      <section className="account-panel">
        <span className="eyebrow">PAGE NOT FOUND</span>
        <h1>This page isn’t here.</h1>
        <p>
          Check the address, or return to your workspaces to find what you need.
        </p>
        <a className="button" href="/workspaces">
          Open workspaces
        </a>
        <a href="/">Back to Graqivo</a>
      </section>
    </main>
  );
}
