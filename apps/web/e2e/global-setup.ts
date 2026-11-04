import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Видео для поддельной камеры Chromium (--use-file-for-fake-video-capture): Y4M из эталонного портрета.
 * Портрет — общественное достояние (NASA). Видео статично: активные команды на нём не выполняются,
 * что и проверяет тест защиты от фото.
 */
export const FAKE_VIDEO = join(__dirname, '..', 'test-results', 'fake-camera', 'face.y4m');

export default function globalSetup(): void {
  if (process.env.E2E_BIOMETRICS !== '1' || existsSync(FAKE_VIDEO)) return;
  mkdirSync(join(FAKE_VIDEO, '..'), { recursive: true });
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-loop',
    '1',
    '-i',
    join(__dirname, 'fixtures', 'face-astronaut.jpg'),
    '-t',
    '2',
    '-r',
    '10',
    '-vf',
    'scale=640:480,format=yuv420p',
    FAKE_VIDEO,
  ]);
}
