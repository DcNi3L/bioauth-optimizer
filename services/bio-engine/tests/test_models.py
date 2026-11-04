"""Интеграционные тесты с настоящими моделями на эталонных изображениях (маркер models)."""

from __future__ import annotations

import time

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from .conftest import HEADERS, b64

pytestmark = pytest.mark.models


def frames(*imgs: np.ndarray) -> list[dict[str, object]]:
    return [{'image': b64(i), 'ts': k * 200} for k, i in enumerate(imgs)]


def jitter(img: np.ndarray, k: int) -> np.ndarray:
    """Небольшие изменения кадра: яркость, масштаб, сдвиг — имитация серии с камеры."""
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), (k % 3 - 1) * 2.0, 1.0 + 0.02 * k)
    m[:, 2] += (3 * k, -2 * k)
    out = cv2.warpAffine(img, m, (w, h), borderMode=cv2.BORDER_REFLECT)
    return cv2.convertScaleAbs(out, alpha=1.0 + 0.03 * (k % 2), beta=4 * (k % 3))


def zoom(img: np.ndarray, k: float) -> np.ndarray:
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h * 0.45), 0, k)
    return cv2.warpAffine(img, m, (w, h), borderMode=cv2.BORDER_REFLECT)


def analyze(client: TestClient, *imgs: np.ndarray) -> list[dict[str, object]]:
    r = client.post('/v1/face/analyze', json={'frames': frames(*imgs)}, headers=HEADERS)
    assert r.status_code == 200, r.text
    return list(r.json()['frames'])


def test_good_frames_have_no_issues(
    real_client: TestClient, astronaut: np.ndarray, hopper: np.ndarray
) -> None:
    out = analyze(real_client, astronaut, hopper)
    assert [f['issues'] for f in out] == [[], []]
    assert all(f['faces'] == 1 and f['quality']['interocularPx'] >= 60 for f in out)


def test_quality_issues_detected(real_client: TestClient, astronaut: np.ndarray, hopper: np.ndarray) -> None:
    blank = np.full_like(astronaut, 127)
    blurred = cv2.GaussianBlur(astronaut, (0, 0), 6)
    dark = cv2.convertScaleAbs(astronaut, alpha=0.2)
    small = cv2.resize(astronaut, None, fx=0.45, fy=0.45)
    h = min(astronaut.shape[0], hopper.shape[0])
    two = np.hstack([cv2.resize(astronaut, (h, h)), cv2.resize(hopper, (h, h))])
    out = analyze(real_client, blank, blurred, dark, small, two)
    assert out[0]['issues'] == ['NO_FACE']
    assert 'BLURRY' in out[1]['issues']
    assert 'TOO_DARK' in out[2]['issues']
    assert 'TOO_SMALL' in out[3]['issues']
    assert out[4]['issues'] == ['MANY_FACES']


def test_same_person_scores_above_threshold(
    real_client: TestClient, astronaut: np.ndarray, hopper: np.ndarray
) -> None:
    tpl = real_client.post(
        '/v1/face/template',
        json={'frames': frames(*[jitter(astronaut, k) for k in range(4)])},
        headers=HEADERS,
    )
    assert tpl.status_code == 200, tpl.text
    t = tpl.json()
    assert t['framesUsed'] == 4 and len(t['pairScores']) == 6 and min(t['pairScores']) > 0.8
    template = {'embedding': t['embedding'], 'modelVersion': t['modelVersion']}

    same = real_client.post(
        '/v1/face/verify',
        json={'frames': frames(jitter(astronaut, 5), jitter(astronaut, 6)), 'template': template},
        headers=HEADERS,
    ).json()
    other = real_client.post(
        '/v1/face/verify', json={'frames': frames(hopper), 'template': template}, headers=HEADERS
    ).json()
    # 0,363 — порог косинусного сходства SFace из примера OpenCV (начальное значение τ_face, docs/10 §10.5.4).
    assert same['score'] > 0.6
    assert other['score'] < 0.363
    assert same['consistency'] > 0.8


def test_static_photo_fails_active_commands(real_client: TestClient, astronaut: np.ndarray) -> None:
    body = {
        'baseline': frames(astronaut),
        'steps': [
            {'command': 'TURN_LEFT', 'frames': frames(*[jitter(astronaut, k) for k in range(3)])},
            {'command': 'CHIN_UP', 'frames': frames(*[jitter(astronaut, k) for k in range(3)])},
        ],
    }
    out = real_client.post('/v1/face/liveness', json=body, headers=HEADERS).json()
    assert [c['passed'] for c in out['commands']] == [False, False]
    assert out['identityConsistent'] is True


def test_move_closer_and_identity_switch(
    real_client: TestClient, astronaut: np.ndarray, hopper: np.ndarray
) -> None:
    closer = {
        'baseline': frames(astronaut),
        'steps': [
            {
                'command': 'MOVE_CLOSER',
                'frames': frames(zoom(astronaut, 1.15), zoom(astronaut, 1.35), zoom(astronaut, 1.5)),
            }
        ],
    }
    out = real_client.post('/v1/face/liveness', json=closer, headers=HEADERS).json()
    assert out['commands'][0]['passed'] is True
    assert out['commands'][0]['measure'] >= 1.25

    hs = cv2.resize(hopper, (astronaut.shape[1], astronaut.shape[0]))
    switch = {
        'baseline': frames(astronaut),
        'steps': [{'command': 'MOVE_CLOSER', 'frames': frames(hs, zoom(hs, 1.4))}],
    }
    out = real_client.post('/v1/face/liveness', json=switch, headers=HEADERS).json()
    assert out['identityConsistent'] is False
    assert out['minPairwiseSimilarity'] < 0.6


def test_latency_budget(real_client: TestClient, astronaut: np.ndarray) -> None:
    """NFR-B1: проверка по 10 кадрам (сравнение + живость) укладывается в бюджет. Порог в тесте с запасом
    на медленные машины CI; фактическое время печатается."""
    imgs = [jitter(astronaut, k) for k in range(10)]
    tpl = real_client.post('/v1/face/template', json={'frames': frames(*imgs[:3])}, headers=HEADERS).json()
    start = time.perf_counter()
    real_client.post(
        '/v1/face/verify',
        json={
            'frames': frames(*imgs),
            'template': {'embedding': tpl['embedding'], 'modelVersion': tpl['modelVersion']},
        },
        headers=HEADERS,
    )
    real_client.post(
        '/v1/face/liveness',
        json={
            'baseline': frames(*imgs[:2]),
            'steps': [
                {'command': 'MOVE_CLOSER', 'frames': frames(*imgs[2:6])},
                {'command': 'TURN_LEFT', 'frames': frames(*imgs[6:10])},
            ],
        },
        headers=HEADERS,
    )
    elapsed = time.perf_counter() - start
    print(f'verify + liveness, 10 кадров: {elapsed:.2f} с')
    assert elapsed < 4.0
