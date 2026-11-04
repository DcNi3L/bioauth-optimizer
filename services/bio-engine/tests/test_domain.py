"""Unit-тесты чистой логики: геометрия, качество, сходство, активные команды."""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.config import LivenessThresholds, QualityThresholds
from app.domain import matching
from app.domain.geometry import pose
from app.domain.liveness import Baseline, Command, StepFailure, check_step, timing_ok
from app.domain.quality import Issue, QualityInput, assess

# Фронтальное лицо: глаза (100,100) и (180,100), нос (140,145), углы рта (110,185) и (170,185).
FRONTAL = np.array([[100, 100], [180, 100], [140, 145], [110, 185], [170, 185]], dtype=float)


def shifted_nose(dx: float = 0, dy: float = 0) -> np.ndarray:
    lm = FRONTAL.copy()
    lm[2] += (dx, dy)
    return lm


class TestGeometry:
    def test_frontal_face_has_zero_yaw(self) -> None:
        p = pose(FRONTAL)
        assert p.interocular_px == pytest.approx(80)
        assert p.yaw_ratio == pytest.approx(0)
        assert p.yaw_deg == pytest.approx(0)

    def test_nose_to_image_right_means_turn_left(self) -> None:
        p = pose(shifted_nose(dx=16))
        assert p.yaw_ratio == pytest.approx(0.2)
        assert p.yaw_deg == pytest.approx(math.degrees(math.atan(0.2 / 0.55)))

    def test_chin_up_raises_pitch(self) -> None:
        assert pose(shifted_nose(dy=-15)).pitch_deg > pose(FRONTAL).pitch_deg

    def test_invariant_to_translation_and_scale(self) -> None:
        rng = np.random.default_rng(7)
        for _ in range(200):
            lm = FRONTAL + rng.normal(0, 3, FRONTAL.shape)
            k, t = rng.uniform(0.3, 4), rng.uniform(-500, 500, 2)
            a, b = pose(lm), pose(lm * k + t)
            assert b.yaw_ratio == pytest.approx(a.yaw_ratio, abs=1e-9)
            assert b.pitch_ratio == pytest.approx(a.pitch_ratio, rel=1e-9)
            assert b.interocular_px == pytest.approx(a.interocular_px * k, rel=1e-9)

    def test_degenerate_landmarks_rejected(self) -> None:
        with pytest.raises(ValueError, match='глаза'):
            pose(np.zeros((5, 2)))
        with pytest.raises(ValueError, match='конечными'):
            pose(np.full((5, 2), np.nan))


class TestQuality:
    t = QualityThresholds()

    def q(self, **kw: object) -> QualityInput:
        base = {
            'faces': 1,
            'detection_score': 0.95,
            'pose': pose(FRONTAL),
            'sharpness': 100.0,
            'brightness': 120.0,
        }
        base.update(kw)
        return QualityInput(**base)  # type: ignore[arg-type]

    def test_good_frame(self) -> None:
        assert assess(self.q(), self.t) == []

    @pytest.mark.parametrize(
        ('kw', 'issue'),
        [
            ({'faces': 0}, Issue.NO_FACE),
            ({'faces': 2}, Issue.MANY_FACES),
            ({'detection_score': 0.7}, Issue.LOW_CONFIDENCE),
            ({'pose': pose(FRONTAL * 0.5)}, Issue.TOO_SMALL),
            ({'sharpness': 10.0}, Issue.BLURRY),
            ({'brightness': 30.0}, Issue.TOO_DARK),
            ({'brightness': 240.0}, Issue.TOO_BRIGHT),
            ({'pose': pose(shifted_nose(dx=30))}, Issue.POSE),
        ],
    )
    def test_each_issue(self, kw: dict[str, object], issue: Issue) -> None:
        assert issue in assess(self.q(**kw), self.t)

    def test_pose_ignored_when_disabled(self) -> None:
        assert assess(self.q(pose=pose(shifted_nose(dx=30))), self.t, check_pose=False) == []


class TestMatching:
    def test_cosine_and_template(self) -> None:
        a, b = np.array([1.0, 0, 0]), np.array([0.0, 2, 0])
        assert matching.cosine(a, a * 5) == pytest.approx(1)
        assert matching.cosine(a, b) == pytest.approx(0)
        assert np.linalg.norm(matching.template([a, b])) == pytest.approx(1)
        assert matching.pairwise([a, b, a]) == pytest.approx([0, 1, 0])
        assert matching.min_pairwise([a]) == 1.0
        assert matching.median([3, 1, 2]) == 2

    def test_zero_vector_rejected(self) -> None:
        with pytest.raises(ValueError, match='нулевой'):
            matching.l2_normalize([0, 0])


class TestLiveness:
    t = LivenessThresholds()
    base = Baseline.of([pose(FRONTAL)])
    ts = (0, 300, 600)

    def step(self, command: Command, poses: list[np.ndarray | None], ts: list[int | None] | None = None):  # type: ignore[no-untyped-def]
        return check_step(
            command, self.base, [None if p is None else pose(p) for p in poses], ts or list(self.ts), self.t
        )

    @pytest.mark.parametrize(
        ('command', 'performed', 'still'),
        [
            (Command.TURN_LEFT, shifted_nose(dx=14), FRONTAL),
            (Command.TURN_RIGHT, shifted_nose(dx=-14), FRONTAL),
            (Command.CHIN_UP, shifted_nose(dy=-12), FRONTAL),
            (Command.MOVE_CLOSER, (FRONTAL - 140) * 1.4 + 140, FRONTAL),
        ],
    )
    def test_command_passes_only_when_performed(
        self, command: Command, performed: np.ndarray, still: np.ndarray
    ) -> None:
        ok = self.step(command, [still, performed, still])
        assert ok.passed and ok.failure is None
        bad = self.step(command, [still, still, still])
        assert not bad.passed and bad.failure is StepFailure.NOT_PERFORMED

    def test_wrong_direction_fails(self) -> None:
        assert not self.step(Command.TURN_LEFT, [shifted_nose(dx=-20)] * 3).passed

    def test_no_face_in_step(self) -> None:
        r = self.step(Command.TURN_LEFT, [None, None, None])
        assert r.failure is StepFailure.NO_FACE

    def test_timing(self) -> None:
        assert timing_ok([0, 10, 20], 1000)
        assert not timing_ok([0, 0, 20], 1000)  # повтор кадра
        assert not timing_ok([0, 2000], 1000)  # слишком долго
        assert not timing_ok([0, None], 1000)  # нет метки
        r = self.step(Command.TURN_LEFT, [shifted_nose(dx=14)] * 3, [30, 20, 10])
        assert r.failure is StepFailure.TIMING
