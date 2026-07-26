export interface CrsInfo {
  epsg: number | null;
  name: string | null;
  wkt: string | null;
  detected: boolean;
}

export interface SourceEncoding {
  applicable: boolean;
  source?: string;
  encoding?: string | null;
  confidence?: number;
  is_utf8?: boolean;
  fixed?: boolean;
}

export interface DatasetSummary {
  dataset_id: string;
  original_filenames: string[];
  format: string;
  feature_count: number;
  geometry_types: string[];
  crs: CrsInfo;
  bounds: [number, number, number, number] | null;
  source_encoding: SourceEncoding;
  pipeline_log: string[];
  preview: GeoJSON.FeatureCollection | null;
}

export interface CrsTarget {
  epsg: number;
  name: string;
  region: string;
}

export interface FormatSpec {
  key: string;
  label: string;
  extensions: string[];
  multi_file: boolean;
}

export interface GeometryReport {
  total_features: number;
  valid: number;
  null_geometry: number;
  empty_geometry: number;
  invalid_geometry: number;
  invalid_details: { row: number; reason: string }[];
  geometry_types: string[];
}

export interface FieldReport {
  name: string;
  dtype: string;
  fill_rate: number;
  null_count: number;
  empty_string_count: number;
  distinct_count: number;
  name_issues: string[];
  stats: Record<string, unknown>;
}

export interface QualityReport {
  fields: {
    total_rows: number;
    total_fields: number;
    average_fill_rate: number;
    fields_with_name_issues: number;
    fields: FieldReport[];
  };
  geometry: GeometryReport;
  score: {
    overall: number;
    breakdown: Record<string, number>;
  };
}

export type PipelineStep =
  | "upload"
  | "crs"
  | "encoding"
  | "geometry"
  | "quality"
  | "export";
