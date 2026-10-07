import { it } from 'vitest';
import {
  formatUnit,
  groupParameters,
  OTHER_SECTION_ID,
  PARAMETER_UI_META,
  UNITS,
  validateParameterValue,
} from './system-parameter-ui';
import type { ParameterView } from '../../lib/api/settings.types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

/** Mirrors SYSTEM_PARAMETER_SEEDS (apps/api/src/modules/seeding/seeds/system-parameters.seed.ts). */
const SEEDED: Array<Pick<ParameterView, 'key' | 'type' | 'module'>> = [
  { key: 'otp_expiration_minutes', type: 'integer', module: 'AUTH' },
  { key: 'lockout_max_attempts', type: 'integer', module: 'AUTH' },
  { key: 'lockout_duration_minutes', type: 'integer', module: 'AUTH' },
  { key: 'dg_circuit_alert_days', type: 'integer', module: 'M1' },
  { key: 'public_holidays', type: 'text', module: 'M1' },
  { key: 'preliminary_evaluation_return_days', type: 'integer', module: 'M3' },
  { key: 'upload_orphan_retention_days', type: 'integer', module: 'M8' },
  { key: 'dashboard_sla_phase_m3_days', type: 'integer', module: 'M12' },
  { key: 'dashboard_sla_phase_m4_days', type: 'integer', module: 'M12' },
  { key: 'dashboard_sla_phase_m5_days', type: 'integer', module: 'M12' },
  { key: 'dashboard_sla_phase_m6_days', type: 'integer', module: 'M12' },
  { key: 'dashboard_sla_phase_m7_days', type: 'integer', module: 'M12' },
  { key: 'dashboard_sla_signature_deposit_days', type: 'integer', module: 'M12' },
  { key: 'dashboard_sla_invoice_upload_days', type: 'integer', module: 'M12' },
  { key: 'dashboard_sla_payment_validation_days', type: 'integer', module: 'M12' },
  { key: 'dashboard_sla_document_evaluation_days', type: 'integer', module: 'M12' },
  { key: 'certificate_dg_full_name', type: 'text', module: 'M7' },
];

function toParameters(rows: typeof SEEDED): ParameterView[] {
  return rows.map((row, index) => ({ ...row, id: index + 1, value: '1', description: null }));
}

function renderedKeys(parameters: ParameterView[]): string[] {
  return groupParameters(parameters).flatMap((section) =>
    section.groups.flatMap((group) => group.parameters.map((p) => p.key))
  );
}

export function runSystemParameterUiTests(): void {
  // Every seeded parameter renders exactly once, none in the fallback section.
  const seeded = toParameters(SEEDED);
  const keys = renderedKeys(seeded);
  assert(keys.length === 17, `Expected 17 rendered parameters, got ${keys.length}.`);
  assert(new Set(keys).size === 17, 'A parameter was rendered more than once.');
  const sections = groupParameters(seeded);
  assert(
    !sections.some((section) => section.id === OTHER_SECTION_ID),
    'Seeded parameters should all have metadata.'
  );
  assert(
    sections.map((s) => s.id).join(',') === 'security,workflow,monitoring,documents,certificates',
    `Unexpected section order: ${sections.map((s) => s.id).join(',')}.`
  );

  // Module codes never become section titles.
  const titles = sections.flatMap((s) => [s.title, ...s.groups.map((g) => g.title ?? '')]);
  assert(
    !titles.some((title) => /\b(AUTH|M\d+)\b/.test(title)),
    `Module code leaked into a heading: ${titles.join(' | ')}.`
  );

  // Pilotage splits into phase targets then operational targets.
  const monitoring = sections.find((s) => s.id === 'monitoring');
  assert(
    monitoring?.groups.map((g) => `${g.id}:${g.parameters.length}`).join(',') ===
      'phase-targets:5,operational-targets:4',
    'Pilotage should split into 5 phase targets and 4 operational targets.'
  );

  // Unknown parameters fall back instead of disappearing.
  const withUnknown = [
    ...seeded,
    { id: 99, key: 'future_flag', value: 'true', type: 'boolean', module: 'M99', description: null },
  ] satisfies ParameterView[];
  const withUnknownSections = groupParameters(withUnknown);
  const fallback = withUnknownSections[withUnknownSections.length - 1];
  assert(fallback?.id === OTHER_SECTION_ID, 'Unknown parameter should create Autres paramètres.');
  assert(
    fallback?.groups[0]?.parameters[0]?.key === 'future_flag',
    'Unknown parameter should be listed under Autres paramètres.'
  );
  assert(renderedKeys(withUnknown).length === 18, 'Unknown parameter should render once.');

  // Metadata without a matching parameter leaves no empty section behind.
  const partial = groupParameters(toParameters(SEEDED.filter((p) => p.module === 'AUTH')));
  assert(
    partial.length === 1 && partial[0].id === 'security',
    'Sections without parameters should be omitted.'
  );

  // French pluralisation: 0 and 1 are singular.
  // The DG circuit threshold counts working days (jours ouvrés), holidays in the same section.
  assert(PARAMETER_UI_META.dg_circuit_alert_days.unit === UNITS.workingDays, 'DG circuit counts working days.');
  assert(formatUnit(UNITS.workingDays, '3') === 'jours ouvrés', 'Working days plural.');
  assert(PARAMETER_UI_META.public_holidays?.section === 'workflow', 'Public holidays sit with the DG circuit.');
  assert(validateParameterValue('text', '', 'public_holidays') === null, 'An empty holiday list is valid.');
  assert(validateParameterValue('integer', '3651') !== null, 'Integers are capped like the API.');
  assert(formatUnit(UNITS.calendarDays, '1') === 'jour calendaire', '1 should be singular.');
  assert(formatUnit(UNITS.calendarDays, '0') === 'jour calendaire', '0 should be singular.');
  assert(formatUnit(UNITS.calendarDays, '2') === 'jours calendaires', '2 should be plural.');
  assert(formatUnit(UNITS.calendarDays, '') === 'jours calendaires', 'Empty should be plural.');

  // Client-side validation.
  assert(validateParameterValue('integer', '3') === null, '3 is a valid integer.');
  for (const invalid of ['', ' ', '0', '-2', '1.5', 'abc', '1e2']) {
    assert(validateParameterValue('integer', invalid) !== null, `"${invalid}" should be rejected.`);
  }
  assert(validateParameterValue('text', 'Nom') === null, 'Non-blank text is valid.');
  assert(validateParameterValue('text', '   ') !== null, 'Blank text should be rejected.');
  assert(validateParameterValue('boolean', 'true') === null, 'Boolean true is valid.');
  assert(validateParameterValue('boolean', 'yes') !== null, 'Unknown boolean should be rejected.');
}

// Batch K1: this runner used to be declared but never called, so none of the
// assertions above ever ran. Vitest now executes it on every test run.
it('system parameter UI rules (grouping, units, validation)', () => {
  runSystemParameterUiTests();
});
