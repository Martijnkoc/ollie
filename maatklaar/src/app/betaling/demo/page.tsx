import type { Metadata } from "next";
import { DemoCheckout } from "@/components/project/DemoCheckout";
import { PRICE } from "@/config/site";
import { paymentsConfig } from "@/lib/payments/config";

export const metadata: Metadata = { title: "DEMO-betaling", robots: { index: false } };

/** Stand-in checkout for DEMO mode only. With a real payment provider configured this page does nothing. */
export default async function DemoCheckoutPage({ searchParams }: PageProps<"/betaling/demo">) {
  const { order } = await searchParams;
  if (paymentsConfig().provider !== "demo") {
    return (
      <div className="container app-shell">
        <div className="panel">
          <h1>Niet beschikbaar</h1>
          <p className="muted">De DEMO-betaling is alleen beschikbaar als er geen echte betaalprovider is ingesteld.</p>
        </div>
      </div>
    );
  }
  return <DemoCheckout orderId={typeof order === "string" ? order : ""} priceLabel={PRICE.label} />;
}
