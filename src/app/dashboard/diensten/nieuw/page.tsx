import type { Metadata } from "next";
import { ServiceForm } from "@/components/forms/ServiceForm";
import { requireActive } from "@/lib/access";
import { PLATFORM_FEE_BPS } from "@/lib/config";

export const metadata: Metadata = { title: "Nieuwe dienst", robots: { index: false } };

export default async function NewService() {
  const v = await requireActive("/dashboard/diensten/nieuw");
  return (
    <>
      <div>
        <p className="eyebrow">Nieuwe dienst</p>
        <h1 style={{ margin: 0 }}>Wat bied je aan?</h1>
      </div>
      <ServiceForm
        serviceId={null}
        feePercent={PLATFORM_FEE_BPS / 100}
        d={{
          kind: "fixed",
          title: "",
          summary: "",
          description: "",
          category: v.profile.categories[0] ?? "",
          includes: "",
          price: "",
          deliveryDays: "",
          locationMode: v.profile.works_remote ? "remote" : "on_site",
          coverId: null,
          coverUrl: null,
          status: "draft",
          extras: [],
        }}
      />
    </>
  );
}
