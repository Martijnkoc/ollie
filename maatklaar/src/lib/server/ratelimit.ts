import "server-only";

/**
 * In-memory sliding-window limiter per key. Best effort: on serverless hosting every instance has its own
 * memory, so this slows down abuse rather than enforcing an exact global limit.
 */
const hits = new Map<string, number[]>();

export const RATE_LIMITS = {
  adresZoek: { max: 60, windowMs: 60_000 },
  adresDetail: { max: 30, windowMs: 60_000 },
  woning: { max: 20, windowMs: 60_000 },
  bestelling: { max: 10, windowMs: 60_000 },
  bestellingStatus: { max: 60, windowMs: 60_000 },
} as const;

export function allow(bucket: keyof typeof RATE_LIMITS, key: string, now = Date.now()) {
  const { max, windowMs } = RATE_LIMITS[bucket];
  const id = `${bucket}:${key}`;
  const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(id, recent);
    return false;
  }
  recent.push(now);
  hits.set(id, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}

export function resetRateLimits() {
  hits.clear();
}
