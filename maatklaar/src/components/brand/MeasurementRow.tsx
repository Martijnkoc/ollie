import { formatMm } from "@/lib/format";
import type { Status } from "@/lib/projects/status";
import { StatusBadge } from "../StatusBadge";

/**
 * One measurement: label, value in whole millimetres (stored value unrounded), the margin rounded up, and a
 * status with icon and text. Never shows more precision than the source supports.
 */
export function MeasurementRow({
  label,
  mm,
  marginMm,
  status,
  statusLabel,
  note,
}: {
  label: string;
  mm: number | null;
  marginMm?: number | null;
  status: Status;
  statusLabel?: string;
  note?: string;
}) {
  return (
    <div className="mrow">
      <span className="mrow-label">{label}</span>
      <span className="mrow-value num">
        {mm === null ? (
          <span className="muted">nog meten</span>
        ) : (
          <>
            {formatMm(mm).replace(" mm", "")}
            <span className="unit"> mm</span>
            {marginMm != null && <span className="margin"> ± {Math.ceil(marginMm - 1e-9)}</span>}
          </>
        )}
      </span>
      <span className="mrow-meta">
        <StatusBadge status={status} label={statusLabel} />
        {note && <span className="tiny muted">{note}</span>}
      </span>
    </div>
  );
}
