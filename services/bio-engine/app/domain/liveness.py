"""Активная проверка «живости»: случайные команды по 5 ключевым точкам (docs/10 §10.5.3).

Каждая команда проверяется по изменению относительно нейтральных кадров (baseline) того же человека,
а не по абсолютному углу: так проверка меньше зависит от индивидуальной геометрии лица и камеры.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from itertools import pairwise

from ..config import LivenessThresholds
from .geometry import Pose
from .matching import median


class Command(StrEnum):
    TURN_LEFT = 'TURN_LEFT'
    TURN_RIGHT = 'TURN_RIGHT'
    CHIN_UP = 'CHIN_UP'
    MOVE_CLOSER = 'MOVE_CLOSER'


class StepFailure(StrEnum):
    NO_FACE = 'NO_FACE'
    NOT_PERFORMED = 'NOT_PERFORMED'
    TIMING = 'TIMING'


@dataclass(frozen=True, slots=True)
class Baseline:
    yaw_ratio: float
    pitch_ratio: float
    interocular_px: float

    @staticmethod
    def of(poses: Sequence[Pose]) -> Baseline:
        if not poses:
            raise ValueError('нет нейтральных кадров с лицом')
        return Baseline(
            yaw_ratio=median([p.yaw_ratio for p in poses]),
            pitch_ratio=median([p.pitch_ratio for p in poses]),
            interocular_px=median([p.interocular_px for p in poses]),
        )


@dataclass(frozen=True, slots=True)
class StepResult:
    command: Command
    passed: bool
    measure: float | None
    """Лучшее достигнутое изменение: Δ yaw_ratio, отношение pitch или отношение iod."""
    failure: StepFailure | None


def measure(command: Command, base: Baseline, p: Pose) -> float:
    match command:
        case Command.TURN_LEFT:
            return p.yaw_ratio - base.yaw_ratio
        case Command.TURN_RIGHT:
            return base.yaw_ratio - p.yaw_ratio
        case Command.CHIN_UP:
            return p.pitch_ratio / base.pitch_ratio
        case Command.MOVE_CLOSER:
            return p.interocular_px / base.interocular_px


def _passes(command: Command, value: float, t: LivenessThresholds) -> bool:
    match command:
        case Command.TURN_LEFT | Command.TURN_RIGHT:
            return value >= t.yaw_ratio_delta
        case Command.CHIN_UP:
            return value <= t.pitch_ratio_factor
        case Command.MOVE_CLOSER:
            return value >= t.closer_factor


def _best(command: Command, values: list[float]) -> float:
    return min(values) if command is Command.CHIN_UP else max(values)


def timing_ok(timestamps: Sequence[int | None], max_step_ms: int) -> bool:
    """Метки времени кадров шага строго возрастают и укладываются в max_step_ms (защита от склейки)."""
    ts = [t for t in timestamps if t is not None]
    if len(ts) != len(timestamps):
        return False
    return all(b > a for a, b in pairwise(ts)) and (ts[-1] - ts[0] <= max_step_ms if ts else True)


def check_step(
    command: Command,
    base: Baseline,
    poses: Sequence[Pose | None],
    timestamps: Sequence[int | None],
    t: LivenessThresholds,
) -> StepResult:
    if not timing_ok(timestamps, t.max_step_ms):
        return StepResult(command, False, None, StepFailure.TIMING)
    values = [measure(command, base, p) for p in poses if p is not None]
    if not values:
        return StepResult(command, False, None, StepFailure.NO_FACE)
    best = _best(command, values)
    ok = _passes(command, best, t)
    return StepResult(command, ok, best, None if ok else StepFailure.NOT_PERFORMED)
