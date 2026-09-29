/** Presentation rules for « Paramètres → État du système »: French labels,
 *  the global summary sentence and the run-result toast. Pure functions so
 *  the wording is testable without rendering. */
import type { TemplateHealthStatus } from '@aidn/shared';
import type { ReferenceDataRunResult, SystemStatus } from '../../lib/api/settings.types';
import { KNOWN_TEMPLATES } from '../document-templates/known-templates';
import { PARAMETER_UI_META } from './system-parameter-ui';

export type HealthTone = 'success' | 'warning' | 'danger' | 'muted';

export const TEMPLATE_HEALTH_META: Record<TemplateHealthStatus, { label: string; tone: HealthTone; hint?: string }> = {
  healthy: { label: 'Conforme', tone: 'success' },
  missing: { label: 'Manquant', tone: 'warning', hint: 'Sera créé par « Créer les éléments manquants ».' },
  file_missing: { label: 'Fichier introuvable', tone: 'danger', hint: 'Le fichier publié n’est plus sur le serveur.' },
  inactive: { label: 'Inactif', tone: 'warning', hint: 'Réactivation manuelle requise.' },
  unchecked: { label: 'Non vérifié', tone: 'muted', hint: 'Le stockage des fichiers est inaccessible.' },
};

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function summarizeSystemStatus(status: SystemStatus): { title: string; detail: string } {
  if (status.overallStatus === 'healthy') {
    return {
      title: 'Système conforme',
      detail: 'Tous les éléments de référence et services vérifiés sont disponibles.',
    };
  }

  const sentences: string[] = [];
  if (status.infrastructure.database.status === 'unavailable') {
    sentences.push('La base de données est inaccessible : les données de référence n’ont pas pu être vérifiées.');
  }
  const storage = status.infrastructure.storage;
  if (storage.status === 'unavailable') {
    sentences.push('Le stockage des fichiers est inaccessible : les fichiers des modèles n’ont pas pu être vérifiés.');
  } else if (storage.lowSpace && storage.freeBytes !== null && storage.totalBytes !== null) {
    sentences.push(
      `Espace disque faible pour le stockage des fichiers : ${formatBytes(storage.freeBytes)} libres sur ${formatBytes(storage.totalBytes)}.`
    );
  }

  const legacy = status.files.legacyAddresses;
  if (legacy !== null && legacy > 0) {
    sentences.push(
      legacy === 1
        ? '1 adresse de fichier héritée n’est plus accessible : exécutez la conversion des adresses (storage:rewrite-addresses).'
        : `${legacy} adresses de fichiers héritées ne sont plus accessibles : exécutez la conversion des adresses (storage:rewrite-addresses).`
    );
  }

  const reference = status.referenceData;
  if (reference) {
    const { systemParameters: params, documentTemplates: templates } = reference;
    if (params.expected === 0) {
      sentences.push('Aucun paramètre système attendu n’est défini : vérifiez la configuration de l’application.');
    }
    if (templates.expected === 0) {
      sentences.push('Aucun modèle officiel attendu n’est défini : vérifiez la configuration de l’application.');
    }
    if (params.missing > 0) {
      sentences.push(`${plural(params.missing, 'paramètre système manquant', 'paramètres système manquants')}.`);
    }
    if (templates.missing > 0) {
      sentences.push(`${plural(templates.missing, 'modèle officiel manquant', 'modèles officiels manquants')}.`);
    }
    const intervention = templates.fileMissing + templates.inactive;
    if (intervention > 0) {
      sentences.push(
        `${plural(intervention, 'modèle de document nécessite', 'modèles de document nécessitent')} une intervention.`
      );
    }
  }

  return {
    title: 'Attention requise',
    detail: sentences.join(' ') || 'Un ou plusieurs éléments vérifiés nécessitent une attention.',
  };
}

const BYTE_UNITS = ['o', 'Ko', 'Mo', 'Go', 'To'];

/** 1024-based, French notation: "512 o", "50 Mo", "1,3 Go". One decimal
 *  below 10, none above. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
  return `${formatted} ${BYTE_UNITS[unit]}`;
}

/** « Adresses de fichiers héritées » row (diagnostic only - no action here). */
export function legacyAddressesLabel(count: number | null): string {
  if (count === null) return 'Non mesuré';
  return count === 0 ? 'Aucune' : `${count} à convertir`;
}

export function runResultMessage(result: ReferenceDataRunResult): string {
  if (result.created === 0) return 'Données de référence vérifiées. Aucun élément manquant.';
  if (result.created === 1) return '1 élément manquant a été créé.';
  return `${result.created} éléments manquants ont été créés.`;
}

export function parameterLabel(key: string): string {
  return PARAMETER_UI_META[key]?.label ?? key;
}

export function templateUsage(key: string): string | null {
  return KNOWN_TEMPLATES.find((template) => template.key === key)?.usageDescription ?? null;
}
