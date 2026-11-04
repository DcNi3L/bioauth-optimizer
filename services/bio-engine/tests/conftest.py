"""Общие фикстуры.

Эталонные изображения (tests/fixtures) находятся в общественном достоянии:
- astronaut.jpg — портрет астронавта NASA Эйлин Коллинз (из scikit-image / imageio, NASA, public domain);
- grace_hopper.jpg — портрет контр-адмирала Грейс Хоппер (из matplotlib sample_data, ВМС США, public domain).
"""

from __future__ import annotations

import base64
from collections.abc import Iterator
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

FIXTURES = Path(__file__).parent / 'fixtures'
MODELS = Path(__file__).resolve().parent.parent / 'models'
SECRET = 'test-secret'
HEADERS = {'X-Bio-Secret': SECRET}


def load(name: str, scale: float = 1.0) -> np.ndarray:
    img = cv2.imread(str(FIXTURES / name))
    assert img is not None, name
    if scale != 1.0:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    return img


def b64(img: np.ndarray, ext: str = '.jpg') -> str:
    ok, buf = cv2.imencode(ext, img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    assert ok
    return base64.b64encode(buf.tobytes()).decode()


def models_available() -> bool:
    return all(
        (MODELS / f).exists()
        for f in (
            'face_detection_yunet_2023mar.onnx',
            'face_recognition_sface_2021dec.onnx',
            'minifasnet_v2_2.7_80x80.onnx',
            'minifasnet_v1se_4.0_80x80.onnx',
        )
    )


@pytest.fixture
def settings() -> Settings:
    return Settings(secret=SECRET, log_level='INFO')


@pytest.fixture(scope='session')
def real_client() -> Iterator[TestClient]:
    if not models_available():
        pytest.skip('модели не скачаны: python scripts/fetch_models.py')
    with TestClient(create_app(Settings(secret=SECRET))) as client:
        yield client


@pytest.fixture(scope='session')
def astronaut() -> np.ndarray:
    return load('astronaut.jpg', 1.6)


@pytest.fixture(scope='session')
def hopper() -> np.ndarray:
    return load('grace_hopper.jpg')
