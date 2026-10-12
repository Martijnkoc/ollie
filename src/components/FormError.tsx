export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      {error}
    </div>
  );
}
