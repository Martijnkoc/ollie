export default function Loading() {
  return (
    <div className="container narrow page stack" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Laden…</span>
      <div className="skeleton" style={{ height: 40, width: "60%" }} />
      <div className="skeleton" style={{ height: 18, width: "90%" }} />
      <div className="skeleton" style={{ height: 160 }} />
    </div>
  );
}
