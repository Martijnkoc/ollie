import { BRAND, SOURCES } from "@/config/site";
import { formatCount, formatM2, formatMFromMm, formatMm, formatPercent } from "@/lib/format";
import { CATALOG, CATEGORY_STATUS_LABELS, computeCategory, type CategoryStatus } from "@/lib/materials/catalog";
import { patternByKey } from "@/lib/materials/patterns";
import { ceilingHeightM, combinedValues, SCAN_STATUS_LABELS, shownMarginMm, type MeasureSource } from "@/lib/measurements/scan";
import { WINDOW_STATUS_LABELS } from "@/lib/measurements/evaluate";
import { ORDER_STATUS_LABELS, orderSummary, type OrderResult } from "@/lib/rules/engine";
import { MEASURE_GROUPS, MEASURE_INFO, MOUNTING_SHORT, PRODUCT_LABELS, PRODUCT_SHORT, type MeasureKey } from "@/lib/measurements/schema";
import { roomName, type ProjectComputation } from "@/lib/projects/compute";
import type { Project, Room } from "@/lib/projects/schema";
import { STATUS_META, type Status } from "@/lib/projects/status";

export type ReportStatus = Status | "neutral";

export type MaterialSection = {
  label: string;
  status: ReportStatus;
  statusLabel: string;
  rule: string;
  table: ReportTable;
  assumptions: string[];
  missing: string[];
  steps: string[];
};

export type WindowCard = {
  title: string;
  rows: { label: string; value: string }[];
};

const CATEGORY_REPORT_STATUS: Record<CategoryStatus, ReportStatus> = {
  niet_genoeg_gegevens: "missing",
  geschat: "check",
  berekend: "derived",
  klaar_voor_bestellen: "confirmed",
  wacht_op_controle: "auto",
  extra_controle_nodig: "check",
};

/**
 * Where a room's size comes from, as a short code next to the plain-language status:
 * PDF_explicit_dimension (a written size in the PDF), OCR_explicit_dimension (a written size read by OCR),
 * PDF_scaled_geometry (outline measured on the drawing with its scale), user_drawn, user_input; plus
 * user_confirmed once the user confirmed it.
 */
export function provenanceOf(room: Room): string {
  const s = room.shape;
  let code: string;
  if (s.kind === "drawn") code = room.origin === "auto" ? "PDF_scaled_geometry" : "user_drawn";
  else {
    const source = s.kind === "area" ? s.source : s.length.source;
    code = source === "pdf-tekst" ? "PDF_explicit_dimension" : source === "ocr" ? "OCR_explicit_dimension" : "user_input";
  }
  const confirmed =
    s.kind === "drawn" || s.kind === "area" ? s.status === "confirmed" : [s.length, s.width].every((l) => l.status === "confirmed");
  return confirmed && code !== "user_input" && code !== "user_drawn" ? `${code} · user_confirmed` : code;
}
export type Cell = { text: string; status?: ReportStatus };

export type ReportTable = { columns: { header: string; width: number; align?: "left" | "right" }[]; rows: Cell[][] };

export type ReportModel = {
  title: string;
  projectName: string;
  createdAt: string;
  address: string | null;
  demo: boolean;
  summary: string[];
  building: { label: string; value: string }[] | null;
  buildingSource: string;
  plan: { png: Uint8Array; width: number; height: number; caption: string } | null;
  floor: { table: ReportTable; totals: { label: string; value: string }[]; steps: string[] };
  plinths: { table: ReportTable; totals: { label: string; value: string }[]; steps: string[] };
  windows: { table: ReportTable; notes: string[]; cards: WindowCard[] };
  materials: MaterialSection[];
  checklist: { order: string[]; todo: string[] };
  assumptions: string[];
  disclaimer: string;
};

const SOURCE_LABEL: Record<string, string> = { gebruiker: "zelf gemeten", tekening: "van tekening", scan: "uit scan", anders: "anders" };

export const statusText = (s: ReportStatus) => (s === "neutral" ? "" : STATUS_META[s].label);

type Sources = Partial<Record<MeasureKey, MeasureSource>>;

/** Whole millimetres for display; the stored value stays unrounded. */
const wholeMm = (mm: number) => String(Math.round(mm));

/** "boven 1203 · midden 1201±8 · onder 1202 mm": every point named, scan values with their ±, the unit once at the end. */
function measureList(keys: readonly MeasureKey[], measures: Partial<Record<MeasureKey, number>>, sources: Sources) {
  const parts = keys
    .filter((k) => typeof measures[k] === "number")
    .map((k) => `${k.split("_").pop()} ${wholeMm(measures[k]!)}${sources[k] ? `±${shownMarginMm(sources[k]!.uncertaintyMm)}` : ""}`);
  return parts.length ? `${parts.join(" · ")} mm` : "nog meten";
}

/** The order size in a table cell: "1200 × 1495 mm" only when it may be ordered; otherwise why not. */
function orderCell(o: OrderResult) {
  if (!o.order)
    return o.status === "measuring_sheet"
      ? "volgens leverancier"
      : ORDER_STATUS_LABELS[o.status].replace(/^Nog geen bestelmaat: /, "nog niet: ");
  if (o.order.byCode) return `op typecode ${o.order.byCode}`;
  const side = (mm: number | null) => (mm === null ? "navragen" : String(mm));
  return `${side(o.order.orderWidthMm)} × ${side(o.order.orderHeightMm)} mm`;
}

/** The order layer of a window card: rule and source, selected sizes, corrections, depth, status, open points. */
function orderRows(o: OrderResult): { label: string; value: string }[] {
  const rows = [
    {
      label: "Productregel",
      value: `${o.rule.title}, regels ${o.rule.version}${o.rule.url ? ` — ${o.rule.url}` : ""}${o.rule.status === "concept" ? " (nog niet tegen de volledige bron gecontroleerd)" : o.rule.checkedOn ? ` (gecontroleerd ${o.rule.checkedOn})` : ""}`,
    },
  ];
  if (o.width) rows.push({ label: "Telt voor de breedte", value: `${formatMm(o.width.mm)}: ${o.width.how}` });
  if (o.height) rows.push({ label: "Telt voor de hoogte", value: `${formatMm(o.height.mm)}: ${o.height.how}` });
  if (o.suggestion)
    rows.push({
      label: "Overlap",
      value: `${o.suggestion.widthMm !== null ? formatMm(o.suggestion.widthMm) : "?"} × ${o.suggestion.heightMm !== null ? formatMm(o.suggestion.heightMm) : "?"}: ${o.suggestion.how}`,
    });
  for (const k of o.corrections)
    rows.push({
      label: "Correctie",
      value: `${k.what} (${k.appliedBy === "leverancier" ? "door de leverancier" : `door ${BRAND.name}`}): ${k.reason}`,
    });
  if (o.depth)
    rows.push({
      label: "Montagediepte",
      value: `${o.depth.measuredMm !== null ? formatMm(o.depth.measuredMm) : "niet gemeten"}; nodig ${o.depth.requiredMm !== null ? formatMm(o.depth.requiredMm) : "onbekend"}${o.depth.ok === null ? "" : o.depth.ok ? " — voldoende" : " — te weinig"}`,
    });
  rows.push({ label: "Bestelmaat", value: orderSummary(o) });
  for (const q of o.questions) rows.push({ label: "Navragen", value: q.question });
  for (const b of o.blockedBy) rows.push({ label: "Waarom (nog) niet", value: b });
  return rows;
}

/** Provenance of one window measurement: ScanTag with its scale source, margin and status, or the user's own. */
function measureProvenance(source: MeasureSource | undefined, confirmed: boolean) {
  if (!source) return confirmed ? "zelf gemeten · door jou bevestigd" : "zelf gemeten · nog niet bevestigd";
  return `ScanTag (${source.scaleSource === "webxr_hit_test_depth" ? "AR-tracking met dieptekaart" : "AR-tracking"}), ${source.shots} scan${source.shots > 1 ? "s" : ""}, ${SCAN_STATUS_LABELS[source.status].toLowerCase()}`;
}

/**
 * Lower bound of a group of scan measurements: the smallest value minus its margin. What still fits between
 * two walls when every scan value is as far off as its margin allows.
 */
export function lowerBound(keys: readonly MeasureKey[], measures: Partial<Record<MeasureKey, number>>, sources: Sources) {
  const values = keys.filter((k) => typeof measures[k] === "number");
  if (!values.some((k) => sources[k])) return null;
  return Math.min(...values.map((k) => measures[k]! - (sources[k] ? shownMarginMm(sources[k]!.uncertaintyMm) : 0)));
}

/**
 * Builds everything the report shows from the project and its computation. Pure and deterministic, so the
 * PDF and the CSV always show the same numbers as the screen.
 */
export function buildReportModel(
  project: Project,
  c: ProjectComputation,
  opts: {
    now: Date;
    plan?: { png: Uint8Array; width: number; height: number; page: number } | null;
  },
): ReportModel {
  const demo = project.payment?.mode === "demo";
  const included = c.rooms.filter((r) => r.room.includeFloor);
  const confirmedRooms = included.filter((r) => r.status === "derived").length;
  const completeWindows = c.windows.filter((w) => w.evaluation.status === "bevestigd").length;

  const summary = [
    `${confirmedRooms} van ${included.length} meegetelde ruimtes rusten op door jou bevestigde maten.`,
    c.windows.length
      ? `${completeWindows} van ${c.windows.length} ramen zijn volledig gemeten en bevestigd.`
      : "Er zijn (nog) geen ramen in het register.",
    c.verified ? "Vloer: alle meegetelde ruimtes zijn gecontroleerd." : "Vloer: nog niet alles is gecontroleerd; zie de status per ruimte.",
  ];

  const b = project.building;
  const building = b
    ? [
        ...(b.verblijfsobject?.oppervlakteM2 != null
          ? [{ label: "Gebruiksoppervlakte (BAG, hele woning)", value: formatM2(b.verblijfsobject.oppervlakteM2) }]
          : []),
        ...(b.pand?.bouwjaar ? [{ label: "Bouwjaar (BAG)", value: String(b.pand.bouwjaar) }] : []),
        ...(b.verblijfsobject?.gebruiksdoelen.length
          ? [{ label: "Gebruiksdoel (BAG)", value: b.verblijfsobject.gebruiksdoelen.join(", ") }]
          : []),
      ]
    : null;

  // Floor
  const f = c.floor;
  const floorRows: Cell[][] = c.rooms.map((r, i) => [
    { text: `${i + 1}. ${roomName(r.room)}` },
    { text: r.room.includeFloor ? "ja" : "nee" },
    { text: r.netAreaMm2 !== null ? formatM2(r.netAreaMm2 / 1_000_000) : "nog meten" },
    { text: r.room.includeFloor && r.netAreaMm2 !== null ? formatM2((r.netAreaMm2 / 1_000_000) * (1 + f.wastePercent / 100)) : "—" },
    { text: statusText(r.status), status: r.status },
    { text: provenanceOf(r.room) },
  ]);
  const floorTotals = [
    { label: "Geselecteerd netto", value: formatM2(f.selectedNetM2) },
    {
      label: `Benodigd met ${formatPercent(f.wastePercent)} snijverlies`,
      value: f.requiredM2 !== null ? formatM2(f.requiredM2) : "nog niet te berekenen",
    },
    {
      label: "Pakken",
      value: f.packs !== null && f.packM2 !== null ? `${formatCount(f.packs)} à ${formatM2(f.packM2, 3)}` : "inhoud per pak niet opgegeven",
    },
  ];

  // Plinths
  const p = c.plinths;
  const plinthRows: Cell[][] = p.rooms.map((r) => [
    { text: r.name },
    { text: r.perimeterMm !== null ? formatMFromMm(r.perimeterMm) : "—" },
    { text: r.excludedWallsMm ? `− ${formatMFromMm(r.excludedWallsMm)}` : "—" },
    { text: r.doorDeductionMm ? `− ${formatMFromMm(r.doorDeductionMm)}` : r.unconfirmedDoors ? "niet bevestigd" : "—" },
    { text: r.obstacleAdditionMm ? `+ ${formatMFromMm(r.obstacleAdditionMm)}` : "—" },
    { text: r.netMm !== null ? formatMFromMm(r.netMm) : "nog meten" },
    { text: statusText(r.status), status: r.status },
  ]);
  const plinthTotals = [
    { label: "Netto strekkende meters", value: formatMFromMm(p.netMm) },
    {
      label: `Met ${formatPercent(p.marginPercent)} marge`,
      value: p.requiredMm !== null ? formatMFromMm(p.requiredMm) : "nog niet te berekenen",
    },
    {
      label: "Handelslengtes",
      value:
        p.piecesByTotal !== null && p.pieceLengthMm !== null
          ? `${formatCount(p.piecesByTotal)} × ${formatMFromMm(p.pieceLengthMm)}`
          : "lengte niet opgegeven",
    },
  ];

  // Windows: the measured opening (observedOpeningDimensions) and the order size (orderDimensions), both in mm.
  const marginCell = (mm: number | null) => (mm === null ? "" : ` ±${shownMarginMm(mm)}`);
  const windowRows: Cell[][] = c.windows.map(({ window: w, rule, evaluation: e, opening: op, order: o, roomName: rn }) => {
    const keys = [...rule.required, ...rule.optional];
    const grouped = new Set<MeasureKey>([...MEASURE_GROUPS.breedte, ...MEASURE_GROUPS.hoogte, "diepte"]);
    const other = keys
      .filter((k) => !grouped.has(k))
      .map(
        (k) =>
          `${MEASURE_INFO[k].label}: ${typeof w.measures[k] === "number" ? `${formatMm(w.measures[k]!)}${w.sources[k] ? ` ±${shownMarginMm(w.sources[k]!.uncertaintyMm)}` : ""}` : rule.required.includes(k) ? "nog meten" : "—"}`,
      );
    const scanned = keys.some((k) => w.sources[k] && w.measures[k]);
    const typed = keys.some((k) => !w.sources[k] && w.measures[k]);
    const source = scanned ? (typed ? "ScanTag en zelf gemeten" : "ScanTag") : SOURCE_LABEL[w.measureSource];
    const status: Status = { "nog-meten": "missing", afwijking: "check", ingevoerd: scanned ? "measured" : "auto", bevestigd: "confirmed" }[
      e.status
    ] as Status;
    const opening =
      op.openingWidthMm === null && op.openingHeightMm === null
        ? "nog meten"
        : `${op.openingWidthMm === null ? "?" : wholeMm(op.openingWidthMm)}${marginCell(op.measurementUncertaintyMm.width)} × ${op.openingHeightMm === null ? "?" : wholeMm(op.openingHeightMm)}${marginCell(op.measurementUncertaintyMm.height)}`;
    return [
      { text: `${w.code}${w.label ? ` ${w.label}` : ""}` },
      { text: rn ?? "—" },
      { text: `${PRODUCT_SHORT[w.product]}, ${MOUNTING_SHORT[w.mounting]}` },
      { text: opening },
      { text: op.depthMm === null ? "—" : `${wholeMm(op.depthMm)}${marginCell(op.measurementUncertaintyMm.depth)}` },
      {
        text:
          [
            ...other,
            ...(e.fabricWidthMm !== null ? [`Stofbreedte bij gekozen volheid ${w.fullness}×: ${formatMm(e.fabricWidthMm)}`] : []),
          ].join("; ") || "—",
      },
      { text: orderCell(o) },
      { text: `${WINDOW_STATUS_LABELS[e.status]} (${source})`, status },
    ];
  });
  const windowNotes = [
    ...new Set(
      c.windows.flatMap((w) => w.evaluation.warnings.filter((x) => !w.rule.warnings.includes(x)).map((x) => `${w.window.code}: ${x}`)),
    ),
  ];

  // Checklist
  const order: string[] = [];
  const todo: string[] = [];
  if (f.requiredM2 !== null)
    order.push(
      `Vloer: ${formatM2(f.requiredM2)}${f.packs !== null ? ` (${formatCount(f.packs)} pakken)` : ""}, ${f.status === "derived" ? "op basis van bevestigde maten" : "controleer eerst de gemarkeerde ruimtes"}.`,
    );
  if (f.incompleteRooms.length) todo.push(`Vloer: nog geen oppervlakte voor ${f.incompleteRooms.join(", ")}.`);
  if (f.packs === null && f.requiredM2 !== null)
    todo.push("Vloer: vul de inhoud per pak van je gekozen vloer in om het aantal pakken te zien.");
  for (const r of included.filter((x) => x.status === "check")) todo.push(`Controleer de maten van ${roomName(r.room)}.`);
  if (p.requiredMm !== null)
    order.push(
      `Plinten: ${formatMFromMm(p.requiredMm)}${p.piecesByTotal !== null && p.pieceLengthMm !== null ? ` (${formatCount(p.piecesByTotal)} stuks van ${formatMFromMm(p.pieceLengthMm)})` : ""}.`,
    );
  if (p.incompleteRooms.length) todo.push(`Plinten: vorm onbekend voor ${p.incompleteRooms.join(", ")}.`);
  for (const r of p.rooms.filter((x) => x.unconfirmedDoors))
    todo.push(
      `Plinten ${r.name}: meet de breedte van ${r.unconfirmedDoors === 1 ? "de deuropening" : `${r.unconfirmedDoors} deuropeningen`}.`,
    );
  for (const { window: w, evaluation: e, order: o } of c.windows) {
    if (o.status === "order_ready" && o.order)
      order.push(`${w.code}: bestelmaat ${orderCell(o)} (${PRODUCT_LABELS[w.product]}, ${o.rule.title}).`);
    else if (e.status === "bevestigd")
      todo.push(
        o.status === "measuring_sheet"
          ? `${w.code}: maten compleet; laat je leverancier de bestelmaat bepalen.`
          : `${w.code}: nog geen bestelmaat — ${o.blockedBy[0] ?? o.questions[0]?.question ?? ORDER_STATUS_LABELS[o.status]}`,
      );
    else
      todo.push(
        `${w.code}: ${e.status === "afwijking" ? "afwijking tussen meetpunten controleren" : e.status === "nog-meten" ? `nog meten (${e.missing.map((k) => MEASURE_INFO[k].label.toLowerCase()).join(", ")})` : "maten nakijken en bevestigen"}.`,
      );
  }

  // Assumptions and provenance
  const pattern = patternByKey(project.floor.pattern);
  const assumptions = [
    `Snijverlies: ${formatPercent(project.floor.wastePercent)} (${pattern.key === "eigen" ? "eigen percentage" : `legpatroon ${pattern.label.toLowerCase()}, richtwaarde die je kunt aanpassen`}).`,
    project.floor.packM2 !== null
      ? `Inhoud per pak ${formatM2(project.floor.packM2, 3)}, door jou opgegeven.`
      : "Geen inhoud per pak opgegeven; er is geen standaardpakgrootte gebruikt.",
    `Plintmarge: ${formatPercent(project.plinth.marginPercent)}. ${project.plinth.pieceLengthMm ? `Handelslengte ${formatMFromMm(project.plinth.pieceLengthMm)}, door jou opgegeven.` : "Geen handelslengte opgegeven."}`,
    "Deuropeningen worden alleen afgetrokken als je de breedte hebt ingevuld.",
    ...project.scales.map(
      (s) =>
        `Schaal pagina ${s.page + 1}: ${
          s.method === "kalibratie"
            ? `gekalibreerd op ${formatMFromMm(s.reference?.realMm ?? 0)}`
            : s.method === "maatlijnen"
              ? `uit ${s.evidence?.agreeing ?? "?"} van ${s.evidence?.lines ?? "?"} maatlijnen op de tekening die onderling kloppen (±${((s.evidence?.uncertainty ?? 0) * 100).toFixed(1).replace(".", ",")} %${s.evidence?.directions === 2 ? ", horizontaal en verticaal" : ", één richting"})`
              : `schaalnotatie 1:${s.notation}`
        } (${s.status === "confirmed" ? "door jou bevestigd" : "automatisch herkend, niet bevestigd"}).`,
    ),
    "Bron per ruimte: PDF_explicit_dimension = maat geschreven in de PDF; OCR_explicit_dimension = maat gelezen met tekstherkenning; PDF_scaled_geometry = omtrek gemeten langs de wanden op de tekening met de schaal; user_input / user_drawn = door jou ingevoerd of getekend; user_confirmed = door jou bevestigd.",
    ...project.analyses.map(
      (a) =>
        `Pagina ${a.page + 1} gelezen met ${a.method === "ocr" ? "tekstherkenning (OCR) op je apparaat" : "de tekst uit de PDF"}; leesbaarheid: ${a.quality}.`,
    ),
    ...[...new Map(c.windows.map((w) => [w.rule.id, w.rule])).values()].map(
      (r) => `Meetregel "${r.title}", versie ${r.version} (${r.date}); bron: ${r.source.label}${r.source.url ? `, ${r.source.url}` : ""}.`,
    ),
    "Kamers met een rechthoek uit een maatlabel zijn als rechthoek berekend; een afwijkende vorm moet je zelf aanpassen.",
    "De BAG-gebruiksoppervlakte is een andere meting dan de som van de kamers en is nergens in de berekening gebruikt.",
  ];

  // Window cards: every window with its measurements and their sources, and what is still missing.
  const cards: WindowCard[] = c.windows.map(({ window: w, evaluation: e, opening: op, order: o, roomName: rn }) => {
    const dim = (mm: number | null, margin: number | null) =>
      mm === null ? "nog meten" : `${formatMm(mm)}${margin === null ? "" : ` ± ${formatMm(shownMarginMm(margin))}`}`;
    const rows = [
      { label: "Ruimte", value: rn ?? "niet gekoppeld" },
      { label: "Product en montage", value: `${PRODUCT_SHORT[w.product]}, ${MOUNTING_SHORT[w.mounting]}` },
      {
        label: "Gemeten opening",
        value: `breedte ${dim(op.openingWidthMm, op.measurementUncertaintyMm.width)} · hoogte ${dim(op.openingHeightMm, op.measurementUncertaintyMm.height)}${op.depthMm !== null ? ` · diepte ${dim(op.depthMm, op.measurementUncertaintyMm.depth)}` : ""} (kleinste van de meetpunten)`,
      },
      ...(Object.keys(w.measures).length
        ? (Object.entries(w.measures) as [MeasureKey, number][]).map(([k, v]) => ({
            label: MEASURE_INFO[k].label,
            value: `${formatMm(v)}${w.sources[k] ? ` ± ${formatMm(shownMarginMm(w.sources[k]!.uncertaintyMm))}` : ""} (${measureProvenance(w.sources[k], w.confirmed)})`,
          }))
        : [{ label: "Meetpunten", value: "nog niet gemeten" }]),
      ...(["breedte", "hoogte"] as const).flatMap((g) => {
        const lb = lowerBound(MEASURE_GROUPS[g], w.measures, w.sources);
        return lb === null ? [] : [{ label: `Ondergrens ${g}`, value: `${formatMm(lb)} (kleinste ${g} min de foutmarge van de scan)` }];
      }),
      ...(w.planWidthMm
        ? [{ label: "Op de plattegrond", value: `opening ongeveer ${formatMm(w.planWidthMm)} breed (indicatief, geen raammaat)` }]
        : []),
      { label: "Ontbreekt", value: e.missing.length ? e.missing.map((k) => MEASURE_INFO[k].label.toLowerCase()).join(", ") : "niets" },
      { label: "Meetstatus", value: WINDOW_STATUS_LABELS[e.status] },
      ...orderRows(o),
    ];
    return { title: `${w.code}${w.label ? ` · ${w.label}` : ""}`, rows };
  });

  // Material library: the categories the user chose, in catalogue order.
  const ceilingScan = combinedValues(project.scans).plafondhoogte;
  const ceiling = ceilingScan?.agree
    ? { m: ceilingHeightM(ceilingScan.mm), uncertaintyMm: ceilingScan.uncertaintyMm, shots: ceilingScan.shots }
    : null;
  const doorsOnPlan = project.analyses.reduce((n, a) => n + (a.auto?.doors ?? 0), 0);
  const materials: MaterialSection[] = CATALOG.filter((m) => project.materials.selected.includes(m.key)).map((m) => {
    const r = computeCategory(m, c, {
      roomIds: project.materials.rooms[m.key] ?? null,
      inputs: project.materials.inputs[m.key] ?? {},
      doorsOnPlan,
    });
    const qty = (q: number | null, unit: string) =>
      q === null
        ? "—"
        : `${["pakken", "stuks", "stuk", "dozen", "rollen"].includes(unit) ? formatCount(q) : q.toLocaleString("nl-NL", { maximumFractionDigits: 2 })} ${unit}`;
    return {
      label: m.label,
      status: CATEGORY_REPORT_STATUS[r.status],
      statusLabel: CATEGORY_STATUS_LABELS[r.status],
      rule: `Regel ${m.key} versie ${m.version} (${m.date}): ${m.formula}`,
      table: {
        columns: [
          { header: "Onderdeel", width: 0.42 },
          { header: "Hoeveelheid", width: 0.2, align: "right" },
          { header: "Toelichting", width: 0.38 },
        ],
        rows: r.lines.map((l) => [{ text: l.label }, { text: qty(l.quantity, l.unit) }, { text: l.note ?? "" }]),
      },
      assumptions: r.assumptions,
      missing: r.missing,
      steps: [
        ...(r.used.length ? [`Voor: ${r.used.join(", ")}.`] : []),
        ...(ceiling && m.inputs.some((i) => i.key === "plafondhoogte") && project.materials.inputs[m.key]?.plafondhoogte === ceiling.m
          ? [
              `Plafondhoogte ${ceiling.m.toLocaleString("nl-NL")} m gemeten met ScanTag (± ${formatMm(shownMarginMm(ceiling.uncertaintyMm))}, ${ceiling.shots} scan${ceiling.shots > 1 ? "s" : ""}; AR-tracking van je telefoon).`,
            ]
          : []),
        ...r.steps,
      ],
    };
  });
  for (const m of materials) {
    if (m.status === "confirmed") order.push(`${m.label}: ${m.table.rows.map((row) => `${row[0]!.text} ${row[1]!.text}`).join("; ")}.`);
    else if (m.status === "missing")
      todo.push(`${m.label}: ${m.missing.length ? `ontbreekt ${m.missing.join(", ")}` : "nog niet genoeg gegevens"}.`);
  }

  const planCaption = opts.plan
    ? `Pagina ${opts.plan.page + 1} van je plattegrond met genummerde ruimtes en ramen. Markeringen komen uit de herkenning of uit je eigen tekenwerk en zijn indicatief.`
    : "";

  return {
    title: "Meet- en bestelrapport",
    projectName: project.name,
    createdAt: opts.now.toISOString(),
    address: project.report.includeAddress ? (project.address?.weergavenaam ?? null) : null,
    demo,
    summary,
    building: building && building.length ? building : null,
    buildingSource: SOURCES.bag,
    plan: opts.plan ? { png: opts.plan.png, width: opts.plan.width, height: opts.plan.height, caption: planCaption } : null,
    floor: {
      table: {
        columns: [
          { header: "Ruimte", width: 0.25 },
          { header: "Meetellen", width: 0.1 },
          { header: "Netto (m²)", width: 0.12, align: "right" },
          { header: "Benodigd (m²)", width: 0.13, align: "right" },
          { header: "Status", width: 0.18 },
          { header: "Bron", width: 0.22 },
        ],
        rows: floorRows,
      },
      totals: floorTotals,
      steps: f.steps,
    },
    plinths: {
      table: {
        columns: [
          { header: "Ruimte", width: 0.22 },
          { header: "Omtrek", width: 0.11, align: "right" },
          { header: "Zonder plint", width: 0.12, align: "right" },
          { header: "Deuren", width: 0.12, align: "right" },
          { header: "Obstakels", width: 0.11, align: "right" },
          { header: "Netto", width: 0.11, align: "right" },
          { header: "Status", width: 0.21 },
        ],
        rows: plinthRows,
      },
      totals: plinthTotals,
      steps: p.steps,
    },
    windows: {
      table: {
        columns: [
          { header: "Raam", width: 0.09 },
          { header: "Ruimte", width: 0.1 },
          { header: "Product en montage", width: 0.14 },
          { header: "Opening b × h (mm)", width: 0.15 },
          { header: "Diepte (mm)", width: 0.09 },
          { header: "Overige maten", width: 0.15 },
          { header: "Bestelmaat", width: 0.13 },
          { header: "Status", width: 0.15 },
        ],
        rows: windowRows,
      },
      notes: windowNotes,
      cards,
    },
    materials,
    checklist: { order, todo },
    assumptions,
    disclaimer: `De berekeningen in dit rapport zijn zo betrouwbaar als de maten die zijn aangeleverd en bevestigd. Automatisch herkende waarden kunnen fouten bevatten en zijn als zodanig gemarkeerd. Productspecifieke bestelmaten volgen de regels van de gekozen leverancier. ${BRAND.name} geeft geen garantie op passende bestellingen; controleer kritieke maten altijd in de woning.`,
  };
}
