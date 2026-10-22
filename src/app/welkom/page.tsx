import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardForm } from "@/components/forms/OnboardForm";
import { viewer } from "@/lib/access";
import { safeNext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Welkom", robots: { index: false } };

export default async function WelcomePage(props: PageProps<"/welkom">) {
  const sp = await props.searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/ontdek");
  const v = await viewer();
  if (!v) redirect(`/inloggen?next=${encodeURIComponent(`/welkom${sp.verkopen ? "?verkopen=1" : ""}`)}`);
  if (v.restricted) redirect("/beperkt");
  if (v.profile) redirect(sp.verkopen ? "/dashboard" : next);
  return (
    <div className="container narrow page stack-lg">
      <div>
        <p className="eyebrow">Nog één stap</p>
        <h1>Hoe mogen we je noemen?</h1>
        <p className="lead">Eén account voor kopen én verkopen. Je naam en gebruikersnaam kun je later nog aanpassen.</p>
      </div>
      <OnboardForm next={next} sell={Boolean(sp.verkopen)} />
    </div>
  );
}
