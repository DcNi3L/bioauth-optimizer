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
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


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
            tmp = target.with_suffix('.part')
            with urllib.request.urlopen(model['url'], timeout=120) as resp, tmp.open('wb') as out:  # noqa: S310
                while chunk := resp.read(1 << 20):
                    out.write(chunk)
            tmp.replace(target)
        actual = sha256(target)
        if actual != model['sha256']:
            print(f'{model["file"]}: SHA-256 {actual} не совпадает с {model["sha256"]}', file=sys.stderr)
            return 1
        print(f'{model["file"]}: ok')
    return 0


if __name__ == '__main__':
    sys.exit(main())
