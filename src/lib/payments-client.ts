import Stripe from "stripe";
import { UserError } from "./errors";

/** test: sk_test_ key (no real money). live: real payments. none: not configured, and the interface says so. */
export function stripeMode(): "test" | "live" | "none" {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) return "none";
  return key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : "test";
}

let client: Stripe | undefined;

export function stripe(): Stripe {
  if (stripeMode() === "none") throw new UserError("Online betalen is nog niet geconfigureerd.");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}
