import { ExperimentDetailPage } from '@/pages/experiment-detail';
import { NO_INDEX } from '@/shared/config';

export const metadata = { title: 'Эксперимент', ...NO_INDEX };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExperimentDetailPage id={id} />;
}
