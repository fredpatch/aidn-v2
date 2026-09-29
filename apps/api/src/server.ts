import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import bootstrapRoute from './modules/bootstrap/bootstrap.route.js';
import authRoute from './modules/auth/auth.route.js';
import applicantAuthRoute from './modules/applicant-auth/applicant-auth.route.js';
import accountRequestsRoute from './modules/account-requests/account-requests.route.js';
import usersRoute from './modules/users/users.route.js';
import personnelAnacRoute from './modules/personnel-anac/personnel-anac.route.js';
import requestsRoute from './modules/requests/requests.route.js';
import uploadsRoute from './modules/uploads/uploads.route.js';
import phasesRoute from './modules/phases/phases.route.js';
import meetingsRoute from './modules/meetings/meetings.route.js';
import documentTemplatesRoute from './modules/document-templates/document-templates.route.js';
import preliminaryEvaluationRoute from './modules/preliminary-evaluation/preliminary-evaluation.route.js';
import systemParameterRoute from './modules/system-parameters/system-parameters.route.js';
import devToolsRoute from './modules/dev-tools/dev-tools.route.js';
import seedingRoute from './modules/seeding/seeding.route.js';
import filesRoute from './modules/files/files.route.js';
import { redactFileGrant } from './modules/files/file-delivery.js';
import { startDgCircuitAlertJob } from './jobs/dg-circuit-alert.job.js';
import { startUploadOrphanCleanupJob } from './jobs/upload-orphan-cleanup.job.js';
import { logSeedingRun, runSeeds } from './modules/seeding/seeding.service.js';
import { verifyEmailConnection } from './shared/utils/email.js';
import { db } from './shared/db/index.js';
import { countLegacyAddresses } from './modules/files/address-rewrite.js';
import { fileGrantSecret } from './modules/files/file-grant.js';
import formalRequestRoute from './modules/formal-request/formal-request.route.js';
import courrierTasksRoute from './modules/courrier-tasks/courrier-tasks.route.js';
import deepEvaluationRoute from './modules/deep-evaluation/deep-evaluation.route.js';
import siteInspectionRoute from './modules/site-inspection/site-inspection.route.js';
import certificatesRoute from './modules/certificates/certificates.route.js';
import dashboardRoute from './modules/dashboard/dashboard.route.js';
import analyticsRoute from './modules/analytics/analytics.route.js';
import reportsRoute from './modules/reports/reports.route.js';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;

// crossOriginResourcePolicy relaxed to cross-origin so uploaded files can be
// displayed/downloaded directly by apps/admin and apps/portal, which run on
// different ports (5173/5174) than the API (4000).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
// Same fields as morgan 'dev', but signed file grants are never logged.
morgan.token('safe-url', (req) => redactFileGrant((req as express.Request).originalUrl ?? req.url ?? ''));
app.use(morgan(':method :safe-url :status :response-time ms - :res[content-length]'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// No public /uploads route (STORAGE-0A): every stored file is served by
// /api/files after an authorization check or with a short-lived signed grant.

// Module routes are mounted here as each sprint lands.
// See docs/TASKS.md for the sprint order and technical/conventions.md
// for module codes (M1, M3-M13).
app.use('/api/bootstrap', bootstrapRoute);
app.use('/api/auth', authRoute);
app.use('/api/applicant-auth', applicantAuthRoute);
app.use('/api/account-requests', accountRequestsRoute);
app.use('/api/users', usersRoute);
app.use('/api/personnel-anac', personnelAnacRoute);
app.use('/api/requests', requestsRoute);
app.use('/api/uploads', uploadsRoute);
app.use('/api/phases', phasesRoute);
app.use('/api/meetings', meetingsRoute);
app.use('/api/document-templates', documentTemplatesRoute);
app.use('/api/preliminary-evaluation', preliminaryEvaluationRoute);
app.use('/api/system-parameters', systemParameterRoute);
app.use('/api/dev-tools', devToolsRoute);
app.use('/api/seeding', seedingRoute);
app.use('/api/files', filesRoute);
app.use('/api/formal-request', formalRequestRoute);
app.use('/api/courrier-tasks', courrierTasksRoute);
app.use('/api/deep-evaluation', deepEvaluationRoute);
app.use('/api/site-inspection', siteInspectionRoute);
app.use('/api/certificates', certificatesRoute);
app.use('/api/dashboard', dashboardRoute);
app.use('/api/analytics', analyticsRoute);
app.use('/api/reports', reportsRoute);

/** Reference data must exist before any request is served, so seeding runs
 *  first and a failure stops startup instead of serving on partial data. */
async function start(): Promise<void> {
  // Outside local development a missing FILE_GRANT_SECRET stops startup.
  fileGrantSecret();

  console.log('[seeding] Starting reference data check...');
  logSeedingRun(await runSeeds());
  console.log('[seeding] Reference data ready.');

  // Legacy /uploads addresses are unreachable once public serving is closed;
  // run `npm run storage:rewrite-addresses` (API stopped) to convert them.
  try {
    const legacy = await countLegacyAddresses(db);
    if (legacy.total > 0) {
      console.warn(`[files] ${legacy.total} legacy /uploads address(es) remain:`, legacy.byColumn);
    }
  } catch (error) {
    console.warn('[files] Could not count legacy addresses:', error instanceof Error ? error.message : error);
  }

  startDgCircuitAlertJob();
  startUploadOrphanCleanupJob();

  app.listen(port, () => {
    console.log(`AIDN API listening on port ${port}`);
    verifyEmailConnection().catch(() => {
      // Non-fatal - already logged inside verifyEmailConnection.
    });
  });
}

start().catch((error) => {
  console.error(
    '[startup] Fatal: API not started.',
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
