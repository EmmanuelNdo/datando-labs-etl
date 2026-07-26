"""Registre des systèmes de coordonnées (CRS) pertinents pour la France
et l'espace francophone, et utilitaires de détection / reprojection."""
from __future__ import annotations

from dataclasses import dataclass

from pyproj import CRS
from pyproj.exceptions import CRSError


@dataclass(frozen=True)
class CrsChoice:
    epsg: int
    name: str
    region: str


# Liste curatée : pas exhaustive comme l'EPSG registry complet, mais couvre
# les cas d'usage courants pour un ETL destiné aux SIG francophones.
FRENCH_FRANCOPHONE_CRS: list[CrsChoice] = [
    CrsChoice(4326, "WGS 84", "Monde (géographique)"),
    CrsChoice(3857, "WGS 84 / Pseudo-Mercator", "Monde (web mapping)"),
    CrsChoice(2154, "RGF93 v1 / Lambert-93", "France métropolitaine"),
    CrsChoice(9794, "RGF93 v2b / Lambert-93", "France métropolitaine (CRS compound récent)"),
    CrsChoice(27561, "NTF (Paris) / Lambert Nord France", "France métropolitaine (historique)"),
    CrsChoice(27562, "NTF (Paris) / Lambert Centre France", "France métropolitaine (historique)"),
    CrsChoice(27563, "NTF (Paris) / Lambert Sud France", "France métropolitaine (historique)"),
    CrsChoice(27564, "NTF (Paris) / Lambert Corse", "France métropolitaine (historique)"),
    CrsChoice(5490, "RGAF09 / UTM zone 20N", "Guadeloupe, Martinique"),
    CrsChoice(2972, "RGFG95 / UTM zone 22N", "Guyane"),
    CrsChoice(2975, "RGR92 / UTM zone 40S", "La Réunion"),
    CrsChoice(4471, "RGM04 / UTM zone 38S", "Mayotte"),
    CrsChoice(3163, "RGNC91-93 / Lambert New Caledonia", "Nouvelle-Calédonie"),
    CrsChoice(3296, "RGPF / UTM zone 6S", "Polynésie française (Tahiti)"),
    CrsChoice(31370, "BD72 / Belgian Lambert 72", "Belgique"),
    CrsChoice(2056, "CH1903+ / LV95", "Suisse"),
    CrsChoice(2169, "Luxembourg 1930 / Gauss", "Luxembourg"),
    CrsChoice(32198, "NAD83 / Quebec Lambert", "Québec (Canada)"),
    CrsChoice(26191, "Merchich / Nord Maroc", "Maroc"),
    CrsChoice(22391, "Carthage / Tunisia Mining Grid", "Tunisie"),
]


def list_target_crs() -> list[CrsChoice]:
    return FRENCH_FRANCOPHONE_CRS


def crs_to_epsg(crs: CRS | None) -> int | None:
    if crs is None:
        return None
    try:
        return crs.to_epsg()
    except CRSError:
        return None


def describe_crs(crs: CRS | None) -> dict:
    if crs is None:
        return {"epsg": None, "name": None, "wkt": None, "detected": False}
    epsg = crs_to_epsg(crs)
    return {
        "epsg": epsg,
        "name": crs.name,
        "wkt": crs.to_wkt(),
        "detected": True,
    }


def crs_from_epsg(epsg: int) -> CRS:
    return CRS.from_epsg(epsg)
