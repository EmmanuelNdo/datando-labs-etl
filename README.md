# Datando Geo ETL

ETL SIG en ligne (MVP) : import de couches vecteur, reprojection vers un
référentiel français/francophone, correction d'encodage, validation des
géométries et analyse de la qualité des attributs — le tout depuis le
navigateur.

Inspiré de l'approche de [GeoLibre](https://github.com/opengeos/GeoLibre),
ce projet reprend son architecture **hybride** : un frontend web pour
l'exploration cartographique et le pilotage du pipeline, et un service
Python dédié au traitement SIG lourd (GDAL/OGR, pyproj, chardet), plus
fiable que du WebAssembly seul pour la détection de CRS, la correction
d'encodage ou le nettoyage géométrique.

## Architecture

```
frontend/   React + TypeScript + Vite + MapLibre GL JS
            -> pilote le pipeline, prévisualise les couches sur la carte

backend/    FastAPI (Python)
            -> GeoPandas / Fiona / pyogrio (GDAL-OGR), Shapely, pyproj, chardet
            -> lit tous les formats, reprojette, corrige l'encodage,
               valide/répare les géométries, calcule la qualité des données
```

Les jeux de données sont conservés en mémoire + fichiers temporaires côté
serveur le temps de la session (`/tmp/datando_etl_sessions`) — il n'y a pas
encore de persistance en base pour ce MVP.

## Pipeline

1. **Import** — Shapefile, GeoPackage, GeoJSON, MapInfo TAB/MIF, DXF, KML,
   GML, FlatGeobuf, GPX, CSV.
2. **Projection** — détection automatique du CRS source (via `.prj`,
   métadonnées du fichier...) et reprojection vers un référentiel choisi
   dans une liste curatée d'EPSG français et francophones (Lambert-93
   `2154`, zones NTF historiques, DOM-TOM, Belgique, Suisse, Luxembourg,
   Québec, Maroc, Tunisie...). Si le CRS source n'est pas détecté, il peut
   être renseigné manuellement avant reprojection.
3. **Encodage** — pour les formats basés sur DBF (Shapefile, MapInfo TAB),
   détection de l'encodage réel (`.cpg` si présent, sinon analyse
   statistique via `chardet`) et correction vers UTF-8.
4. **Géométrie** — détection des géométries invalides, nulles ou vides
   (avec l'explication de l'invalidité), réparation automatique
   (`make_valid` / suppression des géométries nulles).
5. **Qualité** — analyse des champs : noms non conformes DBF (accents,
   longueur > 10 caractères, collisions après troncature), taux de
   remplissage, valeurs distinctes, statistiques simples, et un score de
   qualité global pédagogique combinant géométrie / remplissage / nommage /
   encodage / CRS.
6. **Export** — GeoPackage, GeoJSON, Shapefile (zip), FlatGeobuf, GML, KML,
   MapInfo TAB — toujours réencodé en UTF-8.

## Lancer en local

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Le frontend tourne sur `http://localhost:5173` et proxifie `/api` vers le
backend sur `http://localhost:8000` (voir `vite.config.ts`).

### Avec Docker Compose

```bash
docker compose up --build
```

## Limites connues du MVP

- Pas de base de données : les sessions sont éphémères (RAM + `/tmp`).
- Le format DXF est supporté en lecture au mieux via le driver OGR DXF ;
  les couches CAO complexes (blocs, calques imbriqués) peuvent nécessiter
  un nettoyage manuel supplémentaire.
- Le CSV est lu tel quel par GDAL/OGR (pas encore de mapping interactif
  colonnes X/Y ou WKT).
- La liste d'EPSG francophones est curatée pour les cas d'usage courants,
  pas exhaustive comme le registre EPSG complet.
- Pas d'authentification ni de gestion multi-utilisateurs.
