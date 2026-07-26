import type { PipelineStep } from "../types";

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: "upload", label: "1. Import" },
  { key: "crs", label: "2. Projection" },
  { key: "encoding", label: "3. Encodage" },
  { key: "geometry", label: "4. Géométrie" },
  { key: "quality", label: "5. Qualité" },
  { key: "export", label: "6. Export" },
];

interface Props {
  current: PipelineStep;
  unlocked: PipelineStep[];
  onSelect: (step: PipelineStep) => void;
}

export default function Stepper({ current, unlocked, onSelect }: Props) {
  return (
    <nav className="stepper">
      {STEPS.map((step) => {
        const isUnlocked = unlocked.includes(step.key);
        return (
          <button
            key={step.key}
            className={`stepper-item ${current === step.key ? "stepper-item-active" : ""}`}
            disabled={!isUnlocked}
            onClick={() => onSelect(step.key)}
          >
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}
