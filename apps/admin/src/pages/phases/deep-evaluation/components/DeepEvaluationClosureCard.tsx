import { LockKeyhole } from 'lucide-react';
import CollapsibleCard from '../../../../components/ui/collapsible-card';
import { PhaseClosureForm } from '../../../../components/common/PhaseClosureForm';
import { useDeepEvaluationCloseAction } from '../hooks/useDeepEvaluationCloseAction';

interface DeepEvaluationClosureCardProps {
  phaseId: number;
  requestId: string | undefined;
  setActionError: (message: string | null) => void;
}

export default function DeepEvaluationClosureCard({
  phaseId,
  requestId,
  setActionError,
}: DeepEvaluationClosureCardProps) {
  const { busy, close } = useDeepEvaluationCloseAction(requestId, setActionError);

  return (
    <CollapsibleCard
      title="Cloturer la phase - Evaluation approfondie"
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
