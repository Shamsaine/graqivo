import { Brand } from '../../components/brand';
export default function Welcome() {
  return (
    <main className="status-page">
      <Brand />
      <span className="eyebrow">DEVELOPMENT CHECKPOINT</span>
      <h1>Your workspace starts here.</h1>
      <p>
        Phase 2 adds verified accounts, personal and organization workspaces,
        invitations, and workspace roles.
      </p>
      <ol>
        <li>Foundation</li>
        <li>
          <strong>Authentication and tenant isolation</strong> — current
          checkpoint
        </li>
        <li>Workspace, projects, and people</li>
        <li>Resource registry and private uploads</li>
        <li>Reviews and activity</li>
        <li>Design refinement</li>
        <li>Hosted pilot deployment</li>
        <li>Acceptance and security testing</li>
      </ol>
      <p>
        Projects, resources, uploads, and reviews are coming in later phases.
      </p>
      <a className="button" href="/register">
        Create your account
      </a>
      <a className="text-link" href="/">
        ← Back to Graqivo
      </a>
    </main>
  );
}
