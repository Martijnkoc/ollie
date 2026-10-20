import { STATUS_META, type Status } from "@/lib/projects/status";
import { Icon, type IconName } from "./brand/Icon";

export const STATUS_ICON: Record<Status, IconName> = {
  auto: "auto",
  measured: "measured",
  confirmed: "check-circle",
  derived: "derived",
  check: "alert",
  missing: "question",
};

/** Status label with icon and text, never colour alone. The description is available to screen readers and on hover. */
export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className="badge" data-status={status} title={meta.description}>
      <span className="badge-icon" aria-hidden="true">
        <Icon name={STATUS_ICON[status]} size={16} />
      </span>
      {label ?? meta.label}
    </span>
  );
}
