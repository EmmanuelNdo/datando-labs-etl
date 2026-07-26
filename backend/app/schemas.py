from __future__ import annotations

from pydantic import BaseModel


class ReprojectRequest(BaseModel):
    target_epsg: int


class ExportRequest(BaseModel):
    target_format: str
