import { MOLLIE_PAYMENT_ID } from "@/lib/payments/mollie";
import { paymentDeps } from "@/lib/payments/runtime";
import { handleWebhook } from "@/lib/payments/service";
import { PaymentError } from "@/lib/payments/types";
import { logError } from "@/lib/server/http";

/**
 * Mollie webhook. Mollie posts only `id=tr_…`; we never trust the call itself but fetch the payment from the
 * Mollie API and apply that status. Repeated or out-of-order calls are harmless (see payments/status.ts).
 * 200 tells Mollie to stop; a 5xx makes Mollie retry later.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const id = form?.get("id");
  if (typeof id !== "string" || !MOLLIE_PAYMENT_ID.test(id)) return new Response(null, { status: 400 });
  try {
    const deps = await paymentDeps();
    if (deps.provider.name !== "mollie") return new Response(null, { status: 404 });
    await handleWebhook(id, deps);
    return new Response(null, { status: 200 });
  } catch (err) {
    if (err instanceof PaymentError && err.status < 500) return new Response(null, { status: 200 });
    logError("webhook", err);
    return new Response(null, { status: 503 });
  }
}
