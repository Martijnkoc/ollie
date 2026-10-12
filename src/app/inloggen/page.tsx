import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/LoginForm";
import { otpProvider } from "@/lib/auth/otp";
import { currentUser, safeNext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Inloggen", robots: { index: false } };

export default async function LoginPage(props: PageProps<"/inloggen">) {
  const { next } = await props.searchParams;
  const target = safeNext(typeof next === "string" ? next : undefined, "/afspraken");
  if (await currentUser()) redirect(target);
  const provider = otpProvider();
  return (
    <div className="container narrow page stack-lg">
      <div>
        <h1>Inloggen of account maken</h1>
        <p className="lead">Met je e-mailadres. Je match of uitnodiging wacht op je.</p>
      </div>
      {provider === "none" ? (
        <p className="notice warn" role="status">
          Inloggen is nog niet geconfigureerd: er is geen e-maildienst ingesteld. Dit is een configuratiestap, geen fout aan jouw kant.
        </p>
      ) : (
        <LoginForm next={target} />
      )}
      <p className="muted small">
        Een e-mailcode bevestigt dat je dit adres beheert. Het is geen identiteitscontrole: blijf zelf alert, zeker bij een eerste echte
        afspraak.
      </p>
    </div>
  );
}
