import { LoadingState } from '../components/feedback-state';
export default function Loading() {
  return (
    <main id="main" tabIndex={-1} className="workspace-page">
      <LoadingState label="Opening Graqivo…" />
    </main>
  );
}
