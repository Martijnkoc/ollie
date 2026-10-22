import { type Browser, type Page, expect } from "@playwright/test";
import postgres from "postgres";
import Stripe from "stripe";
import { E2E_DATABASE_URL, E2E_WEBHOOK_SECRET } from "../playwright.config";

export const sql = postgres(E2E_DATABASE_URL, { onnotice: () => {}, idle_timeout: 1, max: 2 });

export async function latestCode(email: string) {
  for (let i = 0; i < 20; i++) {
    const [row] = await sql<{ subject: string }[]>`select subject from mail_outbox where recipient = ${email} order by id desc limit 1`;
    const code = row && /(\d{6})/.exec(row.subject)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no login code for ${email}`);
}

export async function login(page: Page, email: string, next = "/dashboard") {
  await page.goto(`/inloggen?next=${encodeURIComponent(next)}`);
  await sql`delete from mail_outbox where recipient = ${email}`;
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Stuur mij een code" }).click();
  await expect(page.getByText(`We hebben een code gestuurd naar ${email}`)).toBeVisible();
  await page.getByLabel("Code uit de e-mail").fill(await latestCode(email));
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/inloggen"));
}

/** Logs in and completes the onboarding step. */
export async function newUser(browser: Browser, email: string, name: string, intent: "sell" | "buy") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, intent === "sell" ? "/welkom?verkopen=1" : "/ontdek");
  await expect(page).toHaveURL(/\/welkom/);
  await page.getByLabel(intent === "sell" ? "Mijn talent verkopen" : "Talent ontdekken en inhuren").check();
  await page.getByLabel("Je naam").fill(name);
  await page.getByLabel(/18 jaar of ouder/).check();
  await page.getByRole("button", { name: "Doorgaan" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/welkom"));
  return { context, page, email };
}

/**
 * A real image, drawn by the browser, so uploads go through the actual byte checks.
 * Each call gives a different composition in the brand colours (no people, no stock photos).
 */
export async function makeImage(page: Page, seed: number, type: "image/jpeg" | "image/png" = "image/jpeg", w = 1200, h = 900) {
  const dataUrl = await page.evaluate(
    ({ seed, type, w, h }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      const colors = ["#101112", "#C5FF38", "#FFFFFF", "#292B2D"];
      g.fillStyle = colors[seed % 4];
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = colors[(seed + i + 1) % 4];
        const s = ((seed * 37 + i * 91) % 400) + 120;
        g.save();
        g.translate((seed * 53 + i * 211) % w, (seed * 29 + i * 157) % h);
        g.rotate((seed + i) * 0.4);
        if (i % 2) g.fillRect(-s / 2, -s / 2, s, s);
        else {
          g.beginPath();
          g.arc(0, 0, s / 2, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      }
      return c.toDataURL(type, 0.9);
    },
    { seed, type, w, h },
  );
  return {
    name: `werk-${seed}.${type === "image/png" ? "png" : "jpg"}`,
    mimeType: type,
    buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
  };
}

let seq = 0;
/** Sends a correctly signed Stripe event to the real webhook route, as Stripe would. */
export async function stripeEvent(page: Page, type: string, object: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ id: `evt_e2e_${Date.now()}_${++seq}`, object: "event", type, created: now + seq, data: { object } });
  const res = await page.request.post("/api/stripe/webhook", {
    data: payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret: E2E_WEBHOOK_SECRET }),
    },
  });
  return { status: res.status(), body: await res.json(), payload };
}

export function checkoutCompleted(orderId: string, amount: number, pi = `pi_e2e_${orderId.slice(0, 8)}`) {
  return {
    id: `cs_test_${orderId.slice(0, 8)}`,
    object: "checkout.session",
    amount_total: amount,
    currency: "eur",
    payment_status: "paid",
    payment_intent: pi,
    client_reference_id: orderId,
    metadata: { order_id: orderId },
  };
}

export async function orderIdFromUrl(page: Page) {
  const id = /\/opdrachten\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!id) throw new Error(`not on an order page: ${page.url()}`);
  return id;
}

export async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}
