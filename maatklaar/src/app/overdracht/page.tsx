import type { Metadata } from "next";
import { TransferReceive } from "@/components/TransferReceive";

export const metadata: Metadata = { title: "Project overnemen", robots: { index: false } };

export default function OverdrachtPage() {
  return <TransferReceive />;
}
