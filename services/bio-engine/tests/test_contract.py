"""Контрактный тест: примеры packages/contracts/fixtures/bio-engine соответствуют pydantic-схемам сервиса.

Те же файлы проверяет packages/contracts/test/bio-engine.test.ts против zod-схем api, поэтому
несовместимое изменение любой стороны ломает CI."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import BaseModel

from app.api import schemas as s

DIR = Path(__file__).resolve().parents[3] / 'packages' / 'contracts' / 'fixtures' / 'bio-engine'

SCHEMAS: dict[str, type[BaseModel]] = {
    'analyze.request.json': s.FramesRequest,
    'analyze.response.json': s.AnalyzeResponse,
    'template.request.json': s.FramesRequest,
    'template.response.json': s.TemplateResponse,
    'verify.request.json': s.VerifyRequest,
    'verify.response.json': s.VerifyResponse,
    'liveness.request.json': s.LivenessRequest,
    'liveness.response.json': s.LivenessResponse,
    'problem.not-enough-frames.json': s.Problem,
    'problem.model-mismatch.json': s.Problem,
}


def test_every_fixture_has_schema() -> None:
    assert sorted(p.name for p in DIR.glob('*.json')) == sorted(SCHEMAS)


@pytest.mark.parametrize(('name', 'model'), SCHEMAS.items())
def test_fixture_matches_schema(name: str, model: type[BaseModel]) -> None:
    data = json.loads((DIR / name).read_text(encoding='utf-8'))
    if model is s.Problem:
        data = {k: data[k] for k in ('type', 'title', 'status', 'detail', 'code')}
    model.model_validate(data, by_alias=True)
