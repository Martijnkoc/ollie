import type { Metadata } from "next";
import { PaymentReturn } from "@/components/project/PaymentReturn";

export const metadata: Metadata = { title: "Betaling controleren", robots: { index: false } };

/**
 * Where the payment provider sends the buyer back. Only the order id is read from the URL; any other
 * parameter (status=paid or similar) is ignored. The status is verified by our server with the provider.
 */
export default async function PaymentReturnPage({ searchParams }: PageProps<"/betaling/terug">) {
  const { order } = await searchParams;
  return <PaymentReturn orderId={typeof order === "string" ? order : ""} />;
}
