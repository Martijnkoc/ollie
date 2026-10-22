import { getDb } from "@/lib/db";
import { orderMail } from "@/lib/notify";
import { handleWebhook } from "@/lib/payments";

/** Stripe → us. Payment state changes only here, after the signature has been verified. */
export async function POST(req: Request) {
  const raw = await req.text();
  const result = await handleWebhook(await getDb(), raw, req.headers.get("stripe-signature"));
  const outcome = String(result.body.outcome ?? "");
  if (outcome.startsWith("paid:")) await orderMail(outcome.slice(5), "paid").catch(() => undefined);
  return Response.json(result.body, { status: result.status });
}
