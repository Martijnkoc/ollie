import type { Metadata } from "next";

export const metadata: Metadata = { title: "Berichten", robots: { index: false } };

export default function MessagesHome() {
  return (
    <div className="empty" style={{ border: 0, height: "100%", display: "grid", placeContent: "center" }}>
      <h2 style={{ fontSize: "1.4rem" }}>Kies een gesprek</h2>
      <p>Berichten over opdrachten zie je ook bij de opdracht zelf.</p>
    </div>
  );
}
