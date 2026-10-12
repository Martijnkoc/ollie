"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Native modal dialog: the browser traps focus and closes on Escape.
 * Focus returns to the button that opened it. Inside, `<form method="dialog">` closes it.
 */
export function Dialog({
  trigger,
  triggerClassName = "btn secondary",
  title,
  children,
}: {
  trigger: React.ReactNode;
  triggerClassName?: string;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button ref={opener} type="button" className={triggerClassName} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          opener.current?.focus();
        }}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        {open && (
          <div className="dialog-body stack">
            <div className="dialog-head">
              <h2 id={titleId} style={{ margin: 0, fontSize: "1.3rem" }}>
                {title}
              </h2>
              <button type="button" className="btn ghost small" onClick={close}>
                Sluiten
              </button>
            </div>
            {children}
          </div>
        )}
      </dialog>
    </>
  );
}
