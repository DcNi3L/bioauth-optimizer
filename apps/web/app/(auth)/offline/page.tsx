import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Нет сети', robots: { index: false, follow: false } };

export { OfflinePage as default } from '@/pages/offline';
