import { useState } from "react";
import type { CrsTarget, DatasetSummary } from "../types";

interface Props {
  dataset: DatasetSummary;
  crsTargets: CrsTarget[];
  busy: boolean;
  onReproject: (epsg: number) => void;
  onSetSourceCrs: (epsg: number) => void;
}

export default function CrsStep({ dataset, crsTargets, busy, onReproject, onSetSourceCrs }: Props) {
  const [selectedEpsg, setSelectedEpsg] = useState<number>(2154);
  const [sourceEpsg, setSourceEpsg] = useState<number>(4326);
  const [lastReprojectedTo, setLastReprojectedTo] = useState<number | null>(null);

  const grouped = crsTargets.reduce<Record<string, CrsTarget[]>>((acc, c) => {
    (acc[c.region] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="card">
      <h2>2. Projection (CRS)</h2>
      <div className="score-box" style={{ marginBottom: "1rem" }}>
        <div>
          <div className="muted">CRS actif (utilisé pour l'export)</div>
          <div className="score-value" style={{ fontSize: "1.4rem" }}>
            EPSG:{dataset.crs.epsg ?? "?"}
          </div>
          <div className="muted">{dataset.crs.name}</div>
        </div>
      </div>
      {lastReprojectedTo !== null && dataset.crs.epsg === lastReprojectedTo && (
        <p className="success">
          ✓ Reprojection appliquée vers EPSG:{lastReprojectedTo}. La carte ci-contre reste affichée en
          WGS84 (EPSG:4326) pour la visualisation — c'est normal, seul l'export utilisera les
          coordonnées dans le nouveau CRS.
        </p>
      )}
      {dataset.original_crs?.detected ? (
        <p className="muted">
          CRS source d'origine : EPSG:{dataset.original_crs.epsg ?? "?"} ({dataset.original_crs.name})
        </p>
      ) : (
        <div className="warning-box">
          <p>Aucun CRS n'a pu être détecté automatiquement dans le fichier source (pas de .prj ou métadonnées absentes).</p>
          <label>
            Indiquez le CRS source réel :
            <select value={sourceEpsg} onChange={(e) => setSourceEpsg(Number(e.target.value))}>
              {crsTargets.map((c) => (
                <option key={c.epsg} value={c.epsg}>
                  EPSG:{c.epsg} — {c.name} ({c.region})
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} onClick={() => onSetSourceCrs(sourceEpsg)}>
            Définir le CRS source
          </button>
        </div>
      )}

      <label className="target-crs-label">
        Reprojeter vers :
        <select value={selectedEpsg} onChange={(e) => setSelectedEpsg(Number(e.target.value))}>
          {Object.entries(grouped).map(([region, list]) => (
            <optgroup key={region} label={region}>
              {list.map((c) => (
                <option key={c.epsg} value={c.epsg}>
                  EPSG:{c.epsg} — {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button
        disabled={busy || !dataset.crs.detected}
        onClick={() => {
          setLastReprojectedTo(selectedEpsg);
          onReproject(selectedEpsg);
        }}
      >
        Reprojeter
      </button>
    </div>
  );
}
