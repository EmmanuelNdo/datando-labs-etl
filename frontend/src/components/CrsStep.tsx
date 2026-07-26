import { useState } from "react";
import type { CrsTarget, DatasetSummary } from "../types";

interface Props {
  dataset: DatasetSummary;
  crsTargets: CrsTarget[];
  busy: boolean;
  onReproject: (epsg: number) => void;
  onSetSourceCrs: (epsg: number) => void;
}

// Heuristique simple : les coordonnées géographiques (degrés) restent dans
// [-180, 180], les coordonnées projetées (mètres) sont bien plus grandes.
const isLikelyProjectedMeters = (bounds: number[]) => bounds.some((v) => Math.abs(v) > 1000);

export default function CrsStep({ dataset, crsTargets, busy, onReproject, onSetSourceCrs }: Props) {
  const [selectedEpsg, setSelectedEpsg] = useState<number>(2154);
  const [sourceEpsg, setSourceEpsg] = useState<number>(4326);
  const [lastReprojectedTo, setLastReprojectedTo] = useState<number | null>(null);

  const grouped = crsTargets.reduce<Record<string, CrsTarget[]>>((acc, c) => {
    (acc[c.region] ??= []).push(c);
    return acc;
  }, {});

  // Repli défensif : si le backend n'a pas encore renvoyé original_crs
  // (ex. décalage de déploiement), on retombe sur le CRS actif plutôt que
  // d'afficher à tort "CRS non détecté".
  const sourceDetected = dataset.original_crs?.detected ?? dataset.crs.detected;
  const sourceEpsgDisplay = dataset.original_crs?.epsg ?? dataset.crs.epsg;
  const sourceNameDisplay = dataset.original_crs?.name ?? dataset.crs.name;

  const unit = dataset.bounds && isLikelyProjectedMeters(dataset.bounds) ? "m" : "°";
  const fmt = (v: number) => (unit === "m" ? v.toFixed(1) : v.toFixed(5));

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
          coordonnées dans le nouveau CRS. L'emprise ci-dessous confirme le changement de coordonnées.
        </p>
      )}

      {dataset.bounds && (
        <div className="warning-box" style={{ background: "#f8fafc", borderColor: "var(--border)" }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Emprise des données dans le CRS actif (preuve que les coordonnées ont bien changé) :
          </p>
          <table className="data-table">
            <tbody>
              <tr>
                <td>X / longitude min–max</td>
                <td>
                  {fmt(dataset.bounds[0])} {unit} → {fmt(dataset.bounds[2])} {unit}
                </td>
              </tr>
              <tr>
                <td>Y / latitude min–max</td>
                <td>
                  {fmt(dataset.bounds[1])} {unit} → {fmt(dataset.bounds[3])} {unit}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {sourceDetected ? (
        <p className="muted">
          CRS source d'origine : EPSG:{sourceEpsgDisplay ?? "?"} ({sourceNameDisplay})
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
