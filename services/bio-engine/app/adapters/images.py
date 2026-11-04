"""Декодирование кадров из base64 (JPEG/PNG) с ограничениями размера."""

from __future__ import annotations

import base64
import binascii

import cv2
import numpy as np

from ..errors import BioError
from ..ports import Image


def decode_frame(data: str, index: int, *, max_bytes: int, max_side: int) -> Image:
    payload = data.split(',', 1)[1] if data.startswith('data:') else data
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise BioError(422, 'INVALID_IMAGE', f'кадр {index}: некорректный base64') from exc
    if len(raw) > max_bytes:
        raise BioError(413, 'FRAME_TOO_LARGE', f'кадр {index}: больше {max_bytes} байт')
    img = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None or img.ndim != 3 or img.shape[0] < 32 or img.shape[1] < 32:
        raise BioError(422, 'INVALID_IMAGE', f'кадр {index}: не удалось декодировать изображение JPEG/PNG')
    h, w = img.shape[:2]
    if max(h, w) > max_side:
        k = max_side / max(h, w)
        img = cv2.resize(img, (round(w * k), round(h * k)), interpolation=cv2.INTER_AREA)
    return np.asarray(img, dtype=np.uint8)
