import { ArrowUpRight } from 'lucide-react';
import { Brand } from './brand';

export function MarketingNavigation({
  currentPage,
}: {
  currentPage: 'home' | 'about';
}) {
  return (
    <header className="nav">
      <Brand />
      <nav aria-label="Main navigation">
        {currentPage === 'home' ? (
          <>
            <a href="#how">How it works</a>
            <a href="#workspace">The workspace</a>
          </>
        ) : (
          <a href="/">Home</a>
        )}
        <a href="/about" aria-current={currentPage === 'about' ? 'page' : undefined}>
          About
        </a>
        <a href="/login">Sign in</a>
        <a className="button small" href="/register">
          Get started <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </nav>
    </header>
  );
}
