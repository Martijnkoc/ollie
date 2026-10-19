import { defineConfig } from "vitest/config";
import path from "node:path";

/** The validation harness: npm run validate (see validation/harness.run.ts and docs/VALIDATIE.md). */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["validation/**/*.run.ts"], environment: "node", testTimeout: 600_000 },
});
