import { ApiError } from '../api';
import { Notice } from './notice';

export function ApiErrorNotice({ error }: { error: unknown }) {
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
    <Notice tone="error" title="Ошибка">
      {error instanceof Error ? error.message : typeof error === 'string' ? error : 'Неизвестная ошибка'}
    </Notice>
  );
}
