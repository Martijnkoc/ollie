"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMm, parseWholeMm } from "@/lib/format";
import { WINDOW_STATUS_LABELS, evaluateWindow } from "@/lib/measurements/evaluate";
import { CHECK_INFO, MEASURE_GROUPS, MEASURE_INFO, MOUNTING_LABELS, PRODUCT_LABELS, type CheckKey, type MeasureGroup, type MeasureKey, type MeasurementRuleSet } from "@/lib/measurements/schema";
import type { ProjectWindow } from "@/lib/projects/schema";
import { MeasureDiagram } from "./MeasureDiagram";

type Screen = { kind: "intro" } | { kind: "measure"; key: MeasureKey; optional: boolean } | { kind: "group"; group: MeasureGroup } | { kind: "checks" } | { kind: "fullness" } | { kind: "summary" };

const GROUP_LABEL: Record<MeasureGroup, string> = { breedte: "breedte", hoogte: "hoogte", ophanghoogte: "ophanghoogte" };

/** Builds the guided sequence: every measuring point on its own screen, a check after each group of points. */
function screensFor(rule: MeasurementRuleSet): Screen[] {
  const all = [...rule.required.map((k) => ({ k, optional: false })), ...rule.optional.map((k) => ({ k, optional: true }))];
  const screens: Screen[] = [{ kind: "intro" }];
  const done = new Set<MeasureKey>();
  for (const { k, optional } of all) {
    if (done.has(k)) continue;
    const group = (Object.entries(MEASURE_GROUPS) as [MeasureGroup, readonly MeasureKey[]][]).find(([, keys]) => keys.includes(k));
    if (group && !optional) {
      const keys = group[1].filter((x) => rule.required.includes(x));
      for (const g of keys) {
        screens.push({ kind: "measure", key: g, optional: false });
        done.add(g);
      }
      if (keys.length > 1) screens.push({ kind: "group", group: group[0] });
    } else {
      screens.push({ kind: "measure", key: k, optional });
      done.add(k);
    }
  }
  if (rule.checks.length) screens.push({ kind: "checks" });
  if (rule.productFamilies.includes("gordijn")) screens.push({ kind: "fullness" });
  screens.push({ kind: "summary" });
  return screens;
}

export function MeasureWizard({ window: w, rule, onChange, onClose }: { window: ProjectWindow; rule: MeasurementRuleSet; onChange: (w: ProjectWindow) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const screens = useMemo(() => screensFor(rule), [rule]);
  const [i, setI] = useState(0);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const screen = screens[i]!;
  const evaluation = evaluateWindow(w, rule);
  const keys = [...rule.required, ...rule.optional];

  // No close() in a cleanup: in development React runs effects twice, and closing would fire onClose.
  // Unmounting removes the dialog element, which ends the modal state by itself.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    if (screen.kind === "measure") setText(w.measures[screen.key] ? String(w.measures[screen.key]) : "");
    setInvalid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  function saveMeasure(key: MeasureKey): boolean {
    if (!text.trim()) {
      const measures = { ...w.measures };
      delete measures[key];
      onChange({ ...w, measures, confirmed: false });
      return true;
    }
    const mm = parseWholeMm(text);
    if (mm === null || mm <= 0 || mm > 20_000) {
      setInvalid(true);
      return false;
    }
    // A changed measurement needs a new confirmation; an acknowledged spread is re-evaluated.
    if (w.measures[key] !== mm) onChange({ ...w, measures: { ...w.measures, [key]: mm }, confirmed: false, deviationAcknowledged: false });
    return true;
  }

  function next() {
    if (screen.kind === "measure" && !saveMeasure(screen.key)) return;
    setI((x) => Math.min(screens.length - 1, x + 1));
  }

  const progress = `Stap ${i + 1} van ${screens.length}`;
  const groupResult = screen.kind === "group" ? evaluation.groups.find((g) => g.group === screen.group) : null;

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="wizard-title" onClose={onClose} onCancel={onClose}>
      <div className="sheet-head">
        <div>
          <p className="tiny muted" style={{ margin: 0 }}>
            <span className="code">{w.code}</span> · {PRODUCT_LABELS[w.product]} · {MOUNTING_LABELS[w.mounting]}
          </p>
          <h2 id="wizard-title" style={{ fontSize: "1.3rem", margin: 0 }}>
            Raam meten
          </h2>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => ref.current?.close()} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <form
        className="sheet-body"
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="small muted" aria-live="polite">
            {progress}
          </span>
          <div className="bar" style={{ flex: 1, maxWidth: 220 }} aria-hidden="true">
            <span style={{ width: `${((i + 1) / screens.length) * 100}%` }} />
          </div>
        </div>

        {screen.kind === "intro" && (
          <>
            <div className="diagram">
              <MeasureDiagram active={null} keys={keys} />
            </div>
            <p style={{ margin: 0 }}>
              We vragen alleen de maten die nodig zijn voor <strong>{rule.title.toLowerCase()}</strong>. Meet met een stalen rolmaat in millimeters, op elk punt opnieuw. We
              middelen niets weg: verschillen tussen meetpunten blijven zichtbaar.
            </p>
            <div className="field">
              <label htmlFor="bron">Waar komen de maten vandaan?</label>
              <select id="bron" className="select" value={w.measureSource} onChange={(e) => onChange({ ...w, measureSource: e.target.value as ProjectWindow["measureSource"] })}>
                <option value="gebruiker">Zelf gemeten</option>
                <option value="tekening">Overgenomen van een tekening</option>
                <option value="scan">Uit een scan of opmeting</option>
                <option value="anders">Anders</option>
              </select>
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>
              Bron van deze meetregel: {rule.source.label}, versie {rule.version} ({rule.date}).
            </p>
          </>
        )}

        {screen.kind === "measure" && (
          <>
            <div className="diagram">
              <MeasureDiagram active={screen.key} keys={keys} />
            </div>
            <div className="field">
              <label htmlFor="maat" style={{ fontSize: "1.1rem" }}>
                {MEASURE_INFO[screen.key].label}
                {screen.optional ? " (optioneel)" : ""}
              </label>
              <div className="input-unit" style={{ maxWidth: 240 }}>
                <input
                  id="maat"
                  className="input"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  value={text}
                  aria-invalid={invalid}
                  aria-describedby="maat-hint"
                  onChange={(e) => setText(e.target.value)}
                  style={{ fontSize: "1.25rem" }}
                />
                <span>mm</span>
              </div>
              <span id="maat-hint" className="hint">
                {invalid ? <span style={{ color: "var(--danger)" }}>Vul hele millimeters in, bijvoorbeeld 1250.</span> : MEASURE_INFO[screen.key].hint}
              </span>
            </div>
          </>
        )}

        {screen.kind === "group" && (
          <div className="stack-sm">
            <h3 style={{ margin: 0 }}>Controle {GROUP_LABEL[screen.group]}</h3>
            {groupResult ? (
              <>
                <p style={{ margin: 0 }}>
                  Kleinste {formatMm(groupResult.minMm)}, grootste {formatMm(groupResult.maxMm)}: verschil <strong>{formatMm(groupResult.spreadMm)}</strong> (waarschuwingsdrempel{" "}
                  {formatMm(groupResult.toleranceMm)}).
                </p>
                {groupResult.exceeds ? (
                  <div className="notice notice-warn stack-sm">
                    <span>
                      Je meetpunten verschillen meer dan de drempel. Meet opnieuw; een opening is vaak niet overal even groot. Klopt het verschil echt, bevestig het dan. We
                      kiezen niet zelf een gemiddelde.
                    </span>
                    <div className="row">
                      <button type="button" className="btn btn-sm" onClick={() => setI(screens.findIndex((s) => s.kind === "measure" && MEASURE_GROUPS[screen.group].includes(s.key as never)))}>
                        Opnieuw meten
                      </button>
                      <label className="check small">
                        <input type="checkbox" checked={w.deviationAcknowledged} onChange={(e) => onChange({ ...w, deviationAcknowledged: e.target.checked })} />
                        <span>Ik heb opnieuw gemeten en het verschil klopt</span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <p className="notice notice-ok" style={{ margin: 0 }}>
                    Binnen de drempel. De kleinste en grootste maat blijven allebei bewaard.
                  </p>
                )}
              </>
            ) : (
              <p className="notice">Nog niet alle meetpunten zijn ingevuld.</p>
            )}
          </div>
        )}

        {screen.kind === "checks" && (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>
              Controlevragen
            </legend>
            {rule.checks.map((c: CheckKey) => (
              <div key={c} className="card-flat stack-sm" role="radiogroup" aria-labelledby={`chk-${c}`}>
                <span id={`chk-${c}`} style={{ fontWeight: 600 }}>
                  {CHECK_INFO[c].question}
                </span>
                <span className="small muted">{CHECK_INFO[c].why}</span>
                <div className="segmented">
                  {[
                    [true, "Ja"],
                    [false, "Nee"],
                  ].map(([v, label]) => (
                    <label key={String(label)}>
                      <input type="radio" name={`chk-${c}`} checked={w.checks[c] === v} onChange={() => onChange({ ...w, checks: { ...w.checks, [c]: v as boolean }, confirmed: false })} />
                      <span>{label as string}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
        )}

        {screen.kind === "fullness" && (
          <div className="field">
            <label htmlFor="volheid">Volheid van het gordijn (optioneel)</label>
            <select
              id="volheid"
              className="select"
              value={w.fullness === null ? "" : String(w.fullness)}
              onChange={(e) => onChange({ ...w, fullness: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Nog niet gekozen</option>
              <option value="1.5">1,5 × de railbreedte</option>
              <option value="2">2 × de railbreedte</option>
              <option value="2.5">2,5 × de railbreedte</option>
              <option value="3">3 × de railbreedte</option>
            </select>
            <span className="hint">De volheid hangt af van stof, plooi en band. Kies wat jij of je leverancier wilt; wij kiezen niets voor je.</span>
          </div>
        )}

        {screen.kind === "summary" && (
          <div className="stack-sm">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>Overzicht</h3>
              <span className="badge badge-neutral">{WINDOW_STATUS_LABELS[evaluation.status]}</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {keys.map((k) => (
                    <tr key={k}>
                      <th scope="row">{MEASURE_INFO[k].label}</th>
                      <td className="num">{w.measures[k] ? formatMm(w.measures[k]!) : rule.required.includes(k) ? "nog meten" : "—"}</td>
                    </tr>
                  ))}
                  {evaluation.fabricWidthMm !== null && (
                    <tr>
                      <th scope="row">Stofbreedte bij jouw gekozen volheid</th>
                      <td className="num">{formatMm(evaluation.fabricWidthMm)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {evaluation.order ? (
              <div className="notice notice-ok">
                <strong>
                  Bestelmaat: {formatMm(evaluation.order.widthMm)} × {formatMm(evaluation.order.heightMm)}
                </strong>
                <ul>
                  {evaluation.order.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="notice">
                <strong>Meetblad met ruwe maten.</strong> De uiteindelijke bestelmaat bevestig je volgens de meetinstructie van je gekozen leverancier.
                <ul>
                  {evaluation.orderBlocked.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {evaluation.warnings.length > 0 && (
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                {evaluation.warnings.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            <label className="check">
              <input type="checkbox" checked={w.confirmed} disabled={evaluation.missing.length > 0} onChange={(e) => onChange({ ...w, confirmed: e.target.checked })} />
              <span>Ik heb alle maten van dit raam nagekeken{evaluation.missing.length ? " (eerst alle verplichte maten invullen)" : ""}</span>
            </label>
          </div>
        )}

        <div className="row" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn" disabled={i === 0} onClick={() => setI((x) => Math.max(0, x - 1))}>
            Vorige
          </button>
          {screen.kind === "summary" ? (
            <button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>
              Klaar
            </button>
          ) : (
            <button type="submit" className="btn btn-primary">
              Volgende
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
