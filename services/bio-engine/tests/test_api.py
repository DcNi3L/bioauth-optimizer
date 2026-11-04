"""HTTP-слой с поддельными моделями: секрет, лимиты, формат ошибок, отсутствие биометрии в логах."""

from __future__ import annotations

import json
import logging
import re

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.ports import DetectedFace, Image
from app.service import FaceService

from .conftest import HEADERS, b64

LANDMARKS = np.array([[100, 100], [180, 100], [140, 145], [110, 185], [170, 185]], dtype=float)


class FakeDetector:
    version = 'fake-det'

    def detect(self, image: Image) -> list[DetectedFace]:
        # Число «лиц» кодируется яркостью кадра: 0 — чёрный кадр, 2 — белый, иначе одно лицо.
        mean = float(image.mean())
        n = 0 if mean < 5 else 2 if mean > 250 else 1
        return [DetectedFace((60.0, 60.0, 160.0, 160.0), LANDMARKS, 0.95, np.zeros(15, np.float32))] * n


class FakeEmbedder:
    version = 'fake-emb'

    def embed(self, image: Image, face: DetectedFace) -> np.ndarray:
        v = np.zeros(128)
        v[int(image[0, 0, 0]) % 128] = 1.0
        return v


class FakeLiveness:
    version = 'fake-pad'

    def p_live(self, image: Image, face: DetectedFace) -> float:
        return 0.9


class FakeMetrics:
    def sharpness(self, image: Image, face: DetectedFace) -> float:
        return 100.0

    def brightness(self, image: Image, face: DetectedFace) -> float:
        return 120.0


def frame(value: int = 100) -> dict[str, object]:
    return {'image': b64(np.full((240, 240, 3), value, np.uint8)), 'ts': 0}


@pytest.fixture
def client(settings: Settings) -> TestClient:
    def factory(cfg: Settings) -> FaceService:
        return FaceService(FakeDetector(), FakeEmbedder(), FakeLiveness(), FakeMetrics(), cfg)

    return TestClient(create_app(settings, factory))


def test_health_is_open(client: TestClient) -> None:
    assert client.get('/health/live').json() == {'status': 'ok'}
    assert client.get('/health/ready').json()['models']['embedder'] == 'fake-emb'


def test_secret_required(client: TestClient) -> None:
    r = client.post('/v1/face/analyze', json={'frames': [frame()]})
    assert r.status_code == 401
    assert r.headers['content-type'] == 'application/problem+json'
    assert (
        client.post(
            '/v1/face/analyze', json={'frames': [frame()]}, headers={'X-Bio-Secret': 'wrong'}
        ).status_code
        == 401
    )


def test_body_limit(settings: Settings) -> None:
    small = settings.model_copy(update={'max_body_bytes': 1000})
    c = TestClient(
        create_app(
            small, lambda cfg: FaceService(FakeDetector(), FakeEmbedder(), FakeLiveness(), FakeMetrics(), cfg)
        )
    )
    r = c.post('/v1/face/analyze', json={'frames': [frame()]}, headers=HEADERS)
    assert r.status_code == 413
    assert r.json()['code'] == 'PAYLOAD_TOO_LARGE'


def test_validation_error_format(client: TestClient) -> None:
    r = client.post('/v1/face/analyze', json={'frames': []}, headers=HEADERS)
    assert r.status_code == 422
    body = r.json()
    assert body['code'] == 'VALIDATION_ERROR'
    assert body['errors'][0]['path'] == 'frames'


def test_invalid_image(client: TestClient) -> None:
    r = client.post(
        '/v1/face/analyze', json={'frames': [{'image': 'bm90IGFuIGltYWdlIGF0IGFsbA=='}]}, headers=HEADERS
    )
    assert r.status_code == 422
    assert r.json()['code'] == 'INVALID_IMAGE'


def test_too_many_frames(client: TestClient) -> None:
    r = client.post('/v1/face/analyze', json={'frames': [frame()] * 17}, headers=HEADERS)
    assert r.status_code == 413
    assert r.json()['code'] == 'TOO_MANY_FRAMES'


def test_analyze_reports_issues(client: TestClient) -> None:
    r = client.post('/v1/face/analyze', json={'frames': [frame(100), frame(0), frame(255)]}, headers=HEADERS)
    assert r.status_code == 200
    issues = [f['issues'] for f in r.json()['frames']]
    assert issues == [[], ['NO_FACE'], ['MANY_FACES']]
    assert r.json()['modelVersion'] == 'fake-emb+fake-det'
    assert r.json()['frames'][0]['quality']['interocularPx'] == pytest.approx(80)


def test_template_needs_enough_good_frames(client: TestClient) -> None:
    r = client.post('/v1/face/template', json={'frames': [frame(100), frame(0), frame(0)]}, headers=HEADERS)
    assert r.status_code == 422
    body = r.json()
    assert body['code'] == 'NOT_ENOUGH_GOOD_FRAMES'
    assert [f['issues'] for f in body['frames']] == [[], ['NO_FACE'], ['NO_FACE']]


def test_template_and_verify(client: TestClient) -> None:
    t = client.post('/v1/face/template', json={'frames': [frame(100)] * 3}, headers=HEADERS).json()
    assert t['framesUsed'] == 3 and len(t['embedding']) == 128 and t['pairScores'] == [1.0, 1.0, 1.0]
    v = client.post(
        '/v1/face/verify',
        json={
            'frames': [frame(100)] * 2,
            'template': {'embedding': t['embedding'], 'modelVersion': t['modelVersion']},
        },
        headers=HEADERS,
    )
    assert v.status_code == 200
    assert v.json()['score'] == pytest.approx(1.0)
    other = client.post(
        '/v1/face/verify',
        json={
            'frames': [frame(101)],
            'template': {'embedding': t['embedding'], 'modelVersion': t['modelVersion']},
        },
        headers=HEADERS,
    )
    assert other.json()['score'] == pytest.approx(0.0)


def test_verify_rejects_other_model_version(client: TestClient) -> None:
    r = client.post(
        '/v1/face/verify',
        json={'frames': [frame()], 'template': {'embedding': [1.0] * 128, 'modelVersion': 'old'}},
        headers=HEADERS,
    )
    assert r.status_code == 409
    assert r.json()['code'] == 'MODEL_VERSION_MISMATCH'


def test_liveness_static_face_fails_commands(client: TestClient) -> None:
    body = {
        'baseline': [frame()],
        'steps': [
            {'command': c, 'frames': [{**frame(), 'ts': i * 100} for i in range(3)]}
            for c in ('TURN_LEFT', 'CHIN_UP')
        ],
    }
    r = client.post('/v1/face/liveness', json=body, headers=HEADERS)
    assert r.status_code == 200
    out = r.json()
    assert [c['passed'] for c in out['commands']] == [False, False]
    assert out['commands'][0]['failure'] == 'NOT_PERFORMED'
    assert out['identityConsistent'] is True and out['pLiveMedian'] == pytest.approx(0.9)


def test_no_biometrics_in_logs(client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    """NFR-B6: в логах нет base64 изображений и массивов чисел эмбеддингов."""
    caplog.set_level(logging.DEBUG)
    t = client.post('/v1/face/template', json={'frames': [frame(100)] * 3}, headers=HEADERS).json()
    client.post(
        '/v1/face/verify',
        json={
            'frames': [frame(100)],
            'template': {'embedding': t['embedding'], 'modelVersion': t['modelVersion']},
        },
        headers=HEADERS,
    )
    text = '\n'.join(json.dumps(r.__dict__, default=str, ensure_ascii=False) for r in caplog.records)
    assert not re.search(r'[A-Za-z0-9+/]{200,}', text), 'в логах найден base64'
    assert not re.search(r'(-?\d+\.\d+,\s*){16,}', text), 'в логах найден массив чисел'
    assert any(r.getMessage() == 'request' for r in caplog.records)
