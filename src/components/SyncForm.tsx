"use client";

import { useActionState } from "react";
import type { SyncActionState } from "@/app/beheer/actions";

export function SyncForm({
  action,
  jobs,
}: {
  action: (prev: SyncActionState, form: FormData) => Promise<SyncActionState>;
  jobs: string[];
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="stack-sm">
      <div className="row">
        <label htmlFor="job" className="small">
          Taak
        </label>
        <select id="job" name="job" className="btn" defaultValue="">
          <option value="">Alles wat aan de beurt is</option>
          {jobs.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
        <label className="row small">
          <input type="checkbox" name="force" /> Nu uitvoeren, ook als de taak nog niet aan de beurt is
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Bezig…" : "Synchroniseren"}
        </button>
      </div>
      <div aria-live="polite">
        {state.error && <p className="notice notice-error small">{state.error}</p>}
        {state.lines && (
          <pre className="card card-body tiny" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {state.lines.join("\n") || "Niets aan de beurt."}
          </pre>
        )}
      </div>
    </form>
  );
}
