import type { Metadata } from "next";
import { connection } from "next/server";
import { LoginForm } from "@/components/forms/AdminForms";
import { adminConfigured } from "@/lib/admin";

export const metadata: Metadata = { title: "Beheer", robots: { index: false } };

export default async function AdminLoginPage() {
  await connection();
  return (
    <div className="container narrow section stack-lg">
      <h1>Beheer</h1>
      {adminConfigured() ? (
        <LoginForm />
      ) : (
        <p className="notice">
          Beheer is uitgeschakeld. Stel <code>ADMIN_PASSWORD</code> (en bij voorkeur <code>SESSION_SECRET</code>) in om in te
          loggen.
        </p>
      )}
    </div>
  );
}
