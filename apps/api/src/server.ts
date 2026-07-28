import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import bootstrapRoute from './modules/bootstrap/bootstrap.route.js';
import authRoute from './modules/auth/auth.route.js';
import applicantAuthRoute from './modules/applicant-auth/applicant-auth.route.js';
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
import { startDgCircuitAlertJob } from './jobs/dg-circuit-alert.job.js';
import { startUploadOrphanCleanupJob } from './jobs/upload-orphan-cleanup.job.js';
import { verifyEmailConnection } from './shared/utils/email.js';
import formalRequestRoute from './modules/formal-request/formal-request.route.js';
import deepEvaluationRoute from './modules/deep-evaluation/deep-evaluation.route.js';
import siteInspectionRoute from './modules/site-inspection/site-inspection.route.js';
import certificatesRoute from './modules/certificates/certificates.route.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;

// crossOriginResourcePolicy relaxed to cross-origin so uploaded files can be
// displayed/downloaded directly by apps/admin and apps/portal, which run on
// different ports (5173/5174) than the API (4000).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serves uploaded files (M8 - local disk for now, swappable for object
// storage later without changing the /uploads URL contract).
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Module routes are mounted here as each sprint lands.
// See docs/TASKS.md for the sprint order and technical/conventions.md
// for module codes (M1, M3-M13).
app.use('/api/bootstrap', bootstrapRoute);
app.use('/api/auth', authRoute);
app.use('/api/applicant-auth', applicantAuthRoute);
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
app.use('/api/formal-request', formalRequestRoute);
app.use('/api/deep-evaluation', deepEvaluationRoute);
app.use('/api/site-inspection', siteInspectionRoute);
app.use('/api/certificates', certificatesRoute);

app.listen(port, () => {
  console.log(`AIDN API listening on port ${port}`);
  startDgCircuitAlertJob();
  startUploadOrphanCleanupJob();
  verifyEmailConnection().catch(() => {
    // Non-fatal - already logged inside verifyEmailConnection.
  });
});
