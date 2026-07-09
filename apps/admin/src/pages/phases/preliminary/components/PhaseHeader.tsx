interface PhaseHeaderProps {
  requestId: string;
}

export default function PhaseHeader({ requestId }: PhaseHeaderProps) {
  return (
    <div>
      <h1 className="text-anac-navy text-xl font-semibold">Phase Preliminaire</h1>
      <p className="text-anac-muted text-sm">Demande #{requestId}</p>
    </div>
  );
}
