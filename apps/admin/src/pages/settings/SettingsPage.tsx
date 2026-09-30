import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
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
import { SystemHealthSection } from './components/SystemHealthSection';
import {
  formatUnit,
  groupParameters,
  PARAMETER_UI_META,
  validateParameterValue,
  type ParameterUiMeta,
} from './system-parameter-ui';

const SETTINGS_TABS = [
  { id: 'configuration', label: 'Configuration' },
  { id: 'system-status', label: 'État du système' },
  { id: 'backups', label: 'Sauvegardes' },
  { id: 'maintenance', label: 'Maintenance' },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('configuration');

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-anac-navy">
          <Settings2 size={20} />
          Paramètres
        </h1>
        <p className="text-sm text-anac-muted">
          Configuration système, état du système, sauvegardes et outils de maintenance.
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

      {activeTab === 'configuration' && <SystemParametersSection />}
      {activeTab === 'system-status' && <SystemHealthSection />}
      {activeTab === 'backups' && <UploadsMaintenanceSection />}
      {activeTab === 'maintenance' && <MaintenanceSection />}
    </div>
  );
}

function SystemParametersSection() {
  const { parameters, loading, error, refetch, refetching, saveParameter } = useSystemParameters();
  const sections = useMemo(() => groupParameters(parameters), [parameters]);

  if (loading) {
    return (
      <div className="max-w-4xl space-y-4" aria-busy="true" aria-label="Chargement de la configuration">
        {[3, 2].map((rows, index) => (
          <div key={index} className="rounded-lg border border-anac-border bg-white shadow-sm">
            <div className="space-y-2 border-b border-anac-border px-5 py-4">
              <div className="h-4 w-56 animate-pulse rounded bg-anac-gray" />
              <div className="h-3 w-80 max-w-full animate-pulse rounded bg-anac-gray" />
            </div>
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex items-center gap-6 border-b border-anac-border px-5 py-4 last:border-0">
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-64 max-w-full animate-pulse rounded bg-anac-gray" />
                  <div className="h-3 w-40 animate-pulse rounded bg-anac-gray" />
                </div>
                <div className="h-8 w-40 animate-pulse rounded bg-anac-gray" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex max-w-4xl flex-col items-center gap-3 rounded-lg border border-anac-border bg-white px-5 py-10 text-center shadow-sm">
        <AlertTriangle size={20} className="text-anac-danger" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-anac-text">Impossible de charger la configuration.</p>
          <p className="mt-1 text-xs text-anac-muted">{error}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={refetching}>
          <RefreshCw size={14} className={cn(refetching && 'animate-spin')} aria-hidden="true" />
          Réessayer
        </Button>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <p className="max-w-4xl rounded-lg border border-anac-border bg-white px-5 py-10 text-center text-sm text-anac-muted">
        Aucun paramètre système n’est enregistré.
      </p>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      {sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`param-section-${section.id}`}
          className="overflow-hidden rounded-lg border border-anac-border bg-white shadow-sm"
        >
          <header className="border-b border-anac-border px-5 py-3.5">
            <h2 id={`param-section-${section.id}`} className="text-sm font-semibold text-anac-navy">
              {section.title}
            </h2>
            {section.description && <p className="mt-0.5 text-xs text-anac-muted">{section.description}</p>}
          </header>

          {section.groups.map((group) => (
            <div key={group.id}>
              {group.title && (
                <div className="border-b border-anac-border bg-anac-gray/60 px-5 py-2">
                  <h3 className="text-xs font-semibold text-anac-navy">{group.title}</h3>
                  {group.description && <p className="text-[11px] text-anac-muted">{group.description}</p>}
                </div>
              )}
              <div className="divide-y divide-anac-border border-b border-anac-border last:border-b-0">
                {group.parameters.map((param) => (
                  <ParameterRow
                    key={param.id}
                    parameter={param}
                    meta={PARAMETER_UI_META[param.key]}
                    onSaved={saveParameter}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function ParameterRow({
  parameter,
  meta,
  onSaved,
}: {
  parameter: ParameterView;
  meta: ParameterUiMeta | undefined;
  onSaved: (key: string, value: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(parameter.value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setValue(parameter.value);
  }, [parameter.value]);

  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  const modified = value !== parameter.value;
  const validationError = modified ? validateParameterValue(parameter.type, value, parameter.key) : null;
  const label = meta?.label ?? parameter.description ?? parameter.key;
  const description = meta ? meta.description : undefined;
  const inputId = `param-${parameter.key}`;
  const hintId = `${inputId}-hint`;
  const message = validationError ?? error;
  const unitId = `${inputId}-unit`;
  const messageId = `${inputId}-message`;
  const describedBy =
    [description && hintId, meta?.unit && parameter.type === 'integer' && unitId, message && messageId]
      .filter(Boolean)
      .join(' ') || undefined;

  async function handleSave() {
    if (validationError) return;
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
      notify.success('Paramètre enregistré.');
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  function handleChange(next: string) {
    setValue(next);
    setError(null);
    setSaved(false);
  }

  return (
    <div className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="text-sm font-medium text-anac-text">
          {label}
        </label>
        {description && (
          <p id={hintId} className="mt-0.5 text-xs text-anac-muted">
            {description}
          </p>
        )}
        <p className="mt-1 font-mono text-[10px] text-anac-muted/80">{parameter.key}</p>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <div className="flex items-center gap-2">
          {parameter.type === 'boolean' ? (
            <select
              id={inputId}
              className="input h-8 w-32 text-sm"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              aria-describedby={describedBy}
            >
              <option value="true">Activé</option>
              <option value="false">Désactivé</option>
            </select>
          ) : parameter.type === 'integer' ? (
            <>
              <Input
                id={inputId}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                className="h-8 w-20 text-right text-sm"
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                aria-invalid={validationError ? true : undefined}
                aria-describedby={describedBy}
              />
              {meta?.unit && (
                <span id={unitId} className="w-28 text-xs text-anac-muted">
                  {formatUnit(meta.unit, value)}
                </span>
              )}
            </>
          ) : (
            <Input
              id={inputId}
              type="text"
              required={!meta?.optional}
              placeholder={meta?.placeholder}
              className="h-8 w-full text-sm sm:w-[21.5rem]"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              aria-invalid={validationError ? true : undefined}
              aria-describedby={describedBy}
            />
          )}

          <Button
            size="sm"
            onClick={handleSave}
            disabled={!modified || saving || validationError !== null}
            className="h-8 w-8 px-0"
            aria-label={`Enregistrer : ${label}`}
            title="Enregistrer"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Save size={13} aria-hidden="true" />
            )}
          </Button>
        </div>

        <div aria-live="polite" className="min-h-0">
          {message ? (
            <p id={messageId} className="max-w-[21.5rem] text-xs text-anac-danger sm:text-right">
              {message}
            </p>
          ) : saved ? (
            <p className="inline-flex items-center gap-1 text-xs font-medium text-anac-success">
              <CheckCircle2 size={13} aria-hidden="true" />
              Enregistré
            </p>
          ) : null}
        </div>
      </div>
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
      description: 'Catégorie de données nettoyable en environnement de développement.',
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
          label="Sections sélectionnées"
          value={selected.length.toString()}
        />
        <MaintenanceMetric icon={ShieldCheck} label="Accès requis" value={accessRequired} />
        <MaintenanceMetric
          icon={Trash2}
          label="Mode"
          value={mode === 'irreversible' ? 'Irréversible' : mode}
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
            Ouvre une fenêtre temporaire pour le compte dev/supervision. Les données réelles ne
            doivent jamais être nettoyées par cet outil.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 p-4">
          <label className="space-y-1 text-xs font-medium text-anac-navy">
            Durée (15 à 480 minutes)
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
            Démarrer la session
          </Button>
          <p className="text-xs text-anac-muted">
            {session.active && session.expiresAt
              ? `Session active jusqu'à ${new Date(session.expiresAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : enabled
                ? 'Aucune session active.'
                : `Maintenance désactivée pour ${environment}.`}
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
              Nettoyage des données de développement
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-anac-danger">
              Efface les données de test créées pendant le développement. Les utilisateurs, rôles,
              paramètres système et modèles de documents sont conservés.
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
              Nettoyer les données
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
                Nettoyer les données
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
      const msg = 'Le délai de rétention doit être un nombre entier.';
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
      notify.success('Nettoyage des uploads terminé.');
      setRetentionDays('');
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-anac-navy">
        Uploads et traçabilité
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
              <p className="text-xs text-anac-muted">Liés à une pièce</p>
              <p className="text-lg font-semibold text-anac-success">{diagnostics.linked}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-xs text-anac-muted">Non liés</p>
              <p className="text-lg font-semibold text-anac-warning">{diagnostics.unlinked}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-xs text-anac-muted">Orphelins marqués</p>
              <p className="text-lg font-semibold text-anac-danger">{diagnostics.orphanMarked}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-xs text-anac-muted">Liés en zone de dépôt (relocalisation en attente)</p>
              <p className="text-lg font-semibold text-anac-warning">{diagnostics.linkedButStaging}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-xs text-anac-muted">
                dont depuis plus de 24h
              </p>
              <p className="text-lg font-semibold text-anac-danger">{diagnostics.linkedButStagingOver24h}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-xs text-anac-muted">Modèles liés en zone de dépôt (relocalisation en attente)</p>
              <p className="text-lg font-semibold text-anac-warning">{diagnostics.linkedTemplateButStaging}</p>
            </div>
            <div className="rounded border border-anac-border p-3">
              <p className="text-xs text-anac-muted">
                dont depuis plus de 24h
              </p>
              <p className="text-lg font-semibold text-anac-danger">{diagnostics.linkedTemplateButStagingOver24h}</p>
            </div>
          </div>
        )}

        {diagnostics && diagnostics.linkedStagingExcludedFromRelocation > 0 && (
          <p className="text-xs text-anac-muted">
            Dont {diagnostics.linkedStagingExcludedFromRelocation} rapport(s) en zone de dépôt de façon normale
            (jamais relocalisés) - ne comptent pas comme une anomalie.
          </p>
        )}

        {diagnostics && diagnostics.bySource.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-anac-muted">
              Répartition par source
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
            Lance un nettoyage manuel des uploads non liés. Laisser vide pour utiliser le délai
            configuré dans les paramètres système.
          </p>

          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="h-8 w-44 text-sm"
              placeholder="Rétention (jours)"
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
