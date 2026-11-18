import { Filing } from '../../../../components/filing';

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <Filing slug={workspaceSlug} />;
}
