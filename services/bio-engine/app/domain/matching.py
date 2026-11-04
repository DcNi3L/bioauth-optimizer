"""Шаблоны и сходство эмбеддингов (чистые функции)."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import numpy.typing as npt

Vector = npt.NDArray[np.float64]


def l2_normalize(v: npt.ArrayLike) -> Vector:
    arr = np.asarray(v, dtype=np.float64).ravel()
    norm = float(np.linalg.norm(arr))
    if not np.isfinite(norm) or norm <= 1e-12:
        raise ValueError('вектор нулевой длины или с нечисловыми значениями')
    return arr / norm


def cosine(a: npt.ArrayLike, b: npt.ArrayLike) -> float:
    """Косинусное сходство в [−1, 1]."""
    return float(np.clip(np.dot(l2_normalize(a), l2_normalize(b)), -1.0, 1.0))


def template(embeddings: Sequence[npt.ArrayLike]) -> Vector:
    """Шаблон — нормированное среднее нормированных эмбеддингов кадров регистрации."""
    if not embeddings:
        raise ValueError('нет эмбеддингов для шаблона')
    return l2_normalize(np.mean([l2_normalize(e) for e in embeddings], axis=0))


def pairwise(embeddings: Sequence[npt.ArrayLike]) -> list[float]:
    """Сходство всех пар (i < j) в фиксированном порядке."""
    vs = [l2_normalize(e) for e in embeddings]
    return [float(np.clip(vs[i] @ vs[j], -1.0, 1.0)) for i in range(len(vs)) for j in range(i + 1, len(vs))]


def min_pairwise(embeddings: Sequence[npt.ArrayLike]) -> float:
    """Минимальное попарное сходство; для одного кадра — 1."""
    scores = pairwise(embeddings)
    return min(scores) if scores else 1.0


def median(values: Sequence[float]) -> float:
    if not values:
        raise ValueError('пустая выборка')
    return float(np.median(np.asarray(values, dtype=np.float64)))
