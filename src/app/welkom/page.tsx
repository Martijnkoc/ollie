import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/forms/ProfileForm";
import { viewer } from "@/lib/access";
import { safeNext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Welkom", robots: { index: false } };

export default async function WelcomePage(props: PageProps<"/welkom">) {
  const { next } = await props.searchParams;
  const target = safeNext(typeof next === "string" ? next : undefined, "/lidmaatschap");
  const v = await viewer();
  if (!v) redirect(`/inloggen?next=${encodeURIComponent(`/welkom?next=${target}`)}`);
  if (v.profile) redirect(target);
  return (
    <div className="container narrow page stack-lg">
      <div>
        <p className="eyebrow">Stap 1 van 2 · Profiel</p>
        <h1>Welkom bij Cafe</h1>
        <p className="lead">Een paar dingen, meer niet. Jij kiest wat andere leden te zien krijgen.</p>
      </div>
      <ProfileForm mode="new" next={target} />
    </div>
  );
}
