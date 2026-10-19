import type { OrderStore } from "./store";
import type { CreatePaymentInput, PaymentProvider, ProviderPayment } from "./types";
import { PaymentError } from "./types";

/**
 * DEMO provider for local development and protected previews without payment credentials. No money moves.
 * Orders made with it carry mode "demo"; the interface and the report always say so, and it is refused in
 * production unless ALLOW_DEMO_PAYMENTS=true is set explicitly.
 */
export class DemoProvider implements PaymentProvider {
  readonly name = "demo" as const;
  constructor(private readonly store: OrderStore) {}

  async createPayment(input: CreatePaymentInput) {
    const providerPaymentId = `demo_${input.orderId.slice(4)}`;
    await this.store.setDemo(providerPaymentId, "open");
    // The secret travels in the fragment: browsers do not send it to the server or in Referer headers.
    return { providerPaymentId, checkoutUrl: `/betaling/demo?order=${encodeURIComponent(input.orderId)}#${input.orderSecret}`, mode: "demo" as const };
  }

  async getPayment(id: string): Promise<ProviderPayment> {
    const status = await this.store.getDemo(id);
    if (!status) throw new PaymentError(404, "Demo-betaling niet gevonden.");
    const order = await this.store.findByPaymentId(id);
    return {
      id,
      status: status === "paid" ? "paid" : status === "canceled" ? "canceled" : "open",
      amountCents: order?.amountCents ?? 0,
      currency: order?.currency ?? "EUR",
      refundedCents: 0,
      chargedBackCents: 0,
      mode: "demo",
      orderId: order?.id ?? null,
      paidAt: status === "paid" ? new Date().toISOString() : null,
    };
  }
}
