import { UserPlus } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import type { PersonnelAnacResult } from '../../../lib/api/personnel-anac.types';
import { initials } from '../utils';
import { DetailSection, InfoRow } from './DetailPrimitives';

export function PersonnelDetailPanel({
  personnel,
  canManageAccounts,
  onActivate,
}: {
  personnel: PersonnelAnacResult | null;
  canManageAccounts: boolean;
  onActivate: (personnel: PersonnelAnacResult) => void;
}) {
  if (!personnel) {
    return (
      <aside className="w-full min-w-0 rounded-lg border border-anac-border bg-white p-6 text-center shadow-sm md:sticky md:top-20">
        <p className="font-semibold text-anac-navy">Aucun agent selectionne</p>
        <p className="mt-1 text-sm text-anac-muted">
          Selectionnez un agent Personnel ANAC pour consulter la fiche.
        </p>
      </aside>
    );
  }

  return (
    <aside className="w-full min-w-0 rounded-lg border border-anac-border bg-white shadow-sm md:sticky md:top-20">
      <div className="border-b border-anac-border p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-anac-blue/10 text-sm font-semibold text-anac-blue">
            {initials(personnel.fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-anac-navy">
              {personnel.fullName || 'Agent ANAC'}
            </p>
            <p className="text-sm text-anac-muted">Matricule {personnel.employeeCode}</p>
          </div>
          <span
            className={`rounded-full px-2 py-1 text-xs font-semibold ${
              personnel.hasAccount ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {personnel.hasAccount ? 'Compte cree' : 'A activer'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 p-3">
        <DetailSection title="Fiche Personnel ANAC">
          <InfoRow label="Nom" value={personnel.lastName ?? '-'} />
          <InfoRow label="Prenom" value={personnel.firstName ?? '-'} />
          <InfoRow label="Organisation" value={personnel.organisationLabel ?? 'Non renseigne'} />
          <InfoRow
            label="Compte AIDN"
            value={personnel.hasAccount ? 'Deja cree' : 'A activer'}
            strong
          />
        </DetailSection>

        <DetailSection title="Activation AIDN">
          <p className="text-sm text-anac-muted">
            L'annuaire ANAC confirme l'identite. L'activation AIDN ajoute l'email de connexion, les
            roles internes et envoie l'OTP de premiere connexion.
          </p>
          <Button
            type="button"
            disabled={!canManageAccounts || personnel.hasAccount}
            onClick={() => onActivate(personnel)}
            className="mt-3 w-full"
          >
            <UserPlus size={14} />
            Activer le compte AIDN
          </Button>
        </DetailSection>
      </div>
    </aside>
  );
}
