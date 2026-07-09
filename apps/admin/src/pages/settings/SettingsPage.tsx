import { useEffect, useState } from 'react';
import { Settings2, Save, Loader2, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, apiErrorMessage } from '../../lib/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

interface ParameterView {
  id: number;
  key: string;
  value: string;
  type: 'integer' | 'boolean' | 'text';
  module: string;
  description: string | null;
}

const MODULE_LABELS: Record<string, string> = {
  AUTH: 'Authentification',
  M1: 'Intake & Circuit DG',
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
      <DevResetSection />
    </div>
  );
}

function SystemParametersSection() {
  const [parameters, setParameters] = useState<ParameterView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/system-parameters');
      setParameters(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de charger les parametres.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
              <ParameterRow key={param.id} parameter={param} onSaved={load} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ParameterRow({ parameter, onSaved }: { parameter: ParameterView; onSaved: () => void }) {
  const [value, setValue] = useState(parameter.value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const modified = value !== parameter.value;

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/system-parameters/${parameter.key}`, { value });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible d'enregistrer."));
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
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/dev-tools/status')
      .then(({ data }) => {
        setEnabled(data.enabled);
        setScopes(data.scopes);
        setLabels(data.labels);
      })
      .catch(() => setEnabled(false));
  }, []);

  function toggleScope(scope: string) {
    setSelected((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  async function handleReset() {
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.post('/dev-tools/reset', { scopes: selected });
      setResult(`Reinitialise : ${data.scopesCleared.join(', ')}`);
      setSelected([]);
      setConfirming(false);
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de reinitialiser.'));
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) return null;
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
