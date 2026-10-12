export function FormError({ error, success }: { error?: string; success?: string }) {
  return (
    <div aria-live="polite">
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!error && success && (
        <div className="notice good" role="status">
          {success}
        </div>
      )}
    </div>
  );
}
