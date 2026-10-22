import { handleWebhook } from "@/lib/billing/stripe";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  const raw = await req.text();
  const result = await handleWebhook(await getDb(), raw, req.headers.get("stripe-signature"));
  return Response.json(result.body, { status: result.status });
}
