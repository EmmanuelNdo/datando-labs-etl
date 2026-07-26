import { useEffect, useState } from "react";
import { getGeometryReport } from "../api";
import type { GeometryReport } from "../types";

interface Props {
  datasetId: string;
  busy: boolean;
  refreshKey: number;
  onFix: () => void;
}

export default function GeometryStep({ datasetId, busy, refreshKey, onFix }: Props) {
  const [report, setReport] = useState<GeometryReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGeometryReport(datasetId)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [datasetId, refreshKey]);

  if (error) return <div className="card error">{error}</div>;
  if (!report) return <div className="card">Analyse des géométries...</div>;

  const allValid = report.invalid_geometry === 0 && report.null_geometry === 0 && report.empty_geometry === 0;

  return (
    <div className="card">
      <h2>4. Vérification des géométries</h2>
      <ul className="stat-list">
        <li>Entités totales : {report.total_features}</li>
        <li>Types de géométrie : {report.geometry_types.join(", ") || "—"}</li>
        <li className="success">Valides : {report.valid}</li>
        <li className={report.invalid_geometry ? "error" : ""}>Invalides : {report.invalid_geometry}</li>
        <li className={report.null_geometry ? "error" : ""}>Nulles : {report.null_geometry}</li>
        <li className={report.empty_geometry ? "error" : ""}>Vides : {report.empty_geometry}</li>
      </ul>

      {!allValid && (
        <>
          {report.invalid_details.length > 0 && (
            <details>
              <summary>Détail des géométries invalides ({report.invalid_details.length})</summary>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ligne</th>
                    <th>Raison</th>
                  </tr>
                </thead>
                <tbody>
                  {report.invalid_details.map((d) => (
                    <tr key={d.row}>
                      <td>{d.row}</td>
                      <td>{d.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          <div className="warning-box">
            <p>Des géométries invalides, nulles ou vides ont été détectées.</p>
            <button disabled={busy} onClick={onFix}>
              Réparer automatiquement (make_valid, suppression des nulles/vides)
            </button>
          </div>
        </>
      )}
      {allValid && <p className="success">Toutes les géométries sont valides.</p>}
    </div>
  );
}
