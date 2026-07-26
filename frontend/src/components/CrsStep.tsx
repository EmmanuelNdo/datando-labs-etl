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

  const grouped = crsTargets.reduce<Record<string, CrsTarget[]>>((acc, c) => {
    (acc[c.region] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="card">
      <h2>2. Projection (CRS)</h2>
      {dataset.crs.detected ? (
        <p>
          CRS source détecté : <strong>EPSG:{dataset.crs.epsg ?? "?"}</strong> ({dataset.crs.name})
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
      <button disabled={busy || !dataset.crs.detected} onClick={() => onReproject(selectedEpsg)}>
        Reprojeter
      </button>
    </div>
  );
}
