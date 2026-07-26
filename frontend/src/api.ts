import type {
  CrsTarget,
  DatasetSummary,
  FormatSpec,
  GeometryReport,
  QualityReport,
} from "./types";

// En dev, le proxy Vite redirige /api vers le backend local (voir vite.config.ts).
// En prod, VITE_API_BASE_URL doit pointer vers l'URL publique du backend déployé.
const API_ROOT = import.meta.env.VITE_API_BASE_URL ?? "";
const BASE = `${API_ROOT}/api`;

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? `Erreur HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSupportedFormats(): Promise<FormatSpec[]> {
  return handle(await fetch(`${BASE}/formats`));
}

export async function fetchCrsTargets(): Promise<CrsTarget[]> {
  return handle(await fetch(`${BASE}/crs/targets`));
}

export async function uploadFiles(files: File[]): Promise<DatasetSummary> {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  return handle(await fetch(`${BASE}/upload`, { method: "POST", body: form }));
}

export async function getDataset(id: string): Promise<DatasetSummary> {
  return handle(await fetch(`${BASE}/datasets/${id}`));
}

export async function reproject(id: string, targetEpsg: number): Promise<DatasetSummary> {
  return handle(
    await fetch(`${BASE}/datasets/${id}/reproject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_epsg: targetEpsg }),
    })
  );
}

export async function setSourceCrs(id: string, epsg: number): Promise<DatasetSummary> {
  return handle(
    await fetch(`${BASE}/datasets/${id}/set-source-crs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_epsg: epsg }),
    })
  );
}

export async function fixEncoding(id: string, overrideEncoding?: string): Promise<DatasetSummary> {
  const qs = overrideEncoding ? `?override_encoding=${encodeURIComponent(overrideEncoding)}` : "";
  return handle(await fetch(`${BASE}/datasets/${id}/fix-encoding${qs}`, { method: "POST" }));
}

export async function getGeometryReport(id: string): Promise<GeometryReport> {
  return handle(await fetch(`${BASE}/datasets/${id}/geometry-report`));
}

export async function fixGeometry(
  id: string
): Promise<{ summary: Record<string, number>; dataset: DatasetSummary; preview: GeoJSON.FeatureCollection | null }> {
  return handle(await fetch(`${BASE}/datasets/${id}/fix-geometry`, { method: "POST" }));
}

export async function getQualityReport(id: string): Promise<QualityReport> {
  return handle(await fetch(`${BASE}/datasets/${id}/quality-report`));
}

export async function exportDataset(id: string, targetFormat: string): Promise<{ download_url: string }> {
  return handle(
    await fetch(`${BASE}/datasets/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_format: targetFormat }),
    })
  );
}
