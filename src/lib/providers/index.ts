import "server-only";
import type { AppConfig } from "@/lib/env";
import { DemoProvider } from "./demo/provider";
import { SportmonksProvider } from "./sportmonks/client";
import type { FootballProvider, ProviderContext } from "./types";

/** The configured data source, or null when none is configured. Never available to the browser. */
export function createProvider(cfg: AppConfig, ctx: ProviderContext = {}): FootballProvider | null {
  if (cfg.provider === "sportmonks" && cfg.sportmonksToken) return new SportmonksProvider(cfg.sportmonksToken, ctx);
  if (cfg.provider === "demo") return new DemoProvider(ctx);
  return null;
}

export type { FootballProvider } from "./types";
