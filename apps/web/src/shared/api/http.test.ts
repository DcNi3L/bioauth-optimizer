import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiSend, setStepUpHandler } from './http';

const stepUp = () =>
  new Response(
    JSON.stringify({ type: 'forbidden', title: 'Доступ запрещён', status: 403, code: 'step-up-required' }),
    { status: 403, headers: { 'content-type': 'application/problem+json' } },
  );
const ok = () => new Response(JSON.stringify({ done: true }), { status: 200 });

describe('повторная проверка второго фактора в клиенте API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('после подтверждения запрос повторяется один раз', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(stepUp()).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    const off = setStepUpHandler(() => Promise.resolve(true));
    await expect(apiSend('PATCH', '/admin/users/1', { role: 'auditor' })).resolves.toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    off();
  });

  it('отмена окна — исходная ошибка; без окна — тоже ошибка', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(stepUp())),
    );
    const off = setStepUpHandler(() => Promise.resolve(false));
    await expect(apiSend('DELETE', '/admin/oauth-clients/x')).rejects.toBeInstanceOf(ApiError);
    off();
    await expect(apiSend('DELETE', '/admin/oauth-clients/x')).rejects.toBeInstanceOf(ApiError);
  });
});
