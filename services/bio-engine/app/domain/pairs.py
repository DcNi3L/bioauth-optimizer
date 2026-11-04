"""Протокол пар для пакетной оценки (docs/10 §10.6, способ B): все genuine-пары и impostor-пары —
полностью или случайной выборкой с seed. Чистые функции: одинаковые входы и seed дают одинаковые пары."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

Pair = tuple[int, int]


@dataclass(frozen=True, slots=True)
class PairProtocol:
    genuine: list[Pair]
    impostor: list[Pair]
    impostor_total: int
    """Число всех возможных impostor-пар (до выборки)."""
    sampled: bool


def genuine_pairs(subjects: Sequence[str]) -> list[Pair]:
    """Все пары (i < j) изображений одного субъекта, в порядке индексов."""
    by_subject: dict[str, list[int]] = {}
    for i, sub in enumerate(subjects):
        by_subject.setdefault(sub, []).append(i)
    out: list[Pair] = []
    for idx in by_subject.values():
        out.extend((idx[a], idx[b]) for a in range(len(idx)) for b in range(a + 1, len(idx)))
    out.sort()
    return out


def impostor_total(subjects: Sequence[str]) -> int:
    n = len(subjects)
    counts = np.unique(np.asarray(subjects, dtype=object), return_counts=True)[1] if n else np.array([])
    return n * (n - 1) // 2 - int(sum(int(c) * (int(c) - 1) // 2 for c in counts))


def build_protocol(subjects: Sequence[str], max_impostor: int, seed: int) -> PairProtocol:
    """Impostor-пары: все, если их не больше max_impostor, иначе равномерная выборка без повторов
    (генератор numpy PCG64 с seed — воспроизводимо на любой платформе)."""
    if max_impostor < 0:
        raise ValueError('max_impostor не может быть отрицательным')
    genuine = genuine_pairs(subjects)
    total = impostor_total(subjects)
    n = len(subjects)
    if total <= max_impostor:
        impostor = [(i, j) for i in range(n) for j in range(i + 1, n) if subjects[i] != subjects[j]]
        return PairProtocol(genuine, impostor, total, sampled=False)

    rng = np.random.default_rng(seed)
    labels = np.asarray(subjects, dtype=object)
    chosen: set[Pair] = set()
    while len(chosen) < max_impostor:
        need = max_impostor - len(chosen)
        a = rng.integers(0, n, size=need * 2)
        b = rng.integers(0, n, size=need * 2)
        for i, j in zip(a.tolist(), b.tolist(), strict=True):
            if i == j or labels[i] == labels[j]:
                continue
            pair = (i, j) if i < j else (j, i)
            if pair not in chosen:
                chosen.add(pair)
                if len(chosen) == max_impostor:
                    break
    return PairProtocol(genuine, sorted(chosen), total, sampled=True)
