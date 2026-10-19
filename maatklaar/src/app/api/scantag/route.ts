import { paymentDeps } from "@/lib/payments/runtime";
import { orderStatusForBuyer } from "@/lib/payments/service";
import { processShots, scanRequestSchema } from "@/lib/scantag/process";
import { clientKey, json, logError, sameOrigin } from "@/lib/server/http";
import { allow } from "@/lib/server/ratelimit";

/**
 * ScanTag: checks scan geometry and releases window measurements only for a paid order, verified with the
 * payment provider on the server. Unpaid, unknown or mismatched orders get statuses without any size.
 * Nothing is stored and nothing of the request is logged.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Niet toegestaan." }, 403);
  if (!allow("scantag", clientKey(req))) return json({ error: "Even rustig aan; probeer het zo opnieuw." }, 429);
  const text = await req.text();
  if (text.length > 300_000) return json({ error: "Te veel gegevens in één keer." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Ongeldige aanvraag." }, 400);
  }
  const parsed = scanRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Ongeldige aanvraag." }, 400);
  const { order, projectRef, shots } = parsed.data;

  let released = false;
  if (order) {
    try {
      const status = await orderStatusForBuyer(order.id, order.secret, await paymentDeps());
      // The order must be paid and belong to this project: one payment unlocks one home.
      released = status.status === "paid" && status.projectRef === projectRef;
    } catch (err) {
      // Unknown order or wrong secret: answered like an unpaid scan, without telling which.
      if (!(err instanceof Error && "status" in err)) logError("scantag/betaling", err);
    }
  }
  return json({ released, shots: processShots(shots, released) });
}
