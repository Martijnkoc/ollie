import type { Metadata } from "next";
import Link from "next/link";
import { ProfileForm } from "@/components/forms/ProfileForm";
import { requireActive } from "@/lib/access";

export const metadata: Metadata = { title: "Profiel bewerken", robots: { index: false } };

export default async function EditProfile(props: PageProps<"/dashboard/profiel">) {
  const sp = await props.searchParams;
  const v = await requireActive("/dashboard/profiel");
  const p = v.profile;
  return (
    <>
      <div className="row between">
        <div>
          <p className="eyebrow">{sp.nieuw ? "Welkom bij Sell Yourself" : "Profiel"}</p>
          <h1 style={{ margin: 0 }}>{sp.nieuw ? "Laat zien wat je kunt" : "Je profiel"}</h1>
        </div>
        <Link href={`/@${p.username}`} className="btn secondary">
          Bekijk je profiel
        </Link>
      </div>
      {p.hidden_at && <p className="notice error">Je profiel is verborgen door moderatie: {p.hidden_reason}</p>}
      <ProfileForm
        d={{
          displayName: p.display_name,
          username: p.username,
          headline: p.headline,
          bio: p.bio,
          categories: p.categories,
          skills: p.skills,
          city: p.city,
          region: p.region ?? "",
          worksRemote: p.works_remote,
          travelKm: p.travel_km == null ? "" : String(p.travel_km),
          availability: p.availability,
          availabilityNote: p.availability_note,
          sellerType: p.seller_type,
          kvkNumber: p.kvk_number ?? "",
          website: p.website ?? "",
          avatarId: p.avatar_id,
          avatarUrl: p.avatar_url,
          coverId: p.cover_id,
          coverUrl: p.cover_url,
          published: p.published,
        }}
      />
    </>
  );
}
