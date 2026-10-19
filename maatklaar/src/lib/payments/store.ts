import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Order } from "./types";

/** Storage for order metadata only. Implementations: memory (tests), JSON file (local), Postgres (production). */
export interface OrderStore {
  insert(order: Order): Promise<void>;
  get(id: string): Promise<Order | null>;
  findByPaymentId(providerPaymentId: string): Promise<Order | null>;
  /** Updates one order atomically: `fn` gets the current row and returns the new one (or null for no change). */
  update(id: string, fn: (current: Order) => Order | null): Promise<Order | null>;
  /** Demo provider state ("open" | "paid" | "canceled"), kept apart from real orders. */
  getDemo(paymentId: string): Promise<string | null>;
  setDemo(paymentId: string, status: string): Promise<void>;
}

export class MemoryOrderStore implements OrderStore {
  private orders = new Map<string, Order>();
  private demo = new Map<string, string>();
  async insert(order: Order) {
    if (this.orders.has(order.id)) throw new Error("dubbele order");
    this.orders.set(order.id, { ...order });
  }
  async get(id: string) {
    const o = this.orders.get(id);
    return o ? { ...o } : null;
  }
  async findByPaymentId(pid: string) {
    for (const o of this.orders.values()) if (o.providerPaymentId === pid) return { ...o };
    return null;
  }
  async update(id: string, fn: (o: Order) => Order | null) {
    const current = this.orders.get(id);
    if (!current) return null;
    const next = fn({ ...current });
    if (next) this.orders.set(id, { ...next });
    return { ...(next ?? current) };
  }
  async getDemo(pid: string) {
    return this.demo.get(pid) ?? null;
  }
  async setDemo(pid: string, status: string) {
    this.demo.set(pid, status);
  }
}

type FileShape = { orders: Record<string, Order>; demo: Record<string, string> };

/** Local development store: one JSON file, writes serialised within the process and replaced atomically. */
export class FileOrderStore implements OrderStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly file: string) {}

  private async read(): Promise<FileShape> {
    try {
      const data = JSON.parse(await readFile(this.file, "utf8")) as FileShape;
      return { orders: data.orders ?? {}, demo: data.demo ?? {} };
    } catch {
      return { orders: {}, demo: {} };
    }
  }

  private async write(data: FileShape) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, this.file);
  }

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  insert(order: Order) {
    return this.locked(async () => {
      const data = await this.read();
      if (data.orders[order.id]) throw new Error("dubbele order");
      data.orders[order.id] = order;
      await this.write(data);
    });
  }
  async get(id: string) {
    return (await this.read()).orders[id] ?? null;
  }
  async findByPaymentId(pid: string) {
    return Object.values((await this.read()).orders).find((o) => o.providerPaymentId === pid) ?? null;
  }
  update(id: string, fn: (o: Order) => Order | null) {
    return this.locked(async () => {
      const data = await this.read();
      const current = data.orders[id];
      if (!current) return null;
      const next = fn({ ...current });
      if (next) {
        data.orders[id] = next;
        await this.write(data);
      }
      return next ?? current;
    });
  }
  async getDemo(pid: string) {
    return (await this.read()).demo[pid] ?? null;
  }
  setDemo(pid: string, status: string) {
    return this.locked(async () => {
      const data = await this.read();
      data.demo[pid] = status;
      await this.write(data);
    });
  }
}

type Sql = import("postgres").Sql;
type Row = {
  id: string;
  secret_hash: string;
  project_ref: string;
  amount_cents: number;
  currency: string;
  provider: Order["provider"];
  provider_payment_id: string | null;
  status: Order["status"];
  mode: Order["mode"];
  created_at: Date;
  updated_at: Date;
  paid_at: Date | null;
};

const fromRow = (r: Row): Order => ({
  id: r.id,
  secretHash: r.secret_hash,
  projectRef: r.project_ref,
  amountCents: r.amount_cents,
  currency: r.currency,
  provider: r.provider,
  providerPaymentId: r.provider_payment_id,
  status: r.status,
  mode: r.mode,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
  paidAt: r.paid_at ? r.paid_at.toISOString() : null,
});

/**
 * Production store. Creates its tables on first use. Row level security is switched on without policies,
 * so a Supabase anon/authenticated key can never read orders through the REST API; only the server role can.
 */
export class PostgresOrderStore implements OrderStore {
  private ready: Promise<void> | null = null;
  constructor(private readonly sql: Sql) {}

  private migrate() {
    this.ready ??= (async () => {
      await this.sql`
        create table if not exists maatklaar_orders (
          id text primary key,
          secret_hash text not null,
          project_ref text not null,
          amount_cents integer not null,
          currency text not null,
          provider text not null,
          provider_payment_id text unique,
          status text not null,
          mode text not null,
          created_at timestamptz not null,
          updated_at timestamptz not null,
          paid_at timestamptz
        )`;
      await this.sql`create table if not exists maatklaar_demo_payments (id text primary key, status text not null)`;
      await this.sql`alter table maatklaar_orders enable row level security`;
      await this.sql`alter table maatklaar_demo_payments enable row level security`;
    })();
    return this.ready;
  }

  async insert(o: Order) {
    await this.migrate();
    await this.sql`
      insert into maatklaar_orders (id, secret_hash, project_ref, amount_cents, currency, provider, provider_payment_id, status, mode, created_at, updated_at, paid_at)
      values (${o.id}, ${o.secretHash}, ${o.projectRef}, ${o.amountCents}, ${o.currency}, ${o.provider}, ${o.providerPaymentId}, ${o.status}, ${o.mode}, ${o.createdAt}, ${o.updatedAt}, ${o.paidAt})`;
  }
  async get(id: string) {
    await this.migrate();
    const rows = await this.sql<Row[]>`select * from maatklaar_orders where id = ${id}`;
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async findByPaymentId(pid: string) {
    await this.migrate();
    const rows = await this.sql<Row[]>`select * from maatklaar_orders where provider_payment_id = ${pid}`;
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async update(id: string, fn: (o: Order) => Order | null) {
    await this.migrate();
    return this.sql.begin(async (tx) => {
      const rows = await tx<Row[]>`select * from maatklaar_orders where id = ${id} for update`;
      if (!rows[0]) return null;
      const current = fromRow(rows[0]);
      const next = fn({ ...current });
      if (!next) return current;
      await tx`
        update maatklaar_orders set provider_payment_id = ${next.providerPaymentId}, status = ${next.status}, mode = ${next.mode},
          updated_at = ${next.updatedAt}, paid_at = ${next.paidAt}
        where id = ${id}`;
      return next;
    }) as Promise<Order | null>;
  }
  async getDemo(pid: string) {
    await this.migrate();
    const rows = await this.sql<{ status: string }[]>`select status from maatklaar_demo_payments where id = ${pid}`;
    return rows[0]?.status ?? null;
  }
  async setDemo(pid: string, status: string) {
    await this.migrate();
    await this.sql`insert into maatklaar_demo_payments (id, status) values (${pid}, ${status}) on conflict (id) do update set status = excluded.status`;
  }
}
