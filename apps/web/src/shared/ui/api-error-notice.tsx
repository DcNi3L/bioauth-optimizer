'use client';

import { ApiError } from '../api';
import { useT } from '../i18n';
import { Notice } from './notice';

export function ApiErrorNotice({ error }: { error: unknown }) {
  const t = useT();
  if (!error) return null;
  if (error instanceof ApiError) {
    const fieldErrors = error.problem.errors ?? [];
    return (
      <Notice tone="error" title={error.problem.title}>
        {error.problem.detail && <p>{error.problem.detail}</p>}
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
