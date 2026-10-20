import { Icon } from "./Icon";

export type StepState = "done" | "active" | "todo" | "problem";

/**
 * A short list of steps with their real state (address lookup, plan analysis, scan processing). It only shows
 * what the caller knows; it never animates progress that is not happening.
 */
export function StepStatus({ steps, label }: { steps: { text: string; state: StepState; detail?: string }[]; label: string }) {
  return (
    <ol className="progress-list" aria-label={label}>
      {steps.map((s) => (
        <li key={s.text} data-state={s.state}>
          <Icon name={s.state === "done" ? "check-circle" : s.state === "problem" ? "alert" : s.state === "active" ? "auto" : "question"} />
          <span>
            {s.text}
            <span className="visually-hidden">
              {s.state === "done" ? " (klaar)" : s.state === "active" ? " (bezig)" : s.state === "problem" ? " (let op)" : " (nog niet)"}
            </span>
            {s.detail && (
              <span className="tiny muted" style={{ display: "block" }}>
                {s.detail}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
