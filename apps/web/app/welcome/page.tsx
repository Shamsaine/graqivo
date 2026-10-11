import { Brand } from '../../components/brand';
export default function Welcome() {
  return (
    <main className="status-page">
      <Brand />
      <span className="eyebrow">DEVELOPMENT CHECKPOINT</span>
      <h1>Your resources, connected.</h1>
      <p>
        Phase 4 adds the resource registry, external links, private uploads,
        resource access grants, and authorized downloads.
      </p>
      <ol>
        <li>Foundation</li>
        <li>Authentication and tenant isolation</li>
        <li>Workspace, projects, and people</li>
        <li>
          <strong>Resource registry and private uploads</strong> — current
          checkpoint
        </li>
        <li>Reviews and activity</li>
        <li>Design refinement</li>
        <li>Hosted pilot deployment</li>
        <li>Acceptance and security testing</li>
      </ol>
      <p>Reviews and approvals arrive in Phase 5.</p>
      <a className="button" href="/workspaces">
        Open your workspace
      </a>
      <a className="text-link" href="/">
        ← Back to Graqivo
      </a>
    </main>
  );
}
