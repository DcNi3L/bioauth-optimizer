"""Прикладной слой: сценарии analyze, template, verify, liveness поверх портов моделей."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from .adapters.archive import ArchiveImage
from .adapters.images import decode_bytes, decode_frame
from .api import schemas as s
from .config import Settings
from .domain import liveness as lv
from .domain import matching, pairs
from .domain.geometry import Pose, pose
from .domain.quality import Issue, QualityInput, assess
from .errors import BioError
from .ports import DetectedFace, FaceDetector, FaceEmbedder, Image, ImageMetrics, LivenessModel

_IGNORED_FOR_MATCHING = {Issue.POSE, Issue.TOO_SMALL}
"""При сравнении и проверке живости кадры-команды повёрнуты и могут быть ближе/дальше — это не брак."""


@dataclass(slots=True)
class _Frame:
    image: Image
    face: DetectedFace | None
    pose: Pose | None
    analysis: s.FrameAnalysis


class FaceService:
    def __init__(
        self,
        detector: FaceDetector,
        embedder: FaceEmbedder,
        liveness: LivenessModel,
        metrics: ImageMetrics,
        settings: Settings,
    ) -> None:
        self._det = detector
        self._emb = embedder
        self._pad = liveness
        self._metrics = metrics
        self._cfg = settings

    @property
    def model_version(self) -> str:
        """Версия сравнителя: оценки разных версий не смешиваются при калибровке (docs/10 §10.5.1)."""
        return f'{self._emb.version}+{self._det.version}'

    @property
    def pad_version(self) -> str:
        return self._pad.version

    @property
    def detector(self) -> FaceDetector:
        return self._det

    @property
    def embedder(self) -> FaceEmbedder:
        return self._emb

    def versions(self) -> dict[str, str]:
        return {'detector': self._det.version, 'embedder': self._emb.version, 'liveness': self._pad.version}

    # ── вспомогательные ──

    def _check_count(self, n: int) -> None:
        if n > self._cfg.max_frames:
            raise BioError(413, 'TOO_MANY_FRAMES', f'не более {self._cfg.max_frames} кадров в запросе')

    def _decode(self, frames: list[s.FrameIn], offset: int = 0) -> list[Image]:
        return [
            decode_frame(
                f.image, offset + i, max_bytes=self._cfg.max_frame_bytes, max_side=self._cfg.max_frame_side
            )
            for i, f in enumerate(frames)
        ]

    def _analyze(self, image: Image, *, check_pose: bool = True) -> _Frame:
        faces = self._det.detect(image)
        face = faces[0] if len(faces) == 1 else None
        p: Pose | None = None
        quality: s.QualityOut | None = None
        sharp = bright = None
        if face is not None:
            try:
                p = pose(face.landmarks)
            except ValueError:
                p = None
            sharp = self._metrics.sharpness(image, face)
            bright = self._metrics.brightness(image, face)
            if p is not None:
                quality = s.QualityOut(
                    interocular_px=p.interocular_px,
                    sharpness=sharp,
                    brightness=bright,
                    yaw_deg=p.yaw_deg,
                    pitch_deg=p.pitch_deg,
                    yaw_ratio=p.yaw_ratio,
                    pitch_ratio=p.pitch_ratio if p.pitch_ratio != float('inf') else 99.0,
                )
        issues = assess(
            QualityInput(len(faces), face.score if face else None, p, sharp, bright),
            self._cfg.quality,
            check_pose=check_pose,
        )
        face_out = (
            None
            if face is None
            else s.FaceOut(
                bbox=list(face.bbox),
                landmarks=face.landmarks.tolist(),
                score=face.score,
            )
        )
        return _Frame(
            image, face, p, s.FrameAnalysis(faces=len(faces), face=face_out, quality=quality, issues=issues)
        )

    @staticmethod
    def _usable(fr: _Frame, ignore: set[Issue]) -> bool:
        return fr.face is not None and all(i in ignore for i in fr.analysis.issues)

    # ── сценарии ──

    def analyze(self, req: s.FramesRequest) -> s.AnalyzeResponse:
        self._check_count(len(req.frames))
        frames = [self._analyze(img) for img in self._decode(req.frames)]
        return s.AnalyzeResponse(frames=[f.analysis for f in frames], model_version=self.model_version)

    def template(self, req: s.FramesRequest) -> s.TemplateResponse:
        """Шаблон регистрации по кадрам без замечаний качества; пассивная PAD — защита регистрации."""
        self._check_count(len(req.frames))
        frames = [self._analyze(img) for img in self._decode(req.frames)]
        good = [f for f in frames if self._usable(f, set())]
        if len(good) < self._cfg.min_template_frames:
            raise BioError(
                422,
                'NOT_ENOUGH_GOOD_FRAMES',
                f'годных кадров {len(good)}, нужно не менее {self._cfg.min_template_frames}',
                {'frames': [f.analysis.model_dump(by_alias=True, mode='json') for f in frames]},
            )
        embeddings = [self._emb.embed(f.image, f.face) for f in good if f.face is not None]
        p_live = [self._pad.p_live(f.image, f.face) for f in good if f.face is not None]
        return s.TemplateResponse(
            embedding=matching.template(embeddings).tolist(),
            model_version=self.model_version,
            frames_used=len(good),
            pair_scores=matching.pairwise(embeddings),
            p_live_median=matching.median(p_live),
            pad_version=self.pad_version,
            frames=[f.analysis for f in frames],
        )

    def verify(self, req: s.VerifyRequest) -> s.VerifyResponse:
        self._check_count(len(req.frames))
        if req.template.model_version != self.model_version:
            raise BioError(
                409,
                'MODEL_VERSION_MISMATCH',
                f'шаблон построен моделью {req.template.model_version}, сервис — {self.model_version}',
            )
        tpl = matching.l2_normalize(req.template.embedding)
        frames = [self._analyze(img, check_pose=False) for img in self._decode(req.frames)]
        usable = [f for f in frames if self._usable(f, _IGNORED_FOR_MATCHING)]
        if not usable:
            raise BioError(
                422,
                'NO_USABLE_FRAMES',
                'ни в одном кадре нет пригодного лица',
                {'frames': [f.analysis.model_dump(by_alias=True, mode='json') for f in frames]},
            )
        embeddings: list[npt.NDArray[np.float64]] = [
            self._emb.embed(f.image, f.face) for f in usable if f.face
        ]
        scores = [matching.cosine(e, tpl) for e in embeddings]
        return s.VerifyResponse(
            score=matching.median(scores),
            scores=scores,
            consistency=matching.min_pairwise(embeddings),
            frames_used=len(usable),
            probe_embedding=matching.template(embeddings).tolist(),
            model_version=self.model_version,
            frames=[f.analysis for f in frames],
        )

    def liveness(self, req: s.LivenessRequest) -> s.LivenessResponse:
        total = len(req.baseline) + sum(len(st.frames) for st in req.steps)
        self._check_count(total)
        base_frames = [self._analyze(img, check_pose=False) for img in self._decode(req.baseline)]
        base_poses = [
            f.pose for f in base_frames if f.pose is not None and self._usable(f, _IGNORED_FOR_MATCHING)
        ]
        if not base_poses:
            raise BioError(422, 'NO_USABLE_FRAMES', 'в нейтральных кадрах нет пригодного лица')
        baseline = lv.Baseline.of(base_poses)

        offset = len(req.baseline)
        all_frames = list(base_frames)
        results: list[s.StepOut] = []
        for step in req.steps:
            frames = [self._analyze(img, check_pose=False) for img in self._decode(step.frames, offset)]
            offset += len(step.frames)
            all_frames.extend(frames)
            r = lv.check_step(
                step.command,
                baseline,
                [f.pose if self._usable(f, _IGNORED_FOR_MATCHING) else None for f in frames],
                [f.ts for f in step.frames],
                self._cfg.liveness,
            )
            results.append(
                s.StepOut(command=r.command, passed=r.passed, measure=r.measure, failure=r.failure)
            )

        with_face = [f for f in all_frames if self._usable(f, _IGNORED_FOR_MATCHING) and f.face is not None]
        # Пассивная PAD — по фронтальным кадрам: на сильно повёрнутом лице MiniFASNet менее надёжна.
        max_yaw = self._cfg.liveness.frontal_max_yaw_deg
        frontal = [f for f in with_face if f.pose is not None and abs(f.pose.yaw_deg) <= max_yaw] or with_face
        p_live = [self._pad.p_live(f.image, f.face) for f in frontal if f.face is not None]
        # Согласованность личности: каждый кадр сравнивается с центроидом нейтральных кадров.
        base_ids = {id(f) for f in base_frames}
        base_emb = [self._emb.embed(f.image, f.face) for f in with_face if id(f) in base_ids and f.face]
        other_emb = [self._emb.embed(f.image, f.face) for f in with_face if id(f) not in base_ids and f.face]
        centroid = matching.template(base_emb)
        sims = [matching.cosine(e, centroid) for e in [*base_emb, *other_emb]]
        min_sim = min(sims) if sims else 1.0
        return s.LivenessResponse(
            p_live_median=matching.median(p_live),
            p_live=p_live,
            commands=results,
            identity_consistent=min_sim >= self._cfg.liveness.identity_min_similarity,
            min_pairwise_similarity=min_sim,
            model_version=self.model_version,
            pad_version=self.pad_version,
        )


MAX_SKIPPED_REPORTED = 200


def batch_face(
    service: FaceService,
    images: list[ArchiveImage],
    *,
    seed: int,
    max_impostor: int,
    max_side: int,
) -> s.BatchResponse:
    """Пакетная оценка (UC-9): эмбеддинг лица на каждом изображении (лицо с наибольшей уверенностью
    детектора), затем сходство по протоколу пар. Изображение без лица пропускается с причиной."""
    subjects: list[str] = []
    embeddings: list[npt.NDArray[np.float64]] = []
    skipped: list[s.BatchSkipped] = []
    for img in images:
        try:
            image = decode_bytes(img.data, img.name, max_side=max_side)
        except BioError:
            skipped.append(s.BatchSkipped(file=img.name, reason='INVALID_IMAGE'))
            continue
        faces = service.detector.detect(image)
        if not faces:
            skipped.append(s.BatchSkipped(file=img.name, reason='NO_FACE'))
            continue
        embeddings.append(matching.l2_normalize(service.embedder.embed(image, faces[0])))
        subjects.append(img.subject)
    protocol = pairs.build_protocol(subjects, max_impostor, seed)
    if not protocol.genuine:
        raise BioError(
            422,
            'NO_GENUINE_PAIRS',
            'нет genuine-пар: нужен хотя бы один субъект с двумя изображениями, где найдено лицо',
        )
    if not protocol.impostor:
        raise BioError(422, 'NO_IMPOSTOR_PAIRS', 'нет impostor-пар: нужно не менее двух субъектов')
    m = np.vstack(embeddings) if embeddings else np.empty((0, 128))

    def scores(ps: list[pairs.Pair]) -> list[float]:
        if not ps:
            return []
        idx = np.asarray(ps, dtype=np.int64)
        sims = np.einsum('ij,ij->i', m[idx[:, 0]], m[idx[:, 1]])
        return [round(float(x), 6) for x in np.clip(sims, -1.0, 1.0)]

    return s.BatchResponse(
        modality='face',
        model_version=service.model_version,
        subjects=len({img.subject for img in images}),
        images=len(images),
        images_used=len(embeddings),
        skipped=skipped[:MAX_SKIPPED_REPORTED],
        skipped_total=len(skipped),
        genuine=scores(protocol.genuine),
        impostor=scores(protocol.impostor),
        protocol=s.BatchProtocolOut(
            seed=seed, impostor_total=protocol.impostor_total, impostor_sampled=protocol.sampled
        ),
    )
