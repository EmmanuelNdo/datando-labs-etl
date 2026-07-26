"""Validation et correction des géométries d'une couche vecteur."""
from __future__ import annotations

import geopandas as gpd
from shapely.validation import explain_validity


def validate_geometries(gdf: gpd.GeoDataFrame) -> dict:
    geom = gdf.geometry
    is_null = geom.isna()
    is_empty = geom.apply(lambda g: g is not None and g.is_empty)
    is_valid = geom.apply(lambda g: g is not None and not g.is_empty and g.is_valid)

    invalid_rows = []
    for idx, g in geom.items():
        if g is None or g.is_empty or g.is_valid:
            continue
        invalid_rows.append({
            "row": int(idx),
            "reason": explain_validity(g),
        })

    total = len(gdf)
    n_null = int(is_null.sum())
    n_empty = int(is_empty.sum())
    n_invalid = len(invalid_rows)
    n_valid = total - n_null - n_empty - n_invalid

    return {
        "total_features": total,
        "valid": n_valid,
        "null_geometry": n_null,
        "empty_geometry": n_empty,
        "invalid_geometry": n_invalid,
        "invalid_details": invalid_rows[:200],  # cap pour éviter des payloads énormes
        "geometry_types": sorted({g.geom_type for g in geom if g is not None and not g.is_empty}),
    }


def fix_geometries(gdf: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, dict]:
    """Répare les géométries invalides (make_valid) et retire les géométries
    nulles/vides. Retourne le GeoDataFrame corrigé + un résumé des actions."""
    rows_before = len(gdf)
    kept = gdf[~(gdf.geometry.isna() | gdf.geometry.is_empty)].copy()
    n_removed = rows_before - len(kept)

    n_fixed = 0

    def _fix(g):
        nonlocal n_fixed
        if g.is_valid:
            return g
        n_fixed += 1
        try:
            return g.make_valid()
        except AttributeError:
            return g.buffer(0)

    kept["geometry"] = kept.geometry.apply(_fix)

    return kept, {
        "rows_before": rows_before,
        "rows_after": len(kept),
        "removed_null_or_empty": n_removed,
        "geometries_repaired": n_fixed,
    }
