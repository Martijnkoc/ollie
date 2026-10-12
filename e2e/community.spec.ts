import { expect, type Page, test } from "@playwright/test";
import { resetDb, sql } from "./db";

test.beforeAll(resetDb);

function nextThursday() {
  const now = new Date();
  for (let i = 2; i < 10; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d);
    if (new Date(`${day}T12:00:00Z`).getUTCDay() === 4) return day;
  }
  throw new Error("no thursday");
}

async function signUp(page: Page, p: { name: string; email: string; birth: string; gender: string; wants: string }) {
  await page.goto("/");
  await page.getByRole("link", { name: /Ik wil iemand ontmoeten/ }).click();
  await page.getByLabel("Voornaam", { exact: true }).fill(p.name);
  await page.getByLabel("Geboortedatum").fill(p.birth);
  await page.getByLabel("E-mailadres").fill(p.email);
  await page.getByRole("group", { name: "Ik ben" }).getByLabel(p.gender, { exact: true }).check();
  await page.getByRole("group", { name: "Ik wil kennismaken met" }).getByLabel(p.wants).check();
  await page.getByLabel("Regio").selectOption("utrecht");
  await page.getByLabel("Open voor wat er komt").check();
  await page.getByLabel(/Donderdagavond/).check();
  await page.getByLabel(/18 jaar of ouder/).check();
  await page.getByRole("button", { name: "Aanmelden" }).click();
  await expect(page.getByText(`Welkom, ${p.name}!`)).toBeVisible();
  return page.url().split("?")[0];
}

test("sign up → organiser proposes a pair → both accept → date", async ({ page }) => {
  const anna = await signUp(page, { name: "Anna", email: "anna@example.nl", birth: "1993-04-01", gender: "Vrouw", wants: "Mannen" });
  const bram = await signUp(page, { name: "Bram", email: "bram@example.nl", birth: "1991-08-15", gender: "Man", wants: "Vrouwen" });

  // Nothing is announced publicly while the evening is still collecting people.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Wachtwoord").fill("e2e-admin");
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page.getByRole("heading", { name: /Heeft dit gesprek je geholpen/ })).toBeVisible();

  await page.getByRole("link", { name: "Kennismakingsavonden" }).click();
  await page.getByLabel("Moment").selectOption("do-avond");
  await page.getByLabel("Datum").fill(nextThursday());
  await page.getByRole("button", { name: "Avond plannen" }).click();
  await expect(page.getByText("1 mogelijke paren")).toBeVisible();
  await page.getByRole("button", { name: /Alle 1 paren voorstellen/ }).click();
  await expect(page.getByRole("heading", { name: "Verstuurde voorstellen" })).toBeVisible();
  await page.getByRole("button", { name: /Openen/ }).click();

  await page.goto("/ontmoeten");
  await expect(page.getByRole("heading", { name: "Komende kennismakingsavonden" })).toBeVisible();

  await page.goto(anna);
  await expect(page.getByRole("heading", { name: /^Bram, \d+$/ })).toBeVisible();
  await page.getByRole("button", { name: "Ja, ik doe mee" }).click();
  await expect(page.getByText("We wachten op Bram")).toBeVisible();

  await page.goto(bram);
  await page.getByRole("button", { name: "Ja, ik doe mee" }).click();
  await expect(page.getByRole("heading", { name: "Jouw videodates" })).toBeVisible();
  await page.getByRole("link", { name: "Bekijken" }).click();
  await expect(page.getByRole("heading", { name: "Met Anna" })).toBeVisible();

  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from dates where source = 'community'`;
  expect(n).toBe(1);
});

test("cafe waitlist", async ({ page }) => {
  await page.goto("/cafe");
  await expect(page.getByText("€4,99")).toBeVisible();
  await page.getByLabel("Voornaam", { exact: true }).fill("Noor");
  await page.getByLabel("E-mail").fill("noor@example.nl");
  await page.getByLabel("Regio").selectOption("amsterdam");
  await page.getByRole("button", { name: "Zet me op de lijst" }).click();
  await expect(page.getByText("Je staat op de lijst.")).toBeVisible();
});
