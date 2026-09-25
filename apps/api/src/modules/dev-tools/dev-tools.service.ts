import fs from 'fs';
import path from 'path';
import { inArray, sql } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { documentVersions } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import {
  RESETTABLE_SCOPES,
  SCOPE_DESCRIPTIONS,
  SCOPE_LABELS,
  SCOPE_WARNINGS,
  type DevToolsScopeMeta,
  type DevToolsSession,
  type DevToolsStatus,
  type ResettableScope,
} from './dev-tools.types.js';

export type { ResettableScope } from './dev-tools.types.js';
export { RESETTABLE_SCOPES, SCOPE_LABELS } from './dev-tools.types.js';

const MIN_SESSION_MINUTES = 15;
const MAX_SESSION_MINUTES = 480;
const RESET_CONFIRMATION = 'NETTOYER';
const uploadRootDir = path.resolve(process.cwd(), 'uploads');
const WORKFLOW_DOCUMENT_OWNER_TYPES = [
  'dg_circuit_document',
  'formal_request_document',
  'preliminary_evaluation_form',
  'payment_invoice',
  'payment_proof',
  'meeting_report',
  'phase_closure_document',
  'certificate_document',
] as const;

const maintenanceSessions = new Map<number, Date>();

function isDevResetEnabled(): boolean {
  return process.env.ENABLE_DEV_RESET === 'true';
}

function getEnvironment(): string {
  return process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development';
}

function isProductionLikeEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
}

function isEnvironmentAllowed(): boolean {
  return !isProductionLikeEnvironment() || process.env.ALLOW_PRODUCTION_DEV_RESET === 'true';
}

function canUseDevReset(): boolean {
  return isDevResetEnabled() && isEnvironmentAllowed();
}

function assertDevResetAllowed(): void {
  if (!isDevResetEnabled()) {
    throw new Error('DEV_RESET_DISABLED');
  }

  if (!isEnvironmentAllowed()) {
    throw new Error('DEV_RESET_PRODUCTION_GUARD');
  }
}

function getSession(actorUserId: number): DevToolsSession {
  const now = Date.now();
  const expiresAt = maintenanceSessions.get(actorUserId) ?? null;
  const active = expiresAt !== null && expiresAt.getTime() > now;

  if (!active) {
    maintenanceSessions.delete(actorUserId);
    return {
      active: false,
      expiresAt: null,
      durationMinutes: null,
    };
  }

  return {
    active: true,
    expiresAt: expiresAt!.toISOString(),
    durationMinutes: Math.ceil((expiresAt!.getTime() - now) / 60000),
  };
}

function buildScopeDetails(): DevToolsScopeMeta[] {
  return RESETTABLE_SCOPES.map((scope) => ({
    key: scope,
    label: SCOPE_LABELS[scope],
    description: SCOPE_DESCRIPTIONS[scope],
    dangerous: true,
    warning: SCOPE_WARNINGS[scope],
  }));
}

function fileUrlToUploadPath(fileUrl: string | null): string | null {
  if (!fileUrl?.startsWith('/uploads/')) return null;

  const relativePath = fileUrl.replace(/^\/uploads\//, '').replaceAll('/', path.sep);
  const fullPath = path.resolve(uploadRootDir, relativePath);
  const relativeToRoot = path.relative(uploadRootDir, fullPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return fullPath;
}

function deleteUploadFile(fileUrl: string | null): number {
  const fullPath = fileUrlToUploadPath(fileUrl);
  if (!fullPath || !fs.existsSync(fullPath)) return 0;

  fs.unlinkSync(fullPath);
  return 1;
}

function deleteFilesInUploadFolder(folderName: string): number {
  const fullPath = path.resolve(uploadRootDir, folderName);
  const relativeToRoot = path.relative(uploadRootDir, fullPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot) || !fs.existsSync(fullPath)) {
    return 0;
  }

  let deleted = 0;
  for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
    const entryPath = path.join(fullPath, entry.name);
    if (entry.isFile()) {
      fs.unlinkSync(entryPath);
      deleted += 1;
    }
  }

  return deleted;
}

export function getStatus(actorUserId: number): DevToolsStatus {
  return {
    enabled: canUseDevReset(),
    environment: getEnvironment(),
    accessRequired: 'Super admin',
    mode: 'irreversible',
    scopes: [...RESETTABLE_SCOPES],
    labels: SCOPE_LABELS,
    scopeDetails: buildScopeDetails(),
    session: getSession(actorUserId),
  };
}

export async function startMaintenanceSession(
  actorUserId: number,
  durationMinutes: number
): Promise<DevToolsSession> {
  assertDevResetAllowed();

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < MIN_SESSION_MINUTES ||
    durationMinutes > MAX_SESSION_MINUTES
  ) {
    throw new Error('INVALID_SESSION_DURATION');
  }

  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  maintenanceSessions.set(actorUserId, expiresAt);

  await logAudit({
    userId: actorUserId,
    action: 'DEV_MAINTENANCE_SESSION_STARTED',
    module: 'M13',
    details: { durationMinutes, expiresAt: expiresAt.toISOString(), environment: getEnvironment() },
  });

  return getSession(actorUserId);
}

/** TRUNCATE ... CASCADE per scope. CASCADE is safe here because every
 *  table it can reach is itself part of the app's own workflow graph
 *  (phases, meetings, evaluations, payments, certificates, notifications
 *  with a requestId) - never users/roles/parameters/templates, which are
 *  never part of any scope's statement below. document_versions rows tied
 *  to the reset scope are cleaned up separately since ownerId is a plain
 *  integer, not a real foreign key - CASCADE can't reach it automatically. */
async function runScope(scope: ResettableScope): Promise<void> {
  switch (scope) {
    case 'requests_and_workflow':
      {
        const files = await db
          .select({ fileUrl: documentVersions.fileUrl })
          .from(documentVersions)
          .where(inArray(documentVersions.ownerType, [...WORKFLOW_DOCUMENT_OWNER_TYPES]));

        for (const file of files) {
          deleteUploadFile(file.fileUrl);
        }
      }
      await db.execute(sql`TRUNCATE TABLE requests, dg_circuit_documents RESTART IDENTITY CASCADE`);
      await db.execute(
        sql`DELETE FROM document_versions WHERE owner_type IN (
          'dg_circuit_document', 'formal_request_document', 'preliminary_evaluation_form',
          'payment_invoice', 'payment_proof', 'meeting_report', 'phase_closure_document',
          'certificate_document'
        )`
      );
      await db.execute(
        sql`DELETE FROM upload_assets WHERE linked_owner_type IN (
          'dg_circuit_document', 'formal_request_document', 'preliminary_evaluation_form',
          'payment_invoice', 'payment_proof', 'meeting_report', 'phase_closure_document',
          'certificate_document'
        )`
      );
      break;
    case 'organisations_and_applicants':
      await db.execute(
        sql`TRUNCATE TABLE organisations, applicants, account_requests RESTART IDENTITY CASCADE`
      );
      break;
    case 'notifications':
      await db.execute(sql`TRUNCATE TABLE notifications RESTART IDENTITY`);
      break;
    case 'audit_logs':
      await db.execute(sql`TRUNCATE TABLE audit_logs RESTART IDENTITY`);
      break;
    case 'reports':
      deleteFilesInUploadFolder('reports');
      await db.execute(sql`TRUNCATE TABLE reports RESTART IDENTITY`);
      break;
  }
}

/** Dev-only data reset, gated two ways: SU role (route-level) AND an
 *  explicit env flag that must be true. Never callable just by being SU -
 *  the env flag must also be deliberately set, so this can't accidentally
 *  run against a real deployment just because someone has the SU role
 *  there too. */
export async function resetData(
  scopes: string[],
  actorUserId: number,
  confirmation: string
): Promise<{ scopesCleared: ResettableScope[] }> {
  assertDevResetAllowed();

  if (!getSession(actorUserId).active) {
    throw new Error('MAINTENANCE_SESSION_REQUIRED');
  }

  if (confirmation !== RESET_CONFIRMATION) {
    throw new Error('INVALID_CONFIRMATION');
  }

  const validScopes = scopes.filter((s): s is ResettableScope =>
    (RESETTABLE_SCOPES as readonly string[]).includes(s)
  );
  if (validScopes.length === 0 || validScopes.length !== scopes.length) {
    throw new Error('INVALID_SCOPE');
  }

  for (const scope of validScopes) {
    await runScope(scope);
  }

  await logAudit({
    userId: actorUserId,
    action: 'DEV_DATA_RESET',
    module: 'M13',
    details: { scopes: validScopes },
  });

  return { scopesCleared: validScopes };
}
