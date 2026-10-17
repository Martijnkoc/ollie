import { analysisSchema, type Analysis, type AnalysisKind } from "./schema";

export type Validation = { ok: true; analysis: Analysis } | { ok: false; reason: string };

/** Numbers that may appear without being in the input: everyday football vocabulary. */
const ALWAYS_ALLOWED = new Set(["0", "1", "2", "3", "11", "45", "90"]);

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;

/** Every number found anywhere in the input (values, strings, array lengths). */
export function numbersIn(value: unknown, out = new Set<string>()): Set<string> {
  if (value === null || value === undefined) return out;
  if (typeof value === "number") {
    out.add(String(value));
    out.add(String(value).replace(".", ","));
    if (!Number.isInteger(value)) out.add(String(Math.round(value)));
    return out;
  }
  if (typeof value === "string") {
    for (const m of value.match(NUMBER_RE) ?? []) {
      out.add(m);
      out.add(m.replace(",", "."));
      // Dates such as 2026-10-17 also allow "17" and "10".
      for (const part of m.split(/[.,]/)) out.add(String(Number(part)));
    }
    return out;
  }
  if (Array.isArray(value)) {
    out.add(String(value.length));
    for (const v of value) numbersIn(v, out);
    return out;
  }
  if (typeof value === "object") for (const v of Object.values(value)) numbersIn(v, out);
  return out;
}

// Not "inzet" or "tip": both are ordinary Dutch football words.
const BETTING = /\b(odds|wedden|weddenschap\w*|gokken|gokker\w*|goksite\w*|bookmaker\w*|quotering\w*)\b/i;
const PROBABILITY = /(\d+\s?%\s*(kans|waarschijnlijk))|(kans\s+(van|op)\s+\d+)|(\bprocent\s+kans\b)/i;
const CERTAINTY = /\b(gegarandeerd|wint\s+zeker|zal\s+(zeker\s+)?winnen|gaat\s+(zeker\s+)?winnen|staat\s+vast\s+dat|onvermijdelijk)\b/i;

/**
 * Parses and checks a model response. An analysis is rejected (and never shown) when:
 *  - it does not match the schema;
 *  - a fact or statistic contains a number that does not occur in the input;
 *  - it talks about betting, gives probabilities, or presents a prediction as certain.
 */
export function validateAnalysis(raw: unknown, input: unknown, kind: AnalysisKind): Validation {
  const parsed = analysisSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `Ongeldige structuur: ${parsed.error.issues[0]?.path.join(".") || "root"}` };
  const analysis = parsed.data;
  const allowed = numbersIn(input);
  for (const n of ALWAYS_ALLOWED) allowed.add(n);

  const checked: { text: string; where: string }[] = [
    { text: analysis.headline, where: "kop" },
    { text: analysis.summary, where: "samenvatting" },
    ...analysis.sections.flatMap((s) => s.points.filter((p) => p.kind !== "interpretation").map((p) => ({ text: p.text, where: s.title }))),
  ];
  for (const { text, where } of checked) {
    for (const n of text.match(NUMBER_RE) ?? []) {
      if (!allowed.has(n) && !allowed.has(n.replace(",", "."))) return { ok: false, reason: `Getal "${n}" in "${where}" komt niet voor in de gegevens` };
    }
  }

  const everything = [
    analysis.headline,
    analysis.summary,
    ...analysis.sections.flatMap((s) => [s.title, ...s.points.map((p) => p.text)]),
    ...analysis.uncertainties,
  ].join("\n");
  if (BETTING.test(everything)) return { ok: false, reason: "Bevat gok- of weddenschaptaal" };
  if (PROBABILITY.test(everything)) return { ok: false, reason: "Bevat een kanspercentage" };
  if (kind === "preview" && CERTAINTY.test(everything)) return { ok: false, reason: "Presenteert een voorspelling als zekerheid" };
  if (kind === "preview" && analysis.uncertainties.length === 0) return { ok: false, reason: "Een voorbeschouwing moet onzekerheden benoemen" };
  return { ok: true, analysis };
}
