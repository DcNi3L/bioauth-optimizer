import { AsyncLocalStorage } from 'node:async_hooks';

import type { NextFunction, Request, Response } from 'express';

export interface ClientInfo {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

const storage = new AsyncLocalStorage<ClientInfo>();

/**
 * Адрес и браузер клиента текущего запроса — для журнала сессий и истории входов без протаскивания
 * через все сценарии. IP берётся с учётом доверенного прокси (web в той же сети), см. trust proxy.
 */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const ua = req.headers['user-agent'];
  storage.run(
    {
      ip: (req.ip ?? null)?.slice(0, 64) ?? null,
      userAgent: typeof ua === 'string' ? ua.slice(0, 512) : null,
    },
    next,
  );
}

export const clientInfo = (): ClientInfo => storage.getStore() ?? { ip: null, userAgent: null };
