import { cloneElement } from "react";

/**
 * A labelled form control. The label holds only the label text; the hint is linked with
 * aria-describedby, so screen readers announce a short name and the help separately.
 */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, { id, "aria-describedby": hint ? `${id}-hint` : undefined })}
      {hint && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}
