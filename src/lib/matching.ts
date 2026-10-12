import type { Gender, Intent } from "./config";

export type Candidate = {
  id: string;
  age: number;
  gender: Gender;
  lookingFor: Gender[];
  ageMin: number;
  ageMax: number;
  region: string;
  intent: Intent;
};

/** Someone who wants a relationship and someone still figuring it out rarely make a good first call. */
export function intentsCompatible(a: Intent, b: Intent) {
  const far = new Set(["relatie:ontdekken", "ontdekken:relatie"]);
  return !far.has(`${a}:${b}`);
}

function wants(a: Candidate, b: Candidate) {
  return a.lookingFor.includes(b.gender) && b.age >= a.ageMin && b.age <= a.ageMax;
}

/** Mutual preferences, same region and compatible intent. */
export function compatible(a: Candidate, b: Candidate) {
  return a.id !== b.id && a.region === b.region && wants(a, b) && wants(b, a) && intentsCompatible(a.intent, b.intent);
}

export function score(a: Candidate, b: Candidate) {
  let s = 0;
  if (a.intent === b.intent) s += 2;
  const gap = Math.abs(a.age - b.age);
  if (gap <= 3) s += 2;
  else if (gap <= 7) s += 1;
  return s;
}

export function pairKey(a: string, b: string) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Greedy one-to-one pairing for a kennismakingsavond. People with the fewest
 * options go first so nobody easy to match takes the only partner of someone
 * hard to match. The organiser still approves every pair.
 */
export function suggestPairs(candidates: Candidate[], excluded: Set<string> = new Set()) {
  const options = new Map<string, Candidate[]>();
  for (const a of candidates) {
    options.set(
      a.id,
      candidates.filter((b) => compatible(a, b) && !excluded.has(pairKey(a.id, b.id))),
    );
  }
  const order = [...candidates].sort((a, b) => options.get(a.id)!.length - options.get(b.id)!.length || a.id.localeCompare(b.id));
  const taken = new Set<string>();
  const pairs: [Candidate, Candidate][] = [];
  for (const a of order) {
    if (taken.has(a.id)) continue;
    const best = options
      .get(a.id)!
      .filter((b) => !taken.has(b.id))
      .sort((x, y) => score(a, y) - score(a, x) || options.get(x.id)!.length - options.get(y.id)!.length)[0];
    if (!best) continue;
    taken.add(a.id).add(best.id);
    pairs.push([a, best]);
  }
  return pairs;
}
