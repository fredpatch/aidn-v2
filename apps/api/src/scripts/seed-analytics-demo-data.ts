/**
 * Creates realistic demo dossiers for analytics/reporting validation.
 *
 * The script is intentionally scoped to organisations whose normalized name
 * starts with "seed-analytics-" so it can be rerun without touching real test
 * records created from the app.
 *
 * Run from apps/api:
 *   npm run seed:analytics
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { inArray, sql } from 'drizzle-orm';
import { db } from '../shared/db/index.js';
import {
  applicants,
  auditLogs,
  certificates,
  dgCircuitDocuments,
  documentEvaluations,
  formalRequestDocuments,
  meetings,
  notifications,
  organisations,
  payments,
  phases,
  preliminaryEvaluationForms,
  requests,
  siteInspections,
  users,
} from '../shared/db/schema.js';
import { FORMAL_DOCUMENT_SLOTS } from '../shared/statuses.js';

type PhaseCode = 'M3' | 'M4' | 'M5' | 'M6' | 'M7';
type RequestType = 'recognition' | 'issuance' | 'modification' | 'renewal';
type ScenarioKind =
  | 'completed'
  | 'active'
  | 'waiting_intake_print'
  | 'waiting_intake_return'
  | 'cancelled'
  | 'rejected';

interface Scenario {
  kind: ScenarioKind;
  requestType: RequestType;
  currentPhase?: PhaseCode;
  ageDays: number;
  currentPhaseAgeDays?: number;
  overdue?: boolean;
  paymentBlocker?: boolean;
  dgBlocker?: boolean;
  missingReport?: boolean;
}

const PHASES: PhaseCode[] = ['M3', 'M4', 'M5', 'M6', 'M7'];

const PHASE_DURATIONS: Record<PhaseCode, number> = {
  M3: 6,
  M4: 12,
  M5: 18,
  M6: 16,
  M7: 7,
};

const PHASE_SLA: Record<PhaseCode, number> = {
  M3: 15,
  M4: 20,
  M5: 30,
  M6: 30,
  M7: 10,
};

const USER_CODES = {
  su: '0000',
  dn: '0041',
  dnSupervisor: '0200',
  r3: '0129',
  assistantDg: '0148',
  reception: '0169',
  s5: '0103',
};

const ORGANISATION_NAMES = [
  'Aero Services Gabon',
  'Sky Aero Gabon',
  'Gabon Air Services',
  'Fly Africa Maintenance',
  'Navigation Africa',
  'Heli Copters Gabon',
  'Aero Training Gabon',
  'Libreville Aero Club',
  'Port-Gentil Aviation',
  'Equatorial Wings',
  'Transgabon Air',
  'Maintenance Pro Gabon',
  'Global Aviation Gabon',
  'Aero Support Gabon',
  'Nyanga Air Works',
  'Ogoue Aero Tech',
  'Mouila Aviation',
  'Franceville Flight Services',
  'Loango Air Maintenance',
  'Komo Aero Logistics',
];

const SCENARIOS: Scenario[] = [
  ...Array.from({ length: 26 }, (_, index) => ({
    kind: 'completed' as const,
    requestType: (['recognition', 'issuance', 'modification', 'renewal'] as RequestType[])[index % 4],
    ageDays: 95 + index * 10,
  })),
  { kind: 'active', requestType: 'recognition', currentPhase: 'M3', ageDays: 44, currentPhaseAgeDays: 18, overdue: true },
  { kind: 'active', requestType: 'issuance', currentPhase: 'M3', ageDays: 16, currentPhaseAgeDays: 5 },
  { kind: 'active', requestType: 'recognition', currentPhase: 'M4', ageDays: 72, currentPhaseAgeDays: 26, overdue: true, dgBlocker: true },
  { kind: 'active', requestType: 'renewal', currentPhase: 'M4', ageDays: 42, currentPhaseAgeDays: 11 },
  { kind: 'active', requestType: 'recognition', currentPhase: 'M5', ageDays: 110, currentPhaseAgeDays: 36, overdue: true, paymentBlocker: true },
  { kind: 'active', requestType: 'modification', currentPhase: 'M5', ageDays: 84, currentPhaseAgeDays: 19 },
  { kind: 'active', requestType: 'issuance', currentPhase: 'M6', ageDays: 136, currentPhaseAgeDays: 41, overdue: true, paymentBlocker: true, missingReport: true },
  { kind: 'active', requestType: 'recognition', currentPhase: 'M6', ageDays: 96, currentPhaseAgeDays: 18 },
  { kind: 'active', requestType: 'renewal', currentPhase: 'M7', ageDays: 156, currentPhaseAgeDays: 14, overdue: true, paymentBlocker: true },
  { kind: 'active', requestType: 'recognition', currentPhase: 'M7', ageDays: 130, currentPhaseAgeDays: 6 },
  { kind: 'waiting_intake_print', requestType: 'recognition', ageDays: 2 },
  { kind: 'waiting_intake_print', requestType: 'issuance', ageDays: 1 },
  { kind: 'waiting_intake_return', requestType: 'recognition', ageDays: 8 },
  { kind: 'waiting_intake_return', requestType: 'modification', ageDays: 13 },
  { kind: 'cancelled', requestType: 'renewal', currentPhase: 'M4', ageDays: 92 },
  { kind: 'rejected', requestType: 'recognition', currentPhase: 'M5', ageDays: 118 },
];

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizedSeedName(index: number): string {
  return `seed-analytics-${String(index + 1).padStart(3, '0')}`;
}

function requestReference(index: number, createdAt: Date): string {
  const datePart = createdAt.toISOString().slice(0, 10);
  return `DEM-${datePart}-SA${String(index + 1).padStart(3, '0')}`;
}

async function getUserId(employeeCode: string): Promise<number> {
  const [user] = await db.select().from(users).where(sql`${users.employeeCode} = ${employeeCode}`);
  if (!user) throw new Error(`Missing expected user with employee_code=${employeeCode}`);
  return user.id;
}

async function clearPreviousSeedData(): Promise<void> {
  const seededOrganisations = await db
    .select({ id: organisations.id })
    .from(organisations)
    .where(sql`${organisations.normalizedName} LIKE 'seed-analytics-%'`);

  const organisationIds = seededOrganisations.map((organisation) => organisation.id);
  if (organisationIds.length === 0) return;

  const seededRequests = await db
    .select({ id: requests.id })
    .from(requests)
    .where(inArray(requests.organisationId, organisationIds));
  const requestIds = seededRequests.map((request) => request.id);

  const seededPhases =
    requestIds.length > 0
      ? await db.select({ id: phases.id }).from(phases).where(inArray(phases.requestId, requestIds))
      : [];
  const phaseIds = seededPhases.map((phase) => phase.id);

  const seededFormalDocs =
    phaseIds.length > 0
      ? await db
          .select({ id: formalRequestDocuments.id })
          .from(formalRequestDocuments)
          .where(inArray(formalRequestDocuments.phaseId, phaseIds))
      : [];
  const formalDocIds = seededFormalDocs.map((document) => document.id);

  if (formalDocIds.length > 0) {
    await db.delete(documentEvaluations).where(inArray(documentEvaluations.formalRequestDocumentId, formalDocIds));
  }
  if (phaseIds.length > 0) {
    await db.delete(siteInspections).where(inArray(siteInspections.phaseId, phaseIds));
    await db.delete(payments).where(inArray(payments.phaseId, phaseIds));
    await db.delete(preliminaryEvaluationForms).where(inArray(preliminaryEvaluationForms.phaseId, phaseIds));
    await db.delete(meetings).where(inArray(meetings.phaseId, phaseIds));
    await db.delete(formalRequestDocuments).where(inArray(formalRequestDocuments.phaseId, phaseIds));
    await db.delete(phases).where(inArray(phases.id, phaseIds));
  }

  if (requestIds.length > 0) {
    await db.delete(notifications).where(inArray(notifications.requestId, requestIds));
    await db.delete(certificates).where(inArray(certificates.requestId, requestIds));
    await db.delete(auditLogs).where(inArray(auditLogs.entityId, requestIds));
    await db.delete(dgCircuitDocuments).where(inArray(dgCircuitDocuments.requestId, requestIds));
    await db.delete(requests).where(inArray(requests.id, requestIds));
  }

  const seededApplicants = await db
    .select({ id: applicants.id })
    .from(applicants)
    .where(inArray(applicants.organisationId, organisationIds));
  const applicantIds = seededApplicants.map((applicant) => applicant.id);
  if (applicantIds.length > 0) await db.delete(applicants).where(inArray(applicants.id, applicantIds));

  await db.delete(organisations).where(inArray(organisations.id, organisationIds));
}

async function createOrganisationAndApplicant(index: number, passwordHash: string) {
  const name = `${ORGANISATION_NAMES[index % ORGANISATION_NAMES.length]} ${String(index + 1).padStart(2, '0')}`;
  const normalizedName = normalizedSeedName(index);
  const [organisation] = await db
    .insert(organisations)
    .values({
      name,
      normalizedName,
      legalAddress: `Zone aeroportuaire ${index + 1}, Libreville - Gabon`,
      phone: `+241 77 ${String(200000 + index).slice(0, 6)}`,
      email: `contact+analytics${index + 1}@aidn-demo.ga`,
      originalApprovalNumber: `RCCM-GA-LBV-202${index % 5}-${String(1000 + index)}`,
      active: true,
      createdAt: daysAgo(365 - (index % 240)),
      updatedAt: daysAgo(365 - (index % 240)),
    })
    .returning();

  const [applicant] = await db
    .insert(applicants)
    .values({
      organisationId: organisation.id,
      fullName: `Responsable Demo ${String(index + 1).padStart(2, '0')}`,
      email: `postulant.analytics.${index + 1}@aidn-demo.ga`,
      phone: `062${String(5800000 + index).slice(0, 7)}`,
      passwordHash,
      contactOrder: 'primary',
      active: true,
      createdAt: organisation.createdAt,
    })
    .returning();

  return { organisation, applicant };
}

async function seedCircuit(requestId: number, scenario: Scenario, createdAt: Date) {
  if (scenario.kind === 'waiting_intake_print') {
    await db.insert(dgCircuitDocuments).values({
      entityType: 'intake_request',
      requestId,
      status: 'submitted',
      depositedAt: createdAt,
      createdAt,
    });
    return;
  }

  if (scenario.kind === 'waiting_intake_return') {
    await db.insert(dgCircuitDocuments).values({
      entityType: 'intake_request',
      requestId,
      status: 'in_signature_circuit',
      depositedAt: createdAt,
      signatureSentAt: addDays(createdAt, 1),
      createdAt,
    });
    return;
  }

  await db.insert(dgCircuitDocuments).values({
    entityType: 'intake_request',
    requestId,
    status: 'pending_review',
    depositedAt: createdAt,
    signatureSentAt: addDays(createdAt, 1),
    signedAt: addDays(createdAt, 4),
    pendingReviewAt: addDays(createdAt, 4),
    createdAt,
  });
}

async function seedPhaseDetails(
  requestId: number,
  phaseId: number,
  phaseCode: PhaseCode,
  phaseStart: Date,
  phaseEnd: Date | null,
  scenario: Scenario,
  usersByRole: Record<string, number>
) {
  if (phaseCode === 'M3') {
    const meetingStatus = phaseEnd ? 'held' : 'scheduled';
    const [meeting] = await db
      .insert(meetings)
      .values({
        phaseId,
        meetingType: 'preliminary',
        dnAgentId: usersByRole.dn,
        scheduledAt: addDays(phaseStart, 2),
        location: 'Salle de conference ANAC',
        status: meetingStatus,
        ticketDocumentUrl: '/uploads/demo/reunion-preliminaire.pdf',
        crDocumentUrl: phaseEnd ? '/uploads/demo/cr-preliminaire.pdf' : null,
        crUploadedAt: phaseEnd ? addDays(phaseStart, 3) : null,
        createdAt: phaseStart,
      })
      .returning();

    await db.insert(preliminaryEvaluationForms).values({
      phaseId,
      madeAvailableAt: addDays(phaseStart, 3),
      returnDeadline: addDays(phaseStart, 8),
      submittedFileUrl: phaseEnd ? '/uploads/demo/declaration-pre-evaluation.pdf' : null,
      submittedAt: phaseEnd ? addDays(phaseStart, 6) : null,
    });

    await db.insert(auditLogs).values({
      userId: usersByRole.dn,
      action: meeting.status === 'held' ? 'MEETING_HELD' : 'MEETING_SCHEDULED',
      module: 'M3',
      entityId: phaseId,
      details: { seed: 'analytics' },
      createdAt: meeting.createdAt,
    });
  }

  if (phaseCode === 'M4') {
    await db.insert(dgCircuitDocuments).values({
      entityType: 'formal_request_letter',
      requestId,
      status: !phaseEnd && scenario.dgBlocker ? 'in_signature_circuit' : 'pending_review',
      depositedAt: phaseStart,
      signatureSentAt: addDays(phaseStart, 1),
      signedAt: !phaseEnd && scenario.dgBlocker ? null : addDays(phaseStart, 4),
      pendingReviewAt: !phaseEnd && scenario.dgBlocker ? null : addDays(phaseStart, 4),
      createdAt: phaseStart,
    });
  }

  if (phaseCode === 'M4') {
    await db.insert(formalRequestDocuments).values(
      FORMAL_DOCUMENT_SLOTS.map((slot, slotIndex) => ({
        phaseId,
        slot,
        status: phaseEnd || slotIndex < 7 ? ('submitted' as const) : ('missing' as const),
        fileUrl: phaseEnd || slotIndex < 7 ? `/uploads/demo/${slot}.pdf` : null,
        submittedAt: phaseEnd || slotIndex < 7 ? addDays(phaseStart, 3 + (slotIndex % 3)) : null,
      }))
    );

    const [meeting] = await db
      .insert(meetings)
      .values({
        phaseId,
        meetingType: 'formal',
        dnAgentId: usersByRole.dnSupervisor,
        scheduledAt: addDays(phaseStart, 8),
        location: 'Salle de conference ANAC',
        status: phaseEnd ? 'held' : 'scheduled',
        ticketDocumentUrl: '/uploads/demo/reunion-formelle.pdf',
        crDocumentUrl: phaseEnd ? '/uploads/demo/cr-formel.pdf' : null,
        crUploadedAt: phaseEnd ? addDays(phaseStart, 10) : null,
        createdAt: phaseStart,
      })
      .returning();

    await db.insert(auditLogs).values({
      userId: usersByRole.dnSupervisor,
      action: meeting.status === 'held' ? 'FORMAL_MEETING_HELD' : 'FORMAL_MEETING_SCHEDULED',
      module: 'M4',
      entityId: phaseId,
      details: { seed: 'analytics' },
      createdAt: meeting.createdAt,
    });
  }

  if (phaseCode === 'M5' || phaseCode === 'M6' || phaseCode === 'M7') {
    const paymentIsBlocking = !phaseEnd && scenario.paymentBlocker;
    await db.insert(payments).values({
      phaseId,
      invoiceFileUrl: '/uploads/demo/facture-s5.pdf',
      invoiceUploadedAt: addDays(phaseStart, 1),
      proofFileUrl: paymentIsBlocking ? null : '/uploads/demo/preuve-paiement.pdf',
      proofUploadedAt: paymentIsBlocking ? null : addDays(phaseStart, 4),
      status: paymentIsBlocking ? 'awaiting_proof' : 'validated',
      validatedBy: paymentIsBlocking ? null : usersByRole.s5,
      validatedAt: paymentIsBlocking ? null : addDays(phaseStart, 5),
    });
  }

  if (phaseCode === 'M5') {
    const [formalPhase] = await db
      .select()
      .from(phases)
      .where(sql`${phases.requestId} = ${requestId} AND ${phases.phaseCode} = 'M4'`);
    const targetDocs = formalPhase
      ? await db
          .select()
          .from(formalRequestDocuments)
          .where(sql`${formalRequestDocuments.phaseId} = ${formalPhase.id}`)
      : [];
    for (const [index, document] of targetDocs.entries()) {
      await db.insert(documentEvaluations).values({
        formalRequestDocumentId: document.id,
        verdict: phaseEnd || index < 8 ? 'validated' : 'needs_correction',
        evaluatedBy: usersByRole.dn,
        evaluatedAt: addDays(phaseStart, 7 + (index % 4)),
        correctionDeadline: index >= 8 && !phaseEnd ? addDays(phaseStart, 18) : null,
      });
    }
  }

  if (phaseCode === 'M6') {
    const [meeting] = await db
      .insert(meetings)
      .values({
        phaseId,
        meetingType: 'site_visit',
        dnAgentId: usersByRole.dn,
        scheduledAt: addDays(phaseStart, 7),
        location: 'Libreville',
        status: phaseEnd || scenario.missingReport ? 'held' : 'scheduled',
        ticketDocumentUrl: '/uploads/demo/ordre-mission.pdf',
        crDocumentUrl: scenario.missingReport ? null : phaseEnd ? '/uploads/demo/rapport-inspection.pdf' : null,
        crUploadedAt: scenario.missingReport ? null : phaseEnd ? addDays(phaseStart, 10) : null,
        createdAt: phaseStart,
      })
      .returning();

    if (phaseEnd) {
      await db.insert(siteInspections).values({
        phaseId,
        meetingId: meeting.id,
        r3AgentId: usersByRole.r3,
        verdict: 'compliant',
        note: 'Avis conforme genere pour donnees de demonstration analytique.',
        submittedAt: addDays(phaseStart, 11),
      });
    }
  }

}

async function seedScenario(index: number, scenario: Scenario, passwordHash: string, usersByRole: Record<string, number>) {
  const { organisation, applicant } = await createOrganisationAndApplicant(index, passwordHash);
  const createdAt = daysAgo(scenario.ageDays);
  const status =
    scenario.kind === 'completed'
      ? 'completed'
      : scenario.kind === 'cancelled'
        ? 'cancelled'
        : scenario.kind === 'rejected'
          ? 'rejected'
          : ['waiting_intake_print', 'waiting_intake_return'].includes(scenario.kind)
            ? 'submitted'
            : 'in_progress';

  const [request] = await db
    .insert(requests)
    .values({
      reference: requestReference(index, createdAt),
      applicantId: applicant.id,
      organisationId: organisation.id,
      requestType: scenario.requestType,
      message: 'Demande de demonstration analytique generee automatiquement.',
      status,
      rejectionReason: scenario.kind === 'rejected' ? 'Dossier rejete dans le jeu de donnees de demonstration.' : null,
      createdAt,
      updatedAt: scenario.kind === 'completed' ? addDays(createdAt, 61) : daysAgo(Math.min(3, scenario.ageDays)),
    })
    .returning();

  await seedCircuit(request.id, scenario, createdAt);

  if (scenario.kind === 'waiting_intake_print' || scenario.kind === 'waiting_intake_return') return;

  const currentPhaseIndex =
    scenario.kind === 'completed'
      ? PHASES.length
      : Math.max(0, PHASES.indexOf(scenario.currentPhase ?? 'M3'));
  let cursor = addDays(createdAt, 5);

  for (const [phaseIndex, phaseCode] of PHASES.entries()) {
    if (phaseIndex > currentPhaseIndex) break;

    const isCurrentOpen = scenario.kind === 'active' && phaseIndex === currentPhaseIndex;
    const phaseStart = isCurrentOpen && scenario.currentPhaseAgeDays ? daysAgo(scenario.currentPhaseAgeDays) : cursor;
    const nominalDuration =
      scenario.kind === 'completed'
        ? PHASE_DURATIONS[phaseCode] + ((index + phaseIndex) % 5)
        : PHASE_DURATIONS[phaseCode];
    const phaseEnd =
      isCurrentOpen || scenario.kind === 'cancelled' || scenario.kind === 'rejected'
        ? null
        : addDays(phaseStart, nominalDuration);

    const [phase] = await db
      .insert(phases)
      .values({
        requestId: request.id,
        phaseCode,
        status: phaseEnd ? 'closed' : 'open',
        openedAt: phaseStart,
        closedAt: phaseEnd,
        closureDocumentUrl: phaseEnd ? `/uploads/demo/cloture-${phaseCode}.pdf` : null,
        closureNote: phaseEnd ? 'Phase cloturee par le jeu de donnees analytique.' : null,
      })
      .returning();

    await seedPhaseDetails(request.id, phase.id, phaseCode, phaseStart, phaseEnd, scenario, usersByRole);
    if (!phaseEnd) break;
    cursor = addDays(phaseEnd, 1);
  }

  if (scenario.kind === 'completed') {
    const [certificatePhase] = await db
      .select()
      .from(phases)
      .where(sql`${phases.requestId} = ${request.id} AND ${phases.phaseCode} = 'M7'`);
    if (certificatePhase?.closedAt) {
      await db.insert(certificates).values({
        requestId: request.id,
        reference: `CERT-AN-${String(index + 1).padStart(4, '0')}`,
        certificateType: scenario.requestType === 'recognition' ? 'recognition' : 'agreement',
        status: 'collected',
        createdAt: addDays(certificatePhase.openedAt, 2),
        printedAt: addDays(certificatePhase.openedAt, 3),
        signedAt: addDays(certificatePhase.openedAt, 5),
        signedFileUrl: '/uploads/demo/certificat-signe.pdf',
        archivedAt: addDays(certificatePhase.openedAt, 6),
        notifiedAt: addDays(certificatePhase.openedAt, 6),
        collectedAt: certificatePhase.closedAt,
      });
    }
  }
}

async function run(): Promise<void> {
  console.log('[seed:analytics] Preparing demo analytics data...');
  await clearPreviousSeedData();

  const usersByRole = {
    su: await getUserId(USER_CODES.su),
    dn: await getUserId(USER_CODES.dn),
    dnSupervisor: await getUserId(USER_CODES.dnSupervisor),
    r3: await getUserId(USER_CODES.r3),
    assistantDg: await getUserId(USER_CODES.assistantDg),
    reception: await getUserId(USER_CODES.reception),
    s5: await getUserId(USER_CODES.s5),
  };
  const passwordHash = await bcrypt.hash('Postulant2026!', 10);

  for (const [index, scenario] of SCENARIOS.entries()) {
    await seedScenario(index, scenario, passwordHash, usersByRole);
  }

  console.log(`[seed:analytics] Created ${SCENARIOS.length} demo dossiers.`);
  console.log('[seed:analytics] Applicant password for seeded accounts: Postulant2026!');
}

run().catch((error) => {
  console.error('[seed:analytics] Failed:', error);
  process.exit(1);
});
