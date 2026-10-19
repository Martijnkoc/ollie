import "server-only";
import { z } from "zod";
import { MAX_TRANSFER_CHARS } from "./config";

/** Request shapes for the transfer routes. Tokens arrive in headers, never in the URL. */
export const sealedSchema = z.object({
  iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
  data: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .max(MAX_TRANSFER_CHARS),
});
export const createSchema = z.object({
  payload: sealedSchema,
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  returnHash: z.string().regex(/^[0-9a-f]{64}$/),
});
export const ID = /^[A-Za-z0-9_-]{16,40}$/;
export const TOKEN = /^[A-Za-z0-9_-]{20,60}$/;

export async function sha256(text: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text).digest("hex");
}

export async function readJson(req: Request, max = MAX_TRANSFER_CHARS + 2000): Promise<unknown | null> {
  const text = await req.text();
  if (text.length > max) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
