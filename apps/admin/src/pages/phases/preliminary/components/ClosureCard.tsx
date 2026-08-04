import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../../../../components/ui/button';
import { usePhaseCloseAction } from '../hooks/usePhaseCloseAction';

const closureSchema = z.object({
  note: z.string().optional(),
  file: z.instanceof(File).nullable().optional(),
});

type ClosureFormValues = z.infer<typeof closureSchema>;

interface ClosureCardProps {
  phaseId: number;
  requestId: string | undefined;
  setActionError: (message: string | null) => void;
}

export default function ClosureCard({ phaseId, requestId, setActionError }: ClosureCardProps) {
  const { busy, close } = usePhaseCloseAction(setActionError, requestId);
  const { register, handleSubmit, reset, setValue } = useForm<ClosureFormValues>({
    resolver: zodResolver(closureSchema),
    defaultValues: { note: '', file: null },
  });

  async function onSubmit(values: ClosureFormValues) {
    const ok = await close({ phaseId, note: values.note, file: values.file ?? null });
    if (ok) reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-3">
      <span className="font-medium text-sm">Cloturer la phase</span>
      <p className="text-anac-muted text-xs">
        Document et note sont tous les deux facultatifs - vous pouvez cloturer directement.
      </p>
      <div>
        <label className="label">Note (optionnel)</label>
        <textarea className="input" rows={2} {...register('note')} />
      </div>
      <div>
        <label className="label">Document joint (optionnel)</label>
        <input
          type="file"
          onChange={(e) => setValue('file', e.target.files?.[0] ?? null)}
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? 'Cloture...' : 'Cloturer la phase'}
      </Button>
    </form>
  );
}
