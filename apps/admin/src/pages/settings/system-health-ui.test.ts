import { it } from 'vitest';
import {
  formatBytes,
  legacyAddressesLabel,
  parameterLabel,
  runResultMessage,
  summarizeSystemStatus,
  TEMPLATE_HEALTH_META,
  templateUsage,
} from './system-health-ui';
import { deriveTemplatePageStatus } from '../document-templates/known-templates';
import type { SystemStatus } from '../../lib/api/settings.types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function status(overrides: {
  database?: 'available' | 'unavailable';
  storage?: 'available' | 'unavailable';
  missingParameters?: number;
  templates?: Partial<NonNullable<SystemStatus['referenceData']>['documentTemplates']>;
  expectedParameters?: number;
  lowSpace?: boolean;
  legacyAddresses?: number | null;
} = {}): SystemStatus {
  const database = overrides.database ?? 'available';
  const missingParameters = overrides.missingParameters ?? 0;
  const templates = {
    status: 'healthy' as const,
    expected: 4,
    healthy: 4,
    missing: 0,
    fileMissing: 0,
    inactive: 0,
    unchecked: 0,
    items: [],
    ...overrides.templates,
  };
  const expectedParameters = overrides.expectedParameters ?? 16;
  const healthy =
    database === 'available' &&
    (overrides.storage ?? 'available') === 'available' &&
    !overrides.lowSpace &&
    !(overrides.legacyAddresses && overrides.legacyAddresses > 0) &&
    missingParameters === 0 &&
    templates.healthy === templates.expected &&
    expectedParameters > 0;
  return {
    checkedAt: '2026-09-25T11:42:00.000Z',
    overallStatus: healthy ? 'healthy' : 'attention',
    missingCount: missingParameters + templates.missing,
    referenceData:
      database === 'unavailable'
        ? null
        : {
            systemParameters: {
              status: missingParameters === 0 && expectedParameters > 0 ? 'healthy' : 'attention',
              expected: expectedParameters,
              present: expectedParameters - missingParameters,
              missing: missingParameters,
              items: [],
            },
            documentTemplates: templates,
          },
    infrastructure: {
      api: { status: 'available' },
      database: { status: database, sizeBytes: database === 'available' ? 52_428_800 : null },
      storage: {
        status: overrides.storage ?? 'available',
        freeBytes: overrides.lowSpace ? 5 * 1024 ** 3 : 60 * 1024 ** 3,
        totalBytes: 100 * 1024 ** 3,
        lowSpace: overrides.lowSpace ?? false,
      },
    },
    files: { legacyAddresses: overrides.legacyAddresses === undefined ? 0 : overrides.legacyAddresses },
  };
}

export function runSystemHealthUiTests(): void {
  // Global summary
  const ok = summarizeSystemStatus(status());
  assert(ok.title === 'Système conforme', 'Healthy title.');
  assert(
    ok.detail === 'Tous les éléments de référence et services vérifiés sont disponibles.',
    `Healthy detail, got "${ok.detail}".`
  );

  const oneBroken = summarizeSystemStatus(status({ templates: { healthy: 3, fileMissing: 1, status: 'attention' } }));
  assert(oneBroken.title === 'Attention requise', 'Attention title.');
  assert(
    oneBroken.detail === '1 modèle de document nécessite une intervention.',
    `Singular intervention sentence, got "${oneBroken.detail}".`
  );

  const twoBroken = summarizeSystemStatus(
    status({ templates: { healthy: 2, fileMissing: 1, inactive: 1, status: 'attention' } })
  );
  assert(
    twoBroken.detail === '2 modèles de document nécessitent une intervention.',
    `Plural intervention sentence, got "${twoBroken.detail}".`
  );

  const missing = summarizeSystemStatus(
    status({ missingParameters: 2, templates: { healthy: 3, missing: 1, status: 'attention' } })
  );
  assert(
    missing.detail === '2 paramètres système manquants. 1 modèle officiel manquant.',
    `Missing sentences, got "${missing.detail}".`
  );

  const dbDown = summarizeSystemStatus(status({ database: 'unavailable' }));
  assert(
    dbDown.detail ===
      'La base de données est inaccessible : les données de référence n’ont pas pu être vérifiées.',
    `Database sentence, got "${dbDown.detail}".`
  );

  const storageDown = summarizeSystemStatus(
    status({ storage: 'unavailable', templates: { healthy: 0, unchecked: 4, status: 'attention' } })
  );
  assert(
    storageDown.detail ===
      'Le stockage des fichiers est inaccessible : les fichiers des modèles n’ont pas pu être vérifiés.',
    `Storage sentence must replace the unchecked count, got "${storageDown.detail}".`
  );

  const empty = summarizeSystemStatus(status({ expectedParameters: 0 }));
  assert(empty.title === 'Attention requise', 'An empty expected list is never conforming.');
  assert(
    empty.detail.includes('Aucun paramètre système attendu'),
    `Empty expected list sentence, got "${empty.detail}".`
  );

  const lowSpace = summarizeSystemStatus(status({ lowSpace: true }));
  assert(lowSpace.title === 'Attention requise', 'Low space needs attention.');
  assert(
    lowSpace.detail === 'Espace disque faible pour le stockage des fichiers : 5 Go libres sur 100 Go.',
    `Low space sentence, got "${lowSpace.detail}".`
  );

  const legacy = summarizeSystemStatus(status({ legacyAddresses: 2 }));
  assert(legacy.title === 'Attention requise', 'Legacy addresses need attention.');
  assert(
    legacy.detail === '2 adresses de fichiers héritées ne sont plus accessibles : exécutez la conversion des adresses (storage:rewrite-addresses).',
    `Legacy sentence, got "${legacy.detail}".`
  );
  const oneLegacy = summarizeSystemStatus(status({ legacyAddresses: 1 }));
  assert(oneLegacy.detail.startsWith('1 adresse de fichier héritée n’est plus accessible'), `Singular legacy sentence, got "${oneLegacy.detail}".`);
  assert(legacyAddressesLabel(0) === 'Aucune', 'No legacy addresses.');
  assert(legacyAddressesLabel(3) === '3 à convertir', 'Legacy count label.');
  assert(legacyAddressesLabel(null) === 'Non mesuré', 'Unknown legacy count.');

  // Sizes in French units
  assert(formatBytes(0) === '0 o', `0 bytes, got ${formatBytes(0)}`);
  assert(formatBytes(512) === '512 o', 'bytes');
  assert(formatBytes(12 * 1024) === '12 Ko', 'kilobytes');
  assert(formatBytes(52_428_800) === '50 Mo', 'megabytes');
  assert(formatBytes(1.25 * 1024 ** 3) === '1,3 Go', `gigabytes, got ${formatBytes(1.25 * 1024 ** 3)}`);
  assert(formatBytes(2 * 1024 ** 4) === '2 To', 'terabytes');

  // Run result toast
  assert(runResultMessage({ created: 0, skipped: 20, seeds: [] }) === 'Données de référence vérifiées. Aucun élément manquant.', 'Nothing created.');
  assert(runResultMessage({ created: 1, skipped: 19, seeds: [] }) === '1 élément manquant a été créé.', 'One created.');
  assert(runResultMessage({ created: 2, skipped: 18, seeds: [] }) === '2 éléments manquants ont été créés.', 'Several created.');

  // Labels
  assert(TEMPLATE_HEALTH_META.healthy.label === 'Conforme', 'healthy label');
  assert(TEMPLATE_HEALTH_META.missing.label === 'Manquant', 'missing label');
  assert(TEMPLATE_HEALTH_META.file_missing.label === 'Fichier introuvable', 'file_missing label');
  assert(TEMPLATE_HEALTH_META.inactive.label === 'Inactif', 'inactive label');
  assert(TEMPLATE_HEALTH_META.inactive.hint === 'Réactivation manuelle requise.', 'inactive hint');
  assert(TEMPLATE_HEALTH_META.unchecked.label === 'Non vérifié', 'unchecked label');
  assert(parameterLabel('lockout_max_attempts') === 'Nombre maximal de tentatives de connexion', 'Parameter label from UI meta.');
  assert(parameterLabel('unknown_key') === 'unknown_key', 'Unknown parameter falls back to its key.');
  assert(templateUsage('dn_air_r2_3_f_e_012') === 'Acceptation du personnel d’encadrement', 'Template usage from the known list.');
  assert(templateUsage('unknown') === null, 'Unknown template has no usage.');

  // « Modèles de documents » page uses the same precedence (decision 2)
  const file = '/uploads/x.docx';
  assert(deriveTemplatePageStatus(undefined) === 'unconfigured', 'No row -> à configurer.');
  assert(
    deriveTemplatePageStatus({ active: false, fileUrl: null, fileExists: false }) === 'inactive',
    'Inactive wins over a missing file.'
  );
  assert(
    deriveTemplatePageStatus({ active: true, fileUrl: null, fileExists: false }) === 'missing',
    'Active row with no file -> fichier introuvable.'
  );
  assert(
    deriveTemplatePageStatus({ active: true, fileUrl: file, fileExists: false }) === 'missing',
    'Active row with absent file -> fichier introuvable.'
  );
  assert(deriveTemplatePageStatus({ active: true, fileUrl: file, fileExists: true }) === 'available', 'Healthy -> disponible.');
}

// Batch K1: this runner used to be declared but never called, so none of the
// assertions above ever ran. Vitest now executes it on every test run.
it('system health UI rules (statuses, template health, labels)', () => {
  runSystemHealthUiTests();
});
