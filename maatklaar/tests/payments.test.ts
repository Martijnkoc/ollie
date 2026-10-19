import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { appUrl, paymentsConfig, publicPaymentInfo, storeConfig, webhookUrlFor } from "@/lib/payments/config";
import { DemoProvider } from "@/lib/payments/demo";
import { MollieProvider, centsToValue, valueToCents } from "@/lib/payments/mollie";
import { createOrder, handleWebhook, orderStatusForBuyer, simulateDemoPayment, type Deps } from "@/lib/payments/service";
import { nextStatus } from "@/lib/payments/status";
import { FileOrderStore, MemoryOrderStore } from "@/lib/payments/store";
import { PaymentError, type Order } from "@/lib/payments/types";

/** A small in-memory imitation of the Mollie Payments API for contract tests. */
function fakeMollie() {
  const payments = new Map<string, Record<string, unknown>>();
  const requests: { method: string; url: string; headers: Headers; body: unknown }[] = [];
  let n = 0;
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ method: init?.method ?? "GET", url, headers, body });
    if (headers.get("authorization") !== "Bearer test_abcdefghijklmnopqrstuvwxyz") return new Response("{}", { status: 401 });
    if (init?.method === "POST" && url.endsWith("/payments")) {
      const id = `tr_test${++n}`;
      const p = {
        resource: "payment",
        id,
        mode: "test",
        status: "open",
        amount: body.amount,
        description: body.description,
        metadata: body.metadata,
        _links: { checkout: { href: `https://checkout.mollie.test/${id}` } },
      };
      payments.set(id, p);
      return Response.json(p, { status: 201 });
    }
    const m = /\/payments\/(tr_\w+)$/.exec(url);
    if (m && payments.has(m[1]!)) return Response.json(payments.get(m[1]!));
    return new Response("{}", { status: 404 });
  });
  return {
    provider: new MollieProvider("test_abcdefghijklmnopqrstuvwxyz", "https://api.mollie.test/v2", fetchImpl as unknown as typeof fetch),
    set: (id: string, patch: Record<string, unknown>) => payments.set(id, { ...payments.get(id)!, ...patch }),
    requests,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  };
}

const urls = { redirectBase: "https://maatklaar.test", webhookUrl: "https://maatklaar.test/api/betalingen/mollie" };
const REF = "abcdefghijkmnpqrstuvw";

function setup() {
  const mollie = fakeMollie();
  const store = new MemoryOrderStore();
  const deps: Deps = { store, provider: mollie.provider };
  return { mollie, store, deps };
}

describe("Mollie-adapter", () => {
  it("maakt een eenmalige betaling met het serverbedrag, metadata en idempotency-key", async () => {
    const { mollie, deps } = setup();
    const o = await createOrder(REF, urls, deps);
    const req = mollie.requests[0]!;
    expect(req.method).toBe("POST");
    expect(req.body).toMatchObject({
      amount: { currency: "EUR", value: "8.99" },
      metadata: { orderId: o.orderId },
      redirectUrl: `https://maatklaar.test/betaling/terug?order=${o.orderId}`,
      webhookUrl: urls.webhookUrl,
      locale: "nl_NL",
      sequenceType: "oneoff",
    });
    expect(req.headers.get("idempotency-key")).toBe(o.orderId);
    expect(o.checkoutUrl).toMatch(/^https:\/\/checkout\.mollie\.test\//);
  });

  it("laat de webhook weg als die niet bereikbaar is (localhost)", async () => {
    const { mollie, deps } = setup();
    await createOrder(REF, { redirectBase: "http://localhost:3000", webhookUrl: webhookUrlFor("http://localhost:3000") }, deps);
    expect(mollie.requests[0]!.body).not.toHaveProperty("webhookUrl");
  });

  it("rekent bedragen zonder afrondingsfouten om", () => {
    expect(centsToValue(899)).toBe("8.99");
    expect(centsToValue(5)).toBe("0.05");
    expect(valueToCents("8.99")).toBe(899);
  });

  it("een geweigerde sleutel geeft een nette fout zonder details", async () => {
    const p = new MollieProvider("test_wrongwrongwrongwrongwrong", "https://api.mollie.test/v2", fakeMollie().fetchImpl);
    await expect(p.getPayment("tr_test1")).rejects.toMatchObject({ status: 503 });
  });
});

describe("betaalstatus", () => {
  it("een redirect alleen geeft niets vrij: status blijft open tot de provider 'paid' meldt", async () => {
    const { mollie, deps } = setup();
    const o = await createOrder(REF, urls, deps);
    // The browser comes back on /betaling/terug?order=…&status=paid — the server only asks Mollie.
    expect((await orderStatusForBuyer(o.orderId, o.orderSecret, deps)).status).toBe("open");
    mollie.set("tr_test1", { status: "paid", paidAt: "2026-10-19T10:00:00+00:00" });
    expect((await orderStatusForBuyer(o.orderId, o.orderSecret, deps)).status).toBe("paid");
  });

  it("zonder of met verkeerd geheim: niet gevonden", async () => {
    const { deps } = setup();
    const o = await createOrder(REF, urls, deps);
    await expect(orderStatusForBuyer(o.orderId, "", deps)).rejects.toMatchObject({ status: 404 });
    await expect(orderStatusForBuyer(o.orderId, "verkeerd", deps)).rejects.toMatchObject({ status: 404 });
    await expect(orderStatusForBuyer("ord_bestaatniet", o.orderSecret, deps)).rejects.toMatchObject({ status: 404 });
  });

  it("webhook is idempotent en bestand tegen volgorde", async () => {
    const { mollie, store, deps } = setup();
    const o = await createOrder(REF, urls, deps);
    mollie.set("tr_test1", { status: "paid" });
    expect(await handleWebhook("tr_test1", deps)).toEqual({ known: true, status: "paid" });
    const first = (await store.get(o.orderId))!;
    expect(await handleWebhook("tr_test1", deps)).toEqual({ known: true, status: "paid" });
    expect((await store.get(o.orderId))!.updatedAt).toBe(first.updatedAt); // nothing changed
    // A late "open"/"expired" answer must not undo a payment.
    mollie.set("tr_test1", { status: "expired" });
    expect(await handleWebhook("tr_test1", deps)).toEqual({ known: true, status: "paid" });
  });

  it("terugbetaling of chargeback trekt de toegang in", async () => {
    const { mollie, deps } = setup();
    const o = await createOrder(REF, urls, deps);
    mollie.set("tr_test1", { status: "paid" });
    await handleWebhook("tr_test1", deps);
    mollie.set("tr_test1", { status: "paid", amountRefunded: { currency: "EUR", value: "8.99" } });
    expect((await orderStatusForBuyer(o.orderId, o.orderSecret, deps)).status).toBe("refunded");
    expect(nextStatus("refunded", "paid")).toBe("refunded");
  });

  it("een betaling met een ander bedrag of andere order telt niet", async () => {
    const { mollie, store, deps } = setup();
    const o = await createOrder(REF, urls, deps);
    mollie.set("tr_test1", { status: "paid", amount: { currency: "EUR", value: "0.01" } });
    await expect(handleWebhook("tr_test1", deps)).rejects.toMatchObject({ status: 409 });
    expect((await store.get(o.orderId))!.status).toBe("open");
    mollie.set("tr_test1", { amount: { currency: "EUR", value: "8.99" }, metadata: { orderId: "ord_iemandanders" } });
    await expect(handleWebhook("tr_test1", deps)).rejects.toMatchObject({ status: 409 });
  });

  it("onbekende betaling in de webhook wordt zonder details erkend", async () => {
    const { deps } = setup();
    expect(await handleWebhook("tr_onbekend", deps)).toEqual({ known: false });
  });

  it("ordergegevens bevatten geen persoonsgegevens of geheim in leesbare vorm", async () => {
    const { store, deps } = setup();
    const o = await createOrder(REF, urls, deps);
    const stored = (await store.get(o.orderId)) as Order;
    expect(Object.keys(stored).sort()).toEqual([
      "amountCents",
      "createdAt",
      "currency",
      "id",
      "mode",
      "paidAt",
      "projectRef",
      "provider",
      "providerPaymentId",
      "secretHash",
      "status",
      "updatedAt",
    ]);
    expect(JSON.stringify(stored)).not.toContain(o.orderSecret);
  });

  it("een ongeldige projectreferentie wordt geweigerd", async () => {
    const { deps } = setup();
    await expect(createOrder("../../etc", urls, deps)).rejects.toBeInstanceOf(PaymentError);
  });
});

describe("DEMO-modus", () => {
  it("werkt alleen met het geheim en is altijd als demo gemarkeerd", async () => {
    const store = new MemoryOrderStore();
    const deps: Deps = { store, provider: new DemoProvider(store) };
    const o = await createOrder(REF, urls, deps);
    expect(o.mode).toBe("demo");
    expect(o.checkoutUrl).toContain(`#${o.orderSecret}`);
    await expect(simulateDemoPayment(o.orderId, "fout", "paid", deps)).rejects.toMatchObject({ status: 404 });
    expect((await orderStatusForBuyer(o.orderId, o.orderSecret, deps)).status).toBe("open");
    const paid = await simulateDemoPayment(o.orderId, o.orderSecret, "paid", deps);
    expect(paid).toMatchObject({ status: "paid", mode: "demo" });
  });

  it("is geweigerd zodra er een echte provider is", async () => {
    const { deps } = setup();
    const o = await createOrder(REF, urls, deps);
    await expect(simulateDemoPayment(o.orderId, o.orderSecret, "paid", deps)).rejects.toMatchObject({ status: 403 });
  });
});

describe("configuratie", () => {
  it("kiest de provider veilig", () => {
    expect(paymentsConfig({ MOLLIE_API_KEY: "test_abcdefghijklmnopqrstuvwxyz" })).toMatchObject({ provider: "mollie", mode: "test" });
    expect(paymentsConfig({ MOLLIE_API_KEY: "live_abcdefghijklmnopqrstuvwxyz" })).toMatchObject({ provider: "mollie", mode: "live" });
    expect(paymentsConfig({ MOLLIE_API_KEY: "sk_test_123" }).provider).toBe("disabled");
    expect(paymentsConfig({ NODE_ENV: "development" }).provider).toBe("demo");
    // Production never falls back to demo by itself.
    expect(paymentsConfig({ NODE_ENV: "production" }).provider).toBe("disabled");
    expect(paymentsConfig({ NODE_ENV: "production", ALLOW_DEMO_PAYMENTS: "true" }).provider).toBe("demo");
    expect(publicPaymentInfo({ NODE_ENV: "production" }).available).toBe(false);
  });

  it("echte betalingen in productie vereisen een database", () => {
    expect(storeConfig({ NODE_ENV: "production", MOLLIE_API_KEY: "live_abcdefghijklmnopqrstuvwxyz" }).kind).toBe("missing");
    expect(
      storeConfig({ NODE_ENV: "production", MOLLIE_API_KEY: "live_abcdefghijklmnopqrstuvwxyz", DATABASE_URL: "postgres://x" }).kind,
    ).toBe("postgres");
    expect(storeConfig({ NODE_ENV: "development" }).kind).toBe("file");
  });

  it("webhook-URL en basis-URL", () => {
    expect(webhookUrlFor("http://localhost:3000")).toBeNull();
    expect(webhookUrlFor("https://maatklaar.nl")).toBe("https://maatklaar.nl/api/betalingen/mollie");
    expect(appUrl(new Request("http://localhost:3000/api/bestellingen"), { APP_URL: "https://maatklaar.nl/" })).toBe(
      "https://maatklaar.nl",
    );
  });
});

describe("bestandsopslag", () => {
  it("serialiseert gelijktijdige updates en bewaart op schijf", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "maatklaar-orders-"));
    const file = path.join(dir, "orders.json");
    const store = new FileOrderStore(file);
    const deps: Deps = { store, provider: new DemoProvider(store) };
    const orders = await Promise.all(Array.from({ length: 5 }, () => createOrder(REF, urls, deps)));
    const reopened = new FileOrderStore(file);
    for (const o of orders) expect((await reopened.get(o.orderId))?.status).toBe("open");
  });
});
