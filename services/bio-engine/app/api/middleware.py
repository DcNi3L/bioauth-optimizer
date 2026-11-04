"""ASGI-прослойки: общий секрет, лимит размера тела, журнал запросов."""

from __future__ import annotations

import hmac
import json
import logging
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger('bio.http')
OPEN_PATHS = frozenset({'/health/live', '/health/ready', '/openapi.json', '/docs'})


async def _problem(send: Send, status: int, code: str, title: str, detail: str) -> None:
    body = json.dumps(
        {
            'type': f'https://bioauth-optimizer/errors/{code.lower()}',
            'title': title,
            'status': status,
            'detail': detail,
            'code': code,
        },
        ensure_ascii=False,
    ).encode()
    await send(
        {
            'type': 'http.response.start',
            'status': status,
            'headers': [
                (b'content-type', b'application/problem+json'),
                (b'content-length', str(len(body)).encode()),
            ],
        }
    )
    await send({'type': 'http.response.body', 'body': body})


class SecretMiddleware:
    """Все пути, кроме проверок здоровья, требуют заголовок X-Bio-Secret (сравнение за постоянное время)."""

    def __init__(self, app: ASGIApp, secret: str) -> None:
        self.app = app
        self.secret = secret.encode()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope['type'] != 'http' or scope['path'] in OPEN_PATHS:
            await self.app(scope, receive, send)
            return
        provided = dict(scope['headers']).get(b'x-bio-secret', b'')
        if not self.secret or not hmac.compare_digest(provided, self.secret):
            await _problem(
                send, 401, 'UNAUTHORIZED', 'Нет доступа', 'неверный или отсутствующий X-Bio-Secret'
            )
            return
        await self.app(scope, receive, send)


class BodyLimitMiddleware:
    """Отклоняет тела больше max_bytes: и по Content-Length, и при потоковой передаче."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        length = dict(scope['headers']).get(b'content-length')
        if length is not None and length.isdigit() and int(length) > self.max_bytes:
            await _problem(
                send, 413, 'PAYLOAD_TOO_LARGE', 'Слишком большой запрос', f'больше {self.max_bytes} байт'
            )
            return
        received = 0

        async def limited() -> Message:
            nonlocal received
            message = await receive()
            if message['type'] == 'http.request':
                received += len(message.get('body', b''))
                if received > self.max_bytes:
                    raise _TooLargeError
            return message

        try:
            await self.app(scope, limited, send)
        except _TooLargeError:
            await _problem(
                send, 413, 'PAYLOAD_TOO_LARGE', 'Слишком большой запрос', f'больше {self.max_bytes} байт'
            )


class _TooLargeError(Exception):
    pass


class AccessLogMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        start = time.perf_counter()
        status = 500
        request_id = dict(scope['headers']).get(b'x-request-id', b'').decode() or uuid.uuid4().hex

        async def capture(message: Message) -> None:
            nonlocal status
            if message['type'] == 'http.response.start':
                status = message['status']
            await send(message)

        try:
            await self.app(scope, receive, capture)
        finally:
            if scope['path'] not in ('/health/live', '/health/ready'):
                log.info(
                    'request',
                    extra={
                        'method': scope['method'],
                        'path': scope['path'],
                        'status': status,
                        'duration_ms': round((time.perf_counter() - start) * 1000, 1),
                        'request_id': request_id[:64],
                    },
                )
