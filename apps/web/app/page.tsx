import {
  ArrowUpRight,
  Layers3,
  Link2,
  Users,
  CheckCheck,
  ArrowRight,
} from 'lucide-react';
import { Brand } from '../components/brand';
export default function Home() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#workspace">The workspace</a>
          <a className="button small" href="/login">
            Sign in <ArrowUpRight size={15} />
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="hero">
          <div className="eyebrow">
            <span /> YOUR WORK, CONNECTED.
          </div>
          <h1>
            Your organization’s work shouldn’t be <span>scattered.</span>
          </h1>
          <p>
            Your projects, documents, people, and decisions belong to one bigger
            picture. Graqivo connects them, without forcing you to abandon the
            tools you already use.
          </p>
          <a className="button" href="/register">
            Get started <ArrowRight size={18} />
          </a>
          <a className="text-link" href="/welcome">
            View development progress <ArrowUpRight size={16} />
          </a>
          <div className="hero-note">
            One connected workspace. The tools you already know.
          </div>
        </section>
        <section id="how" className="section">
          <div className="section-heading">
            <span className="eyebrow">LESS FRAGMENTATION. MORE CONTEXT.</span>
            <h2>A place for the bigger picture.</h2>
            <p>
              Keep the original files where they belong. Bring their context
              together here.
            </p>
          </div>
          <div className="pillars">
            {[
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
                text: 'Organize reviews and responsibilities around the work itself.',
              },
            ].map(({ icon: Icon, title, text }, i) => (
              <article key={title}>
                <span className="number">0{i + 1}</span>
                <Icon size={25} />
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
              Everything has
              <br />a place. And a connection.
            </h2>
            <p>
              For organizations working together and individuals organizing
              their own workspace.
            </p>
          </div>
          <div className="feature-list">
            {[
              {
                icon: Layers3,
                title: 'Projects with context',
                text: 'Resources, people, reviews, and activity connected to a shared purpose.',
              },
              {
                icon: Link2,
                title: 'One resource registry',
                text: 'Find documents, sheets, designs, repositories, and links across your workspace.',
              },
              {
                icon: CheckCheck,
                title: 'Clear reviews and decisions',
                text: 'Keep feedback, approvals, and change requests beside the resource.',
              },
              {
                icon: Users,
                title: 'People and responsibilities',
                text: 'Understand who is involved and how they connect to the work.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <Icon size={22} />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="closing">
          <span className="eyebrow">
            AN INDEPENDENT WORKSPACE BY ALTETURIA STUDIOS
          </span>
          <h2>Bring your work together.</h2>
          <p>
            Start with a personal workspace or create an organization for your
            team.
          </p>
          <a href="/register" className="button">
            Create your workspace <ArrowRight size={18} />
          </a>
        </section>
      </main>
      <footer>
        <Brand />
        <span>Your work, connected.</span>
        <span>© {new Date().getFullYear()} Alteturia Studios</span>
      </footer>
    </>
  );
}
