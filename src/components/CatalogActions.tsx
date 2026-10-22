"use client";

import { useState, useTransition } from "react";
import { deletePortfolioAction, deleteServiceAction, serviceStatusAction } from "@/app/actions/catalog";

export function ServiceRowActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? undefined : res.error);
    });
  return (
    <div className="row tight">
      {status === "published" ? (
        <button type="button" className="btn ghost small" disabled={pending} onClick={() => run(() => serviceStatusAction(id, "paused"))}>
          Pauzeren
        </button>
      ) : (
        <button
          type="button"
          className="btn ghost small"
          disabled={pending}
          onClick={() => run(() => serviceStatusAction(id, "published"))}
        >
          Publiceren
        </button>
      )}
      <button
        type="button"
        className="btn ghost small"
        disabled={pending}
        onClick={() => {
          if (confirm("Deze dienst verwijderen? Lopende opdrachten blijven gewoon bestaan.")) run(() => deleteServiceAction(id));
        }}
      >
        Verwijderen
      </button>
      {error && (
        <p role="alert" className="notice error small" style={{ width: "100%" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function DeletePortfolioButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <>
      <button
        type="button"
        className="btn ghost small"
        disabled={pending}
        aria-label={`${title} verwijderen`}
        onClick={() => {
          if (!confirm(`"${title}" uit je portfolio verwijderen?`)) return;
          start(async () => {
            const res = await deletePortfolioAction(id);
            setError(res.ok ? undefined : res.error);
          });
        }}
      >
        Verwijderen
      </button>
      {error && (
        <span role="alert" className="small" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </>
  );
}
