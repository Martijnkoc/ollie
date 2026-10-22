export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Gesprek laden…</span>
      <div className="skeleton" style={{ height: 56 }} />
      <div className="skeleton" style={{ height: 360 }} />
    </div>
  );
}
