import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  Save,
  Settings2,
  ShieldCheck,
  Timer,
  Trash2,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import type { DevToolsScopeMeta, ParameterView } from '../../lib/api/settings.types';
import { notify } from '../../lib/notify';
import { cn } from '../../lib/utils';
import { useSystemParameters } from './hooks/useSystemParameters';
import { useDevReset } from './hooks/useDevReset';
import { useUploadMaintenance } from './hooks/useUploadMaintenance';

const MODULE_LABELS: Record<string, string> = {
  AUTH: 'Authentification',
  M1: 'Intake & Circuit signature',
  M3: 'Phase Preliminaire',
};

const SETTINGS_TABS = [
  { id: 'security', label: 'Securite' },
  { id: 'backups', label: 'Sauvegardes' },
  { id: 'maintenance', label: 'Maintenance' },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('maintenance');

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-anac-navy">
          <Settings2 size={20} />
          Parametres
        </h1>
        <p className="text-sm text-anac-muted">
          Configuration systeme, sauvegardes et outils de maintenance.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-anac-border" aria-label="Sections">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'border border-transparent border-b-0 px-3 py-2 text-sm text-anac-muted transition-colors',
              activeTab === tab.id
                ? 'border-anac-warning bg-white text-anac-warning'
                : 'hover:bg-white hover:text-anac-navy'
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'security' && <SystemParametersSection />}
      {activeTab === 'backups' && <UploadsMaintenanceSection />}
      {activeTab === 'maintenance' && <MaintenanceSection />}
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-anac-navy">
        Parametres systeme
      </h2>

      {loading && <p className="text-sm text-anac-muted">Chargement...</p>}
      {error && <p className="text-sm text-anac-danger">{error}</p>}

      {Object.entries(grouped).map(([module, params]) => (
        <div key={module} className="card space-y-3">
          <p className="text-sm font-medium text-anac-navy">{MODULE_LABELS[module] ?? module}</p>
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
          <p className="font-mono text-[10px] text-anac-muted">{parameter.key}</p>
        </div>

        {parameter.type === 'boolean' ? (
          <select
            className="input h-8 w-32 text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="true">Active</option>
            <option value="false">Desactive</option>
          </select>
        ) : (
          <Input
            type={parameter.type === 'integer' ? 'number' : 'text'}
            className="h-8 w-32 text-right text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}

        <Button
          size="sm"
          onClick={handleSave}
          disabled={!modified || saving}
          className="h-8 px-2.5"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        </Button>

        {saved && <CheckCircle2 size={14} className="text-anac-success" />}
      </div>
      {error && <p className="mt-1 text-xs text-anac-danger">{error}</p>}
    </div>
  );
}

function MaintenanceSection() {
  const {
    enabled,
    environment,
    accessRequired,
    mode,
    session,
    scopes,
    labels,
    scopeDetails,
    loadingStatus,
    busy,
    startSession,
    runReset,
  } = useDevReset();
  const [selected, setSelected] = useState<string[]>([]);
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const visibleScopes = useMemo<DevToolsScopeMeta[]>(() => {
    if (scopeDetails.length > 0) return scopeDetails;
    return scopes.map((scope) => ({
      key: scope,
      label: labels[scope] ?? scope,
      description: 'Categorie de donnees nettoyable en environnement de developpement.',
      dangerous: true,
    }));
  }, [labels, scopeDetails, scopes]);

  function toggleScope(scope: string) {
    setSelected((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  function toggleAllScopes() {
    setSelected((prev) =>
      prev.length === visibleScopes.length ? [] : visibleScopes.map((scope) => scope.key)
    );
  }

  async function handleStartSession() {
    setError(null);
    setResult(null);

    const sessionState = await startSession(Number(durationMinutes));
    if (sessionState.error) {
      setError(sessionState.error);
      notify.error(sessionState.error);
      return;
    }

    if (sessionState.result) {
      setResult(sessionState.result);
      notify.success(sessionState.result);
    }
  }

  async function handleReset() {
    setError(null);
    setResult(null);

    const resetState = await runReset(selected, confirmation.trim());
    if (resetState.error) {
      setError(resetState.error);
      notify.error(resetState.error);
    }
    if (resetState.result) {
      setResult(resetState.result);
      notify.success(resetState.result);
      setSelected([]);
      setConfirmation('');
    }
  }

  if (loadingStatus) {
    return (
      <section className="border border-anac-border bg-white p-5 text-sm text-anac-muted">
        Chargement de la maintenance...
      </section>
    );
  }

  const canReset =
    enabled && session.active && selected.length > 0 && confirmation.trim() === 'NETTOYER';

  return (
    <section className="space-y-4">
      <div className="grid gap-2 md:grid-cols-3">
        <MaintenanceMetric
          icon={Database}
          label="Sections selectionnees"
          value={selected.length.toString()}
        />
        <MaintenanceMetric icon={ShieldCheck} label="Acces requis" value={accessRequired} />
        <MaintenanceMetric
          icon={Trash2}
          label="Mode"
          value={mode === 'irreversible' ? 'Irreversible' : mode}
          danger
        />
      </div>

      <div className="border border-anac-border bg-white">
        <div className="border-b border-anac-border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-anac-navy">
            <Timer size={15} className="text-anac-warning" />
            Mode Maintenance
          </h2>
          <p className="mt-1 text-xs text-anac-muted">
            Ouvre une fenetre temporaire pour le compte dev/supervision. Les donnees reelles ne
            doivent jamais etre nettoyees par cet outil.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 p-4">
          <label className="space-y-1 text-xs font-medium text-anac-navy">
            Duree (15 a 480 minutes)
            <Input
              type="number"
              min={15}
              max={480}
              className="h-9 w-32"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
            />
          </label>
          <Button
            size="sm"
            className="bg-anac-warning hover:bg-anac-warning/90"
            onClick={handleStartSession}
            disabled={!enabled || busy}
          >
            <Timer size={14} />
            Demarrer la session
          </Button>
          <p className="text-xs text-anac-muted">
            {session.active && session.expiresAt
              ? `Session active jusqu'a ${new Date(session.expiresAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : enabled
                ? 'Aucune session active.'
                : `Maintenance desactivee pour ${environment}.`}
          </p>
        </div>
      </div>

      <div
        className="border border-red-200 bg-red-50/60"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0 14px, rgba(255, 255, 255, 0.76) 14px 28px)',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-red-100 p-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-anac-danger">
              <AlertTriangle size={15} />
              Nettoyage des donnees de developpement
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-anac-danger">
              Efface les donnees de test creees pendant le developpement. Les utilisateurs, roles,
              parametres systeme et modeles de documents sont conserves.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleAllScopes}
              disabled={!enabled || visibleScopes.length === 0}
            >
              Tout cocher
            </Button>
            <Button variant="destructive" size="sm" onClick={handleReset} disabled={!canReset || busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Nettoyer les donnees
            </Button>
          </div>
        </div>

        <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleScopes.map((scope) => (
            <label
              key={scope.key}
              className={cn(
                'flex min-h-[86px] cursor-pointer gap-3 border bg-white/85 p-3 transition-colors',
                selected.includes(scope.key)
                  ? 'border-anac-danger text-anac-navy'
                  : 'border-anac-border text-anac-muted hover:border-anac-danger/40'
              )}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={selected.includes(scope.key)}
                onChange={() => toggleScope(scope.key)}
                disabled={!enabled}
              />
              <span>
                <span className="block text-sm font-medium">{scope.label}</span>
                <span className="mt-1 block text-xs leading-5">{scope.description}</span>
                {scope.warning && (
                  <span className="mt-1 block text-xs font-medium text-anac-danger">
                    {scope.warning}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="border-t border-red-100 bg-white/70 p-4">
          <label className="space-y-1 text-xs font-medium text-anac-navy">
            Confirmation obligatoire
            <div className="flex gap-3">
              <Input
                className="h-9 flex-1"
                placeholder="Tapez NETTOYER"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={!enabled}
              />
              <Button
                variant="destructive"
                size="sm"
                onClick={handleReset}
                disabled={!canReset || busy}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Nettoyer les donnees
              </Button>
            </div>
          </label>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-anac-muted">
            <KeyRound size={13} />
            En production, le serveur refuse cette action sauf activation explicite par variable
            d'environnement.
          </p>

          {error && <p className="mt-3 text-sm font-medium text-anac-danger">{error}</p>}
          {result && <p className="mt-3 text-sm font-medium text-anac-success">{result}</p>}
        </div>
      </div>
    </section>
  );
}

function MaintenanceMetric({
  icon: Icon,
  label,
  value,
  danger = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        'border bg-white p-4',
        danger ? 'border-red-200 text-anac-danger' : 'border-anac-border text-anac-navy'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-anac-muted">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <Icon size={16} className={danger ? 'text-anac-danger' : 'text-anac-warning'} />
      </div>
    </div>
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-anac-navy">
        Uploads et tracabilite
      </h2>

      <div className="card space-y-4">
        {loading && <p className="text-sm text-anac-muted">Chargement des diagnostics...</p>}
        {error && <p className="text-sm text-anac-danger">{error}</p>}

        {diagnostics && (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded border border-anac-border p-3">
              <p className="text-xs text-anac-muted">Uploads total</p>
              <p className="text-lg font-semibold text-anac-navy">{diagnostics.total}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-xs text-anac-muted">Lies a une piece</p>
              <p className="text-lg font-semibold text-anac-success">{diagnostics.linked}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-xs text-anac-muted">Non lies</p>
              <p className="text-lg font-semibold text-anac-warning">{diagnostics.unlinked}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-xs text-anac-muted">Orphelins marques</p>
              <p className="text-lg font-semibold text-anac-danger">{diagnostics.orphanMarked}</p>
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

        <div className="space-y-2 border-t border-anac-border pt-3">
          <p className="text-xs text-anac-muted">
            Lance un nettoyage manuel des uploads non lies. Laisser vide pour utiliser le delai
            configure dans les parametres systeme.
          </p>

          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="h-8 w-44 text-sm"
              placeholder="Retention (jours)"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
            />
            <Button size="sm" onClick={handleCleanup} disabled={busy}>
              {busy ? 'Nettoyage...' : 'Nettoyer les orphelins'}
            </Button>
          </div>

          {runError && <p className="text-xs text-anac-danger">{runError}</p>}
          {result && <p className="text-xs text-anac-success">{result}</p>}
        </div>
      </div>
    </section>
  );
}
