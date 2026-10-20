import { Icon, type IconName } from "./Icon";

/** What is missing, why it matters, and the one next step. */
export function EmptyState({
  icon = "info",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {children && <div className="small muted">{children}</div>}
      {action}
    </div>
  );
}
