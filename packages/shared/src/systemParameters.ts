/** M13 - validation of system parameter values, shared by the admin
 *  Configuration tab and the API (PATCH /system-parameters/:key) so both
 *  apply exactly the same rules. */
import { parsePublicHolidays } from './workingDays.js';

export type SystemParameterType = 'integer' | 'boolean' | 'text';

export const PUBLIC_HOLIDAYS_PARAMETER_KEY = 'public_holidays';
/** Sanity cap (about 10 years of days) against typing mistakes. */
export const PARAMETER_INTEGER_MAX = 3650;
export const PARAMETER_TEXT_MAX_LENGTH = 500;

/** French error message, or null when the value is valid. */
export function validateParameterValue(type: SystemParameterType, value: string, key?: string): string | null {
  const trimmed = value.trim();

  if (key === PUBLIC_HOLIDAYS_PARAMETER_KEY) {
    const { invalid } = parsePublicHolidays(trimmed);
    if (invalid.length > 0) {
      return `Date(s) invalide(s) : ${invalid.join(', ')}. Format attendu : AAAA-MM-JJ (date précise) ou MM-JJ (chaque année).`;
    }
    return trimmed.length <= PARAMETER_TEXT_MAX_LENGTH
      ? null
      : `${PARAMETER_TEXT_MAX_LENGTH} caractères maximum.`;
  }

  if (type === 'integer') {
    return /^\d+$/.test(trimmed) && Number(trimmed) >= 1 && Number(trimmed) <= PARAMETER_INTEGER_MAX
      ? null
      : `Saisissez un nombre entier entre 1 et ${PARAMETER_INTEGER_MAX}.`;
  }
  if (type === 'boolean') {
    return value === 'true' || value === 'false' ? null : 'Valeur invalide.';
  }
  if (!trimmed) return 'Ce champ ne peut pas être vide.';
  return trimmed.length <= PARAMETER_TEXT_MAX_LENGTH ? null : `${PARAMETER_TEXT_MAX_LENGTH} caractères maximum.`;
}

/** Canonical stored form of a valid value: integers without spaces or
 *  leading zeros, text trimmed, public holidays deduplicated and
 *  comma-separated in entry order. */
export function normalizeParameterValue(type: SystemParameterType, value: string, key?: string): string {
  if (key === PUBLIC_HOLIDAYS_PARAMETER_KEY) return parsePublicHolidays(value).entries.join(', ');
  if (type === 'integer') return String(Number(value.trim()));
  if (type === 'boolean') return value;
  return value.trim();
}
