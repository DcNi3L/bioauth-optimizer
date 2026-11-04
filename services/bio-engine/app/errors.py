"""Прикладные ошибки с HTTP-статусом и машинным кодом."""

from __future__ import annotations

from typing import Any


class BioError(Exception):
    def __init__(self, status: int, code: str, detail: str, extra: dict[str, Any] | None = None) -> None:
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail
        self.extra = extra or {}
