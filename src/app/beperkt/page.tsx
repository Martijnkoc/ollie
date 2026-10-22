import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppealForm } from "@/components/forms/AccountForms";
import { viewer } from "@/lib/access";
import { getDb, one } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Account beperkt", robots: { index: false } };

export default async function RestrictedPage() {
  const v = await viewer();
  if (!v) redirect("/inloggen");
  if (!v.restricted) redirect("/dashboard");
  const appeal = await one<{ status: string; response: string | null; created_at: Date }>(
    await getDb(),
    `select status, response, created_at from appeals where user_id = $1 order by created_at desc limit 1`,
    [v.user.id],
  );
  return (
    <div className="container narrow page stack-lg">
      <div>
        <p className="eyebrow">Account beperkt</p>
        <h1>Je account is beperkt</h1>
        <p className="lead">
          Een moderator heeft je account beperkt. Je profiel, werk en diensten zijn niet zichtbaar en je kunt niets kopen of verkopen.
        </p>
      </div>
      <div className="card stack-sm">
        <strong>Reden</strong>
        <p className="pre" style={{ margin: 0 }}>
          {v.user.restricted_reason}
        </p>
      </div>
      <p className="muted small">
        Lopende, betaalde opdrachten worden afgehandeld zodat niemand geld kwijtraakt. Een moderator neemt daarover contact op.
      </p>
      {appeal?.status === "open" ? (
        <p className="notice">Je bezwaar van {formatDate(appeal.created_at)} wordt beoordeeld.</p>
      ) : (
        <>
          {appeal?.status === "rejected" && <p className="notice">Je vorige bezwaar is afgewezen: {appeal.response}</p>}
          <section className="stack" aria-labelledby="bezwaar">
            <h2 id="bezwaar" style={{ fontSize: "1.3rem" }}>
              Bezwaar maken
            </h2>
            <AppealForm />
          </section>
        </>
      )}
    </div>
  );
}
