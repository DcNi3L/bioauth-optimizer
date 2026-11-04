"""Пакетный режим (UC-9): протокол пар, чтение архива, HTTP с поддельными и настоящими моделями."""

from __future__ import annotations

import io
import zipfile

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.adapters.archive import read_images
from app.config import Settings
from app.domain.pairs import build_protocol, genuine_pairs, impostor_total
from app.errors import BioError
from app.main import create_app
from app.service import FaceService

from .conftest import HEADERS
from .test_api import FakeDetector, FakeEmbedder, FakeLiveness, FakeMetrics


def jpeg(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    assert ok
    return buf.tobytes()


def make_zip(files: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    return out.getvalue()


# ── протокол пар ──


def test_genuine_pairs_and_impostor_total() -> None:
    subjects = ['a', 'a', 'b', 'b', 'b', 'c']
    assert genuine_pairs(subjects) == [(0, 1), (2, 3), (2, 4), (3, 4)]
    assert impostor_total(subjects) == 15 - 4


def test_protocol_full_when_small() -> None:
    p = build_protocol(['a', 'a', 'b'], max_impostor=10, seed=1)
    assert not p.sampled
    assert p.impostor == [(0, 2), (1, 2)]


def test_protocol_sampling_is_reproducible_and_valid() -> None:
    subjects = [f's{i // 3}' for i in range(60)]
    p1 = build_protocol(subjects, max_impostor=200, seed=42)
    p2 = build_protocol(subjects, max_impostor=200, seed=42)
    p3 = build_protocol(subjects, max_impostor=200, seed=7)
    assert p1.sampled and p1.impostor == p2.impostor and p1.impostor != p3.impostor
    assert len(set(p1.impostor)) == 200
    assert all(i < j and subjects[i] != subjects[j] for i, j in p1.impostor)
    assert p1.impostor_total == impostor_total(subjects)


# ── архив ──


def test_archive_layout_and_root_folder_stripped() -> None:
    raw = make_zip(
        {
            'set/alice/1.jpg': b'x' * 10,
            'set/alice/2.png': b'y' * 10,
            'set/bob/1.jpg': b'z' * 10,
            'set/readme.txt': b'-',
            '__MACOSX/set/alice/._1.jpg': b'-',
        }
    )
    imgs = read_images(raw, max_files=10, max_file_bytes=100, max_total_bytes=1000)
    assert [(i.subject, i.name) for i in imgs] == [
        ('alice', 'set/alice/1.jpg'),
        ('alice', 'set/alice/2.png'),
        ('bob', 'set/bob/1.jpg'),
    ]


@pytest.mark.parametrize(
    ('files', 'code'),
    [
        ({'a.txt': b'1'}, 'EMPTY_ARCHIVE'),
        ({'a.jpg': b'1'}, 'INVALID_LAYOUT'),
        ({f's/{i}.jpg': b'1' for i in range(11)}, 'TOO_MANY_FILES'),
        ({'s/a.jpg': b'1' * 101}, 'FILE_TOO_LARGE'),
        ({f's{i}/a.jpg': b'1' * 100 for i in range(10)}, 'ARCHIVE_TOO_LARGE'),
    ],
)
def test_archive_limits(files: dict[str, bytes], code: str) -> None:
    with pytest.raises(BioError) as e:
        read_images(make_zip(files), max_files=10, max_file_bytes=100, max_total_bytes=500)
    assert e.value.code == code


def test_not_a_zip() -> None:
    with pytest.raises(BioError) as e:
        read_images(b'not a zip', max_files=1, max_file_bytes=1, max_total_bytes=1)
    assert e.value.code == 'INVALID_ARCHIVE'


# ── HTTP ──


@pytest.fixture
def fake_client(settings: Settings) -> TestClient:
    return TestClient(
        create_app(
            settings,
            lambda cfg: FaceService(FakeDetector(), FakeEmbedder(), FakeLiveness(), FakeMetrics(), cfg),
        )
    )


def gray(v: int) -> bytes:
    return jpeg(np.full((64, 64, 3), v, np.uint8))


def test_batch_with_fake_models(fake_client: TestClient) -> None:
    raw = make_zip(
        {
            'a/1.jpg': gray(100),
            'a/2.jpg': gray(100),
            'b/1.jpg': gray(150),
            'b/2.jpg': gray(150),
            'b/dark.jpg': gray(0),  # «нет лица» у поддельного детектора
            'b/broken.jpg': b'not an image',
        }
    )
    r = fake_client.post(
        '/v1/batch/face?seed=3', content=raw, headers={**HEADERS, 'content-type': 'application/zip'}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['subjects'] == 2 and body['images'] == 6 and body['imagesUsed'] == 4
    assert body['skippedTotal'] == 2
    assert {x['reason'] for x in body['skipped']} == {'NO_FACE', 'INVALID_IMAGE'}
    assert len(body['genuine']) == 2 and len(body['impostor']) == 4
    assert body['protocol'] == {'seed': 3, 'impostorTotal': 4, 'impostorSampled': False}


def test_batch_needs_genuine_pairs(fake_client: TestClient) -> None:
    raw = make_zip({'a/1.jpg': gray(100), 'b/1.jpg': gray(150)})
    r = fake_client.post('/v1/batch/face', content=raw, headers=HEADERS)
    assert r.status_code == 422 and r.json()['code'] == 'NO_GENUINE_PAIRS'


def test_batch_body_limit_is_separate(settings: Settings) -> None:
    cfg = settings.model_copy(update={'max_body_bytes': 100, 'max_batch_bytes': 50})
    c = TestClient(
        create_app(
            cfg, lambda c: FaceService(FakeDetector(), FakeEmbedder(), FakeLiveness(), FakeMetrics(), c)
        )
    )
    r = c.post('/v1/batch/face', content=b'x' * 80, headers=HEADERS)
    assert r.status_code == 413


def test_batch_with_real_models_is_reproducible(
    real_client: TestClient, astronaut: np.ndarray, hopper: np.ndarray
) -> None:
    def variants(img: np.ndarray) -> list[bytes]:
        h, w = img.shape[:2]
        return [
            jpeg(img),
            jpeg(cv2.convertScaleAbs(img, alpha=1.1, beta=10)),
            jpeg(img[h // 20 :, w // 20 :]),
        ]

    files = {f'astronaut/{i}.jpg': b for i, b in enumerate(variants(astronaut))}
    files |= {f'hopper/{i}.jpg': b for i, b in enumerate(variants(hopper))}
    raw = make_zip(files)
    r1 = real_client.post('/v1/batch/face?seed=5&maxImpostor=5', content=raw, headers=HEADERS)
    r2 = real_client.post('/v1/batch/face?seed=5&maxImpostor=5', content=raw, headers=HEADERS)
    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    assert b1 == r2.json()
    assert b1['imagesUsed'] == 6 and len(b1['genuine']) == 6
    assert b1['protocol'] == {'seed': 5, 'impostorTotal': 9, 'impostorSampled': True}
    assert len(b1['impostor']) == 5
    assert min(b1['genuine']) > 0.6 > max(b1['impostor'])
