import type { Metadata } from "next";
import { GrantRole, RevokeRole } from "@/components/forms/ModerationForms";
import { requireStaff } from "@/lib/access";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Rollen", robots: { index: false } };

export default async function RolesPage() {
  await requireStaff("admin");
  const rows = await (
    await getDb()
  ).query<{ user_id: string; email: string; role: "admin" | "moderator"; name: string | null }>(
    `select r.user_id, u.email, r.role, p.display_name as name from roles r join users u on u.id = r.user_id left join profiles p on p.user_id = r.user_id order by r.role, u.email`,
  );
  return (
    <>
      <h1>Rollen</h1>
      <GrantRole />
      <ul className="divided">
        {rows.map((r) => (
          <li key={`${r.user_id}-${r.role}`} className="row between">
            <span>
              {r.name ?? r.email} <span className="faint small">({r.email})</span> ·{" "}
              <strong>{r.role === "admin" ? "Beheerder" : "Moderator"}</strong>
            </span>
            <RevokeRole userId={r.user_id} role={r.role} />
          </li>
        ))}
      </ul>
    </>
  );
}
