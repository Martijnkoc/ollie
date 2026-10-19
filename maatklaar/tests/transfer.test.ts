import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { open, parseFragment, randomToken, seal, sha256Hex, transferFragment } from "@/lib/transfer/crypto";
import { transferStoreConfig } from "@/lib/transfer/config";
import { mergeIncoming } from "@/lib/transfer/merge";
import { FileTransferStore, MemoryTransferStore, type TransferRecord } from "@/lib/transfer/store";
import { newProject, newWindow } from "@/lib/projects/factory";

// Real clock times: stores also clear out records that expired by the wall clock.
const T = Date.now();
const record = (patch: Partial<TransferRecord> = {}): TransferRecord => ({
  id: "transferid0000000001",
  tokenHash: "a".repeat(64),
  returnHash: "b".repeat(64),
  payload: '{"iv":"x","data":"y"}',
  expiresAt: T + 600_000,
  returnExpiresAt: T + 7_200_000,
  consumed: false,
  back: null,
  ...patch,
});

describe("versleuteling van een overdracht", () => {
  it("alleen met de juiste sleutel te openen, en gewijzigde data wordt geweigerd", async () => {
    const key = randomToken(32);
    const sealed = await seal({ v: 1, hello: "wereld" }, key);
    expect(await open(sealed, key)).toEqual({ v: 1, hello: "wereld" });
    await expect(open(sealed, randomToken(32))).rejects.toThrow();
    const tampered = { ...sealed, data: sealed.data.slice(0, -2) + (sealed.data.endsWith("A") ? "BB" : "AA") };
    await expect(open(tampered, key)).rejects.toThrow();
  });

  it("de link bevat alleen id, eenmalig token en sleutel: geen persoonsgegevens", () => {
    const f = transferFragment("transferid0000000001", randomToken(24), randomToken(32));
    expect(parseFragment(`#${f}`)).toMatchObject({ id: "transferid0000000001" });
    expect(parseFragment("#iets-anders")).toBeNull();
    expect(f).not.toMatch(/straat|@|\d{4}[A-Z]{2}/);
  });

  it("tokens worden alleen als SHA-256 bewaard", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("kortlevende, eenmalige opslag", () => {
  for (const [name, make] of [
    ["geheugen", () => new MemoryTransferStore()],
    ["bestand", () => new FileTransferStore(path.join(mkdtempSync(path.join(tmpdir(), "overdracht-")), "t.json"))],
  ] as const) {
    it(`${name}: één keer ophalen, daarna gebruikt; verlopen is verlopen; verkeerd token is onbekend`, async () => {
      const store = make();
      await store.create(record());
      expect(await store.take("transferid0000000001", "c".repeat(64), T)).toEqual({ ok: false, reason: "onbekend" });
      expect(await store.take("transferid0000000001", "a".repeat(64), T)).toEqual({ ok: true, payload: record().payload });
      expect(await store.take("transferid0000000001", "a".repeat(64), T + 1)).toEqual({ ok: false, reason: "gebruikt" });
      await store.create(record({ id: "transferid0000000002" }));
      expect(await store.take("transferid0000000002", "a".repeat(64), T + 600_001)).toEqual({ ok: false, reason: "verlopen" });
    });

    it(`${name}: de weg terug houdt de laatste kopie tot de computer hem ophaalt`, async () => {
      const store = make();
      await store.create(record());
      expect(await store.takeBack("transferid0000000001", "b".repeat(64), T)).toEqual({ ok: true, payload: null });
      expect(await store.putBack("transferid0000000001", "x".repeat(64), "p", T)).toBe(false);
      expect(await store.putBack("transferid0000000001", "b".repeat(64), "terug-1", T)).toBe(true);
      expect(await store.takeBack("transferid0000000001", "b".repeat(64), T)).toEqual({ ok: true, payload: "terug-1" });
      expect(await store.takeBack("transferid0000000001", "b".repeat(64), T)).toEqual({ ok: true, payload: null });
      expect(await store.putBack("transferid0000000001", "b".repeat(64), "te-laat", T + 7_200_001)).toBe(false);
      expect(await store.takeBack("transferid0000000001", "b".repeat(64), T + 7_200_001)).toEqual({ ok: false, reason: "verlopen" });
    });
  }

  it("in productie zonder database geen overdracht (een bestand overleeft serverless hosting niet)", () => {
    expect(transferStoreConfig({ NODE_ENV: "production" }).kind).toBe("missing");
    expect(transferStoreConfig({ NODE_ENV: "production", DATABASE_URL: "postgres://x" }).kind).toBe("postgres");
    expect(transferStoreConfig({ NODE_ENV: "development" }).kind).toBe("file");
  });
});

describe("samenvoegen van ramen uit het andere apparaat", () => {
  it("vervangt ramen met hetzelfde id, voegt nieuwe toe, houdt de rest", () => {
    const p = newProject();
    const a = newWindow([]);
    const b = newWindow([a]);
    const local = { ...p, windows: [a, b] };
    const c = newWindow([a, b]);
    const incoming = { ...p, windows: [{ ...a, label: "van de telefoon" }, c] };
    const m = mergeIncoming(local, incoming);
    expect(m.project.windows.map((w) => w.id)).toEqual([a.id, b.id, c.id]);
    expect(m.project.windows[0]!.label).toBe("van de telefoon");
    expect([m.updated, m.added]).toEqual([1, 1]);
    expect(() => mergeIncoming(local, { ...incoming, id: "anderprojectxyz" })).toThrow();
  });
});

describe("API: aanmaken, één keer ophalen, terugsturen", () => {
  let routes: {
    create: (req: Request) => Promise<Response>;
    take: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    put: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    back: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  beforeAll(async () => {
    process.env.TRANSFERS_FILE = path.join(mkdtempSync(path.join(tmpdir(), "overdracht-api-")), "t.json");
    routes = {
      create: (await import("@/app/api/overdracht/route")).POST,
      take: (await import("@/app/api/overdracht/[id]/ophalen/route")).POST as never,
      put: (await import("@/app/api/overdracht/[id]/terug/route")).PUT as never,
      back: (await import("@/app/api/overdracht/[id]/terug/ophalen/route")).POST as never,
    };
  });
  const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/overdracht", {
      method,
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("de hele weg, met eenmalig gebruik", async () => {
    const key = randomToken(32);
    const token = randomToken(24);
    const returnToken = randomToken(24);
    const payload = await seal({ v: 1, project: { naam: "x" }, returnToken }, key);
    const created = await routes.create(
      req("POST", { payload, tokenHash: await sha256Hex(token), returnHash: await sha256Hex(returnToken) }),
    );
    expect(created.status).toBe(200);
    const { id } = (await created.json()) as { id: string };

    expect((await routes.take(req("POST", undefined, { "x-transfer-token": randomToken(24) }), ctx(id))).status).toBe(404);
    const first = await routes.take(req("POST", undefined, { "x-transfer-token": token }), ctx(id));
    expect(first.status).toBe(200);
    expect(await open((await first.json()).payload, key)).toMatchObject({ returnToken });
    const second = await routes.take(req("POST", undefined, { "x-transfer-token": token }), ctx(id));
    expect(second.status).toBe(410);
    expect((await second.json()).reason).toBe("gebruikt");

    const backPayload = await seal({ v: 1, project: { naam: "terug" } }, key);
    expect((await routes.put(req("PUT", backPayload, { "x-return-token": token }), ctx(id))).status).toBe(410);
    expect((await routes.put(req("PUT", backPayload, { "x-return-token": returnToken }), ctx(id))).status).toBe(204);
    const got = await routes.back(req("POST", undefined, { "x-return-token": returnToken }), ctx(id));
    expect(await open((await got.json()).payload, key)).toEqual({ v: 1, project: { naam: "terug" } });
  });

  it("weigert andere sites, onzin en te grote overdrachten", async () => {
    expect((await routes.create(req("POST", {}, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await routes.create(req("POST", { payload: { iv: "x", data: "y" }, tokenHash: "z", returnHash: "z" }))).status).toBe(400);
    const big = { payload: { iv: "aaaaaaaaaaaaaaaa", data: "a".repeat(1_000_000) }, tokenHash: "a".repeat(64), returnHash: "b".repeat(64) };
    expect((await routes.create(req("POST", big))).status).toBe(400);
  });
});
