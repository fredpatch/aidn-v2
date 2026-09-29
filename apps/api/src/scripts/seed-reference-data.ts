/** Manual entry point for all reference-data seeding: system parameters and
 *  official document templates - `npm run seed`. The API runs exactly the
 *  same seeding on every startup; use this for maintenance or deploy steps.
 *
 *  Safe to re-run: missing items are created, existing ones are left untouched
 *  (existing document templates are never replaced or repaired). */
import 'dotenv/config';
import { logSeedingRun, runSeeds } from '../modules/seeding/seeding.service.js';

runSeeds()
  .then((run) => {
    logSeedingRun(run);
    console.log('[seeding] Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[seeding] Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
