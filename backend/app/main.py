"""API FastAPI du sidecar de traitement géospatial.

Pipeline MVP : upload -> détection format/CRS/encodage -> reprojection vers
un EPSG français/francophone -> correction d'encodage -> validation/
réparation de géométries -> analyse qualité des attributs -> export.
"""
from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import geopandas as gpd

from .schemas import ExportRequest, ReprojectRequest
from .services import crs as crs_service
from .services import encoding as encoding_service
from .services import formats as formats_service
from .services import geometry as geometry_service
from .services import io_utils
from .services import quality as quality_service
from .session_store import Dataset, store

app = FastAPI(title="Datando Geo ETL", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # MVP : à restreindre en production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_PREVIEW_FEATURES = 3000


def _dataset_or_404(dataset_id: str) -> Dataset:
    dataset = store.get(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset introuvable ou expiré")
    return dataset


def _preview_geojson(dataset: Dataset) -> dict | None:
    gdf = dataset.gdf
    if gdf.crs is None:
        return None
    try:
        preview = gdf.head(MAX_PREVIEW_FEATURES).to_crs(epsg=4326)
    except Exception:
        return None
    return json.loads(preview.to_json())


def _dataset_summary(dataset: Dataset) -> dict:
    gdf = dataset.gdf
    crs_info = crs_service.describe_crs(gdf.crs)
    bounds = gdf.total_bounds.tolist() if len(gdf) else None
    return {
        "dataset_id": dataset.id,
        "original_filenames": dataset.original_filenames,
        "format": dataset.format_key,
        "feature_count": len(gdf),
        "geometry_types": sorted({g.geom_type for g in gdf.geometry if g is not None and not g.is_empty}),
        "crs": crs_info,
        "bounds": bounds,
        "source_encoding": dataset.source_encoding,
        "pipeline_log": dataset.pipeline_log,
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/crs/targets")
def crs_targets() -> list[dict]:
    return [c.__dict__ for c in crs_service.list_target_crs()]


@app.get("/api/formats")
def supported_formats() -> list[dict]:
    return [
        {
            "key": f.key,
            "label": f.label,
            "extensions": f.extensions,
            "multi_file": f.multi_file,
        }
        for f in formats_service.SUPPORTED_FORMATS
    ]


@app.post("/api/upload")
async def upload_dataset(files: list[UploadFile] = File(...)) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier reçu")

    filenames = [f.filename for f in files if f.filename]
    fmt = formats_service.detect_format(filenames)
    if fmt is None:
        raise HTTPException(status_code=400, detail="Format non reconnu parmi les formats supportés")

    # Sauvegarde temporaire du bundle uploadé (shapefile = plusieurs fichiers)
    # avant création du dataset définitif (on ne connaît pas encore son id).
    dataset_placeholder_dir = Path("/tmp/datando_etl_sessions/_incoming")
    dataset_placeholder_dir.mkdir(parents=True, exist_ok=True)

    incoming_dir = dataset_placeholder_dir / str(uuid.uuid4())
    incoming_dir.mkdir(parents=True, exist_ok=True)

    saved_names = []
    for f in files:
        dest = incoming_dir / f.filename
        content = await f.read()
        dest.write_bytes(content)
        saved_names.append(f.filename)

    # Détection d'encodage AVANT lecture attributaire (pertinent pour DBF)
    source_encoding = {"applicable": False}
    read_encoding = "utf-8"
    if fmt.key in encoding_service.DBF_BASED_FORMATS:
        dbf_files = [n for n in saved_names if n.lower().endswith(".dbf")]
        if dbf_files:
            detection = encoding_service.detect_dbf_encoding(incoming_dir / dbf_files[0])
            source_encoding = {"applicable": True, **detection}
            read_encoding = detection["encoding"] or "latin-1"

    try:
        if fmt.key in encoding_service.DBF_BASED_FORMATS:
            entry = formats_service.primary_file(saved_names, fmt)
            gdf = gpd.read_file(incoming_dir / entry, encoding=read_encoding)
        else:
            gdf = io_utils.read_dataset(incoming_dir, saved_names, fmt)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Impossible de lire le jeu de données: {exc}") from exc

    if gdf.empty:
        raise HTTPException(status_code=422, detail="Le jeu de données ne contient aucune entité")

    dataset = store.create(saved_names, fmt.key, gdf)
    dataset.source_encoding = source_encoding
    dataset.upload_dir.rmdir()
    incoming_dir.rename(dataset.upload_dir)
    dataset.log(f"Import: {fmt.label} ({len(saved_names)} fichier(s)), {len(gdf)} entités")
    if gdf.crs is None:
        dataset.log("CRS non détecté dans le fichier source")
    else:
        info = crs_service.describe_crs(gdf.crs)
        dataset.log(f"CRS détecté: EPSG:{info['epsg']} ({info['name']})")

    return {
        **_dataset_summary(dataset),
        "preview": _preview_geojson(dataset),
    }


@app.get("/api/datasets/{dataset_id}")
def get_dataset(dataset_id: str) -> dict:
    dataset = _dataset_or_404(dataset_id)
    return {**_dataset_summary(dataset), "preview": _preview_geojson(dataset)}


@app.post("/api/datasets/{dataset_id}/reproject")
def reproject_dataset(dataset_id: str, body: ReprojectRequest) -> dict:
    dataset = _dataset_or_404(dataset_id)
    if dataset.gdf.crs is None:
        raise HTTPException(
            status_code=400,
            detail="CRS source inconnu : indiquez d'abord le CRS source avant de reprojeter",
        )
    try:
        target_crs = crs_service.crs_from_epsg(body.target_epsg)
        dataset.gdf = dataset.gdf.to_crs(target_crs)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Reprojection impossible: {exc}") from exc

    dataset.log(f"Reprojection vers EPSG:{body.target_epsg}")
    return {**_dataset_summary(dataset), "preview": _preview_geojson(dataset)}


@app.post("/api/datasets/{dataset_id}/set-source-crs")
def set_source_crs(dataset_id: str, body: ReprojectRequest) -> dict:
    """Permet de forcer manuellement le CRS source quand il n'a pas pu être
    détecté automatiquement (pas de .prj, métadonnées absentes...)."""
    dataset = _dataset_or_404(dataset_id)
    try:
        dataset.gdf = dataset.gdf.set_crs(epsg=body.target_epsg, allow_override=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"CRS invalide: {exc}") from exc
    dataset.log(f"CRS source défini manuellement: EPSG:{body.target_epsg}")
    return {**_dataset_summary(dataset), "preview": _preview_geojson(dataset)}


@app.post("/api/datasets/{dataset_id}/fix-encoding")
def fix_encoding(dataset_id: str, override_encoding: str | None = None) -> dict:
    dataset = _dataset_or_404(dataset_id)
    if not dataset.source_encoding.get("applicable"):
        return {**_dataset_summary(dataset), "message": "Correction d'encodage non applicable à ce format"}

    entry = formats_service.primary_file(dataset.original_filenames, next(
        f for f in formats_service.SUPPORTED_FORMATS if f.key == dataset.format_key
    ))
    encoding_to_use = override_encoding or dataset.source_encoding.get("encoding") or "latin-1"
    try:
        dataset.gdf = gpd.read_file(dataset.upload_dir / entry, encoding=encoding_to_use)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Relecture avec l'encodage '{encoding_to_use}' impossible: {exc}") from exc

    dataset.source_encoding = {
        **dataset.source_encoding,
        "encoding": encoding_to_use,
        "is_utf8": True,
        "fixed": True,
    }
    dataset.log(f"Encodage corrigé: relecture en '{encoding_to_use}', export cible en UTF-8")
    return {**_dataset_summary(dataset), "preview": _preview_geojson(dataset)}


@app.get("/api/datasets/{dataset_id}/geometry-report")
def geometry_report(dataset_id: str) -> dict:
    dataset = _dataset_or_404(dataset_id)
    return geometry_service.validate_geometries(dataset.gdf)


@app.post("/api/datasets/{dataset_id}/fix-geometry")
def fix_geometry(dataset_id: str) -> dict:
    dataset = _dataset_or_404(dataset_id)
    fixed_gdf, summary = geometry_service.fix_geometries(dataset.gdf)
    dataset.gdf = fixed_gdf
    dataset.log(
        f"Géométries corrigées: {summary['geometries_repaired']} réparées, "
        f"{summary['removed_null_or_empty']} supprimées (nulles/vides)"
    )
    return {
        "summary": summary,
        "dataset": _dataset_summary(dataset),
        "preview": _preview_geojson(dataset),
    }


@app.get("/api/datasets/{dataset_id}/quality-report")
def quality_report(dataset_id: str) -> dict:
    dataset = _dataset_or_404(dataset_id)
    field_report = quality_service.analyze_fields(dataset.gdf)
    geom_report = geometry_service.validate_geometries(dataset.gdf)
    encoding_ok = not dataset.source_encoding.get("applicable") or dataset.source_encoding.get("is_utf8", False)
    score = quality_service.quality_score(
        geometry_report=geom_report,
        field_report=field_report,
        encoding_ok=encoding_ok,
        crs_detected=dataset.gdf.crs is not None,
    )
    return {"fields": field_report, "geometry": geom_report, "score": score}


@app.post("/api/datasets/{dataset_id}/export")
def export_dataset(dataset_id: str, body: ExportRequest) -> dict:
    dataset = _dataset_or_404(dataset_id)
    out_dir = dataset.upload_dir / "export"
    try:
        out_path = io_utils.write_dataset(dataset.gdf, out_dir, "export", body.target_format)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    dataset.log(f"Export vers {body.target_format} ({out_path.name})")
    return {"download_url": f"/api/datasets/{dataset_id}/download?format={body.target_format}"}


@app.get("/api/datasets/{dataset_id}/download")
def download_dataset(dataset_id: str, format: str) -> FileResponse:
    dataset = _dataset_or_404(dataset_id)
    driver_ext = io_utils.EXPORT_DRIVERS.get(format)
    if driver_ext is None:
        raise HTTPException(status_code=400, detail="Format d'export inconnu")
    out_path = dataset.upload_dir / "export" / f"export{driver_ext[1]}"
    if not out_path.exists():
        raise HTTPException(status_code=404, detail="Export non généré, appelez /export d'abord")

    if format == "shapefile":
        # Le shapefile est multi-fichiers : on zippe pour un download unique.
        zip_base = dataset.upload_dir / "export" / "export"
        archive = shutil.make_archive(str(zip_base), "zip", root_dir=out_path.parent)
        return FileResponse(archive, filename="export_shapefile.zip", media_type="application/zip")

    return FileResponse(out_path, filename=out_path.name)
