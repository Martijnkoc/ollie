import { z } from "zod";
import { PaymentError, type CreatePaymentInput, type PaymentProvider, type ProviderPayment } from "./types";

/**
 * Mollie Payments API v2 over plain fetch: POST /payments to start a one-off payment, GET /payments/{id} to
 * verify it. Field names as in Mollie's API reference (and its official Node client). No SDK dependency.
 */
const amount = z.object({ currency: z.string(), value: z.string().regex(/^\d+\.\d{2}$/) });
const payment = z.object({
  id: z.string().regex(/^tr_[A-Za-z0-9]+$/),
  mode: z.enum(["live", "test"]),
  status: z.enum(["open", "pending", "authorized", "paid", "failed", "canceled", "expired"]),
  amount,
  amountRefunded: amount.optional(),
  amountChargedBack: amount.optional(),
  metadata: z.unknown().optional(),
  paidAt: z.string().optional(),
  sequenceType: z.string().optional(),
  _links: z.object({ checkout: z.object({ href: z.url() }).optional() }).optional(),
});

/** "8.99" → 899, without floating point. */
export function valueToCents(value: string) {
  const [euros, cents] = value.split(".");
  return Number(euros) * 100 + Number(cents);
}

export function centsToValue(cents: number) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export const MOLLIE_PAYMENT_ID = /^tr_[A-Za-z0-9]{4,64}$/;

export class MollieProvider implements PaymentProvider {
  readonly name = "mollie" as const;

  constructor(
    private readonly apiKey: string,
    private readonly apiUrl = "https://api.mollie.com/v2",
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  private async request(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.apiUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/hal+json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
    } catch {
      throw new PaymentError(503, "De betaalprovider is nu niet bereikbaar. Probeer het zo opnieuw.");
    }
    if (res.status === 401) throw new PaymentError(503, "Betalen is niet goed ingesteld (sleutel geweigerd).");
    if (res.status === 404) throw new PaymentError(404, "Betaling niet gevonden bij de betaalprovider.");
    if (!res.ok) throw new PaymentError(502, "De betaalprovider gaf een fout. Probeer het zo opnieuw.");
    const parsed = payment.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new PaymentError(502, "Onverwacht antwoord van de betaalprovider.");
    return parsed.data;
  }

  async createPayment(input: CreatePaymentInput) {
    const body = {
      amount: { currency: input.currency, value: centsToValue(input.amountCents) },
      description: input.description.slice(0, 255),
      redirectUrl: input.redirectUrl,
      cancelUrl: input.redirectUrl,
      ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
      metadata: { orderId: input.orderId },
      locale: "nl_NL",
      sequenceType: "oneoff",
    };
    const p = await this.request("/payments", { method: "POST", body: JSON.stringify(body), idempotencyKey: input.orderId });
    const checkoutUrl = p._links?.checkout?.href;
    if (!checkoutUrl) throw new PaymentError(502, "De betaalprovider gaf geen betaalpagina terug.");
    return { providerPaymentId: p.id, checkoutUrl, mode: p.mode };
  }

  async getPayment(id: string): Promise<ProviderPayment> {
    if (!MOLLIE_PAYMENT_ID.test(id)) throw new PaymentError(400, "Ongeldige betaling.");
    const p = await this.request(`/payments/${id}`);
    const meta = p.metadata && typeof p.metadata === "object" ? (p.metadata as Record<string, unknown>) : {};
    return {
      id: p.id,
      status: p.status,
      amountCents: valueToCents(p.amount.value),
      currency: p.amount.currency,
      refundedCents: p.amountRefunded ? valueToCents(p.amountRefunded.value) : 0,
      chargedBackCents: p.amountChargedBack ? valueToCents(p.amountChargedBack.value) : 0,
      mode: p.mode,
      orderId: typeof meta.orderId === "string" ? meta.orderId : null,
      paidAt: p.paidAt ?? null,
    };
  }
}
