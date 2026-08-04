import { PhaseClosureForm } from '../../../../components/common/PhaseClosureForm';
import { usePhaseCloseAction } from '../hooks/usePhaseCloseAction';

interface ClosureCardProps {
  phaseId: number;
  requestId: string | undefined;
  setActionError: (message: string | null) => void;
}

export default function ClosureCard({ phaseId, requestId, setActionError }: ClosureCardProps) {
  const { busy, close } = usePhaseCloseAction(setActionError, requestId);

  return (
    <div className="card space-y-3">
      <span className="font-medium text-sm">Cloturer la phase</span>
      <PhaseClosureForm
        busy={busy}
        description="Document et note sont tous les deux facultatifs - vous pouvez cloturer directement."
        onClose={(values) => close({ phaseId, note: values.note, file: values.file ?? null })}
      />
    </div>
  );
}
