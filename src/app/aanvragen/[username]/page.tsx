import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RequestForm } from "@/components/forms/OrderForms";
import { Avatar } from "@/components/Visuals";
import { requireActive } from "@/lib/access";
import { getDb } from "@/lib/db";
import { profileByUsername } from "@/lib/profiles";
import { getService } from "@/lib/services";

export const metadata: Metadata = { title: "Maatwerk aanvragen", robots: { index: false } };

export default async function RequestPage(props: PageProps<"/aanvragen/[username]">) {
  const { username } = await props.params;
  const sp = await props.searchParams;
  const serviceId = typeof sp.dienst === "string" ? sp.dienst : undefined;
  const v = await requireActive(`/aanvragen/${username}${serviceId ? `?dienst=${serviceId}` : ""}`);
  const db = await getDb();
  const p = await profileByUsername(db, username, v.user.id);
  if (!p || p.user_id === v.user.id) notFound();
  const service = serviceId ? await getService(db, serviceId, v.user.id) : undefined;
  if (service && (service.owner_id !== p.user_id || !service.visible)) notFound();
  if (p.availability === "unavailable") redirect(`/@${p.username}`);
  return (
    <div className="container narrow page stack-lg">
      <div className="stack">
        <p className="eyebrow">Maatwerk aanvragen</p>
        <h1 style={{ margin: 0 }}>Vertel {p.display_name} wat je zoekt</h1>
        <Link href={`/@${p.username}`} className="byline">
          <Avatar name={p.display_name} url={p.avatar_url} size={28} />
          <span>
            {p.display_name}
            {p.headline && ` · ${p.headline}`}
          </span>
        </Link>
        {service && (
          <p className="notice small">
            Over de dienst: <strong>{service.title}</strong>
          </p>
        )}
      </div>
      <RequestForm
        username={p.username}
        serviceId={service?.id}
        serviceTitle={service?.title}
        needsLocation={service?.location_mode === "on_site"}
      />
    </div>
  );
}
