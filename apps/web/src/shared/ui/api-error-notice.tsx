'use client';

import { ApiError } from '../api';
import { useT } from '../i18n';
import { Notice } from './notice';

export function ApiErrorNotice({ error }: { error: unknown }) {
  const t = useT();
  if (!error) return null;
  if (error instanceof ApiError) {
    const fieldErrors = error.problem.errors ?? [];
    const offline = error.problem.type === 'network' && error.problem.status === 0;
    const unreachable = error.problem.type === 'network' && error.problem.status !== 0;
    return (
      <Notice
        tone="error"
        title={offline ? t('errors.offline') : unreachable ? t('errors.http') : error.problem.title}
      >
        {offline ? <p>{t('errors.offlineDetail')}</p> : error.problem.detail && <p>{error.problem.detail}</p>}
        {fieldErrors.length > 1 && (
          <ul className="mt-1 list-inside list-disc">
            {fieldErrors.map((e) => (
              <li key={e.path + e.message}>
                <span className="num">{e.path}</span>: {e.message}
              </li>
            ))}
          </ul>
        )}
      </Notice>
    );
  }
  return (
    <Notice tone="error" title={t('errors.title')}>
      {error instanceof Error ? error.message : typeof error === 'string' ? error : t('errors.unknown')}
    </Notice>
  );
}
