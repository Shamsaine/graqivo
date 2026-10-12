import { Brand } from '../../components/brand';
export default function Welcome() {
  return (
    <main id="main" tabIndex={-1} className="status-page">
      <Brand />
      <span className="eyebrow">DEVELOPMENT CHECKPOINT</span>
      <h1>Your work, connected.</h1>
      <p>
        Phase 6 applies Graqivo’s visual identity, responsive workspace layouts,
        organization themes, loading and empty states, and accessibility
        refinements.
      </p>
      <ol>
        <li>Foundation</li>
        <li>Authentication and tenant isolation</li>
        <li>Workspace, projects, and people</li>
        <li>Resource registry and private uploads</li>
        <li>Reviews and activity</li>
        <li>
          <strong>Visual design and branding</strong> — current checkpoint
        </li>
        <li>Hosted pilot deployment</li>
        <li>Acceptance and security testing</li>
      </ol>
      <p>
        Hosted deployment and the complete pilot acceptance workflow remain
        pending.
      </p>
      <a className="button" href="/workspaces">
        Open your workspace
      </a>
      <a className="text-link" href="/">
        ← Back to Graqivo
      </a>
    </main>
  );
}
