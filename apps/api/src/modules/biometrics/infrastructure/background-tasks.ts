import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';

/**
 * Фоновые задачи в процессе (без очереди сообщений — ADR-0005): например, impostor-оценки после входа,
 * чтобы не задерживать ответ. drain() дожидается всех задач — для тестов и корректной остановки.
 */
@Injectable()
export class BackgroundTasks implements OnApplicationShutdown {
  private readonly logger = new Logger('BackgroundTasks');
  private readonly pending = new Set<Promise<void>>();

  run(name: string, task: () => Promise<void>): void {
    const p = Promise.resolve()
      .then(task)
      .catch((err: unknown) =>
        this.logger.error({ task: name, err: (err as Error).message }, 'фоновая задача завершилась ошибкой'),
      )
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.drain();
  }
}
