"""Analyse de la qualité des attributs : noms de champs, taux de
remplissage, valeurs et petit score de qualité global."""
from __future__ import annotations

import re

import geopandas as gpd
import pandas as pd

VALID_FIELD_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
DBF_NAME_MAX_LEN = 10  # limite historique du Shapefile/DBF


def _field_name_issues(name: str) -> list[str]:
    issues = []
    if not VALID_FIELD_NAME_RE.match(name):
        issues.append("caractères non standards (accents, espaces, ponctuation...)")
    if len(name) > DBF_NAME_MAX_LEN:
        issues.append(f"nom trop long pour DBF/Shapefile (> {DBF_NAME_MAX_LEN} caractères, sera tronqué)")
    if name != name.strip():
        issues.append("espaces en début/fin de nom")
    return issues


def analyze_fields(gdf: gpd.GeoDataFrame) -> dict:
    attr_cols = [c for c in gdf.columns if c != gdf.geometry.name]
    total_rows = len(gdf)

    seen_truncated: dict[str, list[str]] = {}
    fields = []
    for col in attr_cols:
        series = gdf[col]
        n_null = int(series.isna().sum())
        empty_string_mask = series.astype(str).str.strip().eq("") if series.dtype == object else pd.Series(False, index=series.index)
        n_empty = int((empty_string_mask & ~series.isna()).sum())
        n_filled = total_rows - n_null - n_empty
        fill_rate = round((n_filled / total_rows) * 100, 1) if total_rows else 0.0

        dtype = str(series.dtype)
        distinct = int(series.nunique(dropna=True))

        stats: dict = {}
        if pd.api.types.is_numeric_dtype(series):
            non_null = series.dropna()
            if not non_null.empty:
                stats = {
                    "min": float(non_null.min()),
                    "max": float(non_null.max()),
                    "mean": round(float(non_null.mean()), 3),
                }
        else:
            non_null = series.dropna().astype(str)
            if not non_null.empty:
                sample = non_null.unique()[:5].tolist()
                stats = {"sample_values": sample}

        truncated = col[:DBF_NAME_MAX_LEN]
        seen_truncated.setdefault(truncated, []).append(col)

        fields.append({
            "name": col,
            "dtype": dtype,
            "fill_rate": fill_rate,
            "null_count": n_null,
            "empty_string_count": n_empty,
            "distinct_count": distinct,
            "name_issues": _field_name_issues(col),
            "stats": stats,
        })

    duplicate_after_truncation = [
        names for names in seen_truncated.values() if len(names) > 1
    ]
    for dup_group in duplicate_after_truncation:
        for f in fields:
            if f["name"] in dup_group:
                f["name_issues"].append(
                    "collision avec un autre champ une fois tronqué à 10 caractères: "
                    + ", ".join(n for n in dup_group if n != f["name"])
                )

    avg_fill_rate = round(sum(f["fill_rate"] for f in fields) / len(fields), 1) if fields else 0.0
    fields_with_issues = sum(1 for f in fields if f["name_issues"])

    return {
        "total_rows": total_rows,
        "total_fields": len(fields),
        "average_fill_rate": avg_fill_rate,
        "fields_with_name_issues": fields_with_issues,
        "fields": fields,
    }


def quality_score(geometry_report: dict, field_report: dict, encoding_ok: bool, crs_detected: bool) -> dict:
    """Score naïf 0-100 combinant les différentes dimensions de qualité,
    pensé comme indicateur pédagogique plutôt que métrique certifiée."""
    total = geometry_report.get("total_features", 0) or 1
    geometry_score = 100 * geometry_report.get("valid", 0) / total
    fill_score = field_report.get("average_fill_rate", 0.0)
    naming_penalty = 100 * field_report.get("fields_with_name_issues", 0) / max(field_report.get("total_fields", 1), 1)
    naming_score = 100 - naming_penalty
    encoding_score = 100 if encoding_ok else 40
    crs_score = 100 if crs_detected else 30

    weights = {
        "geometry": 0.3,
        "fill_rate": 0.25,
        "naming": 0.15,
        "encoding": 0.15,
        "crs": 0.15,
    }
    overall = (
        geometry_score * weights["geometry"]
        + fill_score * weights["fill_rate"]
        + naming_score * weights["naming"]
        + encoding_score * weights["encoding"]
        + crs_score * weights["crs"]
    )

    return {
        "overall": round(overall, 1),
        "breakdown": {
            "geometry": round(geometry_score, 1),
            "fill_rate": round(fill_score, 1),
            "field_naming": round(naming_score, 1),
            "encoding": encoding_score,
            "crs": crs_score,
        },
    }
