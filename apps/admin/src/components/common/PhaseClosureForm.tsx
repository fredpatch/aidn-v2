import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../ui/button';

const closureSchema = z.object({
  note: z.string().optional(),
  file: z.instanceof(File).nullable().optional(),
});

export type ClosureFormValues = z.infer<typeof closureSchema>;

/**
 * Shared body for phase-closure forms (note + optional document + submit).
 * Each phase page keeps its own outer chrome (plain card vs CollapsibleCard,
 * title, icon) and its own domain-specific close-action hook — this
 * component only owns the note/file/submit wiring the 3 phase pages were
 * each reimplementing identically.
 */
export function PhaseClosureForm({
  busy,
  onClose,
  description,
  className = 'space-y-3',
}: {
  busy: boolean;
  onClose: (values: ClosureFormValues) => Promise<boolean>;
  description: string;
  className?: string;
}) {
  const { register, handleSubmit, reset, setValue } = useForm<ClosureFormValues>({
    resolver: zodResolver(closureSchema),
    defaultValues: { note: '', file: null },
  });

  async function onSubmit(values: ClosureFormValues) {
    const ok = await onClose(values);
    if (ok) reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={className}>
      <p className="text-anac-muted text-xs">{description}</p>
      <div>
        <label className="label">Note (optionnel)</label>
        <textarea className="input" rows={2} {...register('note')} />
      </div>
      <div>
        <label className="label">Document joint (optionnel)</label>
        <input type="file" onChange={(e) => setValue('file', e.target.files?.[0] ?? null)} />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? 'Cloture...' : 'Cloturer la phase'}
      </Button>
    </form>
  );
}
