import { AdminUserPage } from '@/pages/admin/user';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminUserPage id={id} />;
}
