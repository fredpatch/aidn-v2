import { useEffect, useState } from 'react';
import { Settings2, Save, Loader2, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import type { ParameterView } from '../../lib/api/settings.types';
import { notify } from '../../lib/notify';
import { useSystemParameters } from './hooks/useSystemParameters';
import { useDevReset } from './hooks/useDevReset';
import { useUploadMaintenance } from './hooks/useUploadMaintenance';

const MODULE_LABELS: Record<string, string> = {
  AUTH: 'Authentification',
  M1: 'Intake & Circuit signature',
  M3: 'Phase Preliminaire',
};

export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-anac-navy text-xl font-semibold flex items-center gap-2">
          <Settings2 size={20} />
          Parametres
        </h1>
        <p className="text-anac-muted text-sm">Configuration systeme et outils de developpement</p>
      </div>

      <SystemParametersSection />
      <UploadsMaintenanceSection />
      <DevResetSection />
    </div>
  );
}

function SystemParametersSection() {
  const { parameters, loading, error, saveParameter } = useSystemParameters();

  const grouped = parameters.reduce<Record<string, ParameterView[]>>((acc, param) => {
    (acc[param.module] ??= []).push(param);
    return acc;
  }, {});

  return (
    <section className="space-y-4">
      <h2 className="text-anac-navy font-semibold text-sm uppercase tracking-wide">
        Parametres systeme
      </h2>

      {loading && <p className="text-anac-muted text-sm">Chargement...</p>}
      {error && <p className="text-anac-danger text-sm">{error}</p>}

      {Object.entries(grouped).map(([module, params]) => (
        <div key={module} className="card space-y-3">
          <p className="text-anac-navy font-medium text-sm">{MODULE_LABELS[module] ?? module}</p>
          <div className="space-y-3">
            {params.map((param) => (
              <ParameterRow key={param.id} parameter={param} onSaved={saveParameter} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ParameterRow({
  parameter,
  onSaved,
}: {
  parameter: ParameterView;
  onSaved: (key: string, value: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(parameter.value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(parameter.value);
  }, [parameter.value]);

  const modified = value !== parameter.value;

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const saveError = await onSaved(parameter.key, value);
      if (saveError) {
        setError(saveError);
        notify.error(saveError);
        return;
      }
      setSaved(true);
      notify.success('Parametre enregistre.');
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-anac-border pt-3 first:border-0 first:pt-0">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <p className="text-sm">{parameter.description ?? parameter.key}</p>
          <p className="text-[10px] text-anac-muted font-mono">{parameter.key}</p>
        </div>

        {parameter.type === 'boolean' ? (
          <select
            className="input h-8 text-sm w-32"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="true">Active</option>
            <option value="false">Desactive</option>
          </select>
        ) : (
          <Input
            type={parameter.type === 'integer' ? 'number' : 'text'}
            className="h-8 text-sm w-32 text-right"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}

        <Button
          size="sm"
          onClick={handleSave}
          disabled={!modified || saving}
          className="h-8 px-2.5 gap-1"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        </Button>

        {saved && <CheckCircle2 size={14} className="text-anac-success" />}
      </div>
      {error && <p className="text-anac-danger text-xs mt-1">{error}</p>}
    </div>
  );
}

function DevResetSection() {
  const { enabled, scopes, labels, loadingStatus, busy, runReset } = useDevReset();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function toggleScope(scope: string) {
    setSelected((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  async function handleReset() {
    setError(null);
    const resetState = await runReset(selected);
    if (resetState.error) {
      setError(resetState.error);
      notify.error(resetState.error);
    }
    if (resetState.result) {
      setResult(resetState.result);
      notify.success(resetState.result);
      setSelected([]);
      setConfirming(false);
    }
  }

  if (loadingStatus) return null;
  if (!enabled) return null; // Not shown at all when the env flag is off - not even a disabled hint.

  return (
    <section className="space-y-3">
      <h2 className="text-anac-danger font-semibold text-sm uppercase tracking-wide flex items-center gap-1.5">
        <AlertTriangle size={14} />
        Reinitialisation des donnees (developpement)
      </h2>

      <div className="card space-y-3 border-anac-danger/30">
        <p className="text-anac-muted text-xs">
          Efface les donnees selectionnees. Les comptes utilisateurs (staff), les roles, les
          parametres systeme et les modeles de documents ne sont jamais touches.
        </p>

        {error && <p className="text-anac-danger text-sm">{error}</p>}
        {result && <p className="text-anac-success text-sm">{result}</p>}

        <div className="space-y-2">
          {scopes.map((scope) => (
            <label key={scope} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(scope)}
                onChange={() => toggleScope(scope)}
              />
              <span>{labels[scope] ?? scope}</span>
            </label>
          ))}
        </div>

        {!confirming ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={selected.length === 0}
            onClick={() => setConfirming(true)}
            className="gap-1.5"
          >
            <Trash2 size={13} />
            Reinitialiser la selection
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-anac-danger text-xs font-medium">
              Confirmer la suppression definitive de {selected.length} categorie(s) ?
            </p>
            <Button variant="destructive" size="sm" onClick={handleReset} disabled={busy}>
              {busy ? 'Suppression...' : 'Confirmer'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Annuler
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function UploadsMaintenanceSection() {
  const { diagnostics, loading, error, busy, runCleanup } = useUploadMaintenance();
  const [retentionDays, setRetentionDays] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  async function handleCleanup() {
    setResult(null);
    setRunError(null);

    const retention = retentionDays.trim();
    if (retention && !Number.isInteger(Number(retention))) {
      const msg = 'Le delai de retention doit etre un entier.';
      setRunError(msg);
      notify.error(msg);
      return;
    }

    const response = await runCleanup(retention ? Number(retention) : undefined);
    if (response.error) {
      setRunError(response.error);
      notify.error(response.error);
      return;
    }

    if (response.result) {
      setResult(response.result);
      notify.success('Nettoyage des uploads termine.');
      setRetentionDays('');
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-anac-navy font-semibold text-sm uppercase tracking-wide">
        Uploads et tracabilite
      </h2>

      <div className="card space-y-4">
        {loading && <p className="text-anac-muted text-sm">Chargement des diagnostics...</p>}
        {error && <p className="text-anac-danger text-sm">{error}</p>}

        {diagnostics && (
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-anac-border p-3">
              <p className="text-anac-muted text-xs">Uploads total</p>
              <p className="font-semibold text-anac-navy text-lg">{diagnostics.total}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-anac-muted text-xs">Lies a une piece</p>
              <p className="font-semibold text-anac-success text-lg">{diagnostics.linked}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-anac-muted text-xs">Non lies</p>
              <p className="font-semibold text-anac-warning text-lg">{diagnostics.unlinked}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-anac-muted text-xs">Orphelins marques</p>
              <p className="font-semibold text-anac-danger text-lg">{diagnostics.orphanMarked}</p>
            </div>
          </div>
        )}

        {diagnostics && diagnostics.bySource.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-anac-muted">
              Repartition par source
            </p>
            <div className="space-y-1.5">
              {diagnostics.bySource.map((row) => (
                <div key={row.source} className="flex items-center justify-between text-sm">
                  <span className="text-anac-muted">{row.source}</span>
                  <span className="font-medium text-anac-navy">{row.total}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-anac-border pt-3 space-y-2">
          <p className="text-anac-muted text-xs">
            Lance un nettoyage manuel des uploads non lies. Laisser vide pour utiliser le delai
            configure dans les parametres systeme.
          </p>

          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="h-8 text-sm w-44"
              placeholder="Retention (jours)"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
            />
            <Button size="sm" onClick={handleCleanup} disabled={busy}>
              {busy ? 'Nettoyage...' : 'Nettoyer les orphelins'}
            </Button>
          </div>

          {runError && <p className="text-anac-danger text-xs">{runError}</p>}
          {result && <p className="text-anac-success text-xs">{result}</p>}
        </div>
      </div>
    </section>
  );
}
