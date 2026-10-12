import { expect, test } from "@playwright/test";
import { resetDb, shiftDate, sql } from "./db";

test.beforeAll(resetDb);

function tomorrowAt(hour: number) {
  const d = new Date(Date.now() + 24 * 3600_000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d);
  return `${day}T${String(hour).padStart(2, "0")}:00`;
}

test("invite → moment → videodate → private choice → contact", async ({ page, browser }) => {
  // Host creates the invite.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Eerst een klik. Dan een date.");
  await page.getByRole("link", { name: /Ik heb al een match/ }).click();
  await page.getByLabel("Jouw voornaam").fill("Bram");
  await page.getByLabel("Voornaam van je match").fill("Sanne");
  await page.getByLabel("Jouw e-mailadres").fill("bram@example.nl");
  await page.locator('input[name="moment"]').first().fill(tomorrowAt(20));
  await page.getByRole("button", { name: /Nog een moment/ }).click();
  await page.locator('input[name="moment"]').nth(1).fill(tomorrowAt(21));
  await page.getByLabel("Een kort berichtje").fill("Leuk om je eens te horen!");
  await page.getByLabel(/18 jaar of ouder/).check();
  await page.getByRole("button", { name: "Maak uitnodiging" }).click();

  await expect(page.getByRole("heading", { name: "Stuur deze link naar Sanne" })).toBeVisible();
  const manageUrl = page.url().split("?")[0];
  const inviteUrl = await page.getByLabel("Uitnodigingslink").inputValue();
  expect(inviteUrl).toContain("/u/");

  // Guest opens the link in their own browser, without an account.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(inviteUrl);
  await expect(guest.getByRole("heading", { name: "Hoi Sanne!" })).toBeVisible();
  await expect(guest.getByText("Leuk om je eens te horen!")).toBeVisible();
  await guest.getByRole("radio").first().check();
  await guest.getByLabel("Jouw voornaam").first().fill("Sanne");
  await guest.getByLabel(/18 jaar of ouder/).first().check();
  await guest.getByRole("button", { name: "Ik doe mee" }).click();
  await expect(guest.getByRole("heading", { name: "Met Bram" })).toBeVisible();
  await expect(guest.getByText("De ruimte gaat open over")).toBeVisible();
  const guestToken = new URL(guest.url()).pathname.split("/")[2];

  // Reopening the invite link in the same browser leads back to the date.
  await guest.goto(inviteUrl);
  await expect(guest.getByRole("heading", { name: "Met Bram" })).toBeVisible();

  // Calendar file.
  const ics = await guest.request.get(`/d/${guestToken}/agenda`);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("DURATION:PT20M");

  // Host sees the confirmation.
  await page.goto(manageUrl);
  await expect(page.getByRole("heading", { name: "Sanne doet mee" })).toBeVisible();
  await page.getByRole("link", { name: "Naar jullie videodate" }).click();
  await expect(page.getByRole("heading", { name: "Met Sanne" })).toBeVisible();
  const hostDateUrl = page.url();

  // The date is live: the room opens with a countdown (demo video without a provider key).
  await shiftDate(guestToken, 2);
  await guest.goto(`/d/${guestToken}`);
  await guest.getByRole("link", { name: "Naar binnen" }).click();
  await expect(guest.getByText("Videodate met Bram")).toBeVisible();
  await expect(guest.getByText(/^Nog \d\d:\d\d$/)).toBeVisible();
  await expect(guest.getByText(/Demomodus/)).toBeVisible();

  // Twenty minutes later the room is closed and everyone chooses privately.
  await shiftDate(guestToken, 21);
  await guest.goto(`/d/${guestToken}/kamer`);
  await expect(guest.getByRole("heading", { name: "Hoe was het?" })).toBeVisible();
  await guest.getByRole("button", { name: "Ja, graag" }).click();
  await expect(guest.getByRole("heading", { name: "Nu is Bram aan de beurt" })).toBeVisible();
  await guest.getByRole("button", { name: "Een beetje" }).click();
  await expect(guest.getByText("Dank je voor je antwoord")).toBeVisible();

  await page.goto(hostDateUrl);
  await page.getByRole("button", { name: "Ja, graag" }).click();
  await expect(page.getByRole("heading", { name: "Jullie willen allebei verder" })).toBeVisible();
  await expect(page.getByText("Sanne heeft nog niets gedeeld")).toBeVisible();

  // Contact details stay hidden until Sanne shares them herself.
  await guest.reload();
  await guest.getByLabel("Wat wil je met Bram delen?").fill("06 12 34 56 78");
  await guest.getByLabel(/toestemming/).check();
  await guest.getByRole("button", { name: "Deel met Bram" }).click();
  await expect(guest.getByText("Jij deelt:")).toBeVisible();
  await page.reload();
  await expect(page.getByText("06 12 34 56 78")).toBeVisible();

  // Guests are invited, never enrolled, into the community.
  await guest.getByRole("link", { name: "Iemand nieuw leren kennen" }).click();
  await expect(guest.getByRole("heading", { name: "Leuk dat je er weer bent, Sanne" })).toBeVisible();
  await expect(guest.getByLabel("Voornaam", { exact: true })).toHaveValue("Sanne");

  const [{ helped }] = await sql<{ helped: string }[]>`select helped from participants where token = ${guestToken}`;
  expect(helped).toBe("somewhat");
  await guestContext.close();
});

test("a single no stays private", async ({ page, browser }) => {
  await page.goto("/uitnodigen");
  await page.getByLabel("Jouw voornaam").fill("Kim");
  await page.getByLabel("Jouw e-mailadres").fill("kim@example.nl");
  await page.locator('input[name="moment"]').first().fill(tomorrowAt(19));
  await page.getByLabel(/18 jaar of ouder/).check();
  await page.getByRole("button", { name: "Maak uitnodiging" }).click();
  const inviteUrl = await page.getByLabel("Uitnodigingslink").inputValue();

  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(inviteUrl);
  await expect(guest.getByRole("heading", { name: "Je bent uitgenodigd" })).toBeVisible();
  await guest.getByLabel("Jouw voornaam").first().fill("Lex");
  await guest.getByLabel(/18 jaar of ouder/).first().check();
  await guest.getByRole("button", { name: "Ik doe mee" }).click();
  await expect(guest.getByRole("heading", { name: "Met Kim" })).toBeVisible();
  const guestToken = new URL(guest.url()).pathname.split("/")[2];
  await shiftDate(guestToken, 30);

  await guest.reload();
  await guest.getByRole("button", { name: "Nee, dank je" }).click();
  await expect(guest.getByRole("heading", { name: "Nu is Kim aan de beurt" })).toBeVisible();

  await page.reload();
  await page.getByRole("link", { name: "Naar jullie videodate" }).click();
  await page.getByRole("button", { name: "Ja, graag" }).click();
  await expect(page.getByRole("heading", { name: "Deze keer geen vervolg" })).toBeVisible();
  // The outcome never says who declined.
  const outcome = page.locator(".card", { has: page.getByRole("heading", { name: "Deze keer geen vervolg" }) });
  await expect(outcome).not.toContainText(/nee|Lex/i);
  await ctx.close();
});
