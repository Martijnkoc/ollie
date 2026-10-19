import "server-only";
import { transferStoreConfig } from "./config";
import { FileTransferStore, PostgresTransferStore, type TransferStore } from "./store";

let cached: { key: string; store: TransferStore } | null = null;

/** The transfer store from the environment, once per process; null when none may be used. */
export async function transferStore(): Promise<TransferStore | null> {
  const c = transferStoreConfig();
  if (c.kind === "missing") return null;
  const key = c.kind === "postgres" ? c.url : c.file;
  if (cached?.key === key) return cached.store;
  let store: TransferStore;
  if (c.kind === "postgres") {
    const { default: postgres } = await import("postgres");
    store = new PostgresTransferStore(postgres(c.url, { max: 3, prepare: false, idle_timeout: 20 }));
  } else store = new FileTransferStore(c.file);
  cached = { key, store };
  return store;
}
