interface PhaseStatusBadgeProps {
  status: string;
  label?: string;
  toneMap?: Record<string, string>;
  fallbackTone?: string;
}

export default function PhaseStatusBadge({
  status,
  label,
  toneMap = {},
  fallbackTone = 'bg-anac-muted/10 text-anac-muted',
}: PhaseStatusBadgeProps) {
  const tone = toneMap[status] ?? fallbackTone;
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${tone}`}>{label ?? status}</span>
  );
}
