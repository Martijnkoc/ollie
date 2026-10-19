import { z } from "zod";
import { paymentDeps } from "@/lib/payments/runtime";
import { simulateDemoPayment } from "@/lib/payments/service";
import { PaymentError } from "@/lib/payments/types";
import { json, logError, sameOrigin } from "@/lib/server/http";

const body = z.object({ orderId: z.string().max(40), secret: z.string().max(100), outcome: z.enum(["paid", "canceled"]) });

/** DEMO mode only: completes the simulated checkout. Refused when a real provider is configured. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Niet toegestaan." }, 403);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Ongeldige aanvraag." }, 400);
  try {
    const deps = await paymentDeps();
    const order = await simulateDemoPayment(parsed.data.orderId, parsed.data.secret, parsed.data.outcome, deps);
    return json({ status: order.status, mode: order.mode });
  } catch (err) {
    if (err instanceof PaymentError) return json({ error: err.message }, err.status);
    logError("demo/betalingen", err);
    return json({ error: "Er ging iets mis." }, 500);
  }
}
