/**
 * The four kinds of information MaatKlaar distinguishes, plus "nog controleren" for results that rest on
 * unconfirmed input. Every badge shows the label and an icon, never colour alone.
 */
export type Status = "auto" | "confirmed" | "derived" | "check" | "missing";

export const STATUS_META: Record<Status, { label: string; icon: string; description: string }> = {
  auto: {
    label: "Automatisch herkend",
    icon: "◌",
    description: "Uit je bestand gehaald door de computer. Nog niet door jou nagekeken.",
  },
  confirmed: {
    label: "Door jou bevestigd",
    icon: "✓",
    description: "Je hebt deze waarde nagekeken en bevestigd.",
  },
  derived: {
    label: "Berekend",
    icon: "=",
    description: "Berekend uit bevestigde invoer met een vaste formule.",
  },
  check: {
    label: "Nog controleren",
    icon: "!",
    description: "Berekend uit waarden die nog niet bevestigd zijn. Controleer de invoer.",
  },
  missing: {
    label: "Nog meten",
    icon: "?",
    description: "Er ontbreekt informatie. We vullen niets zelf in.",
  },
};

/**
 * Status of a result computed from several inputs:
 * any missing input → missing; any unconfirmed input → check; otherwise derived from confirmed input.
 */
export function combine(inputs: readonly ("auto" | "confirmed" | "derived" | "check" | "missing")[]): Status {
  if (inputs.includes("missing")) return "missing";
  if (inputs.includes("auto") || inputs.includes("check")) return "check";
  return "derived";
}
