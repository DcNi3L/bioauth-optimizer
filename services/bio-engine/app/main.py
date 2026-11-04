"""Точка входа: сборка приложения FastAPI (create_app) и экземпляр для uvicorn (app)."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .adapters.opencv_models import MiniFasNetLiveness, OpenCvImageMetrics, SFaceEmbedder, YuNetDetector
from .api import schemas as s
from .api.middleware import AccessLogMiddleware, BodyLimitMiddleware, SecretMiddleware
from .config import Settings, get_settings
from .errors import BioError
from .logging_setup import setup_logging
from .service import FaceService

log = logging.getLogger('bio')
PROBLEM = 'application/problem+json'


def get_service(request: Request) -> FaceService:
    service: FaceService = request.app.state.service
    return service


Svc = Annotated[FaceService, Depends(get_service)]


def build_service(settings: Settings) -> FaceService:
    return FaceService(
        YuNetDetector(settings.models_dir),
        SFaceEmbedder(settings.models_dir),
        MiniFasNetLiveness(settings.models_dir),
        OpenCvImageMetrics(),
        settings,
    )


def create_app(
    settings: Settings | None = None, service_factory: Callable[[Settings], FaceService] = build_service
) -> FastAPI:
    cfg = settings or get_settings()
    setup_logging(cfg.log_level)
    service = service_factory(cfg)
    log.info('bio-engine готов', extra={'models': service.versions()})

    app = FastAPI(
        title='BioAuth bio-engine',
        version='2.0.0',
        description='Распознавание лиц без состояния: качество кадра, шаблон, сравнение, проверка «живости». '
        'Все методы /v1 требуют заголовок X-Bio-Secret.',
    )
    app.add_middleware(SecretMiddleware, secret=cfg.secret.get_secret_value())
    app.add_middleware(BodyLimitMiddleware, max_bytes=cfg.max_body_bytes)
    app.add_middleware(AccessLogMiddleware)

    app.state.service = service

    @app.exception_handler(BioError)
    async def bio_error(_: Request, exc: BioError) -> JSONResponse:
        body = {
            'type': f'https://bioauth-optimizer/errors/{exc.code.lower()}',
            'title': 'Ошибка обработки кадров',
            'status': exc.status,
            'detail': exc.detail,
            'code': exc.code,
            **exc.extra,
        }
        return JSONResponse(body, status_code=exc.status, media_type=PROBLEM)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [{'path': '.'.join(str(p) for p in e['loc'][1:]), 'message': e['msg']} for e in exc.errors()]
        body = {
            'type': 'https://bioauth-optimizer/errors/validation-error',
            'title': 'Некорректные входные данные',
            'status': 422,
            'detail': errors[0]['message'] if errors else 'ошибка валидации',
            'code': 'VALIDATION_ERROR',
            'errors': errors,
        }
        return JSONResponse(body, status_code=422, media_type=PROBLEM)

    responses: dict[int | str, dict[str, object]] = {
        401: {'model': s.Problem},
        413: {'model': s.Problem},
        422: {'model': s.Problem},
    }

    @app.get('/health/live', tags=['health'])
    def live() -> dict[str, str]:
        return {'status': 'ok'}

    @app.get('/health/ready', tags=['health'], response_model=s.Health)
    def ready(service: Svc) -> s.Health:
        return s.Health(status='ok', models=service.versions())

    @app.post(
        '/v1/face/analyze',
        tags=['face'],
        response_model=s.AnalyzeResponse,
        response_model_by_alias=True,
        responses=responses,
        summary='Детекция и контроль качества кадров',
    )
    def analyze(req: s.FramesRequest, service: Svc) -> s.AnalyzeResponse:
        return service.analyze(req)

    @app.post(
        '/v1/face/template',
        tags=['face'],
        response_model=s.TemplateResponse,
        response_model_by_alias=True,
        responses=responses,
        summary='Шаблон регистрации по годным кадрам',
    )
    def template(req: s.FramesRequest, service: Svc) -> s.TemplateResponse:
        return service.template(req)

    @app.post(
        '/v1/face/verify',
        tags=['face'],
        response_model=s.VerifyResponse,
        response_model_by_alias=True,
        responses={**responses, 409: {'model': s.Problem}},
        summary='Сравнение кадров попытки с шаблоном',
    )
    def verify(req: s.VerifyRequest, service: Svc) -> s.VerifyResponse:
        return service.verify(req)

    @app.post(
        '/v1/face/liveness',
        tags=['face'],
        response_model=s.LivenessResponse,
        response_model_by_alias=True,
        responses=responses,
        summary='Пассивная PAD, активные команды и согласованность личности',
    )
    def liveness(req: s.LivenessRequest, service: Svc) -> s.LivenessResponse:
        return service.liveness(req)

    return app
