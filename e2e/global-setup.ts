import { BASE_URL, E2E_CRON_SECRET } from "../playwright.config";

/** Two scheduler rounds through the protected cron endpoint: competitions and fixtures, then seasons. */
export default async function globalSetup() {
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`${BASE_URL}/api/cron/sync`, { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
    if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
    const report = (await res.json()) as { jobs: { key: string; status: string }[] };
    const failed = report.jobs.filter((j) => j.status === "failed");
    if (failed.length) throw new Error(`Sync jobs failed: ${failed.map((j) => j.key).join(", ")}`);
  }
}
