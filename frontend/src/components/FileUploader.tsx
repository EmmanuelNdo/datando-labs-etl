import { useRef, useState } from "react";
import type { FormatSpec } from "../types";

interface Props {
  formats: FormatSpec[];
  busy: boolean;
  onUpload: (files: File[]) => void;
  error: string | null;
}

export default function FileUploader({ formats, busy, onUpload, error }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const acceptExt = formats.flatMap((f) => f.extensions).join(",");

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onUpload(Array.from(fileList));
  };

  return (
    <div className="card">
      <h2>1. Charger un jeu de données</h2>
      <p className="muted">
        Formats acceptés : {formats.map((f) => f.label).join(", ") || "chargement..."}.
        Pour un Shapefile, sélectionnez tous les fichiers du bundle (.shp, .dbf, .shx, .prj...).
      </p>
      <div
        className={`dropzone ${dragActive ? "dropzone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Import en cours..." : "Glissez-déposez vos fichiers ici, ou cliquez pour parcourir"}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={acceptExt}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
