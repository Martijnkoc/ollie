import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppealForm } from "@/components/forms/AccountForms";
import { viewer } from "@/lib/access";
import { getDb, one } from "@/lib/db";

export const metadata: Metadata = { title: "Account beperkt", robots: { index: false } };

export default async function RestrictedPage() {
  const v = await viewer();
  if (!v) redirect("/inloggen?next=/beperkt");
  if (!v.restricted) redirect("/account");
  const appeal = await one<{ status: string; response: string | null }>(
    await getDb(),
    `select status, response from appeals where user_id = $1 order by created_at desc limit 1`,
    [v.user.id],
  );
  return (
    <div className="container narrow page stack-lg">
      <h1>Je account is beperkt</h1>
      <div className="card stack">
        <p>
          Een moderator heeft je account beperkt. Je kunt nu niet in de community, geen uitnodigingen versturen en niet deelnemen aan
          videodates.
        </p>
        <p>
          <strong>Reden:</strong> {v.user.restricted_reason}
        </p>
      </div>
      {appeal?.status === "open" ? (
        <p className="notice">Je bezwaar wordt beoordeeld door een moderator.</p>
      ) : (
        <div className="card flat stack">
          {appeal?.status === "rejected" && <p className="notice">Je vorige bezwaar is afgewezen: {appeal.response}</p>}
          <h2>Bezwaar maken</h2>
          <AppealForm />
        </div>
      )}
    </div>
  );
}
