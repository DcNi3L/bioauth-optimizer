"""Чтение zip-архива набора изображений: «<субъект>/<файл>». Архив не распаковывается на диск;
ограничены число файлов, размер каждого и суммарный распакованный объём (защита от zip-бомб)."""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

from ..errors import BioError

IMAGE_SUFFIXES = frozenset({'.jpg', '.jpeg', '.png', '.bmp'})


@dataclass(frozen=True, slots=True)
class ArchiveImage:
    subject: str
    name: str
    """Путь внутри архива (для отчёта о пропущенных файлах)."""
    data: bytes


def _skip(path: PurePosixPath) -> bool:
    return any(p.startswith('.') or p == '__MACOSX' for p in path.parts)


def read_images(
    raw: bytes, *, max_files: int, max_file_bytes: int, max_total_bytes: int
) -> list[ArchiveImage]:
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise BioError(422, 'INVALID_ARCHIVE', 'ожидается zip-архив') from exc
    with zf:
        entries = [
            (PurePosixPath(i.filename), i)
            for i in zf.infolist()
            if not i.is_dir() and PurePosixPath(i.filename).suffix.lower() in IMAGE_SUFFIXES
        ]
        entries = [(p, i) for p, i in entries if not _skip(p)]
        if not entries:
            raise BioError(422, 'EMPTY_ARCHIVE', 'в архиве нет изображений JPEG/PNG/BMP')
        if len(entries) > max_files:
            raise BioError(413, 'TOO_MANY_FILES', f'не более {max_files} изображений в архиве')
        # Общая корневая папка («dataset/<субъект>/...») не считается субъектом.
        tops = {p.parts[0] for p, _ in entries}
        strip = 1 if len(tops) == 1 and all(len(p.parts) >= 3 for p, _ in entries) else 0
        total = 0
        out: list[ArchiveImage] = []
        for path, info in sorted(entries, key=lambda e: e[0].as_posix()):
            parts = path.parts[strip:]
            if len(parts) < 2:
                raise BioError(422, 'INVALID_LAYOUT', f'{path}: файл должен лежать в папке субъекта')
            if info.file_size > max_file_bytes:
                raise BioError(413, 'FILE_TOO_LARGE', f'{path}: больше {max_file_bytes} байт')
            # Заявленным размерам в архиве не доверяем: читаем не больше лимита и считаем фактический объём.
            with zf.open(info) as f:
                data = f.read(max_file_bytes + 1)
            if len(data) > max_file_bytes:
                raise BioError(413, 'FILE_TOO_LARGE', f'{path}: больше {max_file_bytes} байт')
            total += len(data)
            if total > max_total_bytes:
                raise BioError(413, 'ARCHIVE_TOO_LARGE', f'распакованный объём больше {max_total_bytes} байт')
            out.append(ArchiveImage(subject=parts[0], name=path.as_posix(), data=data))
        return out
