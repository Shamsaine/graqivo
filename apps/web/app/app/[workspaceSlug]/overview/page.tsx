import { WorkspaceAccess } from '../../../../components/workspace-access';
export default async function Overview({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <WorkspaceAccess slug={workspaceSlug} />;
}
