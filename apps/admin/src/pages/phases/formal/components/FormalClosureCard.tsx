import { LockKeyhole } from 'lucide-react';
import CollapsibleCard from '../../../../components/ui/collapsible-card';
import { PhaseClosureForm } from '../../../../components/common/PhaseClosureForm';
import { useFormalCloseAction } from '../hooks/useFormalCloseAction';

interface FormalClosureCardProps {
  phaseId: number;
  requestId: string | undefined;
  setActionError: (message: string | null) => void;
}

export default function FormalClosureCard({
  phaseId,
  requestId,
  setActionError,
}: FormalClosureCardProps) {
  const { busy, close } = useFormalCloseAction(requestId, setActionError);

  return (
    <CollapsibleCard
      title="Cloturer la phase - Demande formelle"
      icon={<LockKeyhole size={16} className="text-anac-navy" />}
      defaultOpen
      resetKey={busy}
    >
      <PhaseClosureForm
        busy={busy}
        description="Document et note sont tous les deux facultatifs."
        onClose={(values) => close({ phaseId, note: values.note, file: values.file ?? null })}
      />
    </CollapsibleCard>
  );
}
