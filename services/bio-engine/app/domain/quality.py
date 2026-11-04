"""Контроль качества кадра (docs/10 §10.5.2)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from ..config import QualityThresholds
from .geometry import Pose


class Issue(StrEnum):
    NO_FACE = 'NO_FACE'
    MANY_FACES = 'MANY_FACES'
    LOW_CONFIDENCE = 'LOW_CONFIDENCE'
    TOO_SMALL = 'TOO_SMALL'
    BLURRY = 'BLURRY'
    TOO_DARK = 'TOO_DARK'
    TOO_BRIGHT = 'TOO_BRIGHT'
    POSE = 'POSE'


@dataclass(frozen=True, slots=True)
class QualityInput:
    faces: int
    detection_score: float | None
    pose: Pose | None
    sharpness: float | None
    brightness: float | None


def assess(q: QualityInput, t: QualityThresholds, *, check_pose: bool = True) -> list[Issue]:
    """Список проблем кадра; пустой список — кадр годен. Порядок — от самой важной проблемы."""
    if q.faces == 0:
        return [Issue.NO_FACE]
    if q.faces > 1:
        return [Issue.MANY_FACES]
    issues: list[Issue] = []
    if q.detection_score is not None and q.detection_score < t.min_detection_score:
        issues.append(Issue.LOW_CONFIDENCE)
    if q.pose is not None and q.pose.interocular_px < t.min_interocular_px:
        issues.append(Issue.TOO_SMALL)
    if q.sharpness is not None and q.sharpness < t.min_sharpness:
        issues.append(Issue.BLURRY)
    if q.brightness is not None:
        if q.brightness < t.min_brightness:
            issues.append(Issue.TOO_DARK)
        elif q.brightness > t.max_brightness:
            issues.append(Issue.TOO_BRIGHT)
    if (
        check_pose
        and q.pose is not None
        and (abs(q.pose.yaw_deg) > t.max_abs_yaw_deg or abs(q.pose.pitch_deg) > t.max_abs_pitch_deg)
    ):
        issues.append(Issue.POSE)
    return issues
