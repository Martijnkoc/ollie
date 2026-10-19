import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "postgres";

/**
 * Short-lived storage for project transfers between devices: ciphertext only, with the SHA-256 of the
 * one-time tokens. The outbound copy can be fetched once within its lifetime; the way back (phone →
 * computer) holds the latest copy until the computer fetched it or the transfer expired.
 */
export type TransferRecord = {
  id: string;
  tokenHash: string;
  returnHash: string;
  payload: string;
  expiresAt: number;
  returnExpiresAt: number;
  consumed: boolean;
  back: string | null;
};

export type Taken = { ok: true; payload: string } | { ok: false; reason: "onbekend" | "verlopen" | "gebruikt" };
export type TakenBack = { ok: true; payload: string | null } | { ok: false; reason: "onbekend" | "verlopen" };

export interface TransferStore {
  create(r: TransferRecord): Promise<void>;
  take(id: string, tokenHash: string, now: number): Promise<Taken>;
  putBack(id: string, returnHash: string, payload: string, now: number): Promise<boolean>;
  takeBack(id: string, returnHash: string, now: number): Promise<TakenBack>;
}

/** The rules, on one record; shared by the memory and file stores. */
function take(r: TransferRecord | undefined, tokenHash: string, now: number): { result: Taken; next: TransferRecord | null } {
  if (!r || r.tokenHash !== tokenHash) return { result: { ok: false, reason: "onbekend" }, next: null };
  if (r.consumed) return { result: { ok: false, reason: "gebruikt" }, next: null };
  if (now > r.expiresAt) return { result: { ok: false, reason: "verlopen" }, next: null };
  // The ciphertext is dropped once fetched: it is only needed once.
  return { result: { ok: true, payload: r.payload }, next: { ...r, consumed: true, payload: "" } };
}

function putBack(r: TransferRecord | undefined, returnHash: string, payload: string, now: number) {
  if (!r || r.returnHash !== returnHash || now > r.returnExpiresAt) return null;
  return { ...r, back: payload };
}

function takeBack(r: TransferRecord | undefined, returnHash: string, now: number): { result: TakenBack; next: TransferRecord | null } {
  if (!r || r.returnHash !== returnHash) return { result: { ok: false, reason: "onbekend" }, next: null };
  if (now > r.returnExpiresAt) return { result: { ok: false, reason: "verlopen" }, next: null };
  return { result: { ok: true, payload: r.back }, next: r.back ? { ...r, back: null } : null };
}

const expired = (r: TransferRecord, now: number) => now > r.returnExpiresAt;

export class MemoryTransferStore implements TransferStore {
  private readonly records = new Map<string, TransferRecord>();
  async create(r: TransferRecord) {
    for (const [k, v] of this.records) if (expired(v, Date.now())) this.records.delete(k);
    this.records.set(r.id, r);
  }
  async take(id: string, tokenHash: string, now: number) {
    const { result, next } = take(this.records.get(id), tokenHash, now);
    if (next) this.records.set(id, next);
    return result;
  }
  async putBack(id: string, returnHash: string, payload: string, now: number) {
    const next = putBack(this.records.get(id), returnHash, payload, now);
    if (next) this.records.set(id, next);
    return Boolean(next);
  }
  async takeBack(id: string, returnHash: string, now: number) {
    const { result, next } = takeBack(this.records.get(id), returnHash, now);
    if (next) this.records.set(id, next);
    return result;
  }
}

/** One JSON file, for local development and tests on a single server. */
export class FileTransferStore implements TransferStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly file: string) {}
  private async read(): Promise<Record<string, TransferRecord>> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as Record<string, TransferRecord>;
    } catch {
      return {};
    }
  }
  private async write(data: Record<string, TransferRecord>) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, this.file);
  }
  private locked<T>(fn: (data: Record<string, TransferRecord>) => Promise<T> | T): Promise<T> {
    const run = this.queue.then(async () => {
      const data = await this.read();
      const out = await fn(data);
      for (const [k, v] of Object.entries(data)) if (expired(v, Date.now())) delete data[k];
      await this.write(data);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  create(r: TransferRecord) {
    return this.locked((data) => {
      data[r.id] = r;
    });
  }
  take(id: string, tokenHash: string, now: number) {
    return this.locked((data) => {
      const { result, next } = take(data[id], tokenHash, now);
      if (next) data[id] = next;
      return result;
    });
  }
  putBack(id: string, returnHash: string, payload: string, now: number) {
    return this.locked((data) => {
      const next = putBack(data[id], returnHash, payload, now);
      if (next) data[id] = next;
      return Boolean(next);
    });
  }
  takeBack(id: string, returnHash: string, now: number) {
    return this.locked((data) => {
      const { result, next } = takeBack(data[id], returnHash, now);
      if (next) data[id] = next;
      return result;
    });
  }
}

/** Postgres, for production: every step is one conditional statement, so two devices cannot both win. */
export class PostgresTransferStore implements TransferStore {
  private ready: Promise<void> | null = null;
  constructor(private readonly sql: Sql) {}
  private migrate() {
    this.ready ??= (async () => {
      await this.sql`
        create table if not exists maatklaar_transfers (
          id text primary key,
          token_hash text not null,
          return_hash text not null,
          payload text not null,
          back text,
          consumed boolean not null default false,
          expires_at timestamptz not null,
          return_expires_at timestamptz not null
        )`;
      await this.sql`alter table maatklaar_transfers enable row level security`;
    })();
    return this.ready;
  }
  async create(r: TransferRecord) {
    await this.migrate();
    await this.sql`delete from maatklaar_transfers where return_expires_at < now()`;
    await this.sql`
      insert into maatklaar_transfers (id, token_hash, return_hash, payload, back, consumed, expires_at, return_expires_at)
      values (${r.id}, ${r.tokenHash}, ${r.returnHash}, ${r.payload}, null, false, ${new Date(r.expiresAt)}, ${new Date(r.returnExpiresAt)})`;
  }
  async take(id: string, tokenHash: string, now: number): Promise<Taken> {
    await this.migrate();
    // Lock the row, keep the old ciphertext for the answer, then clear it: fetched once, by one device.
    const rows = await this.sql<{ payload: string }[]>`
      with old as (
        select id, payload from maatklaar_transfers
        where id = ${id} and token_hash = ${tokenHash} and not consumed and expires_at >= ${new Date(now)}
        for update
      )
      update maatklaar_transfers t set consumed = true, payload = '' from old where t.id = old.id
      returning old.payload`;
    if (rows[0]) return { ok: true, payload: rows[0].payload };
    const [r] = await this.sql<{ consumed: boolean; expires_at: Date; token_hash: string }[]>`
      select consumed, expires_at, token_hash from maatklaar_transfers where id = ${id}`;
    if (!r || r.token_hash !== tokenHash) return { ok: false, reason: "onbekend" };
    return { ok: false, reason: r.consumed ? "gebruikt" : "verlopen" };
  }
  async putBack(id: string, returnHash: string, payload: string, now: number) {
    await this.migrate();
    const rows = await this.sql`
      update maatklaar_transfers set back = ${payload}
      where id = ${id} and return_hash = ${returnHash} and return_expires_at >= ${new Date(now)} returning id`;
    return rows.length > 0;
  }
  async takeBack(id: string, returnHash: string, now: number): Promise<TakenBack> {
    await this.migrate();
    const [r] = await this.sql<{ back: string | null; return_expires_at: Date }[]>`
      select back, return_expires_at from maatklaar_transfers where id = ${id} and return_hash = ${returnHash}`;
    if (!r) return { ok: false, reason: "onbekend" };
    if (r.return_expires_at.getTime() < now) return { ok: false, reason: "verlopen" };
    if (r.back) await this.sql`update maatklaar_transfers set back = null where id = ${id} and back = ${r.back}`;
    return { ok: true, payload: r.back };
  }
}
