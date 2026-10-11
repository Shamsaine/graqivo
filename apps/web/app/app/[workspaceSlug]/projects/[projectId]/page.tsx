import { WorkspaceCore } from '../../../../../components/workspace-core';
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return (
    <WorkspaceCore slug={workspaceSlug} view="project" projectId={projectId} />
  );
}
