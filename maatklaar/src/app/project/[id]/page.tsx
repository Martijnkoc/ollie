import type { Metadata } from "next";
import { ProjectApp } from "@/components/project/ProjectApp";
import { publicPaymentInfo } from "@/lib/payments/config";

export const metadata: Metadata = { title: "Mijn woning", robots: { index: false } };

export default async function ProjectPage({ params }: PageProps<"/project/[id]">) {
  const { id } = await params;
  // Server-side: which payment mode is active (live, test, DEMO or unavailable). Never exposes keys.
  const payment = publicPaymentInfo();
  return <ProjectApp id={id} payment={payment} />;
}
