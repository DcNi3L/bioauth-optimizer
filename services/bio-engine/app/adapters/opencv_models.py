"""Адаптеры моделей: YuNet и SFace (OpenCV DNN), MiniFASNet (ONNX Runtime), метрики кадра."""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import numpy.typing as npt
import onnxruntime as ort

from ..ports import DetectedFace, Image


def _lock_entry(models_dir: Path, name: str) -> dict[str, Any]:
    lock = json.loads((models_dir.parent / 'models.lock.json').read_text(encoding='utf-8'))
    for m in lock['models']:
        if m['name'] == name:
            return dict(m)
    raise KeyError(name)


class YuNetDetector:
    """Детектор лиц YuNet. Объект OpenCV не потокобезопасен, поэтому вызовы сериализуются."""

    def __init__(self, models_dir: Path, score_threshold: float = 0.6) -> None:
        entry = _lock_entry(models_dir, 'yunet')
        self.version = f'yunet-{entry["version"]}'
        self._net = cv2.FaceDetectorYN.create(
            str(models_dir / entry['file']), '', (320, 320), score_threshold, 0.3, 50
        )
        self._lock = threading.Lock()

    def detect(self, image: Image) -> list[DetectedFace]:
        h, w = image.shape[:2]
        with self._lock:
            self._net.setInputSize((w, h))
            _, faces = self._net.detect(image)
        if faces is None:
            return []
        out = []
        for row in faces:
            out.append(
                DetectedFace(
                    bbox=(float(row[0]), float(row[1]), float(row[2]), float(row[3])),
                    landmarks=np.asarray(row[4:14], dtype=np.float64).reshape(5, 2),
                    score=float(row[14]),
                    raw=np.asarray(row, dtype=np.float32),
                )
            )
        out.sort(key=lambda f: f.score, reverse=True)
        return out


class SFaceEmbedder:
    """Эмбеддинг SFace (128 чисел) после выравнивания по 5 точкам в 112×112."""

    def __init__(self, models_dir: Path) -> None:
        entry = _lock_entry(models_dir, 'sface')
        self.version = f'sface-{entry["version"]}'
        self._net = cv2.FaceRecognizerSF.create(str(models_dir / entry['file']), '')
        self._lock = threading.Lock()

    def embed(self, image: Image, face: DetectedFace) -> npt.NDArray[np.float64]:
        with self._lock:
            aligned = self._net.alignCrop(image, face.raw)
            feature = self._net.feature(aligned)
        return np.asarray(feature, dtype=np.float64).ravel()


def crop_for_pad(
    image: Image, bbox: tuple[float, float, float, float], scale: float, size: int = 80
) -> Image:
    """Кадр вокруг лица с запасом scale, как при обучении MiniFASNet (CropImage исходного проекта)."""
    src_h, src_w = image.shape[:2]
    x, y, bw, bh = bbox
    bw, bh = max(bw, 1.0), max(bh, 1.0)
    s = min((src_h - 1) / bh, (src_w - 1) / bw, scale)
    nw, nh = bw * s, bh * s
    cx, cy = x + bw / 2, y + bh / 2
    left, top, right, bottom = cx - nw / 2, cy - nh / 2, cx + nw / 2, cy + nh / 2
    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > src_w - 1:
        left -= right - src_w + 1
        right = src_w - 1
    if bottom > src_h - 1:
        top -= bottom - src_h + 1
        bottom = src_h - 1
    patch = image[int(top) : int(bottom) + 1, int(left) : int(right) + 1]
    return np.asarray(cv2.resize(patch, (size, size)), dtype=np.uint8)


class MiniFasNetLiveness:
    """Пассивная проверка «живости»: среднее вероятностей класса «живое лицо» двух моделей MiniFASNet."""

    _MODELS = (('minifasnet-v2', 2.7), ('minifasnet-v1se', 4.0))

    def __init__(self, models_dir: Path) -> None:
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        self._sessions: list[tuple[Any, float]] = []
        versions = []
        for name, scale in self._MODELS:
            entry = _lock_entry(models_dir, name)
            versions.append(f'{name}-{entry["version"]}')
            sess = ort.InferenceSession(
                str(models_dir / entry['file']), opts, providers=['CPUExecutionProvider']
            )
            self._sessions.append((sess, scale))
        self.version = '+'.join(versions)

    def p_live(self, image: Image, face: DetectedFace) -> float:
        total = 0.0
        for sess, scale in self._sessions:
            # Вход модели — BGR 0…255 без нормировки, (1, 3, 80, 80).
            x = crop_for_pad(image, face.bbox, scale).transpose(2, 0, 1)[None].astype(np.float32)
            logits = np.asarray(sess.run(None, {'input': x})[0][0], dtype=np.float64)
            e = np.exp(logits - logits.max())
            total += float(e[1] / e.sum())  # класс 1 — живое лицо
        return total / len(self._sessions)


class OpenCvImageMetrics:
    """Резкость (дисперсия лапласиана) и средняя яркость по области лица."""

    @staticmethod
    def _roi(image: Image, face: DetectedFace) -> Image:
        h, w = image.shape[:2]
        x, y, bw, bh = face.bbox
        x0, y0 = max(int(x), 0), max(int(y), 0)
        x1, y1 = min(int(x + bw), w), min(int(y + bh), h)
        if x1 <= x0 or y1 <= y0:
            return np.zeros((1, 1), dtype=np.uint8)
        return np.asarray(cv2.cvtColor(image[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY), dtype=np.uint8)

    def sharpness(self, image: Image, face: DetectedFace) -> float:
        roi = self._roi(image, face)
        # Нормировка размера: резкость сравнима для разных расстояний до камеры.
        norm = cv2.resize(roi, (160, 160)) if roi.size > 1 else roi
        return float(cv2.Laplacian(norm, cv2.CV_64F).var())

    def brightness(self, image: Image, face: DetectedFace) -> float:
        return float(self._roi(image, face).mean())
