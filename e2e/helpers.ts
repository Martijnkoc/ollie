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

export async function login(page: Page, email: string, next = "/afspraken") {
  await page.goto(`/inloggen?next=${encodeURIComponent(next)}`);
  await sql`delete from mail_outbox where recipient = ${email}`;
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Stuur mij een code" }).click();
  await expect(page.getByText(`We hebben een code gestuurd naar ${email}`)).toBeVisible();
  await page.getByLabel("Code uit de e-mail").fill(await latestCode(email));
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/inloggen"));
}

export async function onboard(page: Page, alias: string) {
  await page.goto("/welkom?next=/lidmaatschap");
  await page.getByLabel("Voornaam of alias").fill(alias);
  await page.getByLabel("Geboortedatum").fill("1992-04-01");
  await page.getByLabel("Regio", { exact: true }).selectOption("utrecht");
  await page.getByLabel("Open voor wat er komt").check();
  await page.getByLabel("Wandelen").check();
  await page.getByLabel(/18 jaar of ouder/).check();
  await page.getByRole("button", { name: "Profiel opslaan" }).click();
  await expect(page.getByRole("heading", { name: "Lid worden van Cafe" })).toBeVisible();
}

let seq = 0;
/** Sends a correctly signed Stripe test event to the real webhook route, as Stripe would. */
export async function stripeEvent(page: Page, type: string, email: string, over: Record<string, unknown> = {}) {
  const [user] = await sql<{ id: string }[]>`select id from users where email = ${email}`;
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now()}_${++seq}`,
    object: "event",
    type,
    created: now + seq,
    data: {
      object: {
        id: `sub_${user.id.slice(0, 8)}`,
        object: "subscription",
        customer: `cus_${user.id.slice(0, 8)}`,
        status: "active",
        cancel_at_period_end: false,
        cancel_at: null,
        metadata: { user_id: user.id },
        items: { data: [{ current_period_start: now - 3600, current_period_end: now + 30 * 86400 }] },
        ...over,
      },
    },
  });
  const res = await page.request.post("/api/stripe/webhook", {
    data: payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret: E2E_WEBHOOK_SECRET }),
    },
  });
  return { status: res.status(), body: await res.json(), payload };
}

export async function newUser(browser: Browser, email: string, alias?: string, member = false) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email);
  if (alias) await onboard(page, alias);
  if (member) {
    expect((await stripeEvent(page, "customer.subscription.created", email)).status).toBe(200);
  }
  return { context, page, email };
}

export function quarterHourFromNow(hours: number) {
  const d = new Date(Date.now() + hours * 3600_000);
  d.setUTCMinutes(Math.ceil(d.getUTCMinutes() / 15) * 15, 0, 0);
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" }).format(d);
  return local.replace(" ", "T");
}

/** Moves a date so that its agreed time is `minutesAgo` minutes in the past (only for the timer test). */
export async function moveDate(dateId: string, minutesAgo: number) {
  await sql`update dates set scheduled_at = now() - make_interval(mins => ${minutesAgo}) where id = ${dateId}`;
}
