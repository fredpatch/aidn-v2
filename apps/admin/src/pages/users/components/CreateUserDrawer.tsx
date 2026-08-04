import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { SheetBody, SheetHeader } from '../../../components/ui/sheet';
import type { PrefillUser } from '../types';
import { RoleSelector } from './RoleSelector';

const createUserSchema = z.object({
  employeeCode: z.string(),
  fullName: z.string(),
  email: z.string(),
  roles: z.array(z.string()).min(1, 'Selectionnez au moins un role.'),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

export function CreateUserDrawer({
  prefill,
  submitting,
  onClose,
  onCreate,
}: {
  prefill: PrefillUser | null;
  submitting: boolean;
  onClose: () => void;
  onCreate: (params: {
    employeeCode: string;
    fullName: string;
    email: string;
    roles: string[];
  }) => void;
}) {
  const { register, handleSubmit, watch, setValue, formState } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      employeeCode: prefill?.employeeCode ?? '',
      fullName: prefill?.fullName ?? '',
      email: '',
      roles: [],
    },
  });

  const roles = watch('roles');

  function toggleRole(role: string) {
    setValue(
      'roles',
      roles.includes(role) ? roles.filter((item) => item !== role) : [...roles, role],
      { shouldValidate: formState.isSubmitted }
    );
  }

  function onSubmit(values: CreateUserFormValues) {
    onCreate(values);
  }

  const error = formState.errors.roles?.message;

  return (
    <>
      <SheetHeader onClose={onClose}>
        <div>
          <p className="text-lg font-semibold text-anac-navy">
            {prefill ? 'Activation depuis Personnel ANAC' : 'Nouvel utilisateur AIDN'}
          </p>
          <p className="text-sm text-anac-muted">Un OTP sera envoye pour la premiere connexion.</p>
        </div>
      </SheetHeader>
      <SheetBody>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-anac-danger">{error}</p>}
          <div>
            <Label>Matricule</Label>
            <Input {...register('employeeCode')} disabled={!!prefill} required />
          </div>
          <div>
            <Label>Nom complet</Label>
            <Input {...register('fullName')} required />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" {...register('email')} required />
          </div>
          <div>
            <Label>Roles</Label>
            <RoleSelector roles={roles} onToggle={toggleRole} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Activation...' : 'Activer le compte'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
          </div>
        </form>
      </SheetBody>
    </>
  );
}
