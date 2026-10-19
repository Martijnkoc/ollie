import "server-only";
import { paymentsConfig, storeConfig } from "./config";
import { DemoProvider } from "./demo";
import { MollieProvider } from "./mollie";
import { FileOrderStore, PostgresOrderStore, type OrderStore } from "./store";
import { PaymentError } from "./types";
import type { Deps } from "./service";

let cached: { key: string; deps: Deps } | null = null;

/** Builds the payment dependencies from the environment once per process. */
export async function paymentDeps(): Promise<Deps> {
  const config = paymentsConfig();
  const store = storeConfig(process.env, config.provider);
  if (config.provider === "disabled") throw new PaymentError(503, `Betalen is nog niet beschikbaar. ${config.reason}`);
  if (store.kind === "missing") throw new PaymentError(503, `Betalen is nog niet beschikbaar. ${store.reason}`);
  const key = `${config.provider}|${store.kind === "postgres" ? store.url : store.file}`;
  if (cached?.key === key) return cached.deps;

  let orderStore: OrderStore;
  if (store.kind === "postgres") {
    const { default: postgres } = await import("postgres");
    orderStore = new PostgresOrderStore(postgres(store.url, { max: 3, prepare: false, idle_timeout: 20 }));
  } else orderStore = new FileOrderStore(store.file);

  const provider = config.provider === "mollie" ? new MollieProvider(config.apiKey, config.apiUrl) : new DemoProvider(orderStore);
  cached = { key, deps: { store: orderStore, provider } };
  return cached.deps;
}
