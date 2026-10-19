import { COMPANY } from "@/config/site";

/** Shows a configured company detail, or a visible placeholder while it has not been filled in. */
export function CompanyField({ field, label }: { field: keyof typeof COMPANY; label: string }) {
  const value = COMPANY[field];
  return value ? <>{value}</> : <span className="placeholder">[{label} nog invullen]</span>;
}

export function DraftBanner({ checklist }: { checklist: string[] }) {
  return (
    <div className="draft-banner" role="note">
      <strong>Concept voor publicatie — geen juridisch advies.</strong> Deze tekst moet vóór livegang door een mens worden gecontroleerd, met actuele bronnen en zo nodig
      juridische hulp.
      <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {checklist.map((c) => (
          <li key={c}>☐ {c}</li>
        ))}
      </ul>
    </div>
  );
}
