import { ResourceRegistry } from '../../../../components/resource-registry';
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <ResourceRegistry slug={workspaceSlug} />;
}
