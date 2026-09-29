/** System parameters only - `npm run seed:params` (kept for deploy scripts).
 *  For all reference data (parameters + document templates) use `npm run seed`;
 *  the API also runs the full seeding automatically on every startup.
 *
 *  Definitions live in modules/seeding/seeds/system-parameters.seed.ts.
 *  Safe to re-run: missing items are created, existing ones are left untouched. */
import 'dotenv/config';
import { logSeedingRun, runSystemParameterSeed } from '../modules/seeding/seeding.service.js';

runSystemParameterSeed()
  .then((run) => {
    logSeedingRun(run);
    console.log('[seeding] Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[seeding] Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
