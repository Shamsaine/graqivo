import { Brand } from '../../components/brand';
export default function Welcome() {
  return (
    <main className="status-page">
      <Brand />
      <span className="eyebrow">DEVELOPMENT CHECKPOINT</span>
      <h1>Your work, reviewed.</h1>
      <p>
        Phase 5 adds review requests, comments, approvals, change requests,
        review history and authorized activity feeds.
      </p>
      <ol>
        <li>Foundation</li>
        <li>Authentication and tenant isolation</li>
        <li>Workspace, projects, and people</li>
        <li>Resource registry and private uploads</li>
        <li>
          <strong>Reviews and activity</strong> — current checkpoint
        </li>
        <li>Design refinement</li>
        <li>Hosted pilot deployment</li>
        <li>Acceptance and security testing</li>
      </ol>
      <p>Final design refinement is next in Phase 6.</p>
      <a className="button" href="/workspaces">
        Open your workspace
      </a>
      <a className="text-link" href="/">
        ← Back to Graqivo
      </a>
    </main>
  );
}
