import { ExperimentDetailPage } from '@/pages/experiment-detail';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExperimentDetailPage id={id} />;
}
