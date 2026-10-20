/** The guides (gidsen): one page per question people actually search for. Content lives in ./guides.ts. */
export const GUIDE_INDEX = [
  { slug: "vloeroppervlakte-berekenen", nav: "Vloeroppervlakte berekenen", group: "vloer" },
  { slug: "laminaat-berekenen", nav: "Laminaat berekenen", group: "vloer" },
  { slug: "ondervloer-berekenen", nav: "Ondervloer berekenen", group: "vloer" },
  { slug: "tegels-berekenen", nav: "Tegels berekenen", group: "vloer" },
  { slug: "plinten-berekenen", nav: "Plinten berekenen", group: "vloer" },
  { slug: "verf-berekenen", nav: "Verf berekenen", group: "wand" },
  { slug: "raamdecoratie-meten", nav: "Raamdecoratie meten", group: "raam" },
  { slug: "gordijnen-meten", nav: "Gordijnen meten", group: "raam" },
  { slug: "jaloezieen-meten", nav: "Jaloezieën meten", group: "raam" },
  { slug: "plisse-meten", nav: "Plissé meten", group: "raam" },
  { slug: "rolluik-meten", nav: "Rolluik meten", group: "raam" },
] as const;

export type GuideSlug = (typeof GUIDE_INDEX)[number]["slug"];
export const GUIDE_GROUPS = { vloer: "Vloer en plinten", wand: "Wanden", raam: "Ramen en raamdecoratie" } as const;
