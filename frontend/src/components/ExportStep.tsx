import { useState } from "react";
import { exportDataset, toAbsoluteApiUrl } from "../api";

const EXPORT_FORMATS = [
  { key: "geopackage", label: "GeoPackage (.gpkg)" },
  { key: "geojson", label: "GeoJSON (.geojson)" },
  { key: "shapefile", label: "Shapefile (.zip)" },
  { key: "flatgeobuf", label: "FlatGeobuf (.fgb)" },
  { key: "gml", label: "GML (.gml)" },
  { key: "kml", label: "KML (.kml)" },
  { key: "mapinfo_tab", label: "MapInfo TAB (.tab)" },
];

interface Props {
  datasetId: string;
}

export default function ExportStep({ datasetId }: Props) {
  const [format, setFormat] = useState("geopackage");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const { download_url } = await exportDataset(datasetId, format);
      window.location.href = toAbsoluteApiUrl(download_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>6. Export</h2>
      <p className="muted">Les données exportées sont systématiquement encodées en UTF-8.</p>
      <label>
        Format de sortie :
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          {EXPORT_FORMATS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <button disabled={busy} onClick={handleExport}>
        {busy ? "Génération..." : "Exporter et télécharger"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
