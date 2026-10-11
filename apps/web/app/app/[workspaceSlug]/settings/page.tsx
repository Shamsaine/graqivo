import { WorkspaceCore } from '../../../../components/workspace-core';
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <WorkspaceCore slug={workspaceSlug} view="settings" />;
}
