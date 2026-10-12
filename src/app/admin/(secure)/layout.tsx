import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/actions/admin";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Beheer", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="container section stack-lg">
      <nav className="row" aria-label="Beheer">
        <Link className="btn ghost" href="/admin">
          Overzicht
        </Link>
        <Link className="btn ghost" href="/admin/avonden">
          Kennismakingsavonden
        </Link>
        <Link className="btn ghost" href="/admin/meldingen">
          Meldingen
        </Link>
        <Link className="btn ghost" href="/admin/leden">
          Leden
        </Link>
        <form action={logoutAction} style={{ marginLeft: "auto" }}>
          <button type="submit" className="btn ghost">
            Uitloggen
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
