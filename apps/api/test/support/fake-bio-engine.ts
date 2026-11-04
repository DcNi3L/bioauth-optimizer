import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Поддельный bio-engine для e2e API: отвечает по контракту packages/contracts (bio-engine), а «лицо»
 * закодировано в самой строке кадра: FAKE|<личность>|<метка>|… Метки: ok, bad (нет лица), spoof
 * (экран/фото), имя команды (TURN_LEFT…) — команда выполнена. Настоящий сервис тестируется отдельно.
 */
export interface FakeBioEngine {
  url: string;
  calls: string[];
  close(): Promise<void>;
}

export const SECRET = 'e2e-bio-secret';

export function frame(identity: string, tag = 'ok', ts = 0): { image: string; ts: number } {
  return { image: `FAKE|${identity}|${tag}|`.padEnd(160, 'x'), ts };
}

const parse = (image: string) => {
  const [, identity = '', tag = ''] = image.split('|');
  return { identity, tag };
};

function embedding(identity: string): number[] {
  const v = new Array<number>(128).fill(0);
  let h = 0;
  for (const ch of identity) h = (h * 31 + ch.charCodeAt(0)) % 128;
  v[h] = 1;
  return v;
}

const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

const analysis = (tag: string) => ({
  faces: tag === 'bad' ? 0 : 1,
  face: null,
  quality: null,
  issues: tag === 'bad' ? ['NO_FACE'] : [],
});

interface Frame {
  image: string;
  ts?: number | null;
}

export async function startFakeBioEngine(): Promise<FakeBioEngine> {
  const calls: string[] = [];
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      calls.push(req.url ?? '');
      const send = (status: number, data: unknown) => {
        res.writeHead(status, {
          'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
        });
        res.end(JSON.stringify(data));
      };
      if (req.headers['x-bio-secret'] !== SECRET) {
        send(401, { type: 't', title: 'Нет доступа', status: 401, detail: 'secret', code: 'UNAUTHORIZED' });
        return;
      }
      const json = JSON.parse(body) as Record<string, unknown>;
      const version = 'fake-sface+fake-yunet';
      if (req.url === '/v1/face/template') {
        const frames = (json.frames as Frame[]).map((f) => parse(f.image));
        const good = frames.filter((f) => f.tag !== 'bad');
        if (good.length < 3) {
          send(422, {
            type: 't',
            title: 'Ошибка',
            status: 422,
            detail: `годных кадров ${good.length}`,
            code: 'NOT_ENOUGH_GOOD_FRAMES',
            frames: frames.map((f) => analysis(f.tag)),
          });
          return;
        }
        const n = good.length;
        send(200, {
          embedding: embedding(good[0]!.identity),
          modelVersion: version,
          framesUsed: n,
          pairScores: Array.from({ length: (n * (n - 1)) / 2 }, (_, i) => 0.9 + (i % 5) * 0.01),
          pLiveMedian: good.some((f) => f.tag === 'spoof') ? 0.1 : 0.9,
          padVersion: 'fake-pad',
          frames: frames.map((f) => analysis(f.tag)),
        });
        return;
      }
      if (req.url === '/v1/face/verify') {
        const frames = (json.frames as Frame[]).map((f) => parse(f.image)).filter((f) => f.tag !== 'bad');
        const tpl = json.template as { embedding: number[]; modelVersion: string };
        if (tpl.modelVersion !== version) {
          send(409, {
            type: 't',
            title: 'Ошибка',
            status: 409,
            detail: 'версия',
            code: 'MODEL_VERSION_MISMATCH',
          });
          return;
        }
        if (frames.length === 0) {
          send(422, {
            type: 't',
            title: 'Ошибка',
            status: 422,
            detail: 'нет лица',
            code: 'NO_USABLE_FRAMES',
            frames: [],
          });
          return;
        }
        const probe = embedding(frames[0]!.identity);
        const score = cos(probe, tpl.embedding) * 0.8;
        send(200, {
          score,
          scores: frames.map(() => score),
          consistency: 1,
          framesUsed: frames.length,
          probeEmbedding: probe,
          modelVersion: version,
          frames: frames.map((f) => analysis(f.tag)),
        });
        return;
      }
      if (req.url === '/v1/face/liveness') {
        const baseline = (json.baseline as Frame[]).map((f) => parse(f.image));
        const steps = json.steps as { command: string; frames: Frame[] }[];
        const all = [...baseline, ...steps.flatMap((s) => s.frames.map((f) => parse(f.image)))];
        const ids = new Set(all.map((f) => f.identity));
        send(200, {
          pLiveMedian: all.some((f) => f.tag === 'spoof') ? 0.1 : 0.9,
          pLive: all.map(() => 0.9),
          commands: steps.map((s) => {
            const passed = s.frames.some((f) => parse(f.image).tag === s.command);
            return {
              command: s.command,
              passed,
              measure: passed ? 0.2 : 0,
              failure: passed ? null : 'NOT_PERFORMED',
            };
          }),
          identityConsistent: ids.size === 1,
          minPairwiseSimilarity: ids.size === 1 ? 0.9 : 0.1,
          modelVersion: version,
          padVersion: 'fake-pad',
        });
        return;
      }
      send(404, { type: 't', title: 'нет', status: 404, detail: 'нет', code: 'NOT_FOUND' });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Кадры попытки входа: нейтральные кадры и по кадру на каждую выданную команду (выполненную). */
export function attemptFrames(
  identity: string,
  commands: string[],
  opts: { skip?: string; tag?: string } = {},
) {
  let ts = 1000;
  return {
    baseline: [frame(identity, opts.tag ?? 'ok', ts++)],
    steps: commands.map((c) => ({
      command: c,
      frames: [frame(identity, opts.tag ?? (c === opts.skip ? 'ok' : c), (ts += 100))],
    })),
  };
}
