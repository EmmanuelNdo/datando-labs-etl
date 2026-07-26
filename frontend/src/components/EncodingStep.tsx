import type { DatasetSummary } from "../types";

interface Props {
  dataset: DatasetSummary;
  busy: boolean;
  onFix: () => void;
}

export default function EncodingStep({ dataset, busy, onFix }: Props) {
  const enc = dataset.source_encoding;

  if (!enc.applicable) {
    return (
      <div className="card">
        <h2>3. Encodage</h2>
        <p className="success">
          Ce format ({dataset.format}) est encodé en UTF-8 par spécification : aucune vérification nécessaire.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>3. Encodage</h2>
      <p>
        Encodage détecté : <strong>{enc.encoding ?? "inconnu"}</strong>
        {enc.source === "cpg" ? " (via fichier .cpg)" : enc.confidence !== undefined ? ` (confiance ${Math.round((enc.confidence ?? 0) * 100)}%, détection statistique)` : ""}
      </p>
      {enc.is_utf8 ? (
        <p className="success">L'encodage est déjà UTF-8, aucune correction nécessaire.</p>
      ) : (
        <div className="warning-box">
          <p>
            Cet encodage n'est pas UTF-8. Les caractères accentués (é, à, ç...) risquent d'être mal
            interprétés par d'autres logiciels. La correction relit les attributs avec l'encodage détecté
            puis les réexportera systématiquement en UTF-8.
          </p>
          <button disabled={busy} onClick={onFix}>
            Corriger l'encodage vers UTF-8
          </button>
        </div>
      )}
      {enc.fixed && <p className="success">Encodage corrigé.</p>}
    </div>
  );
}
