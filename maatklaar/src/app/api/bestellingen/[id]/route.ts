import { paymentDeps } from "@/lib/payments/runtime";
import { orderStatusForBuyer } from "@/lib/payments/service";
import { PaymentError } from "@/lib/payments/types";
import { clientKey, json, logError } from "@/lib/server/http";
import { allow } from "@/lib/server/ratelimit";

/**
 * Payment status, verified with the provider. Only the browser holding the order secret gets an answer.
 * Query parameters on the return URL (status=paid or anything else) are never looked at.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/bestellingen/[id]">) {
  if (!allow("bestellingStatus", clientKey(req))) return json({ error: "Even rustig aan; probeer het zo opnieuw." }, 429);
  const { id } = await ctx.params;
  const secret = req.headers.get("x-order-secret") ?? "";
  try {
    const deps = await paymentDeps();
    return json(await orderStatusForBuyer(id, secret, deps));
  } catch (err) {
    if (err instanceof PaymentError) return json({ error: err.message }, err.status);
    logError("bestellingen/status", err);
    return json({ error: "Er ging iets mis bij het controleren van de betaling." }, 500);
  }
}
