import { useEffect, useState } from "react";
import { getQualityReport } from "../api";
import type { QualityReport } from "../types";

interface Props {
  datasetId: string;
  refreshKey: number;
}

export default function QualityStep({ datasetId, refreshKey }: Props) {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getQualityReport(datasetId)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [datasetId, refreshKey]);

  if (error) return <div className="card error">{error}</div>;
  if (!report) return <div className="card">Analyse de la qualité...</div>;

  return (
    <div className="card">
      <h2>5. Qualité des données</h2>
      <div className="score-box">
        <div className="score-value">{report.score.overall}/100</div>
        <ul className="stat-list">
          {Object.entries(report.score.breakdown).map(([k, v]) => (
            <li key={k}>
              {k} : {v}
            </li>
          ))}
        </ul>
      </div>

      <p>
        {report.fields.total_fields} champs, {report.fields.total_rows} lignes, taux de remplissage moyen{" "}
        {report.fields.average_fill_rate}%.
      </p>

      <table className="data-table">
        <thead>
          <tr>
            <th>Champ</th>
            <th>Type</th>
            <th>Remplissage</th>
            <th>Valeurs distinctes</th>
            <th>Problèmes de nom</th>
          </tr>
        </thead>
        <tbody>
          {report.fields.fields.map((f) => (
            <tr key={f.name}>
              <td>{f.name}</td>
              <td>{f.dtype}</td>
              <td className={f.fill_rate < 80 ? "warn-cell" : ""}>{f.fill_rate}%</td>
              <td>{f.distinct_count}</td>
              <td className={f.name_issues.length ? "warn-cell" : ""}>
                {f.name_issues.length ? f.name_issues.join("; ") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
