"""Détection de format et catalogue des formats SIG supportés."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class FormatSpec:
    key: str
    label: str
    extensions: tuple[str, ...]
    driver: str
    multi_file: bool  # ex: Shapefile = plusieurs fichiers (.shp/.dbf/.shx/.prj)
    vector: bool = True


SUPPORTED_FORMATS: list[FormatSpec] = [
    FormatSpec("shapefile", "Esri Shapefile", (".shp", ".dbf", ".shx", ".prj", ".cpg"), "ESRI Shapefile", True),
    FormatSpec("geopackage", "GeoPackage", (".gpkg",), "GPKG", False),
    FormatSpec("geojson", "GeoJSON", (".geojson", ".json"), "GeoJSON", False),
    FormatSpec("mapinfo_tab", "MapInfo TAB", (".tab", ".map", ".id", ".dat"), "MapInfo File", True),
    FormatSpec("mapinfo_mif", "MapInfo MIF/MID", (".mif", ".mid"), "MapInfo File", True),
    FormatSpec("dxf", "AutoCAD DXF", (".dxf",), "DXF", False),
    FormatSpec("kml", "KML / KMZ", (".kml", ".kmz"), "KML", False),
    FormatSpec("gml", "GML", (".gml",), "GML", False),
    FormatSpec("flatgeobuf", "FlatGeobuf", (".fgb",), "FlatGeobuf", False),
    FormatSpec("gpx", "GPX", (".gpx",), "GPX", False),
    FormatSpec("csv", "CSV (coordonnées X/Y ou WKT)", (".csv",), "CSV", False),
]

FORMATS_BY_EXTENSION: dict[str, FormatSpec] = {}
for spec in SUPPORTED_FORMATS:
    for ext in spec.extensions:
        FORMATS_BY_EXTENSION.setdefault(ext, spec)


def detect_format(filenames: list[str]) -> FormatSpec | None:
    """Détecte le format à partir d'un ou plusieurs noms de fichiers uploadés
    (plusieurs fichiers pour les formats multi-fichiers comme le Shapefile)."""
    extensions = {Path(f).suffix.lower() for f in filenames}

    # Cas prioritaire : bundle Shapefile (au moins .shp présent)
    if ".shp" in extensions:
        return FORMATS_BY_EXTENSION[".shp"]
    if ".tab" in extensions:
        return FORMATS_BY_EXTENSION[".tab"]
    if ".mif" in extensions:
        return FORMATS_BY_EXTENSION[".mif"]

    for ext in extensions:
        if ext in FORMATS_BY_EXTENSION:
            return FORMATS_BY_EXTENSION[ext]
    return None


def primary_file(filenames: list[str], fmt: FormatSpec) -> str:
    """Retourne le fichier 'd'entrée' pour GDAL/OGR parmi un bundle uploadé."""
    priority_ext = {
        "shapefile": ".shp",
        "mapinfo_tab": ".tab",
        "mapinfo_mif": ".mif",
    }.get(fmt.key)
    if priority_ext:
        for f in filenames:
            if f.lower().endswith(priority_ext):
                return f
    return filenames[0]
