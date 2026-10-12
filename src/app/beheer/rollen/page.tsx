import type { Metadata } from "next";
import { revokeRoleAction } from "@/app/actions/moderation";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { GrantRole } from "@/components/forms/ModerationForms";
import { requireStaff } from "@/lib/access";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Rollen", robots: { index: false } };

export default async function RolesPage() {
  const v = await requireStaff("admin");
  const roles = await (
    await getDb()
  ).query<{ user_id: string; role: "admin" | "moderator"; email: string }>(
    `select r.user_id, r.role, u.email from roles r join users u on u.id = r.user_id order by r.role, u.email`,
  );
  return (
    <>
      <h1>Rollen</h1>
      <p className="muted">Alleen beheerders zien deze pagina. Elke wijziging komt in het logboek.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Rol</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={`${r.user_id}-${r.role}`}>
                <td>{r.email}</td>
                <td>{r.role === "admin" ? "Beheerder" : "Moderator"}</td>
                <td>
                  {!(r.user_id === v.user.id && r.role === "admin") && (
                    <ActionForm action={revokeRoleAction.bind(null, r.user_id, r.role)}>
                      <SubmitButton className="btn ghost small">Intrekken</SubmitButton>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <GrantRole />
    </>
  );
}
