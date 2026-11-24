import { Layers3, LoaderCircle } from 'lucide-react';
export function LoadingState({
  label = 'Loading your workspace…',
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-label">
        <LoaderCircle
          size={18}
          className="loading-spinner"
          aria-hidden="true"
        />
        <span>{label}</span>
      </div>
      <div className="skeleton-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Layers3 size={24} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action &&
        (action.href ? (
          <a className="button small" href={action.href}>
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            className="button small"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
