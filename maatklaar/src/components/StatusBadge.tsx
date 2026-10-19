import { STATUS_META, type Status } from "@/lib/projects/status";

/** Status label with icon and text, never colour alone. The description is available to screen readers and on hover. */
export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className="badge" data-status={status} title={meta.description}>
      <span className="badge-icon" aria-hidden="true">
        <span>{meta.icon}</span>
      </span>
      {label ?? meta.label}
    </span>
  );
}
