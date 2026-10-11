import { ResourceRegistry } from '../../../../../components/resource-registry';
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string; resourceId: string }>;
}) {
  const { workspaceSlug, resourceId } = await params;
  return <ResourceRegistry slug={workspaceSlug} resourceId={resourceId} />;
}
