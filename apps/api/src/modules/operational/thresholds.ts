/** SESSION1-COCKPIT-1 §6 - the existing urgency parameters, read in one query.
 *  DASHBOARD_SLA_DEFAULTS moved here unchanged (the DN dashboard imports it). */
import { getIntegerValues } from '../system-parameters/system-parameters.service.js';

export const DASHBOARD_SLA_DEFAULTS = {
  phaseM3Days: 15,
  phaseM4Days: 20,
  phaseM5Days: 30,
  phaseM6Days: 30,
  phaseM7Days: 10,
  signatureDepositDays: 1,
  invoiceUploadDays: 2,
  paymentValidationDays: 1,
  documentEvaluationDays: 2,
};

/** Same key and default as the Circuit DG alert job. */
export const DG_CIRCUIT_ALERT_DAYS_DEFAULT = 3;

export const THRESHOLD_KEYS = {
  signatureDepositDays: 'dashboard_sla_signature_deposit_days',
  invoiceUploadDays: 'dashboard_sla_invoice_upload_days',
  paymentValidationDays: 'dashboard_sla_payment_validation_days',
  dgAlertWorkingDays: 'dg_circuit_alert_days',
} as const;
export type ThresholdName = keyof typeof THRESHOLD_KEYS;

const DEFAULTS: Record<ThresholdName, number> = {
  signatureDepositDays: DASHBOARD_SLA_DEFAULTS.signatureDepositDays,
  invoiceUploadDays: DASHBOARD_SLA_DEFAULTS.invoiceUploadDays,
  paymentValidationDays: DASHBOARD_SLA_DEFAULTS.paymentValidationDays,
  dgAlertWorkingDays: DG_CIRCUIT_ALERT_DAYS_DEFAULT,
};

export async function loadThresholds<N extends ThresholdName>(names: readonly N[]): Promise<Record<N, number>> {
  const fallbacks = Object.fromEntries(names.map((name) => [THRESHOLD_KEYS[name], DEFAULTS[name]])) as Record<string, number>;
  const values = await getIntegerValues(fallbacks);
  return Object.fromEntries(names.map((name) => [name, values[THRESHOLD_KEYS[name]]])) as Record<N, number>;
}
