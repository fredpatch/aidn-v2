/** STORAGE-0A - who may open a stored file. One pure decision used by every
 *  file route (direct GET and grant issuance), mirroring the visibility the
 *  dossier screens already enforce - never wider. */

export type FileActor =
  | { kind: 'staff'; userId: number; roles: string[] }
  | { kind: 'applicant'; applicantId: number };

/** Where a file belongs, resolved from its upload asset (file-context.ts). */
export type FileContext =
  | { kind: 'unlinked'; uploadedByUserId: number | null; uploadedByApplicantId: number | null }
  | { kind: 'dossier'; ownerType: string; requestId: number; applicantId: number; stage: string }
  | { kind: 'template'; active: boolean; isCurrent: boolean }
  | { kind: 'report' }
  | { kind: 'unresolvable' };

const DN = ['dn_agent', 'dn_supervisor'];

/** Staff roles per dossier stage = the roles allowed on that stage's
 *  existing bundle endpoints. */
const STAFF_ROLES_BY_STAGE: Record<string, readonly string[]> = {
  dg_circuit: ['reception', 'assistant_dg', ...DN],
  M3: DN,
  M4: DN,
  M5: [...DN, 's5_agent'],
  M6: [...DN, 's5_agent', 'r3_agent'],
  M7: [...DN, 's5_agent'],
};

/** Never shown in the portal today, so applicants cannot open them either. */
const STAFF_ONLY_OWNER_TYPES = new Set(['phase_closure_document', 'certificate_document']);

function hasRole(actor: FileActor, roles: readonly string[]): boolean {
  return actor.kind === 'staff' && actor.roles.some((role) => roles.includes(role));
}

export function canAccessFile(actor: FileActor, context: FileContext): boolean {
  if (hasRole(actor, ['SU'])) return true;

  switch (context.kind) {
    case 'unlinked':
      return actor.kind === 'staff'
        ? context.uploadedByUserId === actor.userId
        : context.uploadedByApplicantId === actor.applicantId;

    case 'dossier':
      if (actor.kind === 'applicant') {
        return context.applicantId === actor.applicantId && !STAFF_ONLY_OWNER_TYPES.has(context.ownerType);
      }
      return hasRole(actor, STAFF_ROLES_BY_STAGE[context.stage] ?? []);

    case 'template':
      return context.active && context.isCurrent ? true : hasRole(actor, DN);

    case 'report':
      return hasRole(actor, ['dn_supervisor']);

    case 'unresolvable':
      return false;
  }
}
