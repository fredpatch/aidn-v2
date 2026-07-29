import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { SCOPE_CATEGORY_LABELS } from '../constants';
import { useCertificateFields } from '../hooks/useCertificateFields';
import type { CertificateView, ScopeDetails, ScopeCategory } from '../types';

const EMPTY_CATEGORY: ScopeCategory = { qualification: '', qualificationEn: '', limitations: '' };
const EMPTY_SCOPE: ScopeDetails = {
  aeronefs: { ...EMPTY_CATEGORY },
  moteurs: { ...EMPTY_CATEGORY },
  composants: { ...EMPTY_CATEGORY },
  specialisee: { ...EMPTY_CATEGORY },
};

const CATEGORY_KEYS: (keyof ScopeDetails)[] = ['aeronefs', 'moteurs', 'composants', 'specialisee'];

interface ScopeDetailsCardProps {
  requestId: string | undefined;
  certificate: CertificateView;
  setActionError: (message: string | null) => void;
}

export default function ScopeDetailsCard({
  requestId,
  certificate,
  setActionError,
}: ScopeDetailsCardProps) {
  const editable = certificate.status === 'in_preparation';
  const { busy, saveFields } = useCertificateFields(requestId, setActionError);
  const [scope, setScope] = useState<ScopeDetails>(certificate.scopeDetails ?? EMPTY_SCOPE);

  function updateCategory(key: keyof ScopeDetails, field: keyof ScopeCategory, value: string) {
    setScope((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  async function handleSave() {
    await saveFields(certificate.id, { scopeDetails: scope });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList size={16} className="text-anac-navy" />
        <span className="font-medium text-sm">Classe(s) et qualification(s)</span>
      </div>
      <p className="text-anac-muted text-xs">
        Ces 4 catégories sont fixes. Indiquer &quot;Nil&quot; si non applicable - ne pas laisser
        vide.
      </p>

      <div className="space-y-4">
        {CATEGORY_KEYS.map((key) => (
          <div key={key} className="border-t border-anac-border pt-3 first:border-t-0 first:pt-0">
            <p className="text-xs font-medium text-anac-navy mb-2">{SCOPE_CATEGORY_LABELS[key]}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Qualification (FR)</label>
                <input
                  className="input"
                  value={scope[key].qualification}
                  disabled={!editable}
                  onChange={(e) => updateCategory(key, 'qualification', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Qualification (EN)</label>
                <input
                  className="input"
                  value={scope[key].qualificationEn}
                  disabled={!editable}
                  onChange={(e) => updateCategory(key, 'qualificationEn', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Limites</label>
                <input
                  className="input"
                  value={scope[key].limitations}
                  disabled={!editable}
                  onChange={(e) => updateCategory(key, 'limitations', e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {editable && (
        <Button size="sm" onClick={handleSave} disabled={busy}>
          Enregistrer
        </Button>
      )}
    </div>
  );
}
