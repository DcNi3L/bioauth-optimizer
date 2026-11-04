"""Скачивает модели из models.lock.json и проверяет SHA-256 всех моделей.

    python scripts/fetch_models.py [--dest models]

Модели без url (MiniFASNet) уже лежат в каталоге и только проверяются. Повторный запуск не скачивает
файлы с верным хешем. Любое расхождение хеша — ошибка (защита цепочки поставки, NFR-B2).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, target: Path, expected: str, attempts: int = 4) -> bool:
    """Скачивание с повторами: обрыв соединения даёт усечённый файл, поэтому сверяются длина и хеш."""
    tmp = target.with_suffix('.part')
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(url, timeout=120) as resp, tmp.open('wb') as out:  # noqa: S310
                length = int(resp.headers.get('Content-Length') or 0)
                while chunk := resp.read(1 << 20):
                    out.write(chunk)
            size = tmp.stat().st_size
            if length and size != length:
                print(f'  попытка {attempt}: получено {size} из {length} байт', file=sys.stderr)
            elif sha256(tmp) != expected:
                print(f'  попытка {attempt}: неверный хеш ({size} байт)', file=sys.stderr)
            else:
                tmp.replace(target)
                return True
        except OSError as exc:
            print(f'  попытка {attempt}: {exc}', file=sys.stderr)
        time.sleep(2 * attempt)
    tmp.unlink(missing_ok=True)
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dest', type=Path, default=ROOT / 'models')
    args = parser.parse_args()
    lock = json.loads((ROOT / 'models.lock.json').read_text(encoding='utf-8'))
    args.dest.mkdir(parents=True, exist_ok=True)
    for model in lock['models']:
        target = args.dest / model['file']
        if not (target.exists() and sha256(target) == model['sha256']):
            if model['url'] is None:
                print(f'{model["file"]}: нет файла или неверный хеш, а URL не задан', file=sys.stderr)
                return 1
            print(f'скачиваю {model["name"]} {model["version"]}')
            if not download(model['url'], target, model['sha256']):
                print(f'{model["file"]}: не удалось скачать с верным хешем', file=sys.stderr)
                return 1
        actual = sha256(target)
        if actual != model['sha256']:
            print(f'{model["file"]}: SHA-256 {actual} не совпадает с {model["sha256"]}', file=sys.stderr)
            return 1
        print(f'{model["file"]}: ok')
    return 0


if __name__ == '__main__':
    sys.exit(main())
