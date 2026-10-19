import { BRAND, SOURCES } from "@/config/site";
import { formatCount, formatM2, formatMFromMm, formatMm, formatPercent } from "@/lib/format";
import { CATALOG, CATEGORY_STATUS_LABELS, computeCategory, type CategoryStatus } from "@/lib/materials/catalog";
import { patternByKey } from "@/lib/materials/patterns";
import { WINDOW_STATUS_LABELS } from "@/lib/measurements/evaluate";
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
  /** JPEG crop of the window from the user's photo, when there is one. */
  photo: { jpg: Uint8Array; width: number; height: number } | null;
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

/** "boven 1203 · midden 1201 · onder 1202 mm": every point named, the unit once at the end. */
function measureList(keys: readonly MeasureKey[], measures: Partial<Record<MeasureKey, number>>) {
  const parts = keys.filter((k) => typeof measures[k] === "number").map((k) => `${k.split("_").pop()} ${measures[k]}`);
  return parts.length ? `${parts.join(" · ")} mm` : "nog meten";
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
    /** JPEG crops of window photos, by window id. */
    photos?: Record<string, { jpg: Uint8Array; width: number; height: number }>;
  },
): ReportModel {
  const demo = project.payment?.mode === "demo";
  const included = c.rooms.filter((r) => r.room.includeFloor);
  const confirmedRooms = included.filter((r) => r.status === "derived").length;
  const completeWindows = c.windows.filter((w) => w.evaluation.status === "bevestigd" || w.evaluation.status === "bestelmaat").length;

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

  // Windows
  const windowRows: Cell[][] = c.windows.map(({ window: w, rule, evaluation: e, roomName: rn }) => {
    const keys = [...rule.required, ...rule.optional];
    const grouped = new Set<MeasureKey>(Object.values(MEASURE_GROUPS).flat());
    const width = keys.filter((k) => (MEASURE_GROUPS.breedte as readonly MeasureKey[]).includes(k));
    const height = keys.filter(
      (k) =>
        (MEASURE_GROUPS.hoogte as readonly MeasureKey[]).includes(k) || (MEASURE_GROUPS.ophanghoogte as readonly MeasureKey[]).includes(k),
    );
    const other = keys
      .filter((k) => !grouped.has(k))
      .map((k) => `${MEASURE_INFO[k].label}: ${w.measures[k] ? formatMm(w.measures[k]!) : rule.required.includes(k) ? "nog meten" : "—"}`);
    const status: Status = { "nog-meten": "missing", afwijking: "check", ingevoerd: "auto", bevestigd: "confirmed", bestelmaat: "derived" }[
      e.status
    ] as Status;
    return [
      { text: `${w.code}${w.label ? ` ${w.label}` : ""}` },
      { text: rn ?? "—" },
      { text: `${PRODUCT_SHORT[w.product]}, ${MOUNTING_SHORT[w.mounting]}` },
      { text: width.length ? measureList(width, w.measures) : "—" },
      { text: height.length ? measureList(height, w.measures) : "—" },
      {
        text:
          [
            ...other,
            ...(e.fabricWidthMm !== null ? [`Stofbreedte bij gekozen volheid ${w.fullness}×: ${formatMm(e.fabricWidthMm)}`] : []),
          ].join("; ") || "—",
      },
      { text: e.order ? `${formatMm(e.order.widthMm)} × ${formatMm(e.order.heightMm)}` : "volgens leverancier" },
      { text: `${WINDOW_STATUS_LABELS[e.status]} (${SOURCE_LABEL[w.measureSource]})`, status },
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
  for (const { window: w, evaluation: e } of c.windows) {
    if (e.order)
      order.push(`${w.code}: bestelmaat ${formatMm(e.order.widthMm)} × ${formatMm(e.order.heightMm)} (${PRODUCT_LABELS[w.product]}).`);
    else if (e.status === "bevestigd") order.push(`${w.code}: ruwe maten compleet; laat je leverancier de bestelmaat bepalen.`);
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

  // Window cards: every window with its sources, photo estimate and what is still missing.
  const cards: WindowCard[] = c.windows.map(({ window: w, rule, evaluation: e, roomName: rn }) => {
    const rows = [
      { label: "Ruimte", value: rn ?? "niet gekoppeld" },
      { label: "Product en montage", value: `${PRODUCT_SHORT[w.product]}, ${MOUNTING_SHORT[w.mounting]}` },
      {
        label: "Gemeten maten",
        value: Object.keys(w.measures).length
          ? `${Object.entries(w.measures)
              .map(([k, v]) => `${MEASURE_INFO[k as MeasureKey].label.toLowerCase()} ${v}`)
              .join(" · ")} mm (bron: ${w.confirmed ? "user_confirmed" : "user_input, nog niet bevestigd"})`
          : "nog niet gemeten",
      },
      ...(w.photo?.estimate
        ? [
            {
              label: "Schatting uit foto",
              value: `ca. ${formatMm(Math.round(Math.max(w.photo.estimate.topMm, w.photo.estimate.bottomMm)))} × ${formatMm(Math.round(Math.max(w.photo.estimate.leftMm, w.photo.estimate.rightMm)))} ± ${formatMm(w.photo.estimate.uncertaintyMm)} (browser_scan_estimate, A4-referentie; geen meting)`,
            },
          ]
        : []),
      ...(w.planWidthMm
        ? [{ label: "Op de plattegrond", value: `opening ongeveer ${formatMFromMm(w.planWidthMm)} breed (indicatief, geen raammaat)` }]
        : []),
      { label: "Ontbreekt", value: e.missing.length ? e.missing.map((k) => MEASURE_INFO[k].label.toLowerCase()).join(", ") : "niets" },
      {
        label: "Bestelstatus",
        value: e.order
          ? `bestelmaat ${formatMm(e.order.widthMm)} × ${formatMm(e.order.heightMm)} volgens ${rule.title} (versie ${rule.version})`
          : `${WINDOW_STATUS_LABELS[e.status]}; bestelmaat volgens je leverancier`,
      },
    ];
    return { title: `${w.code}${w.label ? ` · ${w.label}` : ""}`, photo: opts.photos?.[w.id] ?? null, rows };
  });

  // Material library: the categories the user chose, in catalogue order.
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
      steps: [...(r.used.length ? [`Voor: ${r.used.join(", ")}.`] : []), ...r.steps],
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
          { header: "Raam", width: 0.1 },
          { header: "Ruimte", width: 0.11 },
          { header: "Product en montage", width: 0.15 },
          { header: "Breedtes (ruw)", width: 0.13 },
          { header: "Hoogtes (ruw)", width: 0.13 },
          { header: "Overige maten", width: 0.15 },
          { header: "Bestelmaat", width: 0.11 },
          { header: "Status", width: 0.12 },
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
