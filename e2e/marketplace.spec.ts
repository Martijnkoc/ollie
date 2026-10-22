import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { checkoutCompleted, login, makeImage, newUser, orderIdFromUrl, sql, stripeEvent } from "./helpers";

// Mila sells, Bas buys, Cas is a third person who must never see what is not theirs, Ada moderates.
test.describe.configure({ mode: "serial" });

type Actor = { context: BrowserContext; page: Page; email: string };
let mila: Actor;
let bas: Actor;
let cas: Actor;
let serviceId = "";
let customServiceId = "";
let fixedOrderId = "";
let customOrderId = "";
let threadId = "";

test("a maker signs up, builds a public profile with a photo and publishes work and services", async ({ browser }) => {
  mila = await newUser(browser, "mila@e2e.test", "Mila de Vries", "sell");
  const { page } = mila;
  await expect(page).toHaveURL(/\/dashboard\/profiel\?nieuw=1/);
  await expect(page.getByLabel("Gebruikersnaam")).toHaveValue("mila-de-vries");
  await page.getByLabel("Gebruikersnaam").fill("mila");
  await page.getByLabel("Profielfoto").setInputFiles(await makeImage(page, 3, "image/png", 600, 600));
  await expect(page.locator('input[name="avatarId"]')).toHaveValue(/[0-9a-f-]{36}/);
  await page.getByLabel("Kopregel").fill("Portret- en productfotograaf in Utrecht");
  await page
    .getByLabel("Introductie")
    .fill("Ik fotografeer mensen en producten, het liefst met daglicht en op locatie. Snel, rustig en zonder poespas.");
  await page.getByLabel("Creatief").check();
  await page.getByLabel("Vaardigheden").fill("portretfotografie, productfotografie, Lightroom");
  await page.getByLabel("Plaats").fill("Utrecht");
  await page.getByLabel("Provincie").selectOption("utrecht");
  await page.getByLabel("Ik werk ook op afstand").check();
  await page.getByLabel(/Mijn profiel is openbaar/).check();
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(page.getByText("Opgeslagen. Je profiel staat online op /@mila.")).toBeVisible();

  await page.goto("/dashboard/portfolio");
  await page.getByLabel("Foto of video").setInputFiles(await makeImage(page, 7));
  await expect(page.locator('input[name="mediaId"]')).toHaveValue(/[0-9a-f-]{36}/);
  await page.getByLabel("Titel").fill("Bakkerij Sanne, productshoot");
  await page.getByLabel("Categorie").selectOption("creatief");
  await page.getByLabel(/Dit is mijn eigen werk/).check();
  await page.getByRole("button", { name: "Toevoegen aan portfolio" }).click();
  await expect(page.getByText("Toegevoegd aan je portfolio.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Bakkerij Sanne, productshoot" })).toBeVisible();

  await page.goto("/dashboard/diensten/nieuw");
  await page.getByLabel(/Direct boeken/).check();
  await page.getByLabel("Titel", { exact: true }).fill("Portretshoot op locatie");
  await page.getByLabel("Korte omschrijving").fill("Een uur fotograferen op een plek die bij je past.");
  await page.getByLabel("Categorie").selectOption("creatief");
  await page.getByLabel("Waar lever je?").selectOption("both");
  await page
    .getByLabel("Omschrijving", { exact: true })
    .fill("Ik kom naar je toe en fotografeer je een uur lang. Je krijgt twintig bewerkte foto's in een online galerij.");
  await page.getByLabel("Wat is inbegrepen").fill("1 uur fotograferen\n20 bewerkte foto's\nOnline galerij");
  await page.getByLabel("Prijs", { exact: true }).fill("150");
  await page.getByLabel("Levertijd in dagen").fill("7");
  await expect(page.getByText("Je ontvangt € 135 per opdracht")).toBeVisible();
  await page.getByLabel("Uitbreiding 1").fill("Extra uur");
  await page.getByLabel("Prijs (€)").first().fill("75");
  await page.getByLabel("Extra dagen").first().fill("2");
  await page.getByRole("button", { name: "Publiceren" }).click();
  await expect(page).toHaveURL(/\/dashboard\/diensten\?opgeslagen=/);
  serviceId = new URL(page.url()).searchParams.get("opgeslagen")!;
  await expect(page.getByText("Gepubliceerd")).toBeVisible();

  await page.goto("/dashboard/diensten/nieuw");
  await page.getByLabel(/Op aanvraag \(maatwerk\)/).check();
  await page.getByLabel("Titel", { exact: true }).fill("Huisstijlfotografie op maat");
  await page.getByLabel("Categorie").selectOption("creatief");
  await page
    .getByLabel("Omschrijving", { exact: true })
    .fill("Een complete beeldbank voor je merk: portretten, sfeer en product. We stemmen alles samen af.");
  await page.getByLabel("Vanafprijs (optioneel)").fill("450");
  await page.getByRole("button", { name: "Publiceren" }).click();
  await expect(page).toHaveURL(/\/dashboard\/diensten\?opgeslagen=/);
  customServiceId = new URL(page.url()).searchParams.get("opgeslagen")!;
});

test("visitors discover the maker through search, categories and region filters", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Je hebt iets");
  await expect(page.getByRole("link", { name: "Portretshoot op locatie" }).first()).toBeVisible();

  await page.goto("/ontdek?q=portret");
  await expect(page.getByRole("link", { name: "Portretshoot op locatie" })).toBeVisible();
  await page.goto("/ontdek?q=loodgieter");
  await expect(page.getByText("Niets gevonden met deze filters")).toBeVisible();
  await page.goto("/ontdek?regio=utrecht&soort=makers");
  await expect(page.getByRole("link", { name: "Mila de Vries" })).toBeVisible();
  await page.goto("/ontdek?regio=zeeland&soort=makers");
  await expect(page.getByRole("link", { name: "Mila de Vries" })).toHaveCount(0);
  await page.goto("/ontdek?categorie=creatief&boeken=overleg");
  await expect(page.getByRole("link", { name: "Huisstijlfotografie op maat" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Portretshoot op locatie" })).toHaveCount(0);

  await page.goto("/@mila");
  await expect(page.getByRole("heading", { name: "Mila de Vries", level: 1 })).toBeVisible();
  await expect(page.getByText("Particuliere aanbieder")).toBeVisible();
  await expect(page.getByText("0 volgers")).toBeVisible();
  await page.getByRole("button", { name: "Mila de Vries volgen" }).click();
  await expect(page).toHaveURL(/\/inloggen\?next=%2F%40mila/);

  // A draft or unpublished maker is not public.
  expect((await page.request.get("/@onbekend")).status()).toBe(404);
});

test("a buyer follows, saves, and orders a fixed-price service with explicit confirmation", async ({ browser }) => {
  bas = await newUser(browser, "bas@e2e.test", "Bas Jansen", "buy");
  const { page } = bas;
  await page.goto("/@mila");
  await page.getByRole("button", { name: "Mila de Vries volgen" }).click();
  await expect(page.getByRole("button", { name: "Mila de Vries niet meer volgen" })).toBeEnabled();
  await page.reload();
  await expect(page.getByText("1 volger", { exact: true })).toBeVisible();

  await page.goto(`/diensten/${serviceId}`);
  await expect(page.getByText("Direct te boeken")).toBeVisible();
  await page.getByRole("button", { name: "Bewaren" }).click();
  // Optimistic first, then confirmed by the server: wait until the request has settled.
  await expect(page.getByRole("button", { name: "Bewaard" })).toBeEnabled();
  await page.goto("/bewaard");
  await expect(page.getByRole("link", { name: "Portretshoot op locatie" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Mila de Vries/ }).first()).toBeVisible();

  await page.goto(`/diensten/${serviceId}`);
  await page.getByRole("link", { name: "Bestellen" }).click();
  await expect(page).toHaveURL(`/bestellen/${serviceId}`);
  await page.getByLabel(/Extra uur/).check();
  await expect(page.getByText("Je betaalt")).toBeVisible();
  await expect(page.locator(".kv .total").last()).toHaveText("€ 225");
  await page.getByLabel("Wat moet de maker weten?").fill("Graag buiten, in het Wilhelminapark.");
  await page.getByRole("button", { name: "Bestellen met betaalverplichting" }).click();
  // The browser refuses without the confirmation checkbox; nothing was created.
  expect((await sql`select count(*)::int as n from orders`)[0].n).toBe(0);
  await page.getByLabel(/Ik ga akkoord met de voorwaarden/).check();
  await page.getByRole("button", { name: "Bestellen met betaalverplichting" }).click();
  await expect(page).toHaveURL(/\/opdrachten\/[0-9a-f-]{36}\?nieuw=1/);
  fixedOrderId = await orderIdFromUrl(page);
  await expect(page.getByRole("heading", { name: "Rond de betaling af" })).toBeVisible();
  await expect(page.getByText("Online betalen is in deze omgeving nog niet geconfigureerd")).toBeVisible();
  await page.getByRole("button", { name: /Betalen/ }).click();
  await expect(page.getByText("Online betalen is nog niet geconfigureerd. Er is niets afgeschreven.")).toBeVisible();
  const [o] =
    await sql`select status, payment_status, price_cents, fee_cents, seller_amount_cents, terms_accepted_at from orders where id = ${fixedOrderId}`;
  expect(o).toMatchObject({
    status: "awaiting_payment",
    payment_status: "none",
    price_cents: 22_500,
    fee_cents: 2_250,
    seller_amount_cents: 20_250,
  });
  expect(o.terms_accepted_at).not.toBeNull();
});

test("only a verified webhook with the agreed amount marks an order paid", async () => {
  const { page } = bas;
  const forged = await page.request.post("/api/stripe/webhook", { data: "{}", headers: { "stripe-signature": "t=1,v1=nep" } });
  expect(forged.status()).toBe(400);
  const wrong = await stripeEvent(page, "checkout.session.completed", checkoutCompleted(fixedOrderId, 100));
  expect(wrong.body.outcome).toBe("flagged: amount mismatch");
  expect((await sql`select status from orders where id = ${fixedOrderId}`)[0].status).toBe("awaiting_payment");

  const ok = await stripeEvent(page, "checkout.session.completed", checkoutCompleted(fixedOrderId, 22_500));
  expect(ok.body.outcome).toBe(`paid:${fixedOrderId}`);
  const replay = await page.request.post("/api/stripe/webhook", {
    data: ok.payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": (await import("stripe")).default.webhooks.generateTestHeaderString({
        payload: ok.payload,
        secret: "whsec_e2e_contract",
      }),
    },
  });
  expect((await replay.json()).outcome).toBe("duplicate");
  await page.goto(`/opdrachten/${fixedOrderId}`);
  await expect(page.getByRole("heading", { name: "De maker is aan de slag" })).toBeVisible();
});

test("buyer and maker talk live; delivery, approval and a review that only a completed order allows", async () => {
  await mila.page.goto(`/opdrachten/${fixedOrderId}`);
  await bas.page.goto(`/opdrachten/${fixedOrderId}`);
  await expect(mila.page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
  await bas.page.getByRole("textbox", { name: "Bericht aan Mila de Vries" }).fill("Zaterdag om 10 uur bij de vijver?");
  await bas.page.getByRole("button", { name: "Verstuur" }).click();
  await expect(mila.page.getByText("Zaterdag om 10 uur bij de vijver?")).toBeVisible({ timeout: 10_000 });
  threadId = (await sql`select id from threads limit 1`)[0].id;

  await mila.page.getByLabel("Opleverbericht").fill("De foto's staan in je galerij: https://galerij.example/bas");
  await mila.page.getByRole("button", { name: "Opleveren" }).click();
  // The action panel moves on to the next step.
  await expect(mila.page.getByRole("heading", { name: "Opgeleverd", level: 2 })).toBeVisible();

  await bas.page.reload();
  await expect(bas.page.getByRole("heading", { name: "Bekijk de oplevering" })).toBeVisible();
  await bas.page.getByRole("button", { name: "Goedkeuren en afronden" }).click();
  await expect(bas.page.getByRole("heading", { name: "Afgerond", level: 2 })).toBeVisible();
  await bas.page.getByLabel("5 van 5 sterren").check();
  await bas.page.getByLabel("Hoe was het?").fill("Superfijne shoot, rustig en de foto's waren binnen een week klaar.");
  await bas.page.getByRole("button", { name: "Review plaatsen" }).click();
  await expect(bas.page.getByText("Bedankt voor je review.")).toBeVisible();
  const [o] = await sql`select status, transfer_status from orders where id = ${fixedOrderId}`;
  // Payouts wait until Stripe is configured; they are never marked sent without a real transfer.
  expect(o).toMatchObject({ status: "completed", transfer_status: "pending" });

  await bas.page.goto("/@mila");
  await expect(bas.page.getByText("Superfijne shoot")).toBeVisible();
  await expect(bas.page.getByText("Geverifieerde opdracht: Portretshoot op locatie")).toBeVisible();
  await expect(bas.page.getByText("1 afgeronde opdracht")).toBeVisible();
});

test("custom work: request, questions, quote and acceptance", async () => {
  await bas.page.goto(`/diensten/${customServiceId}`);
  await bas.page.getByRole("link", { name: "Offerte aanvragen" }).click();
  await expect(bas.page).toHaveURL(new RegExp(`/aanvragen/mila\\?dienst=${customServiceId}`));
  await bas.page.getByLabel("Waar gaat het om?").fill("Beeldbank voor mijn koffiebar");
  await bas.page
    .getByLabel("Omschrijf je opdracht")
    .fill("Ik open in maart een koffiebar en zoek sfeerbeelden, portretten van het team en productfoto's.");
  await bas.page.getByLabel("Budget (optioneel)").fill("500");
  await bas.page.getByRole("button", { name: "Aanvraag versturen" }).click();
  await expect(bas.page).toHaveURL(/\/opdrachten\/[0-9a-f-]{36}\?nieuw=1/);
  customOrderId = await orderIdFromUrl(bas.page);
  await expect(bas.page.getByRole("heading", { name: "Wachten op een offerte" })).toBeVisible();

  await mila.page.goto(`/opdrachten/${customOrderId}`);
  await expect(mila.page.getByText("Ik open in maart een koffiebar")).toBeVisible();
  await mila.page.getByLabel("Prijs (totaal)").fill("490");
  await mila.page.getByLabel("Levertijd in dagen").fill("14");
  await mila.page.getByLabel("Wat zit erin?").fill("Halve dag shooten, 60 bewerkte beelden.");
  await expect(mila.page.getByText("Je ontvangt € 441 na 10% platformkosten.")).toBeVisible();
  await mila.page.getByRole("button", { name: "Offerte versturen" }).click();
  await expect(mila.page.getByRole("heading", { name: "Je offerte staat open" })).toBeVisible();

  await bas.page.reload();
  await expect(bas.page.getByRole("heading", { name: "Je hebt een offerte" })).toBeVisible();
  await bas.page.getByLabel(/Ik ga akkoord met de voorwaarden/).check();
  await bas.page.getByRole("button", { name: "Offerte accepteren met betaalverplichting (€ 490)" }).click();
  await expect(bas.page.getByRole("heading", { name: "Rond de betaling af" })).toBeVisible();
  const [o] = await sql`select status, price_cents, delivery_days from orders where id = ${customOrderId}`;
  expect(o).toMatchObject({ status: "awaiting_payment", price_cents: 49_000, delivery_days: 14 });
});

test("a third person cannot see orders, conversations, streams or other people's uploads", async ({ browser }) => {
  cas = await newUser(browser, "cas@e2e.test", "Cas Peters", "buy");
  const r = cas.page.request;
  for (const path of [`/opdrachten/${fixedOrderId}`, `/opdrachten/${customOrderId}`, `/berichten/${threadId}`]) {
    expect((await r.get(path)).status(), path).toBe(404);
  }
  expect((await r.get(`/api/stream/gesprek/${threadId}`)).status()).toBe(404);
  const [media] = await sql`select id from media limit 1`;
  const finish = await r.post(`/api/uploads/${media.id}/klaar`, { headers: { origin: "http://localhost:3100" } });
  expect(finish.status()).toBe(403);
  // Anonymous visitors are sent to the login.
  const anon = await browser.newContext();
  const res = await anon.request.get(`/opdrachten/${fixedOrderId}`, { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  await anon.close();
});

test("uploads are checked by their bytes, not by their name", async () => {
  const { page } = mila;
  await page.goto("/dashboard/portfolio");
  await page
    .getByLabel("Foto of video")
    .setInputFiles({ name: "vakantie.jpg", mimeType: "image/jpeg", buffer: Buffer.from("dit is geen foto maar tekst") });
  await expect(page.getByText("Dit bestand is niet wat het lijkt te zijn")).toBeVisible();
  await page.getByLabel("Foto of video").setInputFiles({ name: "tekening.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByText("Kies een foto (JPG, PNG, WebP) of video")).toBeVisible();
});

test("reports go to a moderator, who can hide content with a reason the owner sees", async ({ browser }) => {
  await cas.page.goto(`/diensten/${customServiceId}`);
  await cas.page.getByRole("button", { name: "Dienst melden" }).click();
  await cas.page.getByLabel(/Misleidend aanbod/).check();
  await cas.page.getByLabel("Toelichting (optioneel)").fill("Deze foto's lijken van een ander te zijn.");
  await cas.page.getByRole("button", { name: "Melding versturen" }).click();
  await expect(cas.page.getByText("Bedankt. Een moderator bekijkt je melding.")).toBeVisible();

  const ada = await browser.newContext();
  const page = await ada.newPage();
  await login(page, "ada@e2e.test", "/beheer");
  expect(page.url()).not.toContain("/beheer");
  await sql`insert into roles (user_id, role) select id, 'admin' from users where email = 'ada@e2e.test'`;
  await page.goto("/beheer/meldingen");
  await expect(page.getByText("Misleidend aanbod of nepprofiel")).toBeVisible();
  await page.getByText("Deze inhoud verbergen").click();
  await page.getByLabel(/Reden om te verbergen/).fill("Herkomst van de beelden is onduidelijk; we vragen om bewijs.");
  await page.getByRole("button", { name: "Verbergen" }).click();
  await expect(page.getByText("Verborgen en vastgelegd.")).toBeVisible();
  await page.getByLabel("Afhandelen (maatregel genomen)").fill("Dienst verborgen in afwachting van bewijs.");
  await page.getByRole("button", { name: "Afgehandeld" }).click();
  await expect(page.getByText("Besluit: Dienst verborgen in afwachting van bewijs.")).toBeVisible();

  expect((await cas.page.request.get(`/diensten/${customServiceId}`)).status()).toBe(404);
  await mila.page.goto(`/dashboard/diensten`);
  await expect(mila.page.getByText("Herkomst van de beelden is onduidelijk")).toBeVisible();
  await ada.close();
});

test("main pages pass automated accessibility checks (WCAG 2.2 A/AA, serious and critical)", async () => {
  const { page } = bas;
  for (const path of [
    "/",
    "/ontdek",
    "/@mila",
    `/diensten/${serviceId}`,
    `/opdrachten/${customOrderId}`,
    "/dashboard",
    "/hoe-het-werkt",
    "/bewaard",
    "/berichten",
  ]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${path}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
});

test("after logging out the old session no longer works, and cross-site posts are refused", async () => {
  const { page, context } = cas;
  const cookie = (await context.cookies()).find((c) => c.name === "sy_session")!;
  await page.goto("/account");
  await page.getByRole("button", { name: "Uitloggen" }).click();
  await expect(page).toHaveURL("/");
  const replay = await page.request.get("/dashboard", { headers: { cookie: `sy_session=${cookie.value}` }, maxRedirects: 0 });
  expect(replay.status()).toBe(307);
  const cross = await bas.page.request.post("/api/uploads", {
    data: { purpose: "portfolio", contentType: "image/jpeg", size: 10 },
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });
  expect(cross.status()).toBe(403);
});
