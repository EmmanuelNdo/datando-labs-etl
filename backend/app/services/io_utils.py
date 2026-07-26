"""Lecture des fichiers uploadés et export vers un format cible, via
GeoPandas/Fiona (GDAL/OGR)."""
from __future__ import annotations

import shutil
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

# GeoJSON (RFC 7946) et KML imposent des coordonnées en WGS84 par spécification :
# écrire les coordonnées brutes d'un autre CRS produit un fichier valide en
# apparence mais géographiquement faux dans tout lecteur standard (les mètres
# d'une projection sont alors lus comme des degrés).
FORCE_WGS84_FORMATS = {"geojson", "kml"}


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

    if target_format_key in FORCE_WGS84_FORMATS and gdf.crs is not None and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)

    # Repart d'un dossier d'export propre à chaque appel : sans ça, les
    # fichiers d'exports précédents (autres formats, anciens .zip) restent
    # sur disque et se retrouvent inclus dans les téléchargements suivants
    # (en particulier le zip Shapefile, qui archive tout le dossier).
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    out_path = out_dir / f"{base_name}{ext}"
    gdf.to_file(out_path, driver=driver, encoding="utf-8")
    return out_path
