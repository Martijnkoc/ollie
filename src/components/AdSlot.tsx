/**
 * Reserved advertising position. Renders nothing until advertising is switched on
 * (NEXT_PUBLIC_ADS_ENABLED=true) together with a consent setup; then it reserves fixed space so
 * an ad never shifts the layout. No ad scripts are loaded by this component.
 */
export function AdSlot({ position, height = 250 }: { position: "home-aside" | "match-aside" | "competition-aside"; height?: number }) {
  if (process.env.NEXT_PUBLIC_ADS_ENABLED !== "true") return null;
  return (
    <div className="ad-slot" style={{ minHeight: height }} data-ad-position={position} aria-label="Advertentie">
      Advertentie
    </div>
  );
}
