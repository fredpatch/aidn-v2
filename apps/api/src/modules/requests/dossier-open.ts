/** K7 - a closed dossier (rejected, cancelled or completed) is read-only.
 *
 *  Decision (Fred, 2026-10-08): on a closed dossier only viewing and
 *  downloading stay possible; every workflow action is refused. Before this,
 *  no write action checked the dossier's status: on a rejected dossier the
 *  R3 opinion was accepted, closed M6, and M7 (delivery) could then be opened.
 *
 *  Each workflow write calls one of these guards first, from the entity it
 *  receives. They throw DOSSIER_CLOSED (409, mapped once for every module in
 *  shared/utils/error.ts) and stay silent when the entity does not exist, so
 *  each action keeps its own NOT_FOUND error. Inside a transaction the
 *  request row is read FOR SHARE: a concurrent rejection (which updates that
 *  row) and the action are serialised. */
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../../shared/db/index.js';
import {
  certificates,
  documentEvaluations,
  formalRequestDocuments,
  meetings,
  phases,
  requests,
} from '../../shared/db/schema.js';

export const CLOSED_DOSSIER_STATUSES: readonly string[] = ['completed', 'cancelled', 'rejected'];

export function isDossierClosed(requestStatus: string): boolean {
  return CLOSED_DOSSIER_STATUSES.includes(requestStatus);
}

/** K7c - fields every staff work list carries, so the screen can show the
 *  dossier as closed and offer no action (the guards below stay the safety
 *  net). Built from the requests.status the list already reads. */
export interface DossierFlags {
  dossierStatus: string;
  dossierClosed: boolean;
}

export function dossierFlags(requestStatus: string): DossierFlags {
  return { dossierStatus: requestStatus, dossierClosed: isDossierClosed(requestStatus) };
}

function refuseIfClosed(row: { status: string } | undefined): void {
  if (row && isDossierClosed(row.status)) throw new Error('DOSSIER_CLOSED');
}

export async function assertDossierOpen(executor: DbExecutor, requestId: number): Promise<void> {
  const [row] = await executor
    .select({ status: requests.status })
    .from(requests)
    .where(eq(requests.id, requestId))
    .for('share');
  refuseIfClosed(row);
}

export async function assertPhaseDossierOpen(executor: DbExecutor, phaseId: number): Promise<void> {
  const [row] = await executor
    .select({ status: requests.status })
    .from(phases)
    .innerJoin(requests, eq(requests.id, phases.requestId))
    .where(eq(phases.id, phaseId))
    .for('share', { of: requests });
  refuseIfClosed(row);
}

export async function assertMeetingDossierOpen(executor: DbExecutor, meetingId: number): Promise<void> {
  const [row] = await executor
    .select({ status: requests.status })
    .from(meetings)
    .innerJoin(phases, eq(phases.id, meetings.phaseId))
    .innerJoin(requests, eq(requests.id, phases.requestId))
    .where(eq(meetings.id, meetingId))
    .for('share', { of: requests });
  refuseIfClosed(row);
}

export async function assertCertificateDossierOpen(executor: DbExecutor, certificateId: number): Promise<void> {
  const [row] = await executor
    .select({ status: requests.status })
    .from(certificates)
    .innerJoin(requests, eq(requests.id, certificates.requestId))
    .where(eq(certificates.id, certificateId))
    .for('share', { of: requests });
  refuseIfClosed(row);
}

export async function assertEvaluationDossierOpen(executor: DbExecutor, evaluationId: number): Promise<void> {
  const [row] = await executor
    .select({ status: requests.status })
    .from(documentEvaluations)
    .innerJoin(formalRequestDocuments, eq(formalRequestDocuments.id, documentEvaluations.formalRequestDocumentId))
    .innerJoin(phases, eq(phases.id, formalRequestDocuments.phaseId))
    .innerJoin(requests, eq(requests.id, phases.requestId))
    .where(eq(documentEvaluations.id, evaluationId))
    .for('share', { of: requests });
  refuseIfClosed(row);
}
