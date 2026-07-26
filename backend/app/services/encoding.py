"""Détection et correction d'encodage pour les formats basés sur DBF
(Shapefile, MapInfo TAB) qui ne déclarent pas toujours leur encodage."""
from __future__ import annotations

from pathlib import Path

import chardet

TARGET_ENCODING = "utf-8"

# Formats dont les attributs sont stockés dans un DBF (souvent en Latin-1 /
# Windows-1252 quand ils viennent de vieux exports français).
DBF_BASED_FORMATS = {"shapefile", "mapinfo_tab"}


def read_cpg_encoding(dbf_path: Path) -> str | None:
    cpg_path = dbf_path.with_suffix(".cpg")
    if cpg_path.exists():
        try:
            return cpg_path.read_text(encoding="ascii").strip()
        except (UnicodeDecodeError, OSError):
            return None
    return None


def detect_dbf_encoding(dbf_path: Path) -> dict:
    """Détecte l'encodage réel d'un .dbf : d'abord via le .cpg s'il existe,
    sinon par analyse statistique (chardet) du contenu binaire."""
    cpg_encoding = read_cpg_encoding(dbf_path)
    if cpg_encoding:
        return {
            "source": "cpg",
            "encoding": cpg_encoding,
            "confidence": 1.0,
            "is_utf8": cpg_encoding.lower().replace("-", "") in ("utf8",),
        }

    if not dbf_path.exists():
        return {"source": "none", "encoding": None, "confidence": 0.0, "is_utf8": False}

    raw = dbf_path.read_bytes()
    # Le header DBF contient des octets binaires non-texte ; on saute les 32
    # premiers octets (header) pour se concentrer sur les enregistrements.
    sample = raw[32:] if len(raw) > 32 else raw
    result = chardet.detect(sample)
    encoding = (result.get("encoding") or "latin-1").lower()
    confidence = result.get("confidence") or 0.0
    return {
        "source": "chardet",
        "encoding": encoding,
        "confidence": round(confidence, 2),
        "is_utf8": encoding.replace("-", "") in ("utf8",),
    }


def needs_encoding_fix(fmt_key: str, detection: dict) -> bool:
    if fmt_key not in DBF_BASED_FORMATS:
        return False
    return not detection.get("is_utf8", False)
