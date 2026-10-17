import "server-only";
import { z } from "zod";

/**
 * All configuration is read from the environment on the server. Nothing in here may be
 * imported by client components: tokens and secrets never leave the server.
 *
 * Parsing is tolerant on purpose: a bad value must not take the whole site down. Problems are
 * collected in `issues` and shown on /status, and the affected feature reports itself as
 * "niet geconfigureerd" instead of pretending to work.
 */

export type DataMode = "live" | "demo" | "unconfigured";
export type ProviderId = "sportmonks" | "demo";

export interface AppConfig {
  production: boolean;
  siteUrl: string;
  dataMode: DataMode;
  /** Which provider's rows the site reads and writes. `null` when unconfigured. */
  provider: ProviderId | null;
  sportmonksToken: string | null;
  /** Competition slugs to synchronise; empty means the whole catalogue. */
  competitions: string[];
  livePollSeconds: number;
  /** Requests per day we allow ourselves at the provider; null = no extra cap. */
  providerDailyBudget: number | null;
  cronSecret: string | null;
  admin: { user: string; password: string } | null;
  syncOnTraffic: boolean;
  showProviderLogos: boolean;
  ai: {
    apiKey: string | null;
    model: string;
    effort: "low" | "medium" | "high";
    dailyLimit: number;
  };
  issues: string[];
}

const flag = (value: string | undefined, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1";
};

function int(name: string, value: string | undefined, fallback: number, min: number, max: number, issues: string[]) {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    issues.push(`${name} moet een geheel getal tussen ${min} en ${max} zijn; standaardwaarde ${fallback} gebruikt.`);
    return fallback;
  }
  return n;
}

const urlSchema = z.string().url();

export function readConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const issues: string[] = [];
  const production = env.NODE_ENV === "production";

  let siteUrl = (env.SITE_URL ?? "").replace(/\/+$/, "");
  if (!siteUrl) {
    siteUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";
    if (production) issues.push("SITE_URL ontbreekt; canonieke URL's en de sitemap gebruiken een afgeleide host.");
  } else if (!urlSchema.safeParse(siteUrl).success) {
    issues.push("SITE_URL is geen geldige URL.");
    siteUrl = "http://localhost:3000";
  }

  const sportmonksToken = env.SPORTMONKS_API_TOKEN?.trim() || null;
  if (sportmonksToken && !/^[A-Za-z0-9]{20,200}$/.test(sportmonksToken)) {
    issues.push("SPORTMONKS_API_TOKEN heeft een onverwacht formaat.");
  }

  const requested = (env.DATA_PROVIDER ?? "").trim().toLowerCase();
  const demoAllowed = !production || flag(env.ALLOW_DEMO_DATA);
  let dataMode: DataMode = "unconfigured";
  let provider: ProviderId | null = null;
  if (requested === "demo") {
    if (demoAllowed) {
      dataMode = "demo";
      provider = "demo";
    } else {
      issues.push("DATA_PROVIDER=demo is in productie alleen toegestaan met ALLOW_DEMO_DATA=true (afgeschermde preview).");
    }
  } else if (requested === "sportmonks" || (requested === "" && sportmonksToken)) {
    if (sportmonksToken) {
      dataMode = "live";
      provider = "sportmonks";
    } else {
      issues.push("DATA_PROVIDER=sportmonks maar SPORTMONKS_API_TOKEN ontbreekt.");
    }
  } else if (requested !== "" && requested !== "none") {
    issues.push(`Onbekende DATA_PROVIDER "${requested}". Gebruik sportmonks of demo.`);
  }

  const cronSecret = env.CRON_SECRET?.trim() || null;
  if (cronSecret && cronSecret.length < 24) issues.push("CRON_SECRET is te kort (minimaal 24 tekens).");
  if (!cronSecret && dataMode !== "unconfigured") issues.push("CRON_SECRET ontbreekt; geplande synchronisatie is uitgeschakeld.");

  const adminUser = env.ADMIN_USER?.trim();
  const adminPassword = env.ADMIN_PASSWORD ?? "";
  let admin: AppConfig["admin"] = null;
  if (adminUser && adminPassword) {
    if (adminPassword.length < 16) issues.push("ADMIN_PASSWORD is te kort (minimaal 16 tekens); beheer is uitgeschakeld.");
    else admin = { user: adminUser, password: adminPassword };
  }

  const effort = (env.AI_EFFORT ?? "low").trim();
  const aiEffort = effort === "medium" || effort === "high" ? effort : "low";

  return {
    production,
    siteUrl,
    dataMode,
    provider,
    sportmonksToken: dataMode === "live" ? sportmonksToken : null,
    competitions: (env.COMPETITIONS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    livePollSeconds: int("LIVE_POLL_SECONDS", env.LIVE_POLL_SECONDS, 30, 10, 600, issues),
    providerDailyBudget: env.PROVIDER_DAILY_BUDGET
      ? int("PROVIDER_DAILY_BUDGET", env.PROVIDER_DAILY_BUDGET, 2000, 10, 1_000_000, issues)
      : null,
    cronSecret: cronSecret && cronSecret.length >= 24 ? cronSecret : null,
    admin,
    syncOnTraffic: flag(env.SYNC_ON_TRAFFIC),
    showProviderLogos: flag(env.SHOW_PROVIDER_LOGOS),
    ai: {
      apiKey: env.ANTHROPIC_API_KEY?.trim() || null,
      model: env.AI_MODEL?.trim() || "claude-opus-5-5",
      effort: aiEffort,
      dailyLimit: int("AI_DAILY_LIMIT", env.AI_DAILY_LIMIT, 100, 0, 10_000, issues),
    },
    issues,
  };
}

let cached: AppConfig | undefined;

/** Configuration of this process. Tests pass their own environment to `readConfig` instead. */
export function config(): AppConfig {
  cached ??= readConfig();
  return cached;
}

/** Only for tests that change process.env between cases. */
export function resetConfigCache() {
  cached = undefined;
}
