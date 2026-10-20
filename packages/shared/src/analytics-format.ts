/** ANALYTICS-GLOBAL-UX-1 - analytics presentation shared by the admin
 *  (/analytique, /pilotage) and the API reports, so a duration and a term
 *  read the same everywhere. Display only: values are never changed. */

const MINUTES_PER_DAY = 24 * 60;

/** What a count counts, in both numbers (« circuit DG terminé » / « circuits
 *  DG terminés »). */
export interface CountNoun {
  singular: string;
  plural: string;
}

/** « 0 circuit DG terminé », « 1 … », « 2 circuits DG terminés »: French takes
 *  the singular for 0 and 1. */
export function countLabel(count: number, noun: CountNoun): string {
  return `${count} ${count > 1 ? noun.plural : noun.singular}`;
}

/** A duration in calendar days (24 h each) for humans: from one day on, days
 *  and hours (rounded to the hour); below, hours and minutes (rounded to the
 *  minute); never seconds. 0.1 -> « 2 h 24 min », 4.8 -> « 4 j 19 h »;
 *  null (or a non-finite value) -> « - ». */
export function formatCalendarDuration(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return '-';
  const minutes = Math.round(days * MINUTES_PER_DAY);
  if (minutes >= MINUTES_PER_DAY) {
    const hours = Math.round(days * 24);
    const whole = Math.floor(hours / 24);
    const rest = hours % 24;
    return rest ? `${whole} j ${rest} h` : `${whole} j`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export interface AnalyticsGlossaryEntry {
  term: string;
  /** Plain-French expansion of an acronym (KPI, SLA); absent for French terms. */
  meaning?: string;
  definition: string;
}

/** Reading keys for analytics screens and reports (no prior analytics vocabulary assumed). */
export const ANALYTICS_GLOSSARY: readonly AnalyticsGlossaryEntry[] = [
  {
    term: 'KPI',
    meaning: 'Indicateur clé de performance',
    definition:
      'Mesure utilisée pour suivre l’activité, les délais ou la performance du processus.',
  },
  {
    term: 'SLA',
    meaning: 'Délai cible de traitement',
    definition:
      'Cible de délai définie pour une phase. Un dépassement indique qu’une phase ouverte a dépassé son objectif de traitement.',
  },
  {
    term: 'Moyenne',
    definition: 'Durée moyenne calculée sur tous les dossiers de l’échantillon.',
  },
  {
    term: 'Médiane',
    definition:
      'Durée située au milieu de l’échantillon ; elle est moins influencée par quelques dossiers exceptionnellement longs.',
  },
  {
    term: 'Jours calendaires',
    definition: 'Tous les jours du calendrier sont comptés.',
  },
  {
    term: 'Jours ouvrés',
    definition: 'Seuls les jours de travail du calendrier opérationnel sont comptés.',
  },
];
