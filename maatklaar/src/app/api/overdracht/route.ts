import { randomBytes } from "node:crypto";
import { RETURN_TTL_MS, TRANSFER_TTL_MS } from "@/lib/transfer/config";
import { createSchema, readJson } from "@/lib/transfer/http";
import { transferStore } from "@/lib/transfer/runtime";
import { clientKey, json, logError, sameOrigin } from "@/lib/server/http";
import { allow } from "@/lib/server/ratelimit";

/**
 * Starts a transfer between devices. The browser sends an encrypted project and the hashes of two tokens it
 * made itself; the server never sees the key or the tokens and keeps the ciphertext for minutes, not days.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Niet toegestaan." }, 403);
  if (!allow("overdracht", clientKey(req))) return json({ error: "Even rustig aan; probeer het zo opnieuw." }, 429);
  const store = await transferStore();
  if (!store) return json({ error: "Verder op een ander apparaat is hier nog niet beschikbaar." }, 503);
  const parsed = createSchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "Ongeldige aanvraag." }, 400);
  const now = Date.now();
  const id = randomBytes(18).toString("base64url");
  try {
    await store.create({
      id,
      tokenHash: parsed.data.tokenHash,
      returnHash: parsed.data.returnHash,
      payload: JSON.stringify(parsed.data.payload),
      expiresAt: now + TRANSFER_TTL_MS,
      returnExpiresAt: now + RETURN_TTL_MS,
      consumed: false,
      back: null,
    });
  } catch (err) {
    logError("overdracht/maken", err);
    return json({ error: "De overdracht kon niet worden gestart." }, 500);
  }
  return json({
    id,
    expiresAt: new Date(now + TRANSFER_TTL_MS).toISOString(),
    returnExpiresAt: new Date(now + RETURN_TTL_MS).toISOString(),
  });
}
