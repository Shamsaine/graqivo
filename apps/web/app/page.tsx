import {
  ArrowUpRight,
  Layers3,
  Link2,
  Users,
  CheckCheck,
  ArrowRight,
  FolderKanban,
  FileText,
  GitBranch,
  UserRound,
  Building2,
} from 'lucide-react';
import { Brand, BrandMark } from '../components/brand';
const pillars = [
  {
    icon: Link2,
    title: 'Connect',
    text: 'Bring projects, people, and resources together. Give every link a place and a purpose.',
  },
  {
    icon: Layers3,
    title: 'Understand',
    text: 'See what exists, who is involved, and which work needs attention.',
  },
  {
    icon: CheckCheck,
    title: 'Coordinate',
    text: 'Keep review requests, feedback, and decisions close to the work.',
  },
];
export default function Home() {
  return (
    <div className="marketing">
      <header className="nav">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#workspace">The workspace</a>
          <a href="/login">Sign in</a>
          <a className="button small" href="/register">
            Get started <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span />
              YOUR WORK, CONNECTED.
            </span>
            <h1>
              Your organization’s work shouldn’t be <span>scattered.</span>
            </h1>
            <p>
              Your projects, documents, people, and decisions belong to one
              bigger picture. Graqivo connects them, without forcing you to
              abandon the tools you already use.
            </p>
            <div className="hero-actions">
              <a className="button" href="/register">
                Get started <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a className="button secondary" href="/login">
                Sign in
              </a>
            </div>
            <p className="hero-note">
              For teams working together. And individuals finding their focus.
            </p>
          </div>
          <div
            className="connection-board"
            role="img"
            aria-label="Projects, resources, people, and decisions connected in one Graqivo workspace"
          >
            <div className="board-grid" aria-hidden="true" />
            <span className="board-caption">THE BIGGER PICTURE</span>
            <svg
              className="connection-lines"
              viewBox="0 0 440 360"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="connection" x2="1" y2="1">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#14b8a6" />
                </linearGradient>
              </defs>
              <path
                d="M100 95Q180 100 220 180T350 265M340 95Q260 105 220 180T95 265"
                stroke="url(#connection)"
                strokeWidth="2"
                fill="none"
              />
              <circle
                cx="220"
                cy="180"
                r="75"
                fill="none"
                stroke="#94a3b8"
                strokeOpacity=".15"
                strokeDasharray="3 7"
              />
            </svg>
            <div className="connection-center" aria-hidden="true">
              <BrandMark />
              <span>graqivo</span>
            </div>
            <div className="connection-node node-project">
              <FolderKanban size={19} aria-hidden="true" />
              <span>Projects</span>
            </div>
            <div className="connection-node node-resource">
              <FileText size={19} aria-hidden="true" />
              <span>Resources</span>
            </div>
            <div className="connection-node node-people">
              <Users size={19} aria-hidden="true" />
              <span>People</span>
            </div>
            <div className="connection-node node-review">
              <CheckCheck size={19} aria-hidden="true" />
              <span>Decisions</span>
            </div>
            <p className="board-note">Your tools. One connected context.</p>
          </div>
        </section>
        <section className="fragmentation section">
          <span className="eyebrow">FAMILIAR TOOLS. A SHARED PICTURE.</span>
          <h2>
            The work is there.
            <br />
            The context shouldn’t be missing.
          </h2>
          <p>
            A document in one tab. A decision in another. People searching for
            the latest link. Graqivo gives that scattered work a shared home, so
            the next person can pick up the thread.
          </p>
          <div className="tool-tags" aria-label="Resources you can connect">
            <span>
              <FileText size={16} aria-hidden="true" />
              Documents & sheets
            </span>
            <span>
              <Link2 size={16} aria-hidden="true" />
              Designs & links
            </span>
            <span>
              <GitBranch size={16} aria-hidden="true" />
              Repositories
            </span>
          </div>
          <small>
            Connect resources by link. Access to the original file stays with
            its provider.
          </small>
        </section>
        <section id="how" className="section">
          <div className="marketing-heading">
            <span className="eyebrow">LESS FRAGMENTATION. MORE CONTEXT.</span>
            <h2>A place for the bigger picture.</h2>
            <p>
              Keep the original files where they belong. Bring their context
              together here.
            </p>
          </div>
          <div className="pillars">
            {pillars.map(({ icon: Icon, title, text }, i) => (
              <article key={title}>
                <span className="number">0{i + 1}</span>
                <div className="feature-icon">
                  <Icon size={24} aria-hidden="true" />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="workspace" className="section workspace">
          <div>
            <span className="eyebrow">BUILT AROUND YOUR WORK</span>
            <h2>
              Everything has a place.
              <br />
              And a connection.
            </h2>
            <p>
              From the first project link to the final review, keep the people
              and decisions around your work in view.
            </p>
            <a className="inline-link" href="/register">
              Find your starting point{' '}
              <ArrowRight size={17} aria-hidden="true" />
            </a>
          </div>
          <div className="feature-list">
            {[
              {
                icon: FolderKanban,
                title: 'Projects with context',
                text: 'Connect resources, people, dates, reviews, and activity to a shared purpose.',
              },
              {
                icon: Layers3,
                title: 'One resource registry',
                text: 'Search and filter external links and private uploads across the workspace.',
              },
              {
                icon: CheckCheck,
                title: 'Clear reviews and decisions',
                text: 'Request a review. Leave feedback. Approve or request changes with a visible history.',
              },
              {
                icon: Users,
                title: 'People and responsibilities',
                text: 'See who is involved and which projects connect them to the work.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span className="feature-icon">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="section">
          <div className="marketing-heading">
            <span className="eyebrow">MAKE ROOM FOR THE WAY YOU WORK</span>
            <h2>Shared work. Personal focus.</h2>
            <p>
              A workspace for your organization, or a place to organize your own
              projects.
            </p>
          </div>
          <div className="workspace-options">
            <article>
              <Building2 size={27} aria-hidden="true" />
              <h3>For organizations</h3>
              <p>
                Invite your team, connect projects, and coordinate reviews.
                Membership and resource permissions shape what each person can
                access.
              </p>
              <a className="inline-link" href="/register">
                Create an organization{' '}
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </article>
            <article>
              <UserRound size={27} aria-hidden="true" />
              <h3>For individuals</h3>
              <p>
                Bring your personal projects, reference material, and decisions
                into one organized workspace. No company details needed.
              </p>
              <a className="inline-link" href="/register">
                Start a personal workspace{' '}
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </article>
          </div>
        </section>
        <section id="getting-started" className="section">
          <div className="marketing-heading">
            <span className="eyebrow">A SIMPLE START</span>
            <h2>One connection at a time.</h2>
          </div>
          <ol className="getting-started">
            {[
              [
                'Create your account',
                'Register and verify your email. Choose an organization or personal workspace.',
              ],
              [
                'Bring the work together',
                'Create a project, add a resource link or private file, and connect the people involved.',
              ],
              [
                'Keep the picture clear',
                'Request reviews, record decisions, and follow activity as the work moves forward.',
              ],
            ].map(([title, text], i) => (
              <li key={title}>
                <span className="step-count" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="closing">
          <Brand light />
          <h2>Bring your work together.</h2>
          <p>
            Your projects, people, documents, and decisions.
            <br />
            One organized workspace.
          </p>
          <a href="/register" className="button">
            Create your workspace <ArrowRight size={18} aria-hidden="true" />
          </a>
        </section>
      </main>
      <footer>
        <Brand />
        <span>Your work, connected.</span>
        <span>© {new Date().getFullYear()} Alteturia Studios</span>
        <a href="/login">Sign in</a>
      </footer>
    </div>
  );
}
