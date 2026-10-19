import { computeFloor } from "@/lib/materials/floor";

/**
 * The fictional example home shown on the landing page. It is the same apartment as fixtures/appartement.pdf
 * (12 × 8 m). The numbers on the page are computed with the real calculation code, not typed in.
 */
export type ExampleRoom = { name: string; areaM2: number; included: boolean; poly: [number, number][]; label: [number, number] };

export const EXAMPLE_ROOMS: ExampleRoom[] = [
  {
    name: "Woonkamer",
    areaM2: 40.5,
    included: true,
    poly: [
      [0, 0],
      [6000, 0],
      [6000, 8000],
      [2500, 8000],
      [2500, 5000],
      [0, 5000],
    ],
    label: [2600, 2500],
  },
  {
    name: "Werkkamer",
    areaM2: 7.5,
    included: true,
    poly: [
      [0, 5000],
      [2500, 5000],
      [2500, 8000],
      [0, 8000],
    ],
    label: [1050, 6500],
  },
  {
    name: "Keuken",
    areaM2: 9,
    included: true,
    poly: [
      [6000, 0],
      [9000, 0],
      [9000, 3000],
      [6000, 3000],
    ],
    label: [7250, 1500],
  },
  {
    name: "Hal",
    areaM2: 6,
    included: true,
    poly: [
      [6000, 3000],
      [9000, 3000],
      [9000, 5000],
      [6000, 5000],
    ],
    label: [7250, 4000],
  },
  {
    name: "Slaapkamer 1",
    areaM2: 12.6,
    included: true,
    poly: [
      [9000, 0],
      [12000, 0],
      [12000, 4200],
      [9000, 4200],
    ],
    label: [10050, 2100],
  },
  {
    name: "Slaapkamer 2",
    areaM2: 11.4,
    included: true,
    poly: [
      [9000, 4200],
      [12000, 4200],
      [12000, 8000],
      [9000, 8000],
    ],
    label: [10050, 6100],
  },
  {
    name: "Badkamer",
    areaM2: 6,
    included: false,
    poly: [
      [6000, 5000],
      [8000, 5000],
      [8000, 8000],
      [6000, 8000],
    ],
    label: [6950, 6500],
  },
  {
    name: "Toilet",
    areaM2: 1.5,
    included: false,
    poly: [
      [8000, 5000],
      [9000, 5000],
      [9000, 6500],
      [8000, 6500],
    ],
    label: [8500, 5750],
  },
  {
    name: "Berging",
    areaM2: 1.5,
    included: false,
    poly: [
      [8000, 6500],
      [9000, 6500],
      [9000, 8000],
      [8000, 8000],
    ],
    label: [8500, 7250],
  },
];

export const EXAMPLE_WINDOWS: { code: string; at: [number, number] }[] = [
  { code: "R01", at: [2900, 0] },
  { code: "R02", at: [7600, 0] },
  { code: "R03", at: [10500, 0] },
  { code: "R04", at: [12000, 6200] },
  { code: "R05", at: [4300, 8000] },
];

export const EXAMPLE_WASTE = 7;
export const EXAMPLE_PACK_M2 = 2.131;

export function exampleFloor() {
  return computeFloor(
    EXAMPLE_ROOMS.map((r) => ({
      id: r.name,
      name: r.name,
      included: r.included,
      areaMm2: r.areaM2 * 1_000_000,
      status: "derived" as const,
    })),
    { wastePercent: EXAMPLE_WASTE, packM2: EXAMPLE_PACK_M2 },
  );
}
