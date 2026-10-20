import { formatCount, formatM2, formatPercent } from "@/lib/format";
import { ceilSafe, mm2ToM2 } from "@/lib/geometry/units";
import type { ProjectComputation, RoomResult, WindowResult } from "@/lib/projects/compute";
import type { ProductFamily } from "@/lib/measurements/schema";
import { orderSummary, type OrderStatus } from "@/lib/rules/engine";
import type { Room } from "@/lib/projects/schema";

/**
 * The material library: one versioned module per category. A module states which rooms (or windows) it
 * uses, which inputs it needs with their units, its formula and its rounding. It returns quantities only
 * from the input it has, says which inputs are still assumptions, and never invents product or supplier
 * data. Status vocabulary (shown in the app and the report):
 *
 * - niet_genoeg_gegevens: a required value is missing; no quantity.
 * - geschat: a quantity, but it rests on an assumption or on room sizes that are not confirmed yet.
 * - berekend: calculated from confirmed sizes and entered values; packaging still unknown.
 * - klaar_voor_bestellen: calculated from confirmed input including packaging: ready to buy.
 * - wacht_op_controle: measured, but the order size follows the supplier's own instructions.
 * - extra_controle_nodig: a measuring spread or a product (rolluik) that needs a closer check.
 */
export const CATEGORY_STATUSES = [
  "niet_genoeg_gegevens",
  "geschat",
  "berekend",
  "klaar_voor_bestellen",
  "wacht_op_controle",
  "extra_controle_nodig",
] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

export const CATEGORY_STATUS_LABELS: Record<CategoryStatus, string> = {
  niet_genoeg_gegevens: "Niet genoeg gegevens",
  geschat: "Geschat",
  berekend: "Berekend",
  klaar_voor_bestellen: "Klaar voor bestellen",
  wacht_op_controle: "Wacht op controle",
  extra_controle_nodig: "Extra controle nodig",
};

export const CATEGORY_KEYS = [
  "laminaat",
  "pvc",
  "tegels",
  "ondervloer",
  "plinten",
  "profielen",
  "verf",
  "primer",
  "behang",
  "gordijnen",
  "rolgordijnen",
  "jaloezieen",
  "plisse",
  "vouwgordijnen",
  "rolluiken",
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export type InputSpec = {
  key: string;
  label: string;
  unit: "%" | "m²" | "mm" | "cm" | "m" | "m²/L" | "L" | "stuks" | "×";
  help: string;
  min: number;
  max: number;
  /** Used until the user enters a value; always shown as an assumption and keeps the status at "geschat". */
  assumption?: { value: number; why: string };
  /** Needed for a quantity at all (otherwise only for the order in packs/rolls/cans). */
  required?: boolean;
};

export type CategoryInputs = Record<string, number | null | undefined>;

export type CategoryLine = { label: string; quantity: number | null; unit: string; note?: string };

export type CategoryResult = {
  key: CategoryKey;
  status: CategoryStatus;
  lines: CategoryLine[];
  /** The calculation in words, step by step. */
  steps: string[];
  /** Values still taken from an assumption. */
  assumptions: string[];
  missing: string[];
  /** Rooms or windows used. */
  used: string[];
};

export type CategoryModule = {
  key: CategoryKey;
  label: string;
  group: "vloer" | "wand" | "raam";
  version: string;
  date: string;
  /** Free modules are part of the free basis (paint); the rest unlocks with the report. */
  paid: boolean;
  description: string;
  formula: string;
  scope: "vloer" | "wand" | "raam";
  inputs: InputSpec[];
  compute(ctx: CategoryContext, inputs: CategoryInputs): CategoryResult;
};

export type CategoryContext = {
  computed: ProjectComputation;
  /** Rooms chosen for this category (the user can leave out a bathroom for paint, for example). */
  rooms: RoomResult[];
  windows: WindowResult[];
  /** Door openings found on the plan, as a suggestion for transition profiles. */
  doorsOnPlan: number;
};

const VERSION = "1.0";
const DATE = "2026-10-19";

const roomName = (r: RoomResult) => r.room.name.trim() || "Naamloze ruimte";
const fmt = (n: number, d = 2) => n.toLocaleString("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Reads an input or its assumption; records which values are still assumptions or missing. */
function reader(specs: InputSpec[], inputs: CategoryInputs, assumptions: string[], missing: string[]) {
  return (key: string): number | null => {
    const spec = specs.find((s) => s.key === key)!;
    const v = inputs[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= spec.min && v <= spec.max) return v;
    if (spec.assumption) {
      assumptions.push(
        `${spec.label}: ${fmt(spec.assumption.value, spec.unit === "×" || spec.unit === "stuks" ? 0 : 2)} ${spec.unit} (aanname — ${spec.assumption.why})`,
      );
      return spec.assumption.value;
    }
    if (spec.required) missing.push(spec.label);
    return null;
  };
}

function finish(
  key: CategoryKey,
  base: Omit<CategoryResult, "key" | "status">,
  opts: { complete: boolean; unconfirmed: boolean; packaged: boolean },
): CategoryResult {
  let status: CategoryStatus;
  if (!opts.complete) status = "niet_genoeg_gegevens";
  else if (opts.unconfirmed || base.assumptions.length) status = "geschat";
  else status = opts.packaged ? "klaar_voor_bestellen" : "berekend";
  return { key, status, ...base };
}

/** Sum of known net floor areas; rooms without an area are listed as missing. */
function floorArea(rooms: RoomResult[], missing: string[]) {
  let m2 = 0;
  for (const r of rooms) {
    if (r.netAreaMm2 === null) missing.push(`Oppervlakte van ${roomName(r)}`);
    else m2 += mm2ToM2(r.netAreaMm2);
  }
  return m2;
}

const unconfirmed = (rooms: RoomResult[]) => rooms.some((r) => r.status !== "derived");

const WASTE: InputSpec = {
  key: "snijverlies",
  label: "Snijverlies",
  unit: "%",
  help: "Hangt af van het legpatroon, de vorm van de ruimtes en de legrichtlijn van het product.",
  min: 0,
  max: 50,
  assumption: { value: 7, why: "richtwaarde voor rechte banen; pas aan voor je patroon" },
};

function floorModule(key: "laminaat" | "pvc", label: string): CategoryModule {
  const inputs: InputSpec[] = [
    WASTE,
    { key: "pak_m2", label: "Inhoud per pak", unit: "m²", help: "Staat op de verpakking of productpagina.", min: 0.1, max: 100 },
  ];
  return {
    key,
    label,
    group: "vloer",
    version: VERSION,
    date: DATE,
    paid: true,
    scope: "vloer",
    description: `${label} voor de gekozen ruimtes, met snijverlies en afgerond op hele pakken.`,
    formula: "benodigd m² = netto m² × (1 + snijverlies / 100); pakken = ⌈benodigd m² / m² per pak⌉",
    inputs,
    compute(ctx, values) {
      const assumptions: string[] = [];
      const missing: string[] = [];
      const read = reader(inputs, values, assumptions, missing);
      const net = floorArea(ctx.rooms, missing);
      const waste = read("snijverlies")!;
      const pack = read("pak_m2");
      const complete = ctx.rooms.length > 0 && missing.length === 0;
      const needed = net * (1 + waste / 100);
      const packs = pack ? ceilSafe(needed / pack) : null;
      const steps = [
        `Netto: ${ctx.rooms.map((r) => roomName(r)).join(" + ") || "geen ruimtes"} = ${formatM2(net)}`,
        `Met ${formatPercent(waste)} snijverlies: ${formatM2(net)} × ${fmt(1 + waste / 100, 2)} = ${formatM2(needed)}`,
      ];
      if (packs !== null) steps.push(`Pakken: ⌈${formatM2(needed)} / ${formatM2(pack!, 3)}⌉ = ${formatCount(packs)}`);
      return finish(
        key,
        {
          lines: [
            { label: `${label} inclusief snijverlies`, quantity: complete ? needed : null, unit: "m²" },
            {
              label: `${label} in pakken`,
              quantity: complete ? packs : null,
              unit: "pakken",
              note: pack ? undefined : "Vul de inhoud per pak in",
            },
          ],
          steps,
          assumptions,
          missing,
          used: ctx.rooms.map(roomName),
        },
        { complete, unconfirmed: unconfirmed(ctx.rooms), packaged: packs !== null },
      );
    },
  };
}

const tegels: CategoryModule = (() => {
  const inputs: InputSpec[] = [
    { ...WASTE, assumption: { value: 10, why: "richtwaarde voor tegels recht gelegd; meer bij diagonaal of grote formaten" } },
    { key: "tegel_lengte", label: "Tegel lengte", unit: "mm", help: "Werkelijke tegelmaat.", min: 20, max: 3000, required: true },
    { key: "tegel_breedte", label: "Tegel breedte", unit: "mm", help: "Werkelijke tegelmaat.", min: 20, max: 3000, required: true },
    { key: "doos_m2", label: "Inhoud per doos", unit: "m²", help: "Staat op de doos of productpagina.", min: 0.05, max: 50 },
  ];
  return {
    key: "tegels",
    label: "Vloertegels",
    group: "vloer",
    version: VERSION,
    date: DATE,
    paid: true,
    scope: "vloer",
    description: "Aantal vloertegels en dozen voor de gekozen ruimtes. Wandtegels vallen hier buiten.",
    formula: "tegels = ⌈netto m² × (1 + snijverlies / 100) / (lengte × breedte)⌉; dozen = ⌈benodigd m² / m² per doos⌉",
    inputs,
    compute(ctx, values) {
      const assumptions: string[] = [];
      const missing: string[] = [];
      const read = reader(inputs, values, assumptions, missing);
      const net = floorArea(ctx.rooms, missing);
      const waste = read("snijverlies")!;
      const l = read("tegel_lengte");
      const w = read("tegel_breedte");
      const box = read("doos_m2");
      const complete = ctx.rooms.length > 0 && missing.length === 0 && l !== null && w !== null;
      const needed = net * (1 + waste / 100);
      const tiles = complete ? ceilSafe(needed / ((l! * w!) / 1e6)) : null;
      const boxes = complete && box ? ceilSafe(needed / box) : null;
      return finish(
        "tegels",
        {
          lines: [
            { label: "Tegels inclusief snijverlies", quantity: complete ? needed : null, unit: "m²" },
            { label: "Aantal tegels", quantity: tiles, unit: "stuks", note: "Zonder voegbreedte gerekend: iets aan de ruime kant" },
            { label: "Dozen", quantity: boxes, unit: "dozen", note: box ? undefined : "Vul de inhoud per doos in" },
          ],
          steps: [
            `Netto ${formatM2(net)} × ${fmt(1 + waste / 100)} = ${formatM2(needed)}`,
            ...(complete ? [`Tegel ${fmt(l!, 0)} × ${fmt(w!, 0)} mm = ${fmt((l! * w!) / 1e6, 4)} m² → ${formatCount(tiles!)} tegels`] : []),
          ],
          assumptions,
          missing,
          used: ctx.rooms.map(roomName),
        },
        { complete, unconfirmed: unconfirmed(ctx.rooms), packaged: boxes !== null },
      );
    },
  };
})();

const ondervloer: CategoryModule = (() => {
  const inputs: InputSpec[] = [
    {
      key: "overlap",
      label: "Extra voor overlap en snijden",
      unit: "%",
      help: "Sommige ondervloeren overlappen bij de naden, andere niet: kijk op de verpakking.",
      min: 0,
      max: 50,
      assumption: { value: 5, why: "ruime marge voor snijden; 0 % als je de banen stuik legt en weinig snijdt" },
    },
    { key: "rol_m2", label: "Inhoud per rol of pak", unit: "m²", help: "Staat op de verpakking.", min: 0.5, max: 200 },
  ];
  return {
    key: "ondervloer",
    label: "Ondervloer",
    group: "vloer",
    version: VERSION,
    date: DATE,
    paid: true,
    scope: "vloer",
    description: "Ondervloer onder laminaat of PVC voor de gekozen ruimtes.",
    formula: "benodigd m² = netto m² × (1 + extra / 100); rollen = ⌈benodigd m² / m² per rol⌉",
    inputs,
    compute(ctx, values) {
      const assumptions: string[] = [];
      const missing: string[] = [];
      const read = reader(inputs, values, assumptions, missing);
      const net = floorArea(ctx.rooms, missing);
      const extra = read("overlap")!;
      const roll = read("rol_m2");
      const complete = ctx.rooms.length > 0 && missing.length === 0;
      const needed = net * (1 + extra / 100);
      const rolls = complete && roll ? ceilSafe(needed / roll) : null;
      return finish(
        "ondervloer",
        {
          lines: [
            { label: "Ondervloer", quantity: complete ? needed : null, unit: "m²" },
            { label: "Rollen of pakken", quantity: rolls, unit: "stuks", note: roll ? undefined : "Vul de inhoud per rol in" },
          ],
          steps: [`Netto ${formatM2(net)} × ${fmt(1 + extra / 100)} = ${formatM2(needed)}`],
          assumptions,
          missing,
          used: ctx.rooms.map(roomName),
        },
        { complete, unconfirmed: unconfirmed(ctx.rooms), packaged: rolls !== null },
      );
    },
  };
})();

const plinten: CategoryModule = {
  key: "plinten",
  label: "Plinten",
  group: "vloer",
  version: VERSION,
  date: DATE,
  paid: true,
  scope: "vloer",
  description: "Strekkende meters plint per wand, minus bevestigde deuropeningen, met marge en handelslengtes.",
  formula: "zie plintenberekening: omtrek − wanden zonder plint − bevestigde deuren, × (1 + marge)",
  inputs: [],
  compute(ctx) {
    const p = ctx.computed.plinths;
    const status: CategoryStatus =
      p.status === "missing"
        ? "niet_genoeg_gegevens"
        : p.status === "derived"
          ? p.piecesByTotal !== null
            ? "klaar_voor_bestellen"
            : "berekend"
          : "geschat";
    return {
      key: "plinten",
      status,
      lines: [
        { label: "Plinten inclusief marge", quantity: p.requiredMm === null ? null : p.requiredMm / 1000, unit: "m" },
        { label: "Plinten in handelslengtes", quantity: p.piecesByTotal, unit: "stuks" },
      ],
      steps: p.steps,
      assumptions: [],
      missing: p.status === "missing" ? ["Vorm van een of meer ruimtes"] : [],
      used: p.rooms.map((r) => r.name),
    };
  },
};

const profielen: CategoryModule = (() => {
  const inputs: InputSpec[] = [
    {
      key: "aantal",
      label: "Aantal overgangen",
      unit: "stuks",
      help: "Deuropeningen waar de vloer stopt of een andere vloer begint. Tel ze zelf; de tekening geeft een suggestie.",
      min: 0,
      max: 100,
      required: true,
    },
  ];
  return {
    key: "profielen",
    label: "Overgangsprofielen",
    group: "vloer",
    version: VERSION,
    date: DATE,
    paid: true,
    scope: "vloer",
    description: "Profielen bij deuren waar de vloer overgaat. Lengte per profiel: minstens de deurbreedte.",
    formula: "aantal = door jou bevestigd aantal overgangen",
    inputs,
    compute(ctx, values) {
      const assumptions: string[] = [];
      const missing: string[] = [];
      const read = reader(inputs, values, assumptions, missing);
      const count = read("aantal");
      return {
        key: "profielen",
        status: count === null ? "niet_genoeg_gegevens" : "berekend",
        lines: [{ label: "Overgangsprofielen", quantity: count, unit: "stuks", note: "Lengte per profiel: minstens de deurbreedte" }],
        steps: ctx.doorsOnPlan ? [`Op de tekening staan ${ctx.doorsOnPlan} deuropeningen; niet bij elke deur verandert de vloer.`] : [],
        assumptions,
        missing,
        used: [],
      };
    },
  };
})();

const HEIGHT: InputSpec = {
  key: "plafondhoogte",
  label: "Plafondhoogte",
  unit: "m",
  help: "Meet van vloer tot plafond. Een plattegrond van bovenaf laat de hoogte niet zien.",
  min: 1.5,
  max: 6,
  assumption: { value: 2.6, why: "veelvoorkomende hoogte in Nederlandse woningen; meet je eigen plafond" },
};

/** Wall area per room: perimeter × height. Rooms without an outline are listed as missing. */
function walls(rooms: RoomResult[], heightMm: number, missing: string[]) {
  let m2 = 0;
  for (const r of rooms) {
    if (r.geometry.perimeterMm === null) missing.push(`Vorm (omtrek) van ${roomName(r)}`);
    else m2 += (r.geometry.perimeterMm * heightMm) / 1e6;
  }
  return m2;
}

const verf: CategoryModule = (() => {
  const inputs: InputSpec[] = [
    HEIGHT,
    {
      key: "lagen",
      label: "Aantal lagen",
      unit: "×",
      help: "Meestal twee; bij een sterk kleurverschil soms drie.",
      min: 1,
      max: 5,
      assumption: { value: 2, why: "gebruikelijk advies voor muurverf" },
    },
    {
      key: "dekking",
      label: "Dekking",
      unit: "m²/L",
      help: "Staat op het blik of de productpagina, per laag.",
      min: 1,
      max: 30,
      assumption: { value: 8, why: "voorzichtige richtwaarde voor muurverf; kijk op je blik" },
    },
    {
      key: "openingen_m2",
      label: "Ramen en deuren aftrekken",
      unit: "m²",
      help: "Totale oppervlakte van ramen en deuren die je niet verft. Leeg of 0: niets afgetrokken (ruim gerekend).",
      min: 0,
      max: 500,
    },
    { key: "plafond", label: "Plafonds meeverven (1 = ja)", unit: "×", help: "Telt de vloeroppervlakte als plafond mee.", min: 0, max: 1 },
    { key: "blik_l", label: "Inhoud per blik", unit: "L", help: "Bijvoorbeeld 2,5 of 5 liter.", min: 0.1, max: 50 },
  ];
  return {
    key: "verf",
    label: "Muurverf",
    group: "wand",
    version: VERSION,
    date: DATE,
    paid: false,
    scope: "wand",
    description: "Liters muurverf voor de wanden (en desgewenst plafonds) van de gekozen ruimtes.",
    formula: "liters = (omtrek × plafondhoogte − openingen + plafonds) × lagen / dekking; blikken = ⌈liters / inhoud⌉",
    inputs,
    compute(ctx, values) {
      const assumptions: string[] = [];
      const missing: string[] = [];
      const read = reader(inputs, values, assumptions, missing);
      const h = read("plafondhoogte")! * 1000;
      const coats = Math.round(read("lagen")!);
      const cover = read("dekking")!;
      const openings = read("openingen_m2") ?? 0;
      const ceiling = read("plafond") === 1;
      const can = read("blik_l");
      const wallM2 = walls(ctx.rooms, h, missing);
      const ceilingM2 = ceiling ? floorArea(ctx.rooms, missing) : 0;
      const surface = Math.max(0, wallM2 - openings) + ceilingM2;
      const complete = ctx.rooms.length > 0 && missing.length === 0;
      const litres = (surface * coats) / cover;
      const cans = complete && can ? ceilSafe(litres / can) : null;
      const steps = [
        `Wanden: omtrek × ${fmt(h / 1000)} m = ${formatM2(wallM2)}`,
        openings ? `Min ramen en deuren: ${formatM2(openings)}` : "Ramen en deuren niet afgetrokken: aan de ruime kant.",
        ...(ceiling ? [`Plus plafonds: ${formatM2(ceilingM2)}`] : []),
        `${formatM2(surface)} × ${coats} ${coats === 1 ? "laag" : "lagen"} / ${fmt(cover, 1)} m² per liter = ${fmt(litres, 1)} liter`,
      ];
      if (cans !== null) steps.push(`Blikken: ⌈${fmt(litres, 1)} / ${fmt(can!, 1)}⌉ = ${cans}`);
      return finish(
        "verf",
        {
          lines: [
            { label: "Te verven oppervlak", quantity: complete ? surface : null, unit: "m²" },
            { label: "Muurverf", quantity: complete ? litres : null, unit: "liter" },
            { label: "Blikken", quantity: cans, unit: "stuks", note: can ? undefined : "Vul de inhoud per blik in" },
          ],
          steps,
          assumptions,
          missing,
          used: ctx.rooms.map(roomName),
        },
        { complete, unconfirmed: unconfirmed(ctx.rooms), packaged: cans !== null },
      );
    },
  };
})();

const primer: CategoryModule = (() => {
  const inputs: InputSpec[] = [
    HEIGHT,
    {
      key: "dekking",
      label: "Dekking primer",
      unit: "m²/L",
      help: "Staat op het blik; zuigende ondergronden nemen meer op.",
      min: 1,
      max: 30,
      assumption: { value: 10, why: "richtwaarde; kijk op je blik" },
    },
    { key: "blik_l", label: "Inhoud per blik", unit: "L", help: "Bijvoorbeeld 2,5 liter.", min: 0.1, max: 50 },
  ];
  return {
    key: "primer",
    label: "Primer / voorstrijk",
    group: "wand",
    version: VERSION,
    date: DATE,
    paid: true,
    scope: "wand",
    description: "Eén laag primer op de wanden van de gekozen ruimtes (nieuw stucwerk, sterk zuigende of donkere ondergrond).",
    formula: "liters = omtrek × plafondhoogte / dekking; blikken = ⌈liters / inhoud⌉",
    inputs,
    compute(ctx, values) {
      const assumptions: string[] = [];
      const missing: string[] = [];
      const read = reader(inputs, values, assumptions, missing);
      const h = read("plafondhoogte")! * 1000;
      const cover = read("dekking")!;
      const can = read("blik_l");
      const wallM2 = walls(ctx.rooms, h, missing);
      const complete = ctx.rooms.length > 0 && missing.length === 0;
      const litres = wallM2 / cover;
      const cans = complete && can ? ceilSafe(litres / can) : null;
      return finish(
        "primer",
        {
          lines: [
            { label: "Primer", quantity: complete ? litres : null, unit: "liter" },
            { label: "Blikken", quantity: cans, unit: "stuks", note: can ? undefined : "Vul de inhoud per blik in" },
          ],
          steps: [`${formatM2(wallM2)} / ${fmt(cover, 1)} m² per liter = ${fmt(litres, 1)} liter (ramen en deuren niet afgetrokken)`],
          assumptions,
          missing,
          used: ctx.rooms.map(roomName),
        },
        { complete, unconfirmed: unconfirmed(ctx.rooms), packaged: cans !== null },
      );
    },
  };
})();

const behang: CategoryModule = (() => {
  const inputs: InputSpec[] = [
    HEIGHT,
    {
      key: "rol_breedte",
      label: "Rolbreedte",
      unit: "m",
      help: "Staat op het etiket.",
      min: 0.3,
      max: 2,
      assumption: { value: 0.53, why: "gangbare rolbreedte; kijk op het etiket" },
    },
    {
      key: "rol_lengte",
      label: "Rollengte",
      unit: "m",
      help: "Staat op het etiket.",
      min: 2,
      max: 50,
      assumption: { value: 10.05, why: "gangbare rollengte; kijk op het etiket" },
    },
    {
      key: "rapport",
      label: "Patroonrapport",
      unit: "cm",
      help: "Herhaling van het patroon; 0 bij behang zonder patroon.",
      min: 0,
      max: 200,
      assumption: { value: 0, why: "geen patroon aangenomen" },
    },
    {
      key: "snijmarge",
      label: "Snijmarge per baan",
      unit: "cm",
      help: "Extra boven en onder om recht af te snijden.",
      min: 0,
      max: 50,
      assumption: { value: 10, why: "5 cm boven en onder" },
    },
  ];
  return {
    key: "behang",
    label: "Behang",
    group: "wand",
    version: VERSION,
    date: DATE,
    paid: true,
    scope: "wand",
    description: "Rollen behang voor de wanden van de gekozen ruimtes, met patroonrapport en snijmarge.",
    formula:
      "banen per rol = ⌊rollengte / (hoogte + rapport + snijmarge)⌋; banen = Σ ⌈omtrek / rolbreedte⌉; rollen = ⌈banen / banen per rol⌉",
    inputs,
    compute(ctx, values) {
      const assumptions: string[] = [];
      const missing: string[] = [];
      const read = reader(inputs, values, assumptions, missing);
      const h = read("plafondhoogte")! * 1000;
      const width = read("rol_breedte")! * 1000;
      const length = read("rol_lengte")! * 1000;
      const repeat = read("rapport")! * 10;
      const trim = read("snijmarge")! * 10;
      let strips = 0;
      for (const r of ctx.rooms) {
        if (r.geometry.perimeterMm === null) missing.push(`Vorm (omtrek) van ${roomName(r)}`);
        else strips += Math.ceil(r.geometry.perimeterMm / width);
      }
      const perRoll = Math.floor(length / (h + repeat + trim));
      const complete = ctx.rooms.length > 0 && missing.length === 0 && perRoll > 0;
      const rolls = complete ? ceilSafe(strips / perRoll) : null;
      if (perRoll <= 0) missing.push("Een rollengte die langer is dan de wandhoogte");
      return finish(
        "behang",
        {
          lines: [
            { label: "Banen", quantity: complete ? strips : null, unit: "stuks" },
            {
              label: "Rollen behang",
              quantity: rolls,
              unit: "rollen",
              note: "Ramen en deuren niet afgetrokken; houd voor patroonbehang één rol extra uit dezelfde partij aan",
            },
          ],
          steps: [
            `Banen per rol: ⌊${fmt(length / 1000)} m / (${fmt(h / 1000)} + ${fmt(repeat / 1000)} + ${fmt(trim / 1000)} m)⌋ = ${perRoll}`,
          ],
          assumptions,
          missing,
          used: ctx.rooms.map(roomName),
        },
        // Wallpaper is sold per roll: with the label values entered, the number of rolls is the order.
        { complete, unconfirmed: unconfirmed(ctx.rooms), packaged: true },
      );
    },
  };
})();

/** Category status of one window: its measurements first, then the order size from its rule. */
function windowStatus(w: WindowResult): CategoryStatus {
  if (w.evaluation.status === "nog-meten") return "niet_genoeg_gegevens";
  if (w.evaluation.status === "afwijking") return "extra_controle_nodig";
  const map: Record<OrderStatus, CategoryStatus> = {
    order_ready: "klaar_voor_bestellen",
    rule_not_verified: "wacht_op_controle",
    measurement_not_accepted: "wacht_op_controle",
    measuring_sheet: "wacht_op_controle",
    needs_more_data: "niet_genoeg_gegevens",
    needs_verification: "extra_controle_nodig",
    not_suitable: "extra_controle_nodig",
    unsupported: "extra_controle_nodig",
  };
  return map[w.order.status];
}

const ORDER: CategoryStatus[] = [
  "niet_genoeg_gegevens",
  "extra_controle_nodig",
  "geschat",
  "wacht_op_controle",
  "berekend",
  "klaar_voor_bestellen",
];
/** The least advanced status of several windows decides the category. */
export const worstStatus = (statuses: CategoryStatus[]) =>
  statuses.reduce<CategoryStatus>((w, s) => (ORDER.indexOf(s) < ORDER.indexOf(w) ? s : w), "klaar_voor_bestellen");

function windowModule(key: CategoryKey, label: string, family: ProductFamily, extra?: (w: WindowResult) => CategoryLine[]): CategoryModule {
  return {
    key,
    label,
    group: "raam",
    version: VERSION,
    date: DATE,
    paid: true,
    scope: "raam",
    description: `${label} per raam uit het raamregister, met meetstatus. Een bestelmaat alleen met een gecontroleerde leveranciersregel.`,
    formula: "per raam: gemeten maten (geen gemiddelde); bestelmaat = regel van de leverancier, anders open",
    inputs: [],
    compute(ctx) {
      const windows = ctx.windows.filter((w) => w.window.product === family);
      const statuses = windows.map((w) =>
        family === "rolluik" && w.evaluation.status !== "nog-meten" ? "extra_controle_nodig" : windowStatus(w),
      );
      const lines: CategoryLine[] = windows.flatMap((w) => [
        {
          label: `${w.window.code}${w.roomName ? ` · ${w.roomName}` : ""}`,
          quantity: 1,
          unit: "stuk",
          note: w.evaluation.status === "nog-meten" ? "Nog meten" : orderSummary(w.order),
        },
        ...(extra?.(w) ?? []),
      ]);
      return {
        key,
        status: windows.length ? worstStatus(statuses) : "niet_genoeg_gegevens",
        lines,
        steps: windows.length ? [] : [`Kies in het raamregister bij een raam het product "${label.toLowerCase()}".`],
        assumptions: [],
        missing: windows.filter((w) => w.evaluation.status === "nog-meten").map((w) => `Maten van ${w.window.code}`),
        used: windows.map((w) => w.window.code),
      };
    },
  };
}

const minOf = (w: WindowResult, keys: string[]) => {
  const vals = keys.map((k) => w.window.measures[k as keyof typeof w.window.measures]).filter((v): v is number => typeof v === "number");
  return vals.length ? Math.min(...vals) : null;
};

const gordijnen = windowModule("gordijnen", "Gordijnen", "gordijn", (w) => {
  const rail = w.window.measures.rail_breedte ?? null;
  const drop = minOf(w, ["ophanghoogte_links", "ophanghoogte_midden", "ophanghoogte_rechts"]);
  const out: CategoryLine[] = [{ label: `${w.window.code} rail of roede`, quantity: rail === null ? null : rail / 1000, unit: "m" }];
  if (rail !== null && w.window.fullness)
    out.push({
      label: `${w.window.code} stofbreedte (× ${fmt(w.window.fullness, 1)} volheid)`,
      quantity: (rail * w.window.fullness) / 1000,
      unit: "m",
      note: "Totaal, verdeeld over de banen",
    });
  if (drop !== null)
    out.push({
      label: `${w.window.code} kleinste ophanghoogte`,
      quantity: drop / 1000,
      unit: "m",
      note: "Afgewerkte lengte volgens band en runners: met je leverancier",
    });
  return out;
});

export const CATALOG: CategoryModule[] = [
  floorModule("laminaat", "Laminaat"),
  floorModule("pvc", "PVC-/vinylvloer"),
  tegels,
  ondervloer,
  plinten,
  profielen,
  verf,
  primer,
  behang,
  gordijnen,
  windowModule("rolgordijnen", "Rolgordijnen", "rolgordijn"),
  windowModule("jaloezieen", "Jaloezieën", "jaloezie"),
  windowModule("plisse", "Plissés", "plisse"),
  windowModule("vouwgordijnen", "Vouwgordijnen", "vouwgordijn"),
  windowModule("rolluiken", "Rolluiken", "rolluik"),
];

export const moduleByKey = (key: CategoryKey) => CATALOG.find((m) => m.key === key)!;

/** Rooms a category uses unless the user changed the selection: floors where floor counts, walls where plinths do. */
export function defaultRoomsFor(module: CategoryModule, rooms: readonly Room[]) {
  if (module.scope === "raam") return [];
  return rooms.filter((r) => (module.scope === "vloer" ? r.includeFloor : r.includePlinth)).map((r) => r.id);
}

export function computeCategory(
  module: CategoryModule,
  computed: ProjectComputation,
  opts: { roomIds: readonly string[] | null; inputs: CategoryInputs; doorsOnPlan: number },
): CategoryResult {
  const ids =
    opts.roomIds ??
    defaultRoomsFor(
      module,
      computed.rooms.map((r) => r.room),
    );
  return module.compute(
    { computed, rooms: computed.rooms.filter((r) => ids.includes(r.room.id)), windows: computed.windows, doorsOnPlan: opts.doorsOnPlan },
    opts.inputs,
  );
}
