import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, type DbExecutor } from '../../shared/db/index.js';
import {
  dossierTeamMembers,
  dossierTeamProposalMembers,
  dossierTeamProposals,
  dossierTeams,
  phases,
  requests,
  userRoles,
  users,
} from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { assertDossierOpen } from '../requests/dossier-open.js';
import { parseTeamProposal } from './dossier-teams.input.js';

const memberView = { id: users.id, fullName: users.fullName, employeeCode: users.employeeCode };

export async function getEligibleMembers(executor: DbExecutor = db) {
  return executor
    .selectDistinct(memberView)
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.active, true), inArray(userRoles.role, ['dn_agent', 'dn_supervisor'])))
    .orderBy(asc(users.fullName), asc(users.id));
}

export async function getDossierTeam(
  requestId: number,
  executor: DbExecutor = db
): Promise<Awaited<ReturnType<typeof readDossierTeam>>> {
  // One snapshot for headers and members, even during concurrent proposal saves.
  if (executor === db) {
    return db.transaction((tx) => readDossierTeam(requestId, tx), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
  }
  return readDossierTeam(requestId, executor);
}

async function readDossierTeam(requestId: number, executor: DbExecutor) {
  const [request] = await executor
    .select({ id: requests.id })
    .from(requests)
    .where(eq(requests.id, requestId));
  if (!request) throw new Error('REQUEST_NOT_FOUND');
  const [proposal] = await executor
    .select()
    .from(dossierTeamProposals)
    .where(eq(dossierTeamProposals.requestId, requestId));
  const [team] = await executor
    .select()
    .from(dossierTeams)
    .where(eq(dossierTeams.requestId, requestId));
  const proposedMembers = proposal
    ? await executor
        .select(memberView)
        .from(dossierTeamProposalMembers)
        .innerJoin(users, eq(users.id, dossierTeamProposalMembers.userId))
        .where(eq(dossierTeamProposalMembers.proposalId, proposal.id))
        .orderBy(asc(users.fullName), asc(users.id))
    : [];
  const finalMembers = team
    ? await executor
        .select(memberView)
        .from(dossierTeamMembers)
        .innerJoin(users, eq(users.id, dossierTeamMembers.userId))
        .where(eq(dossierTeamMembers.teamId, team.id))
        .orderBy(asc(users.fullName), asc(users.id))
    : [];
  return {
    proposal: proposal
      ? {
          id: proposal.id,
          proposedApprovalNumber: proposal.proposedApprovalNumber,
          proposedBy: proposal.proposedBy,
          proposedAt: proposal.proposedAt,
          updatedAt: proposal.updatedAt,
          members: proposedMembers,
        }
      : null,
    team: team
      ? {
          id: team.id,
          approvalNumber: team.approvalNumber,
          finalizedBy: team.finalizedBy,
          finalizedAt: team.finalizedAt,
          members: finalMembers,
        }
      : null,
  };
}

/** The HTTP boundary enforces supervisor/SU authority. No finalization operation
 * exists here: LEGAL-DECISION-1 must supply its Decision and authorization first. */
export async function saveTeamProposal(requestId: number, actorId: number, input: unknown) {
  const { memberIds, proposedApprovalNumber } = parseTeamProposal(input);
  return db.transaction(async (tx) => {
    // Serializes first saves as well as edits, and concurrent dossier closure.
    const [request] = await tx
      .select({ id: requests.id })
      .from(requests)
      .where(eq(requests.id, requestId))
      .for('update');
    if (!request) throw new Error('REQUEST_NOT_FOUND');
    await assertDossierOpen(tx, requestId);
    const [phase] = await tx
      .select()
      .from(phases)
      .where(and(eq(phases.requestId, requestId), eq(phases.phaseCode, 'M3')))
      .for('update');
    if (!phase || phase.status !== 'open') throw new Error('PRELIMINARY_NOT_OPEN');

    // Protect active identities through commit. Read roles without locking:
    // updateUserRoles locks roles before users; taking both in the opposite
    // order would deadlock. Eligibility is checked against committed roles.
    const candidates = await tx
      .select({ id: users.id, active: users.active })
      .from(users)
      .where(inArray(users.id, memberIds))
      .orderBy(asc(users.id))
      .for('share');
    const roles = await tx
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(
        and(
          inArray(userRoles.userId, memberIds),
          inArray(userRoles.role, ['dn_agent', 'dn_supervisor'])
        )
      )
      .orderBy(asc(userRoles.userId), asc(userRoles.id));
    const eligible = new Set(roles.map((r) => r.userId));
    if (
      candidates.length !== memberIds.length ||
      candidates.some((u) => !u.active || !eligible.has(u.id))
    ) {
      throw new Error('TEAM_MEMBER_INELIGIBLE');
    }

    const [existing] = await tx
      .select()
      .from(dossierTeamProposals)
      .where(eq(dossierTeamProposals.requestId, requestId));
    const oldMembers = existing
      ? await tx
          .select({ userId: dossierTeamProposalMembers.userId })
          .from(dossierTeamProposalMembers)
          .where(eq(dossierTeamProposalMembers.proposalId, existing.id))
          .orderBy(asc(dossierTeamProposalMembers.userId))
      : [];
    const [proposal] = existing
      ? await tx
          .update(dossierTeamProposals)
          .set({ proposedApprovalNumber, updatedAt: new Date() })
          .where(eq(dossierTeamProposals.id, existing.id))
          .returning()
      : await tx
          .insert(dossierTeamProposals)
          .values({ requestId, proposedApprovalNumber, proposedBy: actorId })
          .returning();
    await tx
      .delete(dossierTeamProposalMembers)
      .where(eq(dossierTeamProposalMembers.proposalId, proposal.id));
    await tx
      .insert(dossierTeamProposalMembers)
      .values(memberIds.map((userId) => ({ proposalId: proposal.id, userId })));
    await logAudit(
      {
        userId: actorId,
        requestId,
        entityId: proposal.id,
        module: 'M3',
        action: existing ? 'DOSSIER_TEAM_PROPOSAL_UPDATED' : 'DOSSIER_TEAM_PROPOSAL_CREATED',
        details: {
          fromMemberIds: oldMembers.map((m) => m.userId),
          toMemberIds: [...memberIds].sort((a, b) => a - b),
          fromProposedApprovalNumber: existing?.proposedApprovalNumber ?? null,
          proposedApprovalNumber,
        },
      },
      tx
    );
    return getDossierTeam(requestId, tx);
  });
}
