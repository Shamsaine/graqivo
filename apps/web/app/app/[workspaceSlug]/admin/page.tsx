import { WorkspaceAccess } from '../../../../components/workspace-access';
export default async function Administration({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <WorkspaceAccess slug={workspaceSlug} admin />;
}
