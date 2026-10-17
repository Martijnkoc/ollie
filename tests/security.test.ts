import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasAdminCredentials, hasCronSecret } from "@/lib/auth";
import { readConfig, resetConfigCache } from "@/lib/env";
import { breadcrumbLd, isIndexable, jsonLdString } from "@/lib/seo";
import { proxy } from "@/proxy";

const TOKEN = "SecretTokenValue0123456789abcdefghijklmnopqrstuvwxyz";
const CRON = "cron-secret-0123456789abcdefghij";
const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;

describe("configuration", () => {
  it("only allows demo data in production behind an explicit flag", () => {
    expect(readConfig({ NODE_ENV: "development", DATA_PROVIDER: "demo" }).dataMode).toBe("demo");
    const prod = readConfig({ NODE_ENV: "production", DATA_PROVIDER: "demo" });
    expect(prod.dataMode).toBe("unconfigured");
    expect(prod.issues.join(" ")).toMatch(/ALLOW_DEMO_DATA/);
    expect(readConfig({ NODE_ENV: "production", DATA_PROVIDER: "demo", ALLOW_DEMO_DATA: "true" }).dataMode).toBe("demo");
  });

  it("needs a token for live data and never repeats secrets in its messages", () => {
    expect(readConfig({ NODE_ENV: "production", DATA_PROVIDER: "sportmonks" }).dataMode).toBe("unconfigured");
    const live = readConfig({
      NODE_ENV: "production",
      SPORTMONKS_API_TOKEN: TOKEN,
      CRON_SECRET: "short",
      ADMIN_USER: "a",
      ADMIN_PASSWORD: "tooshort",
    });
    expect(live.dataMode).toBe("live");
    expect(live.provider).toBe("sportmonks");
    expect(live.cronSecret).toBeNull();
    expect(live.admin).toBeNull();
    const text = JSON.stringify(live.issues);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("tooshort");
    expect(text).toMatch(/CRON_SECRET/);
  });

  it("falls back to defaults for invalid numbers instead of crashing", () => {
    const cfg = readConfig({ NODE_ENV: "production", LIVE_POLL_SECONDS: "1", AI_DAILY_LIMIT: "lots" });
    expect(cfg.livePollSeconds).toBe(30);
    expect(cfg.ai.dailyLimit).toBe(100);
    expect(cfg.issues).toHaveLength(2 + 1); // two numbers + missing SITE_URL in production
  });
});

describe("authentication of internal endpoints", () => {
  const cfg = readConfig({ NODE_ENV: "production", CRON_SECRET: CRON, ADMIN_USER: "beheer", ADMIN_PASSWORD: "een-lang-wachtwoord-123" });

  it("accepts only the exact cron secret as a bearer token", () => {
    expect(hasCronSecret(`Bearer ${CRON}`, cfg)).toBe(true);
    expect(hasCronSecret(`Bearer ${CRON}x`, cfg)).toBe(false);
    expect(hasCronSecret(CRON, cfg)).toBe(false);
    expect(hasCronSecret(null, cfg)).toBe(false);
    expect(hasCronSecret(`Bearer ${CRON}`, readConfig({ NODE_ENV: "production" }))).toBe(false);
  });

  it("accepts only the configured admin credentials", () => {
    expect(hasAdminCredentials(basic("beheer", "een-lang-wachtwoord-123"), cfg)).toBe(true);
    expect(hasAdminCredentials(basic("beheer", "fout"), cfg)).toBe(false);
    expect(hasAdminCredentials(basic("root", "een-lang-wachtwoord-123"), cfg)).toBe(false);
    expect(hasAdminCredentials("Basic !!!", cfg)).toBe(false);
    expect(hasAdminCredentials(basic("beheer", "een-lang-wachtwoord-123"), readConfig({ NODE_ENV: "production" }))).toBe(false);
  });

  it("puts /beheer behind Basic auth in the proxy, closed when no credentials are configured", () => {
    const req = (auth?: string) => new NextRequest("https://voetbalradar.test/beheer", { headers: auth ? { authorization: auth } : {} });
    process.env.ADMIN_USER = "beheer";
    process.env.ADMIN_PASSWORD = "een-lang-wachtwoord-123";
    expect(proxy(req()).status).toBe(401);
    expect(proxy(req()).headers.get("www-authenticate")).toMatch(/Basic/);
    expect(proxy(req(basic("beheer", "fout"))).status).toBe(401);
    expect(proxy(req(basic("beheer", "een-lang-wachtwoord-123"))).status).toBe(200);
    process.env.ADMIN_PASSWORD = "";
    expect(proxy(req(basic("beheer", ""))).status).toBe(401);
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD;
  });
});

describe("API routes", () => {
  const saved = { ...process.env };
  beforeAll(() => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      DATA_PROVIDER: "demo",
      CRON_SECRET: CRON,
      ADMIN_USER: "beheer",
      ADMIN_PASSWORD: "een-lang-wachtwoord-123",
      PGLITE_DIR: path.join(mkdtempSync(path.join(tmpdir(), "vr-")), "db"),
    });
    resetConfigCache();
  });
  afterAll(() => {
    process.env = saved;
    resetConfigCache();
  });

  it("refuses the cron endpoint without the secret", async () => {
    const { GET } = await import("@/app/api/cron/sync/route");
    expect((await GET(new Request("http://x/api/cron/sync"))).status).toBe(401);
    expect((await GET(new Request("http://x/api/cron/sync", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });

  it("refuses the admin endpoint without credentials and limits repeated attempts", async () => {
    const { POST } = await import("@/app/api/admin/sync/route");
    const attempt = () =>
      POST(
        new Request("http://x/api/admin/sync", {
          method: "POST",
          headers: { authorization: basic("beheer", "fout"), "x-real-ip": "203.0.113.9" },
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
    const ok = await POST(
      new Request("http://x/api/admin/sync", {
        method: "POST",
        headers: { authorization: basic("beheer", "een-lang-wachtwoord-123") },
        body: JSON.stringify({ only: ["'; drop table matches; --"] }),
      }),
    );
    expect(ok.status).toBe(400);
  });

  it("validates public input before touching the database", async () => {
    const day = await import("@/app/api/v1/day/[date]/route");
    expect((await day.GET(new Request("http://x"), { params: Promise.resolve({ date: "2026-13-45" }) })).status).toBe(400);
    expect((await day.GET(new Request("http://x"), { params: Promise.resolve({ date: "../../etc" }) })).status).toBe(400);
    const match = await import("@/app/api/v1/matches/[id]/route");
    expect((await match.GET(new Request("http://x"), { params: Promise.resolve({ id: "1 or 1=1" }) })).status).toBe(400);
    const fav = await import("@/app/api/v1/favorites/route");
    expect((await fav.GET(new Request("http://x/api/v1/favorites?teams=1,abc"))).status).toBe(400);
    expect(
      (await fav.GET(new Request(`http://x/api/v1/favorites?teams=${Array.from({ length: 51 }, (_, i) => i + 1).join(",")}`))).status,
    ).toBe(400);
  });
});

describe("search engine rules", () => {
  const live = readConfig({ NODE_ENV: "production", SPORTMONKS_API_TOKEN: TOKEN, SITE_URL: "https://voetbalradar.nl" });

  it("indexes only production deployments with real data", () => {
    expect(isIndexable(live, {})).toBe(true);
    expect(isIndexable(live, { VERCEL_ENV: "production" })).toBe(true);
    expect(isIndexable(live, { VERCEL_ENV: "preview" })).toBe(false);
    expect(isIndexable(readConfig({ NODE_ENV: "production", DATA_PROVIDER: "demo", ALLOW_DEMO_DATA: "true" }), {})).toBe(false);
    expect(isIndexable(readConfig({ NODE_ENV: "development", SPORTMONKS_API_TOKEN: TOKEN }), {})).toBe(false);
    expect(isIndexable(readConfig({ NODE_ENV: "production" }), {})).toBe(false);
  });

  it("serialises structured data without allowing script injection", () => {
    const s = jsonLdString({ name: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("</script>");
    expect(JSON.parse(s).name).toBe("</script><script>alert(1)</script>");
    expect(breadcrumbLd(live, [{ name: "Eredivisie", path: "/competitie/eredivisie" }]).itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Eredivisie",
      item: "https://voetbalradar.nl/competitie/eredivisie",
    });
  });
});
