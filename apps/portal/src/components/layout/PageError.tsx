/** Full-page load failure with a retry (the page has nothing else to show). */
export function PageError({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div role="alert" className="card max-w-lg mx-auto space-y-3">
      <p className="text-anac-danger">{message}</p>
      <button type="button" className="btn-secondary text-sm" onClick={() => onRetry()} disabled={retrying}>
        {retrying ? 'Chargement...' : 'Réessayer'}
      </button>
    </div>
  );
}
