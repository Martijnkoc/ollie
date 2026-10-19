import path from "node:path";

type Env = Record<string, string | undefined>;

export type TransferStoreConfig = { kind: "postgres"; url: string } | { kind: "file"; file: string } | { kind: "missing"; reason: string };

/** Where transfers are kept: Postgres in production; a file only locally or on one server with a persistent disk. */
export function transferStoreConfig(env: Env = process.env): TransferStoreConfig {
  if (env.DATABASE_URL?.trim()) return { kind: "postgres", url: env.DATABASE_URL.trim() };
  if (env.NODE_ENV === "production" && env.ALLOW_FILE_TRANSFER_STORE !== "true")
    return {
      kind: "missing",
      reason: "Er is geen database ingesteld (DATABASE_URL); zonder die kan een overdracht tussen apparaten niet veilig.",
    };
  return { kind: "file", file: env.TRANSFERS_FILE?.trim() || path.join(process.cwd(), ".data", "transfers.json") };
}

/** Lifetimes: the QR code is short-lived and one-time; the way back stays open while you scan. */
export const TRANSFER_TTL_MS = 10 * 60_000;
export const RETURN_TTL_MS = 2 * 60 * 60_000;
/** Largest encrypted project we accept, in characters. */
export const MAX_TRANSFER_CHARS = 900_000;
