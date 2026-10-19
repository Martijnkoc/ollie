import { z } from "zod";
import { appUrl, webhookUrlFor } from "@/lib/payments/config";
import { paymentDeps } from "@/lib/payments/runtime";
import { createOrder } from "@/lib/payments/service";
import { PaymentError } from "@/lib/payments/types";
import { clientKey, json, logError, sameOrigin } from "@/lib/server/http";
import { allow } from "@/lib/server/ratelimit";

const body = z.object({ projectRef: z.string().regex(/^[a-z0-9]{12,40}$/) });

/** Starts the one-off payment for one project. The amount comes from the server configuration. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Niet toegestaan." }, 403);
  if (!allow("bestelling", clientKey(req))) return json({ error: "Even rustig aan; probeer het over een minuut opnieuw." }, 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Ongeldige aanvraag." }, 400);
  try {
    const deps = await paymentDeps();
    const base = appUrl(req);
    const webhookUrl = deps.provider.name === "mollie" ? webhookUrlFor(base) : null;
    const result = await createOrder(parsed.data.projectRef, { redirectBase: base, webhookUrl }, deps);
    return json(result, 201);
  } catch (err) {
    if (err instanceof PaymentError) return json({ error: err.message }, err.status);
    logError("bestellingen", err);
    return json({ error: "Er ging iets mis bij het starten van de betaling." }, 500);
  }
}
