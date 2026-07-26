# Construire un ETL SIG en ligne — guide de formation

*Ce document retrace, étape par étape, la construction de Datando Geo ETL : pourquoi ces choix, comment le pipeline est structuré techniquement, quels bugs réels sont survenus en production et comment ils ont été diagnostiqués. Objectif : servir de support pour former des géomaticiens à concevoir et construire ce type d'outil.*

---

## 1. Le problème métier

Un géomaticien qui reçoit un jeu de données (Shapefile envoyé par un partenaire, export d'un bureau d'études, opendata communale...) répète presque toujours la même check-list avant de pouvoir l'exploiter :

1. Dans quel système de coordonnées est cette couche ? Y a-t-il seulement un `.prj` ?
2. Faut-il la reprojeter en Lambert-93 (le standard France métropolitaine) ou dans un CRS régional (DOM-TOM, Suisse, Québec...) ?
3. Les accents des noms de commune sont-ils corrects, ou est-ce un fichier DBF en Windows-1252 mal interprété ?
4. Y a-t-il des géométries invalides (polygones auto-intersectants, entités vides) qui vont faire planter un traitement plus loin dans la chaîne ?
5. Les noms de champs sont-ils propres ? Les valeurs sont-elles bien renseignées ?

C'est un travail répétitif, mais qui demande de l'expertise (savoir lire un message d'erreur GDAL, connaître les EPSG français, comprendre pourquoi un `.shp` sans `.cpg` peut afficher des caractères corrompus). L'idée du projet : encoder cette check-list dans un pipeline web guidé, pour qu'elle devienne accessible sans ligne de commande, tout en restant rigoureuse sur le plan technique.

Le nom du jeu : **ETL** (Extract - Transform - Load), mais appliqué spécifiquement aux données géospatiales vecteur, avec les étapes de transformation qui comptent vraiment pour un SIG : projection, encodage, géométrie, qualité attributaire.

### Pourquoi s'inspirer de GeoLibre

[GeoLibre](https://github.com/opengeos/GeoLibre) est un projet qui pose une architecture intéressante pour du SIG "cloud-native" : un frontend qui fait le plus possible dans le navigateur (via DuckDB-WASM Spatial), complété par un sidecar Python optionnel pour les traitements lourds. C'est le point de départ de la réflexion, mais le MVP décrit ici ne réutilise pas GeoLibre tel quel — il en reprend le **principe architectural** (hybride navigateur / serveur) en l'adaptant à un besoin plus étroit : un pipeline de contrôle qualité et de reprojection, pas une plateforme SIG complète.

---

## 2. La décision d'architecture : hybride, et pourquoi

Deux options possibles pour le "moteur" du pipeline :

| Option | Avantage | Limite |
|---|---|---|
| **Tout dans le navigateur** (DuckDB-WASM Spatial, GDAL en WASM) | Aucune donnée envoyée à un serveur, confidentialité maximale | Détection de CRS moins fiable sur des Shapefile sans `.prj`, pas de vrai détecteur d'encodage type `chardet`, support DXF/TAB capricieux en WASM |
| **Tout côté serveur** (GDAL natif + Python) | Fiabilité maximale, accès à tout l'écosystème GDAL/OGR/pyproj | Il faut envoyer les données à un serveur |

Le choix retenu est **hybride** : un frontend web (React + MapLibre) pour la navigation, la carte et le pilotage du pipeline, et un backend Python (FastAPI + GeoPandas/Fiona/GDAL + pyproj + chardet) pour l'exécution réelle des traitements. C'est un compromis assumé : on perd le "100% local" de la confidentialité navigateur, on gagne en fiabilité sur exactement les points qui posent problème en WASM aujourd'hui (CRS, encodage, formats exotiques).

**Ce qu'il faut retenir pour former quelqu'un à ce choix** : ne pas partir d'un principe architectural ("il faut faire du WASM", "il faut du serverless") mais lister d'abord les opérations métier critiques (ici : détection de CRS fiable, détection d'encodage, large couverture de formats), puis choisir la techno qui les sert le mieux.

---

## 3. Stack technique

```
frontend/   React 18 + TypeScript + Vite + MapLibre GL JS
            -> pilotage du pipeline (wizard 6 étapes) + prévisualisation cartographique

backend/    FastAPI (Python 3.11)
            -> GeoPandas / Fiona / pyogrio (GDAL-OGR)  : lecture/écriture multi-formats
            -> Shapely                                  : géométrie, validation, réparation
            -> pyproj                                    : CRS, reprojection
            -> chardet                                    : détection d'encodage
```

Pas de base de données : chaque dataset uploadé vit en mémoire (un `GeoDataFrame`) + sur disque temporaire côté serveur, identifié par un UUID, le temps de la session. C'est un choix MVP délibéré — un vrai produit ajouterait une persistance, mais elle n'était pas nécessaire pour valider le pipeline.

### Frontend / Backend : deux déploiements séparés

- **Backend → Render** (`render.yaml` à la racine, service Python détecté automatiquement, `uvicorn app.main:app`)
- **Frontend → Vercel** (détection automatique de Vite, variable d'environnement `VITE_API_BASE_URL` pointant vers l'URL Render)

Point important pour la formation : dans une architecture à deux origines (frontend et backend sur des domaines différents), **toute URL renvoyée par le backend doit être absolue ou reconstruite côté client** — voir la section bugs, ce point a été la cause d'un vrai bug de production.

---

## 4. Le pipeline, étape par étape

Le pipeline suit exactement l'ordre demandé dans le brief initial : **import → projection → encodage → géométrie → qualité → export**. Chaque étape correspond à un onglet du frontend et à un (ou plusieurs) endpoint(s) REST du backend.

### 4.1 Import et détection de format

`backend/app/services/formats.py` définit un catalogue de formats supportés (Shapefile, GeoPackage, GeoJSON, MapInfo TAB/MIF, DXF, KML, GML, FlatGeobuf, GPX, CSV), chacun avec ses extensions et si c'est un format "multi-fichiers" (le Shapefile a besoin de `.shp` + `.dbf` + `.shx` + `.prj`).

La détection se fait sur les extensions des fichiers uploadés (l'utilisateur peut sélectionner plusieurs fichiers d'un coup pour un bundle Shapefile). `primary_file()` détermine quel fichier est le point d'entrée pour GDAL/OGR (le `.shp`, le `.tab`...).

### 4.2 Projection (CRS)

C'est le cœur technique du projet. Deux opérations bien distinctes, à ne jamais confondre — c'est une source de confusion fréquente, y compris pour des utilisateurs expérimentés :

- **Reprojeter** (`POST /datasets/{id}/reproject`) : une vraie transformation de coordonnées via `gdf.to_crs(target_crs)` (pyproj sous le capot — la même bibliothèque qu'utilise QGIS). Le point reste physiquement au même endroit sur Terre ; seules ses coordonnées numériques changent pour refléter le nouveau système. Équivalent à *Exporter → Enregistrer les entités sous...* avec un CRS différent dans QGIS.
- **Définir le CRS source** (`POST /datasets/{id}/set-source-crs`) : `gdf.set_crs(epsg=..., allow_override=True)`, **sans transformation**. Ça sert uniquement quand le CRS d'origine n'a pas pu être détecté (pas de `.prj`) : on affirme "ces coordonnées sont dans tel système", sans rien recalculer. Équivalent à *Assigner un SCR* dans QGIS.

Le registre de CRS cibles (`backend/app/services/crs.py`) est une liste **curatée**, pas le registre EPSG complet (qui contient des dizaines de milliers d'entrées) : Lambert-93 (2154), les zones NTF historiques, les DOM-TOM (Guadeloupe/Martinique, Guyane, Réunion, Mayotte, Nouvelle-Calédonie, Polynésie), la Belgique, la Suisse, le Luxembourg, le Québec, quelques pays francophones d'Afrique du Nord. Ce choix de curation plutôt que d'exhaustivité est délibéré : un menu déroulant avec 10 entrées pertinentes vaut mieux qu'un `<select>` avec des milliers de codes que 99% des utilisateurs ne reconnaîtront pas.

La détection automatique du CRS source s'appuie sur ce que le format embarque (`.prj` pour Shapefile, métadonnées internes pour GeoPackage/GeoJSON). `pyproj.CRS.to_epsg()` tente de faire correspondre le WKT lu à un code EPSG connu ; si ça échoue (CRS "maison" ou non standard), `detected` reste vrai mais `epsg` est `null` — l'interface doit gérer ce cas sans planter.

### 4.3 Encodage

Concerne principalement les formats basés sur un DBF (Shapefile, MapInfo TAB) : ces formats anciens ne déclarent pas toujours leur encodage, et un export "à l'ancienne" est souvent en Windows-1252 / Latin-1 plutôt qu'en UTF-8.

`backend/app/services/encoding.py` :
1. Cherche d'abord un fichier `.cpg` à côté du `.dbf` (certains exports l'incluent) — s'il existe, on lui fait confiance à 100%.
2. Sinon, analyse statistique du contenu binaire via `chardet.detect()` sur les octets du DBF (en sautant les 32 premiers octets, qui sont le header binaire du format DBF, pas du texte).
3. Le résultat inclut un score de confiance ; l'utilisateur peut relire le fichier avec un encodage différent s'il n'est pas satisfait du résultat détecté.

Correction : relecture du DBF avec l'encodage identifié (`gpd.read_file(path, encoding=...)`), puis tout export ultérieur est systématiquement en UTF-8.

### 4.4 Géométrie

`backend/app/services/geometry.py` distingue trois états invalides différents (une géométrie peut être `None`, vide (`is_empty`), ou invalide au sens topologique (`is_valid` de Shapely — auto-intersections, anneaux mal fermés, etc.)). Pour chaque géométrie invalide, `shapely.validation.explain_validity()` donne une explication lisible (ex. `"Self-intersection[0.5 0.5]"`), affichée à l'utilisateur.

La réparation utilise `make_valid()` (Shapely ≥ 2.0), avec un repli sur la vieille astuce `buffer(0)` si la méthode n'est pas disponible. Les géométries nulles/vides sont retirées du jeu de données (elles ne peuvent pas être réparées, seulement supprimées).

### 4.5 Qualité des données

`backend/app/services/quality.py` analyse chaque champ attributaire :

- **Noms de champs** : caractères non conformes (accents, espaces, ponctuation), longueur > 10 caractères (limite historique du DBF/Shapefile — au-delà, le nom sera tronqué silencieusement à l'export), collisions de noms après troncature.
- **Taux de remplissage** : proportion de valeurs non nulles et non vides (distinction faite entre `null` et chaîne vide `""`, qui sont deux formes différentes de "pas de valeur").
- **Statistiques** : min/max/moyenne pour les champs numériques, échantillon de valeurs distinctes pour le texte.

Un score de qualité global (0-100) combine géométrie, remplissage, nommage, encodage et CRS avec des poids fixes — présenté explicitement comme un indicateur pédagogique, pas une métrique certifiée, pour éviter qu'il soit interprété comme plus rigoureux qu'il ne l'est.

### 4.6 Export

Le point le plus riche en pièges techniques du projet (voir section 6). Formats de sortie : GeoPackage, GeoJSON, Shapefile (zip), FlatGeobuf, GML, KML, MapInfo TAB — toujours réencodés en UTF-8.

---

## 5. Déploiement : deux plateformes gratuites, une frontière à gérer

- **Render** (`render.yaml`) : détecte le runtime Python, exécute `pip install -r requirements.txt` puis `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Le plan gratuit met le service en veille après inactivité (redémarrage à froid ~30s sur la requête suivante).
- **Vercel** (`frontend/vercel.json`) : détecte Vite automatiquement. La variable d'environnement `VITE_API_BASE_URL`, injectée au moment du build, indique au frontend où se trouve le backend.

La bascule d'un déploiement local (proxy Vite unique, une seule origine) à un déploiement en production (deux domaines différents) est l'endroit où les hypothèses implicites du code local ("le frontend et le backend sont sur la même origine") se révèlent fausses. C'est un excellent cas d'école : **tout ce qui fonctionne en local avec un proxy doit être revérifié explicitement en configuration multi-origines.**

---

## 6. Retours d'expérience : les bugs réels rencontrés en production

Cette section est probablement la plus utile pour la formation : ce sont des bugs réels, découverts en testant l'application déployée, pas des cas d'école inventés.

### Bug 1 — La reprojection semblait "ne rien faire"

**Symptôme** : après avoir cliqué "Reprojeter", rien ne changeait visuellement à l'écran.

**Cause** : la reprojection backend fonctionnait très bien (vérifié en isolant l'appel API du reste de l'interface), mais la carte de prévisualisation est **volontairement toujours affichée en WGS84** (MapLibre GL JS a besoin de longitude/latitude pour aligner un fond de carte web-mercator) — donc reprojeter en Lambert-93 ne change rien à l'affichage cartographique, seulement aux coordonnées qui seront écrites à l'export.

**Correction** : ajout d'un encart "CRS actif" explicite + un message de confirmation après l'action + un encart "Emprise des données dans le CRS actif" qui affiche les vraies valeurs min/max en cours (degrés avant reprojection, mètres après) — une preuve numérique concrète que la transformation a bien eu lieu, sans dépendre du rendu cartographique.

**Leçon** : quand une action backend est correcte mais que l'UI ne le montre pas, ne pas se précipiter à modifier la logique métier — d'abord isoler la couche qui a le bug (ici : test direct de l'API en `curl`, qui a confirmé que le problème n'était que dans le rendu).

### Bug 2 — Export cassé en production (404) alors qu'il marchait en local

**Symptôme** : bouton "Exporter" fonctionnel en développement local, page d'erreur Vercel 404 en production.

**Cause** : le backend renvoie une URL de téléchargement **relative** (`/api/datasets/{id}/download?...`), parce qu'il ne connaît pas son propre nom de domaine public. En local, frontend et backend partagent la même origine grâce au proxy Vite, donc l'URL relative se résout correctement. En production, frontend (Vercel) et backend (Render) sont sur deux domaines différents : `window.location.href = download_url` résolvait l'URL relative contre le domaine **Vercel**, qui ne sert évidemment pas cette route.

**Correction** : le frontend reconstruit l'URL absolue en préfixant avec la même variable d'environnement (`VITE_API_BASE_URL`) qui sert déjà à construire toutes les autres requêtes API.

**Leçon** : toute URL générée dynamiquement côté serveur doit être traitée comme relative par défaut, et explicitement absolutisée côté client dans une architecture multi-origines — ne jamais supposer que "ça a marché en local" veut dire "ça marchera en prod" dès qu'il y a plus d'une origine réseau en jeu.

### Bug 3 — Des points reprojetés qui finissent "au milieu de l'Atlantique" (le plus intéressant)

**Symptôme** : un utilisateur reprojette un jeu de données en Lambert-93, exporte en GeoJSON, réimporte le fichier exporté (dans un autre outil ou pour vérification) — et les points apparaissent à un endroit géographiquement absurde.

**Cause réelle** : la spécification GeoJSON ([RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946)) **impose des coordonnées en WGS84**. Notre export écrivait pourtant les coordonnées brutes du CRS actif du dataset (donc des mètres Lambert-93 après reprojection), avec un membre `"crs"` non-standard pour signaler le vrai système utilisé. Notre propre backend, en le relisant, respectait ce membre `"crs"` et retombait sur ses pattes — mais **tout lecteur strictement conforme à la norme** (la plupart des outils SIG modernes, dont beaucoup ignorent ce membre `"crs"` déprécié) interprète ces mètres comme des degrés de longitude/latitude, ce qui les projette effectivement au milieu de l'océan.

**Correction** : `write_dataset()` reprojette désormais systématiquement vers EPSG:4326 avant d'écrire un GeoJSON ou un KML (qui a la même contrainte WGS84), **quel que soit le CRS actif du dataset affiché à l'utilisateur** — la donnée de travail interne reste dans le CRS choisi, seule la sérialisation de sortie est contrainte par le format.

**Leçon** — celle-ci vaut la peine d'être enseignée en tant que telle : **connaître les contraintes de représentation intrinsèques à chaque format d'export (pas seulement son schéma, sa contrainte de CRS) fait partie du métier**. GeoJSON et KML ne sont pas des conteneurs neutres capables de stocker "n'importe quel CRS avec métadonnées" comme un GeoPackage ou un Shapefile — ce sont des formats à CRS fixe par spécification. Exporter dans un CRS projeté vers l'un de ces deux formats est une erreur silencieuse : le fichier est syntaxiquement valide, s'ouvre sans erreur, et ment sur la position réelle des données.

*Un piège annexe a été découvert au passage : le zip Shapefile accumulait les fichiers de tous les exports précédents de la session (un vieux `.geojson`, un vieux `.gpkg`, et même son propre `.zip` par auto-inclusion, car il était généré dans le dossier qu'il archivait). Corrigé en vidant le dossier d'export à chaque nouvel appel, et en écrivant le zip hors du dossier qu'il archive.*

### Bug 4 — Fond de carte invisible en production

**Symptôme** : la carte de prévisualisation affichait un aplat de couleur uni, sans aucun repère géographique (côtes, frontières), rendant impossible la vérification visuelle de la position des données.

**Cause** : le style MapLibre pointait vers `tile.openstreetmap.org` directement. Cette politique d'usage des tuiles OSM (documentée publiquement) **interdit explicitement l'usage embarqué dans une application tierce hébergée** — au-delà d'un usage personnel ou de très faible volume, le service bloque ou dégrade silencieusement les requêtes.

**Correction** : bascule vers les tuiles [CARTO](https://carto.com/basemaps) (gratuites, prévues pour ce cas d'usage, attribution OSM + CARTO conservée).

**Leçon** : une ressource externe gratuite n'est pas forcément une ressource externe *autorisée* pour un usage donné — vérifier la politique d'utilisation d'un service tiers avant de le mettre en production, pas après un blocage silencieux.

### Bug 5 — Un warning "CRS non détecté" contradictoire

**Symptôme** : le journal du pipeline affichait "CRS détecté : EPSG:4326", mais l'interface affichait quand même un bandeau "Aucun CRS n'a pu être détecté".

**Cause** : un décalage temporaire entre le déploiement du frontend (rapide, Vercel) et celui du backend (plus lent, Render) — le frontend attendait un nouveau champ (`original_crs`) que le backend ne renvoyait pas encore. `dataset.original_crs?.detected` valait `undefined`, donc "faux", même si la détection avait réellement réussi.

**Correction** : repli défensif côté frontend — si `original_crs` n'est pas présent dans la réponse, se rabattre sur le CRS actif plutôt que d'afficher un état contradictoire.

**Leçon** : dans un système à déploiements indépendants (frontend et backend redéployés séparément), il existe toujours une fenêtre où les deux versions en production ne correspondent pas exactement l'une à l'autre. Le code frontend doit tolérer une réponse backend "d'une version précédente" sans se rendre incohérent.

---

## 7. Méthode de travail (comment ce projet a été construit avec un agent IA)

Quelques principes qui ont structuré le développement, transposables à un travail en binôme humain :

1. **Cadrer avant de coder.** La première réponse n'a pas été du code, mais une discussion sur l'architecture (WASM pur vs hybride) avec les compromis explicités, validée par l'utilisateur avant tout scaffold.
2. **Tester avec de vraies données, pas juste vérifier que "ça compile".** À chaque étape, un test de bout en bout contre l'API réelle (upload → reproject → export → réimport) a été exécuté via `curl`, avant même de toucher à l'interface. Ça a permis d'isoler à chaque bug si le problème était côté données (backend) ou côté affichage (frontend) — une distinction cruciale pour ne pas corriger le mauvais endroit.
3. **Isoler la couche fautive.** Pour chaque bug rapporté ("ça ne marche pas"), la première étape a été de reproduire le scénario exact via l'API brute (sans navigateur), pour éliminer une hypothèse ou l'autre.
4. **Vérifier en conditions réelles, pas en confiance.** Un pipeline CI vert ou un `npm run build` qui passe ne garantit pas qu'une fonctionnalité marche réellement — plusieurs bugs de ce projet (URL relative cross-origine, contrainte CRS de GeoJSON, politique d'usage OSM) n'apparaissent que lors d'un test de bout en bout en environnement de production réel.
5. **Écouter la description du symptôme, mais vérifier l'hypothèse causale de l'utilisateur.** "La reprojection ne fonctionne pas" a eu trois causes différentes à trois moments différents du projet (UI qui ne montre rien, URL cassée en prod, contrainte de spécification GeoJSON) — le même symptôme apparent peut cacher des causes très différentes.

---

## 8. Pistes d'évolution (pour aller au-delà du MVP)

- **Persistance** : remplacer le stockage en mémoire par une base (PostgreSQL/PostGIS serait naturel) pour des sessions longues ou partagées.
- **Traitement asynchrone** : pour de gros volumes, faire tourner la reprojection/validation en tâche de fond (queue) plutôt qu'en synchrone dans la requête HTTP.
- **CSV avec mapping interactif** : actuellement lu tel quel par GDAL ; un vrai mapping colonnes X/Y ou WKT serait nécessaire pour un usage fiable.
- **DXF avancé** : le support actuel est basique (driver OGR standard) ; les fichiers CAO avec blocs et calques imbriqués demandent un traitement dédié.
- **Authentification et multi-utilisateurs** : absents du MVP, nécessaires pour un usage en équipe.
- **Historique de traitement** exportable (actuellement affiché mais non téléchargeable en tant que rapport).

---

## 9. Exercice pratique suggéré (pour un atelier de formation)

Faire reconstruire, par binôme, un mini-pipeline à 3 étapes (détection de CRS, reprojection, export) sur un format unique (GeoJSON → GeoPackage), en insistant sur :

1. Faire écrire le test de non-régression *avant* le code (upload d'un point connu, ex. Paris `2.3522, 48.8566`, vérifier qu'il ressort au bon endroit après le cycle complet).
2. Volontairement introduire le bug de la section 6.3 (exporter un CRS projeté vers GeoJSON sans reprojeter), le faire découvrir aux stagiaires via un lecteur GeoJSON strict, puis le corriger — c'est le bug le plus riche d'enseignement du projet.
3. Faire déployer sur deux services séparés (par exemple Render + Vercel comme ici) pour qu'ils rencontrent eux-mêmes le problème d'URL relative cross-origine.

---

*Document rédigé à partir de la construction réelle de [datando-labs-etl](https://github.com/EmmanuelNdo/datando-labs-etl), branche `claude/geospatial-etl-mvp-bnoztk`.*
