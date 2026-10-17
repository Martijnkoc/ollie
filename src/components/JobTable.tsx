import type { JobState } from "@/lib/sync/overview";
import { formatDate, formatTime } from "@/lib/time";

const when = (iso: string | null) => (iso ? `${formatDate(iso)} ${formatTime(iso)}` : "–");

export function JobTable({ jobs, showErrors }: { jobs: JobState[]; showErrors: boolean }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Taak</th>
            <th scope="col">Laatst geslaagd</th>
            <th scope="col">Volgende</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.key}>
              <td>
                <code className="small">{j.key}</code>
              </td>
              <td className="small">{when(j.lastSuccessAt)}</td>
              <td className="small">{when(j.nextDueAt)}</td>
              <td className="small">
                {j.running ? (
                  <span className="badge">bezig</span>
                ) : j.failures > 0 ? (
                  <span className="badge badge-error">{j.failures}× mislukt</span>
                ) : j.lastSuccessAt ? (
                  <span className="badge badge-ok">ok</span>
                ) : (
                  <span className="badge">nog niet gedraaid</span>
                )}
                {showErrors && j.lastError && <div className="tiny dim">{j.lastError}</div>}
              </td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr>
              <td colSpan={4} className="dim">
                Er heeft nog geen synchronisatie plaatsgevonden.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
