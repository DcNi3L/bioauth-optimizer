"""Порты: интерфейсы моделей, от которых зависит прикладной слой (реализации — app/adapters)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np
import numpy.typing as npt

Image = npt.NDArray[np.uint8]
"""Кадр BGR формы (h, w, 3)."""


@dataclass(frozen=True, slots=True)
class DetectedFace:
    bbox: tuple[float, float, float, float]
    """x, y, ширина, высота."""
    landmarks: npt.NDArray[np.float64]
    """(5, 2)"""
    score: float
    raw: npt.NDArray[np.float32]
    """Строка детектора как есть (нужна выравниванию SFace)."""


class FaceDetector(Protocol):
    version: str

    def detect(self, image: Image) -> list[DetectedFace]: ...


class FaceEmbedder(Protocol):
    version: str

    def embed(self, image: Image, face: DetectedFace) -> npt.NDArray[np.float64]: ...


class LivenessModel(Protocol):
    version: str

    def p_live(self, image: Image, face: DetectedFace) -> float: ...


class ImageMetrics(Protocol):
    def sharpness(self, image: Image, face: DetectedFace) -> float: ...

    def brightness(self, image: Image, face: DetectedFace) -> float: ...
