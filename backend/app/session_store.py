"""Stockage en mémoire des datasets en cours de traitement.

MVP volontairement simple : pas de DB, pas de persistance entre redémarrages.
Chaque dataset uploadé vit en RAM (GeoDataFrame) + sur disque (fichiers
sources) le temps de la session, identifié par un UUID."""
from __future__ import annotations

import shutil
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import geopandas as gpd

BASE_TMP_DIR = Path("/tmp/datando_etl_sessions")
BASE_TMP_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class Dataset:
    id: str
    original_filenames: list[str]
    format_key: str
    upload_dir: Path
    gdf: gpd.GeoDataFrame
    source_encoding: dict = field(default_factory=dict)
    pipeline_log: list[str] = field(default_factory=list)

    def log(self, message: str) -> None:
        self.pipeline_log.append(message)


class DatasetStore:
    def __init__(self) -> None:
        self._datasets: dict[str, Dataset] = {}

    def create(self, original_filenames: list[str], format_key: str, gdf: gpd.GeoDataFrame) -> Dataset:
        dataset_id = str(uuid.uuid4())
        upload_dir = BASE_TMP_DIR / dataset_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        dataset = Dataset(
            id=dataset_id,
            original_filenames=original_filenames,
            format_key=format_key,
            upload_dir=upload_dir,
            gdf=gdf,
        )
        self._datasets[dataset_id] = dataset
        return dataset

    def get(self, dataset_id: str) -> Dataset | None:
        return self._datasets.get(dataset_id)

    def update_gdf(self, dataset_id: str, gdf: gpd.GeoDataFrame) -> None:
        dataset = self._datasets[dataset_id]
        dataset.gdf = gdf

    def delete(self, dataset_id: str) -> None:
        dataset = self._datasets.pop(dataset_id, None)
        if dataset is not None:
            shutil.rmtree(dataset.upload_dir, ignore_errors=True)


store = DatasetStore()
