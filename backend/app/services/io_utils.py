"""Lecture des fichiers uploadés et export vers un format cible, via
GeoPandas/Fiona (GDAL/OGR)."""
from __future__ import annotations

from pathlib import Path

import fiona
import geopandas as gpd

from .formats import FormatSpec, primary_file

EXPORT_DRIVERS: dict[str, tuple[str, str]] = {
    # format_key -> (driver GDAL, extension de sortie)
    "geopackage": ("GPKG", ".gpkg"),
    "geojson": ("GeoJSON", ".geojson"),
    "shapefile": ("ESRI Shapefile", ".shp"),
    "flatgeobuf": ("FlatGeobuf", ".fgb"),
    "gml": ("GML", ".gml"),
    "kml": ("KML", ".kml"),
    "mapinfo_tab": ("MapInfo File", ".tab"),
}


def read_dataset(upload_dir: Path, filenames: list[str], fmt: FormatSpec) -> gpd.GeoDataFrame:
    entry_file = primary_file(filenames, fmt)
    path = upload_dir / entry_file

    layers = fiona.listlayers(str(path))
    layer = layers[0] if layers else None
    gdf = gpd.read_file(path, layer=layer)
    return gdf


def write_dataset(gdf: gpd.GeoDataFrame, out_dir: Path, base_name: str, target_format_key: str) -> Path:
    if target_format_key not in EXPORT_DRIVERS:
        raise ValueError(f"Format d'export non supporté: {target_format_key}")
    driver, ext = EXPORT_DRIVERS[target_format_key]
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{base_name}{ext}"
    gdf.to_file(out_path, driver=driver, encoding="utf-8")
    return out_path
