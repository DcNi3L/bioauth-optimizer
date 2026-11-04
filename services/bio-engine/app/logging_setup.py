"""Структурные JSON-логи. Изображения и эмбеддинги в логи не попадают (NFR-B6): тела запросов
и ответов не журналируются вовсе, а значения длиннее 200 символов обрезаются."""

from __future__ import annotations

import json
import logging
import sys
import time
from typing import Any

_MAX_VALUE = 200
_STANDARD = set(logging.LogRecord('', 0, '', 0, '', (), None).__dict__) | {'message', 'asctime'}


def _safe(value: Any) -> Any:
    if isinstance(value, str) and len(value) > _MAX_VALUE:
        return value[:_MAX_VALUE] + '…'
    if isinstance(value, list | tuple) and len(value) > 16:
        return f'<{len(value)} элементов>'
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            'time': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(record.created))
            + f'.{int(record.msecs):03d}Z',
            'level': record.levelname.lower(),
            'logger': record.name,
            'msg': _safe(record.getMessage()),
        }
        for key, value in record.__dict__.items():
            if key not in _STANDARD:
                payload[key] = _safe(value)
        if record.exc_info:
            payload['error'] = self.formatException(record.exc_info).splitlines()[-1]
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    logging.getLogger('uvicorn.access').disabled = True
