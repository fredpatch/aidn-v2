/** Calendar days elapsed (1 decimal), the dashboard's daysBetween rule; null
 *  without a date or for a date in the future. */
export function calendarDaysSince(since: Date | null, now: Date): number | null {
  if (!since) return null;
  const diff = now.getTime() - since.getTime();
  if (Number.isNaN(diff) || diff < 0) return null;
  return Math.round((diff / 86_400_000) * 10) / 10;
}

