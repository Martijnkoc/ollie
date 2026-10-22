import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { login, moveDate, newUser, onboard, quarterHourFromNow, sql, stripeEvent } from "./helpers";

// Two test members (Anna, Bram), one external match without membership (Gina), and a third member (Cas)
// who must never get access to what is not theirs.
test.describe.configure({ mode: "serial" });

type Actor = { context: BrowserContext; page: Page; email: string };
let anna: Actor;
let bram: Actor;
let gina: Actor;
let cas: Actor;
let inviteDateId = "";
let inviteLink = "";

test("paid access comes only from a verified Stripe webhook", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, "anna@e2e.test");
  await onboard(page, "Anna");
  await expect(page.getByText("Betalen is nog niet geconfigureerd")).toBeVisible();

  await page.goto("/cafe/lounge");
  await expect(page).toHaveURL(/\/lidmaatschap/);

  const forged = await page.request.post("/api/stripe/webhook", { data: "{}", headers: { "stripe-signature": "t=1,v1=nep" } });
  expect(forged.status()).toBe(400);
  await page.goto("/cafe/lounge");
  await expect(page).toHaveURL(/\/lidmaatschap/);

  const first = await stripeEvent(page, "customer.subscription.created", "anna@e2e.test");
  expect(first.status).toBe(200);
  const replay = await page.request.post("/api/stripe/webhook", {
    data: first.payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": (await import("stripe")).default.webhooks.generateTestHeaderString({
        payload: first.payload,
        secret: "whsec_e2e_contract",
      }),
    },
  });
  expect((await replay.json()).outcome).toBe("duplicate");

  await page.goto("/cafe/lounge");
  await expect(page.getByRole("heading", { name: "De lounge" })).toBeVisible();
  await page.goto("/lidmaatschap");
  await expect(page.getByText("0 van 5 gebruikt")).toBeVisible();
  anna = { context, page, email: "anna@e2e.test" };
});

test("members chat in real time; someone without membership cannot read the community", async ({ browser }) => {
  bram = await newUser(browser, "bram@e2e.test", "Bram", true);
  await bram.page.goto("/cafe/lounge");
  await anna.page.goto("/cafe/lounge");
  await expect(anna.page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
  await expect(bram.page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();

  await anna.page.getByRole("textbox", { name: "Bericht" }).fill("Hoi allemaal, iemand een tip voor een wandeling?");
  await anna.page.getByRole("button", { name: "Verstuur" }).click();
  // Bram's page was not reloaded: the message arrives over the live stream.
  await expect(bram.page.getByText("Hoi allemaal, iemand een tip voor een wandeling?")).toBeVisible({ timeout: 10_000 });

  gina = await newUser(browser, "gina@e2e.test");
  await gina.page.goto("/cafe/lounge");
  await expect(gina.page).toHaveURL(/\/welkom/);
  const stream = await gina.page.request.get("/api/stream/kanaal/lounge");
  expect(stream.status()).toBe(403);
  const anonymous = await (await browser.newContext()).request.get("http://localhost:3100/api/stream/kanaal/lounge");
  expect(anonymous.status()).toBe(403);
});

test("a private chat starts with a request and leads to a confirmed videodate; blocking stops it", async () => {
  await bram.page.goto("/cafe/leden?q=Anna");
  await bram.page.getByRole("link", { name: /Anna/ }).click();
  await bram.page.getByLabel("Een kort berichtje (optioneel)").fill("Leuk wat je in de lounge schreef!");
  await bram.page.getByRole("button", { name: "Verzoek sturen" }).click();
  await expect(bram.page.getByText("Je verzoek is verstuurd")).toBeVisible();

  await anna.page.goto("/berichten");
  await expect(anna.page.getByText("Leuk wat je in de lounge schreef!")).toBeVisible();
  await anna.page.getByRole("button", { name: "Accepteren" }).click();
  await expect(anna.page).toHaveURL(/\/berichten\/[0-9a-f-]{36}/);
  const threadUrl = anna.page.url();

  await bram.page.goto(threadUrl);
  await anna.page.getByRole("textbox", { name: "Bericht" }).fill("Hoi Bram!");
  await anna.page.getByRole("button", { name: "Verstuur" }).click();
  await expect(bram.page.getByText("Hoi Bram!")).toBeVisible({ timeout: 10_000 });

  await bram.page.getByLabel("Wanneer?").fill(quarterHourFromNow(26));
  await bram.page.getByRole("button", { name: "Videodate voorstellen" }).click();
  await expect(bram.page.getByRole("heading", { name: "Wacht op Anna" })).toBeVisible();
  const proposalUrl = bram.page.url();

  await anna.page.goto(proposalUrl);
  await anna.page.getByRole("button", { name: "Ja, dat past" }).click();
  await expect(anna.page.getByRole("heading", { name: "Met Bram" })).toBeVisible();
  const [credit] = await sql<{ credit_status: string; email: string }[]>`
    select d.credit_status, u.email from dates d join users u on u.id = d.organizer_id where d.source = 'community'`;
  expect(credit).toEqual({ credit_status: "reserved", email: "bram@e2e.test" });

  // Cas, a third member, gets nothing of theirs.
  cas = await newUser(anna.page.context().browser()!, "cas@e2e.test", "Cas", true);
  await cas.page.goto(threadUrl);
  await expect(cas.page.getByRole("heading", { name: "Niet gevonden" })).toBeVisible();
  await cas.page.goto(proposalUrl);
  await expect(cas.page.getByRole("heading", { name: "Niet gevonden" })).toBeVisible();

  await anna.page.goto(threadUrl);
  await anna.page.getByRole("button", { name: "Blokkeren" }).click();
  await anna.page.getByRole("dialog").getByRole("button", { name: "Blokkeren" }).click();
  await expect(anna.page).toHaveURL(/\/berichten$/);
  await bram.page.goto(threadUrl);
  await expect(bram.page.getByText("In dit gesprek kun je geen berichten meer sturen.")).toBeVisible();
  await bram.page.goto("/cafe/leden?q=Anna");
  await expect(bram.page.getByText("Niemand gevonden")).toBeVisible();
  const [blocked] = await sql<
    { status: string; credit_status: string }[]
  >`select status, credit_status from dates where source = 'community'`;
  expect(blocked).toEqual({ status: "cancelled", credit_status: "released" });
});

test("an external match accepts with their own login; the organiser confirms who it is", async () => {
  await anna.page.goto("/uitnodigen");
  await anna.page.getByLabel("Voornaam van je match").fill("Gina");
  await anna.page.getByLabel("Waar matchten jullie?").selectOption("Hinge");
  await anna.page.locator('input[name="moment"]').first().fill(quarterHourFromNow(24));
  await anna.page.getByLabel("Een kort berichtje (optioneel)").fill("Leuk om je eens te zien!");
  await anna.page.getByRole("button", { name: "Maak uitnodigingslink" }).click();
  inviteLink = await anna.page.getByLabel("Uitnodigingslink").inputValue();
  expect(inviteLink).toMatch(/\/uitnodiging#[A-Za-z0-9_-]{32}$/);
  const [stored] = await sql<{ token_hash: string }[]>`select token_hash from invites`;
  expect(stored.token_hash).not.toContain(inviteLink.split("#")[1]);

  // Gina is logged out in a fresh browser; she reads the invitation first.
  const fresh = await anna.page.context().browser()!.newContext();
  const g = await fresh.newPage();
  await g.goto(inviteLink);
  await expect(g.getByRole("heading", { name: "Hoi Gina!" })).toBeVisible();
  expect(g.url()).not.toContain("#");
  await g.getByRole("link", { name: "Inloggen en bevestigen" }).click();
  await login(g, "gina@e2e.test", "/uitnodiging");
  await expect(g.getByRole("heading", { name: "Hoi Gina!" })).toBeVisible();
  await g.getByRole("radio").first().check();
  await g.getByLabel("Je voornaam").fill("Gina");
  await g.getByLabel(/Een berichtje voor Anna/).fill("Ik ben het, van Hinge");
  await g.getByLabel(/18 jaar of ouder/).check();
  await g.getByRole("button", { name: "Ik doe mee" }).click();
  await expect(g.getByRole("heading", { name: "Anna bevestigt nog dat jij het bent" })).toBeVisible();
  gina = { context: fresh, page: g, email: "gina@e2e.test" };

  // Cas gets hold of the same link: it is spent.
  await cas.page.goto(inviteLink);
  await expect(cas.page.getByText("Deze uitnodiging is al beantwoord.")).toBeVisible();

  await anna.page.goto("/afspraken");
  await anna.page.getByRole("link", { name: /Gina wil meedoen/ }).click();
  await expect(anna.page.getByText("Ik ben het, van Hinge")).toBeVisible();
  await anna.page.getByRole("button", { name: "Ja, bevestig de videodate" }).click();
  await expect(anna.page.getByRole("heading", { name: "Met Gina" })).toBeVisible();
  inviteDateId = anna.page.url().split("/").pop()!;

  await gina.page.goto("/afspraken");
  await gina.page.getByRole("link", { name: /Anna/ }).click();
  await expect(gina.page.getByRole("heading", { name: "Met Anna" })).toBeVisible();
  await expect(gina.page.getByText("Tijdzone Europe/Amsterdam")).toBeVisible();
  const [m] = await sql<
    { n: number }[]
  >`select count(*)::int as n from memberships m join users u on u.id = m.user_id where u.email = 'gina@e2e.test'`;
  expect(m.n).toBe(0);

  // A third person gets no page, no token and no heartbeat for this date.
  await cas.page.goto(`/afspraken/${inviteDateId}`);
  await expect(cas.page.getByRole("heading", { name: "Niet gevonden" })).toBeVisible();
  await moveDate(inviteDateId, 1);
  for (const path of ["deelnemen", "hartslag"]) {
    const res = await cas.page.request.post(`/api/afspraken/${inviteDateId}/${path}`, { headers: { origin: "http://localhost:3100" } });
    expect(res.status()).toBe(403);
  }
});

test("the twenty minutes start once when both are present; refresh gives no extra time", async () => {
  await moveDate(inviteDateId, 1);
  for (const p of [anna.page, gina.page]) {
    await p.goto(`/afspraken/${inviteDateId}/kamer`);
    await expect(p.getByText("Testmodus: geen echte videoverbinding")).toBeVisible();
    await p.getByRole("button", { name: "Deelnemen" }).click();
  }
  await expect(anna.page.getByText(/^Nog (19|20):\d\d$/)).toBeVisible({ timeout: 20_000 });
  await expect(gina.page.getByText(/^Nog (19|20):\d\d$/)).toBeVisible({ timeout: 20_000 });
  const [first] = await sql<
    { started_at: Date; ends_at: Date; credit_status: string }[]
  >`select started_at, ends_at, credit_status from dates where id = ${inviteDateId}`;
  expect(first.ends_at.getTime() - first.started_at.getTime()).toBe(20 * 60_000);
  expect(first.credit_status).toBe("consumed");

  // Refresh and rejoin: same end time.
  await gina.page.reload();
  await gina.page.getByRole("button", { name: "Deelnemen" }).click();
  await expect(gina.page.getByText(/^Nog \d\d:\d\d$/)).toBeVisible({ timeout: 20_000 });
  const [again] = await sql<{ ends_at: Date }[]>`select ends_at from dates where id = ${inviteDateId}`;
  expect(again.ends_at.getTime()).toBe(first.ends_at.getTime());

  // Two minutes before the end, both get a visible and announced warning.
  await sql`update dates set started_at = now() - interval '18 minutes 30 seconds', ends_at = now() + interval '90 seconds' where id = ${inviteDateId}`;
  await expect(anna.page.locator(".toast", { hasText: "Nog twee minuten" })).toBeVisible({ timeout: 15_000 });
  await expect(anna.page.getByRole("status").filter({ hasText: "Nog twee minuten." })).toHaveCount(1);

  // Let the twenty minutes pass on the server clock: both are taken to the private questions.
  await sql`update dates set scheduled_at = scheduled_at - interval '21 minutes', started_at = started_at - interval '21 minutes', ends_at = ends_at - interval '21 minutes' where id = ${inviteDateId}`;
  await expect(anna.page.getByRole("heading", { name: "Hoe was het?" })).toBeVisible({ timeout: 20_000 });
  await expect(gina.page.getByRole("heading", { name: "Hoe was het?" })).toBeVisible({ timeout: 20_000 });
  const res = await gina.page.request.post(`/api/afspraken/${inviteDateId}/deelnemen`, { headers: { origin: "http://localhost:3100" } });
  expect(res.status()).toBe(403);
});

async function answer(page: Page, next: string) {
  await page.getByRole("group", { name: "Voelde het gesprek prettig?" }).getByLabel("Ja").check();
  await page
    .getByRole("group", { name: /Heeft dit gesprek je geholpen/ })
    .getByLabel("Ja")
    .check();
  await page.getByRole("group", { name: "Hoe wil je verder?" }).getByLabel(next).check();
  await page.getByRole("button", { name: "Bewaar mijn antwoorden" }).click();
}

test("feedback stays private; only mutual interest opens a follow-up; contact needs separate consent", async () => {
  await answer(gina.page, "Graag afspreken");
  await expect(gina.page.getByRole("heading", { name: "Nu is Anna aan de beurt" })).toBeVisible();
  await anna.page.reload();
  await expect(anna.page.getByRole("heading", { name: "Hoe was het?" })).toBeVisible();
  await expect(anna.page.getByText("Graag afspreken", { exact: true })).toHaveCount(1); // only her own option label

  await answer(anna.page, "Graag afspreken");
  await expect(anna.page.getByRole("heading", { name: "Jullie willen allebei verder" })).toBeVisible();
  await expect(anna.page.getByText("Gina heeft nog niets gedeeld.")).toBeVisible();

  await gina.page.reload();
  await expect(gina.page.getByRole("heading", { name: "Jullie willen allebei verder" })).toBeVisible();
  const phone = gina.page.locator("form", { has: gina.page.getByLabel("Telefoonnummer") });
  await phone.getByLabel("Telefoonnummer").fill("06 12 34 56 78");
  await phone.getByRole("button", { name: "Deel met Anna" }).click();
  // Without ticking consent the form is not sent (the server refuses it too; see unit tests).
  expect(await phone.getByLabel(/Ik deel dit bewust met Anna/).evaluate((el) => (el as HTMLInputElement).validity.valid)).toBe(false);
  expect(await sql`select 1 from contact_shares`).toHaveLength(0);
  await phone.getByLabel(/Ik deel dit bewust met Anna/).check();
  await phone.getByRole("button", { name: "Deel met Anna" }).click();
  await expect(gina.page.getByText("Telefoonnummer gedeeld:")).toBeVisible();

  await anna.page.reload();
  await expect(anna.page.getByText("06 12 34 56 78")).toBeVisible();
  await expect(gina.page.getByText("Anna heeft nog niets gedeeld.")).toBeVisible();
  const [consent] = await sql<{ consent_text: string }[]>`select consent_text from contact_shares`;
  expect(consent.consent_text).toContain("intrekken");
});

test("logout, other accounts and direct calls do not get around authorisation", async () => {
  const cookies = await gina.context.cookies();
  const session = cookies.find((c) => c.name === "cafe_session")!;
  await gina.page.goto("/account");
  await gina.page.getByRole("button", { name: "Uitloggen" }).click();
  await gina.page.goto("/afspraken");
  await expect(gina.page).toHaveURL(/\/inloggen/);
  const replay = await gina.page.request.post(`/api/afspraken/${inviteDateId}/hartslag`, {
    headers: { cookie: `cafe_session=${session.value}`, origin: "http://localhost:3100" },
  });
  expect(replay.status()).toBe(401);

  const crossSite = await anna.page.request.post(`/api/afspraken/${inviteDateId}/einde`, { headers: { origin: "https://evil.example" } });
  expect(crossSite.status()).toBe(403);
});

test("only staff reach moderation; a moderator's restriction is explained and can be appealed", async () => {
  await anna.page.goto("/beheer");
  await expect(anna.page).toHaveURL("http://localhost:3100/");
  await sql`insert into roles (user_id, role) select id, 'admin' from users where email = 'cas@e2e.test'`;
  await cas.page.goto("/beheer/meldingen");
  await expect(cas.page.getByRole("heading", { name: "Meldingen", exact: true })).toBeVisible();
  const [bramId] = await sql<{ id: string }[]>`select id from users where email = 'bram@e2e.test'`;
  await cas.page.goto(`/beheer/gebruikers/${bramId.id}`);
  await cas.page.getByLabel(/Reden voor beperking/).fill("Herhaaldelijk ongevraagde berichten na een afwijzing.");
  await cas.page.getByRole("button", { name: "Account beperken" }).click();
  await expect(cas.page.getByText(/^Beperkt sinds .*Herhaaldelijk ongevraagde berichten/)).toBeVisible();

  await bram.page.goto("/cafe/lounge");
  await expect(bram.page).toHaveURL(/\/beperkt/);
  await expect(bram.page.getByText("Herhaaldelijk ongevraagde berichten na een afwijzing.")).toBeVisible();
  await bram.page.getByLabel("Waarom ben je het hier niet mee eens?").fill("Ik had het verzoek niet goed begrepen, sorry.");
  await bram.page.getByRole("button", { name: "Bezwaar indienen" }).click();
  await expect(bram.page.getByText("Je bezwaar is ontvangen")).toBeVisible();

  await cas.page.goto("/beheer/bezwaren");
  await cas.page.getByLabel(/Toekennen/).fill("Eerste keer, uitleg is redelijk.");
  await cas.page.getByRole("button", { name: "Bezwaar toekennen" }).click();
  await expect(cas.page.getByText("Toegekend", { exact: true })).toBeVisible();
  await bram.page.goto("/cafe/lounge");
  await expect(bram.page.getByRole("heading", { name: "De lounge" })).toBeVisible();
  const log = await sql<{ action: string }[]>`select action from moderation_actions order by created_at`;
  expect(log.map((l) => l.action)).toEqual(["restrict", "appeal_granted"]);
});

test("key pages have no serious automated accessibility violations", async () => {
  for (const path of ["/", "/lidmaatschap", "/cafe/lounge", "/uitnodigen", `/afspraken/${inviteDateId}`, "/account", "/privacy"]) {
    await anna.page.goto(path);
    const results = await new AxeBuilder({ page: anna.page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${path}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  }
});

test("deleting an account removes the person and keeps the other side's history neutral", async () => {
  await login(gina.page, "gina@e2e.test", "/account");
  await gina.page.getByText("Ik wil mijn account verwijderen").click();
  await gina.page.getByLabel("Typ VERWIJDER om te bevestigen").fill("VERWIJDER");
  await gina.page.getByRole("button", { name: "Account en gegevens verwijderen" }).click();
  await expect(gina.page.getByText("Je account en gegevens zijn verwijderd.")).toBeVisible();
  const rows = await sql`select 1 from users where email = 'gina@e2e.test'`;
  expect(rows).toHaveLength(0);
  const shares = await sql`select 1 from contact_shares`;
  expect(shares).toHaveLength(0);
  await anna.page.goto("/afspraken");
  await expect(anna.page.getByText("Verwijderd account")).toBeVisible();
});
