import { useEffect, useState } from "react";
import {
  fetchCrsTargets,
  fetchSupportedFormats,
  fixEncoding,
  fixGeometry,
  reproject,
  setSourceCrs,
  uploadFiles,
} from "./api";
import type { CrsTarget, DatasetSummary, FormatSpec, PipelineStep } from "./types";
import FileUploader from "./components/FileUploader";
import Stepper from "./components/Stepper";
import MapPreview from "./components/MapPreview";
import CrsStep from "./components/CrsStep";
import EncodingStep from "./components/EncodingStep";
import GeometryStep from "./components/GeometryStep";
import QualityStep from "./components/QualityStep";
import ExportStep from "./components/ExportStep";

export default function App() {
  const [formats, setFormats] = useState<FormatSpec[]>([]);
  const [crsTargets, setCrsTargets] = useState<CrsTarget[]>([]);
  const [dataset, setDataset] = useState<DatasetSummary | null>(null);
  const [step, setStep] = useState<PipelineStep>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchSupportedFormats().then(setFormats).catch(() => undefined);
    fetchCrsTargets().then(setCrsTargets).catch(() => undefined);
  }, []);

  const runAction = async (action: () => Promise<DatasetSummary>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await action();
      setDataset(updated);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = (files: File[]) =>
    runAction(async () => {
      const summary = await uploadFiles(files);
      setStep("crs");
      return summary;
    });

  const unlockedSteps: PipelineStep[] = dataset
    ? ["upload", "crs", "encoding", "geometry", "quality", "export"]
    : ["upload"];

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Datando Geo ETL</h1>
        <p className="muted">
          ETL SIG en ligne — reprojection, encodage, géométrie et qualité des données, inspiré de{" "}
          <a href="https://github.com/opengeos/GeoLibre" target="_blank" rel="noreferrer">
            GeoLibre
          </a>
          .
        </p>
      </header>

      <Stepper current={step} unlocked={unlockedSteps} onSelect={setStep} />

      {error && step !== "upload" && (
        <div className="card error-banner">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      <main className="app-main">
        <div className="pipeline-column">
          {step === "upload" && (
            <FileUploader formats={formats} busy={busy} onUpload={handleUpload} error={error} />
          )}

          {step === "crs" && dataset && (
            <CrsStep
              dataset={dataset}
              crsTargets={crsTargets}
              busy={busy}
              onReproject={(epsg) => runAction(() => reproject(dataset.dataset_id, epsg))}
              onSetSourceCrs={(epsg) => runAction(() => setSourceCrs(dataset.dataset_id, epsg))}
            />
          )}

          {step === "encoding" && dataset && (
            <EncodingStep
              dataset={dataset}
              busy={busy}
              onFix={() => runAction(() => fixEncoding(dataset.dataset_id))}
            />
          )}

          {step === "geometry" && dataset && (
            <GeometryStep
              datasetId={dataset.dataset_id}
              busy={busy}
              refreshKey={refreshKey}
              onFix={() =>
                runAction(async () => {
                  const res = await fixGeometry(dataset.dataset_id);
                  return res.dataset;
                })
              }
            />
          )}

          {step === "quality" && dataset && (
            <QualityStep datasetId={dataset.dataset_id} refreshKey={refreshKey} />
          )}

          {step === "export" && dataset && <ExportStep datasetId={dataset.dataset_id} />}

          {dataset && (
            <div className="card">
              <h2>Journal du pipeline</h2>
              <ul className="log-list">
                {dataset.pipeline_log.map((entry, i) => (
                  <li key={i}>{entry}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="map-column">
          <MapPreview geojson={dataset?.preview ?? null} />
          {dataset && (
            <div className="dataset-meta">
              <span>{dataset.feature_count} entités</span>
              <span>{dataset.geometry_types.join(", ")}</span>
              <span>EPSG:{dataset.crs.epsg ?? "?"}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
