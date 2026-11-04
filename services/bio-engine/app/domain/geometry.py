"""Геометрия лица по 5 ключевым точкам YuNet (чистые функции, без OpenCV).

Порядок точек YuNet: правый глаз, левый глаз (с точки зрения человека), кончик носа, правый и левый
угол рта. Для всех величин порядок глаз не важен: используются середина и расстояние между ними.
Изображение не зеркальное (как его выдаёт камера): ось x направлена вправо, y — вниз.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

Landmarks = npt.NDArray[np.float64]
"""Массив формы (5, 2): x, y ключевых точек."""

NOSE_DEPTH_RATIO = 0.55
"""Выступ кончика носа относительно плоскости глаз в долях межзрачкового расстояния (антропометрия)."""
PITCH_NEUTRAL_RATIO = 1.6
"""Отношение (глаза–нос)/(нос–рот) у фронтального лица по точкам YuNet (измерено на эталонных портретах)."""


@dataclass(frozen=True, slots=True)
class Pose:
    interocular_px: float
    yaw_ratio: float
    """(x носа − x середины глаз) / межзрачковое расстояние: > 0 — голова повёрнута влево (для человека)."""
    pitch_ratio: float
    """(глаза–нос) / (нос–рот) по вертикали; уменьшается, когда подбородок поднят."""
    yaw_deg: float
    pitch_deg: float
    """> 0 — подбородок поднят."""


def as_landmarks(points: npt.ArrayLike) -> Landmarks:
    arr = np.asarray(points, dtype=np.float64).reshape(5, 2)
    if not np.all(np.isfinite(arr)):
        raise ValueError('ключевые точки должны быть конечными числами')
    return arr


def pose(points: npt.ArrayLike) -> Pose:
    lm = as_landmarks(points)
    eye_r, eye_l, nose, mouth_r, mouth_l = lm
    eye_mid = (eye_r + eye_l) / 2
    mouth_mid = (mouth_r + mouth_l) / 2
    iod = float(np.linalg.norm(eye_r - eye_l))
    if iod <= 1e-6:
        raise ValueError('глаза совпадают: вырожденные ключевые точки')
    yaw_ratio = float((nose[0] - eye_mid[0]) / iod)
    eye_nose = float(nose[1] - eye_mid[1])
    nose_mouth = float(mouth_mid[1] - nose[1])
    pitch_ratio = eye_nose / nose_mouth if nose_mouth > 1e-6 else math.inf
    # Нос смещается на d·sinθ при сужении базы глаз до iod·cosθ: ratio = (d/iod)·tgθ.
    yaw_deg = math.degrees(math.atan(yaw_ratio / NOSE_DEPTH_RATIO))
    pitch_deg = (
        90.0
        if not math.isfinite(pitch_ratio)
        else max(-90.0, min(90.0, (PITCH_NEUTRAL_RATIO - pitch_ratio) / PITCH_NEUTRAL_RATIO * 60.0))
    )
    return Pose(iod, yaw_ratio, pitch_ratio, yaw_deg, pitch_deg)
