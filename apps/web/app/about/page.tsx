import type { Metadata } from 'next';
import {
  ArrowRight,
  CheckCheck,
  FileStack,
  FolderKanban,
  LockKeyhole,
  Users,
} from 'lucide-react';
import { Brand } from '../../components/brand';
import { MarketingNavigation } from '../../components/marketing-navigation';

export const metadata: Metadata = {
  title: 'About Graqivo',
  description:
    'Learn how Graqivo brings projects, resources, people, and decisions into one connected workspace.',
};

const offers = [
  {
    icon: FolderKanban,
    title: 'Projects with context',
    description:
      'Give work a shared home. Keep its goals, collaborators, resources, activity, and next steps connected.',
  },
  {
    icon: FileStack,
    title: 'A searchable resource registry',
    description:
      'Bring links and private uploads together, organize them with filing categories, and find the right reference when you need it.',
  },
  {
    icon: CheckCheck,
    title: 'Reviews and decisions',
    description:
      'Request reviews, capture feedback, approve work or request changes, and keep a clear history of what happened.',
  },
  {
    icon: Users,
    title: 'People and permissions',
    description:
      'Invite collaborators and connect people to projects. Workspace membership and access rules help keep work appropriately scoped.',
  },
];

export default function About() {
  return (
    <div className="marketing about-page">
      <MarketingNavigation currentPage="about" />
      <main id="main" tabIndex={-1}>
        <section className="about-hero">
          <span className="eyebrow">ABOUT GRAQIVO</span>
          <h1>
            Make the work easier to <span>see together.</span>
          </h1>
          <p>
            Graqivo is a connected workspace for projects, resources, people,
            and decisions. It brings the context around your work into one
            organized place, so teams spend less time searching and more time
            moving forward.
          </p>
          <a className="button" href="/register">
            Create your workspace <ArrowRight size={18} aria-hidden="true" />
          </a>
        </section>

        <section className="section about-purpose">
          <div>
            <span className="eyebrow">WHAT GRAQIVO IS</span>
            <h2>A shared picture of work in progress.</h2>
          </div>
          <div>
            <p>
              Work rarely lives in one place. A project may depend on a
              document, a conversation, a decision, and the people who know its
              history. When those pieces are disconnected, it is harder to
              understand what is current or what needs attention.
            </p>
            <p>
              Graqivo connects those pieces without requiring you to replace
              the tools that created them. Keep external files with their
              providers, add links or private uploads to a shared resource
              registry, and connect resources to the projects and people that
              give them meaning.
            </p>
          </div>
        </section>

        <section className="section about-offers">
          <div className="marketing-heading">
            <span className="eyebrow">WHAT GRAQIVO OFFERS</span>
            <h2>Everything around the work, in view.</h2>
            <p>
              The workspace is designed to make the connections between doing,
              sharing, and deciding visible.
            </p>
          </div>
          <div className="about-offer-grid">
            {offers.map(({ icon: Icon, title, description }) => (
              <article key={title}>
                <span className="feature-icon">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section about-audience">
          <div>
            <span className="eyebrow">MADE FOR YOUR WAY OF WORKING</span>
            <h2>For a team, or just for you.</h2>
            <p>
              Set up an organization workspace to coordinate projects with
              teammates, or choose an individual workspace to give your own
              projects and references a home. Start with what you need and build
              context as the work grows.
            </p>
          </div>
          <div className="about-audience-note">
            <LockKeyhole size={22} aria-hidden="true" />
            <div>
              <h3>Connected does not mean exposed.</h3>
              <p>
                Graqivo keeps workspace access scoped to membership and
                permissions. External resources remain governed by their
                original provider; Graqivo stores their context, not a promise
                of access to someone else’s file.
              </p>
            </div>
          </div>
        </section>

        <section className="closing">
          <Brand light />
          <h2>Bring your work into focus.</h2>
          <p>Start with a project, connect what matters, and keep moving.</p>
          <a href="/register" className="button">
            Get started <ArrowRight size={18} aria-hidden="true" />
          </a>
        </section>
      </main>
      <footer>
        <Brand />
        <a href="/">Home</a>
        <span>© {new Date().getFullYear()} Alteturia Studios</span>
        <a href="/login">Sign in</a>
      </footer>
    </div>
  );
}
