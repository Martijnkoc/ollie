import path from "node:path";

export type PaymentsConfig =
  | { provider: "mollie"; apiKey: string; apiUrl: string; mode: "live" | "test" }
  | { provider: "demo" }
  | { provider: "disabled"; reason: string };

type Env = Record<string, string | undefined>;

/**
 * Chooses the payment provider from the environment:
 * - MOLLIE_API_KEY (test_… or live_…) → Mollie;
 * - otherwise in development, or with ALLOW_DEMO_PAYMENTS=true → labelled DEMO mode, no money moves;
 * - otherwise disabled. A production build never silently falls back to demo.
 */
export function paymentsConfig(env: Env = process.env): PaymentsConfig {
  const key = env.MOLLIE_API_KEY?.trim();
  if (key) {
    if (!/^(test|live)_[A-Za-z0-9]{20,}$/.test(key))
      return { provider: "disabled", reason: "MOLLIE_API_KEY heeft geen geldig formaat (test_… of live_…)." };
    return {
      provider: "mollie",
      apiKey: key,
      apiUrl: env.MOLLIE_API_URL?.trim() || "https://api.mollie.com/v2",
      mode: key.startsWith("live_") ? "live" : "test",
    };
  }
  if (env.NODE_ENV !== "production" || env.ALLOW_DEMO_PAYMENTS === "true") return { provider: "demo" };
  return { provider: "disabled", reason: "Er is geen betaalprovider ingesteld (MOLLIE_API_KEY ontbreekt)." };
}

export type StoreConfig = { kind: "postgres"; url: string } | { kind: "file"; file: string } | { kind: "missing"; reason: string };

export function storeConfig(env: Env = process.env, provider = paymentsConfig(env).provider): StoreConfig {
  if (env.DATABASE_URL?.trim()) return { kind: "postgres", url: env.DATABASE_URL.trim() };
  // Orders of real payments must survive restarts; a file on serverless hosting does not.
  if (env.NODE_ENV === "production" && provider === "mollie" && env.ALLOW_FILE_ORDER_STORE !== "true") {
    return { kind: "missing", reason: "DATABASE_URL ontbreekt; zonder database gaan ordergegevens verloren." };
  }
  return { kind: "file", file: env.ORDERS_FILE?.trim() || path.join(process.cwd(), ".data", "orders.json") };
}

/** Public base URL for redirect and webhook URLs. */
export function appUrl(req: Request, env: Env = process.env) {
  const configured = env.APP_URL?.trim().replace(/\/$/, "");
  return configured || new URL(req.url).origin;
}

/** Mollie cannot reach localhost; then the status is verified on return instead of by webhook. */
export function webhookUrlFor(base: string) {
  const host = new URL(base).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return null;
  return `${base}/api/betalingen/mollie`;
}

/** What the interface may say about payments. Never exposes keys. */
export function publicPaymentInfo(env: Env = process.env) {
  const c = paymentsConfig(env);
  const store = storeConfig(env, c.provider);
  if (c.provider === "disabled" || store.kind === "missing")
    return { available: false as const, mode: null, label: "Betalen is nog niet beschikbaar." };
  if (c.provider === "demo") return { available: true as const, mode: "demo" as const, label: "DEMO-modus: er wordt niet echt betaald." };
  return {
    available: true as const,
    mode: c.mode,
    label: c.mode === "test" ? "Testmodus: Mollie-testbetaling, er wordt geen geld afgeschreven." : "",
  };
}
