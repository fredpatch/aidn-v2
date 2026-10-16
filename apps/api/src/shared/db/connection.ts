/** ROLE-ANALYTICS-1B - every application session runs in UTC.
 *
 *  Our columns are `timestamp` without time zone holding UTC: values written
 *  by the app (`new Date()`) are UTC, but `defaultNow()` columns are filled by
 *  PostgreSQL in the *session* time zone, which defaults to the server's
 *  (e.g. Europe/Paris on a dev machine: +1/+2 h). The libpq start-up option
 *  pins the session before the first statement, whatever the host or Docker
 *  time zone. Existing `PGOPTIONS` are kept; the last `-c` wins. */
import type { ClientConfig } from 'pg';

export const DB_SESSION_TIME_ZONE = 'UTC';

export function utcSessionOptions(existing: string | undefined = process.env.PGOPTIONS): string {
  return [existing?.trim(), `-c TimeZone=${DB_SESSION_TIME_ZONE}`].filter(Boolean).join(' ');
}

/** Connection settings for every app pool or client. A `DATABASE_URL` that
 *  itself carries `?options=` would override this (pg parses the URL last). */
export function pgConnectionConfig(connectionString: string | undefined = process.env.DATABASE_URL): ClientConfig {
  return { connectionString, options: utcSessionOptions() };
}
