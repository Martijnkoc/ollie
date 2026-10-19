/** Payment status of an order as we store it. "refunded" also covers chargebacks: access is withdrawn. */
export type OrderStatus = "created" | "open" | "pending" | "paid" | "failed" | "canceled" | "expired" | "refunded";

export type PaymentMode = "live" | "test" | "demo";

/**
 * Everything we keep on the server about a purchase. Deliberately no address, name, e-mail, file or room
 * data: only what is needed to verify a payment and unlock one project.
 */
export type Order = {
  id: string;
  /** SHA-256 of the order secret that only the buyer's browser holds. */
  secretHash: string;
  /** Random reference of the local project; links the unlock to that project. */
  projectRef: string;
  amountCents: number;
  currency: string;
  provider: "mollie" | "demo";
  providerPaymentId: string | null;
  status: OrderStatus;
  mode: PaymentMode;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

export type ProviderPayment = {
  id: string;
  status: "open" | "pending" | "authorized" | "paid" | "failed" | "canceled" | "expired";
  amountCents: number;
  currency: string;
  refundedCents: number;
  chargedBackCents: number;
  mode: PaymentMode;
  /** Our order id as echoed back by the provider (metadata). */
  orderId: string | null;
  paidAt: string | null;
};

export type CreatePaymentInput = {
  orderId: string;
  orderSecret: string;
  amountCents: number;
  currency: string;
  description: string;
  redirectUrl: string;
  webhookUrl: string | null;
};

export interface PaymentProvider {
  readonly name: "mollie" | "demo";
  createPayment(input: CreatePaymentInput): Promise<{ providerPaymentId: string; checkoutUrl: string; mode: PaymentMode }>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment>;
}

export class PaymentError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
