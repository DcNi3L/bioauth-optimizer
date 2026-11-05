"""Схемы HTTP API (camelCase в JSON). Зеркало — packages/contracts/src/bio-engine.ts; общие примеры
запросов и ответов лежат в packages/contracts/fixtures/bio-engine и проверяются обеими сторонами."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from ..domain.liveness import Command, StepFailure
from ..domain.quality import Issue

EMBEDDING_DIM = 128


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra='forbid')


class FrameIn(Model):
    image: str = Field(min_length=16, description='JPEG или PNG в base64 (допускается префикс data:)')
    ts: int | None = Field(default=None, ge=0, description='Метка времени кадра, мс (нужна в шагах-командах)')


class FramesRequest(Model):
    frames: list[FrameIn] = Field(min_length=1)


class FaceOut(Model):
    bbox: list[float] = Field(min_length=4, max_length=4)
    landmarks: list[list[float]] = Field(min_length=5, max_length=5)
    score: float


class QualityOut(Model):
    interocular_px: float
    sharpness: float
    brightness: float
    yaw_deg: float
    pitch_deg: float
    yaw_ratio: float = Field(description='Смещение носа от середины глаз в долях межзрачкового расстояния')
    pitch_ratio: float = Field(description='(глаза–нос)/(нос–рот); меньше — подбородок выше')


class FrameAnalysis(Model):
    faces: int
    face: FaceOut | None
    quality: QualityOut | None
    issues: list[Issue]


class AnalyzeResponse(Model):
    frames: list[FrameAnalysis]
    model_version: str


class TemplateResponse(Model):
    embedding: list[float] = Field(min_length=EMBEDDING_DIM, max_length=EMBEDDING_DIM)
    model_version: str
    frames_used: int
    pair_scores: list[float] = Field(description='Сходство пар годных кадров — genuine-оценки для калибровки')
    p_live_median: float
    pad_version: str
    frames: list[FrameAnalysis]


class TemplateIn(Model):
    embedding: list[float] = Field(min_length=EMBEDDING_DIM, max_length=EMBEDDING_DIM)
    model_version: str


class VerifyRequest(Model):
    frames: list[FrameIn] = Field(min_length=1)
    template: TemplateIn


class VerifyResponse(Model):
    score: float = Field(description='Медиана косинусного сходства годных кадров с шаблоном')
    scores: list[float]
    consistency: float = Field(description='Минимальное попарное сходство кадров попытки')
    frames_used: int
    probe_embedding: list[float] = Field(min_length=EMBEDDING_DIM, max_length=EMBEDDING_DIM)
    model_version: str
    frames: list[FrameAnalysis]


class StepIn(Model):
    command: Command
    frames: list[FrameIn] = Field(min_length=1)


class LivenessRequest(Model):
    baseline: list[FrameIn] = Field(min_length=1)
    steps: list[StepIn] = Field(default_factory=list, max_length=5)


class StepOut(Model):
    command: Command
    passed: bool
    measure: float | None
    failure: StepFailure | None


class LivenessResponse(Model):
    p_live_median: float
    p_live: list[float]
    commands: list[StepOut]
    identity_consistent: bool
    min_pairwise_similarity: float
    model_version: str
    pad_version: str


class BatchSkipped(Model):
    file: str
    reason: str


class BatchProtocolOut(Model):
    seed: int
    impostor_total: int = Field(description='Число всех возможных impostor-пар')
    impostor_sampled: bool = Field(description='impostor-пары взяты случайной выборкой с seed')


class BatchResponse(Model):
    modality: str
    model_version: str
    subjects: int
    images: int
    images_used: int
    skipped: list[BatchSkipped] = Field(description='Не более 200 первых пропущенных файлов')
    skipped_total: int
    genuine: list[float]
    impostor: list[float]
    protocol: BatchProtocolOut


class Problem(Model):
    type: str
    title: str
    status: int
    detail: str
    code: str


class Health(Model):
    status: str
    models: dict[str, str]
