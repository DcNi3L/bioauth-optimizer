"""Конфигурация сервиса из переменных окружения (префикс BIO_)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class QualityThresholds(BaseModel):
    """Начальные пороги контроля качества кадра (docs/10 §10.5.2); калибруются по FTA."""

    min_detection_score: float = 0.9
    min_interocular_px: float = 60.0
    min_sharpness: float = 60.0
    min_brightness: float = 60.0
    max_brightness: float = 200.0
    max_abs_yaw_deg: float = 25.0
    max_abs_pitch_deg: float = 20.0


class LivenessThresholds(BaseModel):
    """Пороги активных команд (docs/10 §10.5.3). Изменения меряются относительно нейтральных кадров."""

    yaw_ratio_delta: float = 0.10
    """Смещение носа относительно середины глаз, в долях межзрачкового расстояния."""
    pitch_ratio_factor: float = 0.88
    """Отношение (глаза–нос)/(нос–рот) при поднятом подбородке не больше этой доли исходного."""
    closer_factor: float = 1.18
    """Рост межзрачкового расстояния при приближении."""
    identity_min_similarity: float = 0.3
    """Минимальное сходство каждого кадра попытки с центроидом нейтральных кадров. Повёрнутое лицо того же
    человека даёт 0,4–0,7, другой человек — обычно ниже 0,25; попарный минимум по всем кадрам был слишком
    строгим для команд с поворотом головы."""
    frontal_max_yaw_deg: float = 20.0
    """Кадры с |yaw| не больше этого угла считаются фронтальными: по ним считается пассивная PAD."""
    max_step_ms: int = 15_000
    """Длительность одного шага-команды; дольше — отказ."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='BIO_', env_nested_delimiter='__')

    secret: SecretStr = Field(default=SecretStr(''), description='Общий секрет для заголовка X-Bio-Secret')
    models_dir: Path = Path(__file__).resolve().parent.parent / 'models'
    max_body_bytes: int = 24 * 1024 * 1024
    max_frames: int = 16
    max_frame_bytes: int = 4 * 1024 * 1024
    max_frame_side: int = 1920
    min_template_frames: int = 3
    max_batch_bytes: int = 256 * 1024 * 1024
    """Размер zip-архива пакетного режима (тело запроса /v1/batch/*)."""
    max_batch_files: int = 5000
    max_batch_unpacked_bytes: int = 1024 * 1024 * 1024
    max_batch_impostor: int = 1_000_000
    log_level: str = 'INFO'
    quality: QualityThresholds = QualityThresholds()
    liveness: LivenessThresholds = LivenessThresholds()


@lru_cache
def get_settings() -> Settings:
    return Settings()
